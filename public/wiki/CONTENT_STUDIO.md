# Meridian Strike Content Studio

Content Studio is the private official campaign-presentation and campaign-map authoring surface. It is a separate Electron application; do not include it in Steam or standalone player distribution artifacts.

Player builds read only a signed public release manifest. They cannot create drafts, call admin endpoints, or use local custom content to replace an official campaign.

The community repository admin page and Content Studio deliberately use separate authorization. The wiki admin approves community submissions. Content Studio uses Google Desktop OAuth and the official-content Worker authorizes Fredrik's immutable Google `sub`; simply being signed in at `/admin` does not grant official publishing access.

## One-time Cloudflare setup

1. Create separate Cloudflare **development**, **staging**, and **production** Worker environments, D1 databases, and R2 buckets. Copy the real D1 IDs and public Worker origin into `services/official-content/wrangler.toml`; never reuse the community-scenario Netlify project.
2. Apply migrations for every environment:

   ```powershell
   npm --workspace @meridian/official-content-service exec -- wrangler d1 migrations apply CONTENT_DB --remote --config wrangler.toml
   npm --workspace @meridian/official-content-service exec -- wrangler d1 migrations apply CONTENT_DB --remote --config wrangler.toml --env staging
   npm --workspace @meridian/official-content-service exec -- wrangler d1 migrations apply CONTENT_DB --remote --config wrangler.toml --env production
   ```

3. Create a Google OAuth **Desktop** client for Content Studio. Google must permit loopback redirects on `127.0.0.1`; do not create a web client. Google requires the generated Desktop client secret at the token endpoint. Keep it only in the private Studio main-process configuration or a local setup command; it must never enter a Worker variable, renderer bundle, repository, or this chat. It is not an owner-authorization boundary: the Worker authorizes only Fredrik's immutable Google `sub`.
4. Generate an Ed25519 manifest signing key pair with `node scripts/generate-official-content-keypair.mjs`. Store the private PKCS#8 value only as a Worker secret. Pin the public SPKI value in player builds.
5. Set Worker secrets for each environment:

   ```powershell
   npm --workspace @meridian/official-content-service exec wrangler secret put OWNER_GOOGLE_SUB --config wrangler.toml
   npm --workspace @meridian/official-content-service exec wrangler secret put SESSION_SIGNING_SECRET --config wrangler.toml
   npm --workspace @meridian/official-content-service exec wrangler secret put MANIFEST_SIGNING_PRIVATE_KEY --config wrangler.toml
   npm --workspace @meridian/official-content-service exec wrangler secret put MANIFEST_SIGNING_KEY_ID --config wrangler.toml
   ```

   `OWNER_GOOGLE_SUB` is the immutable verified Google subject for Fredrik’s account. It is not the email address. Obtain it from a successful Google identity token during controlled setup; do not log or commit tokens.

6. Deploy the Worker from a protected environment. The public Worker route must be HTTPS and immutable released map URLs must remain available forever for rollback.

## Development environment bootstrap

Complete these steps only for the top-level development Worker; do not pass `--env staging` or `--env production`.

1. Development uses `https://meridian-official-content-development.fredrik-carleson.workers.dev`. It is set in top-level `PUBLIC_ORIGIN` in `wrangler.toml` and in the Studio configuration example.
2. Discover the immutable owner subject locally. This command opens Google sign-in with the public Desktop client ID, validates the returned identity token, and prints only the verified email and `sub`; it never sends the token to the Worker:

   ```powershell
   $env:GOOGLE_OAUTH_CLIENT_ID = "331012244806-9goa4697udvqe2horffhv3kspnms77eh.apps.googleusercontent.com"
   $env:GOOGLE_OAUTH_CLIENT_SECRET = Read-Host "Google Desktop OAuth client secret"
   $env:OPEN_BROWSER = "1" # Optional: open the sign-in URL automatically.
   npm run official-content:owner-sub
   ```

3. Generate the manifest signing pair in your own terminal. Do not paste the private output into chat, source control, or the Studio configuration file. The first output is unpadded base64url PKCS#8 DER private-key data; the second is unpadded base64url SPKI public-key data:

   ```powershell
   npm run official-content:keygen
   ```

4. Generate a separate session-signing value in your own terminal. Keep it in a password manager or temporary secure clipboard until it has been stored as a Cloudflare secret:

   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

5. From the repository root, run each of these commands separately. Wrangler prompts interactively; paste the matching value only into its prompt. `MANIFEST_SIGNING_KEY_ID` may be `dev-2026-07-25`; use the same text as the key in the player public-key JSON.

   ```powershell
   npm --workspace @meridian/official-content-service exec -- wrangler secret put OWNER_GOOGLE_SUB --config wrangler.toml --env=""
   npm --workspace @meridian/official-content-service exec -- wrangler secret put SESSION_SIGNING_SECRET --config wrangler.toml --env=""
   npm --workspace @meridian/official-content-service exec -- wrangler secret put MANIFEST_SIGNING_PRIVATE_KEY --config wrangler.toml --env=""
   npm --workspace @meridian/official-content-service exec -- wrangler secret put MANIFEST_SIGNING_KEY_ID --config wrangler.toml --env=""
   ```

6. Pin the public key only in a local player-build environment file (for example `.env.local`, which is ignored). This is intentionally public:

   ```dotenv
   VITE_OFFICIAL_CONTENT_ORIGIN=https://meridian-official-content-development.fredrik-carleson.workers.dev
   VITE_OFFICIAL_CONTENT_PUBLIC_KEYS={"dev-2026-07-25":"PASTE_THE_SECOND_KEYGEN_OUTPUT_HERE"}
   ```

7. Apply the development database migration, deploy, then confirm the public manifest endpoint:

   ```powershell
   npm --workspace @meridian/official-content-service exec -- wrangler d1 migrations apply CONTENT_DB --remote --config wrangler.toml --env=""
   npm --workspace @meridian/official-content-service exec -- wrangler deploy --config wrangler.toml --env=""
   ```

## Build configuration

Every player build that may receive live official content requires only public values:

```powershell
$env:VITE_OFFICIAL_CONTENT_ORIGIN = "https://official-content.example.workers.dev"
$env:VITE_OFFICIAL_CONTENT_PUBLIC_KEYS = '{"key-2026-01":"BASE64URL_ED25519_SPKI_PUBLIC_KEY"}'
npm run build:steam
```

The Electron build-info writer carries the HTTPS origin into the packaged CSP. The player never receives OAuth settings, owner IDs, session secrets, Worker secrets, or manifest private keys.

Create `%APPDATA%\Meridian Strike Content Studio\content-studio.config.json` from [`apps/content-studio/content-studio.config.example.json`](../apps/content-studio/content-studio.config.example.json), then package the private tool. The Studio environment selector switches between development, staging, and production immediately; each environment keeps an isolated encrypted sign-in session. Development is the only authoring environment. Staging imports an immutable Development release, and Production imports an immutable Staging release.

```powershell
npm run package:content-studio
```

The configuration contains the public Worker origin, Google Desktop client ID, and Google Desktop client secret. The secret is consumed only by Electron's main process for the Google token exchange; it is not exposed to renderer JavaScript or sent to the Worker. Studio encrypts its short-lived service session using Electron `safeStorage`.

## First release and migration

### Environment promotion workflow

1. Select **Development**. Seed the catalog, edit campaign presentation or tactical maps, validate, and publish a complete Development release.
2. Select **Staging** and reauthenticate. Direct editing and manual seeding are unavailable here. Choose **Import from Development**. The Worker fetches the currently active Development manifest, validates that it contains every compiled mission and campaign presentation, copies every map image into a private candidate, and verifies its size and SHA-256 checksum.
3. Review the imported release ID, source-manifest checksum, map count, and campaign-presentation count. Choose **Publish exact snapshot to Staging**. Later Development edits are not included unless they are published as a new Development release and explicitly imported again.
4. Test the Staging player build. When accepted, select **Production**, import the currently active Staging release, review it, and explicitly publish that exact snapshot to Production.
5. Rollback remains available in every environment and creates a new signed release from the chosen immutable snapshot.

The Worker enforces this one-way path, so an older Studio build or direct API request cannot edit Staging or Production. Promotion also carries the compatible catalog and records the source environment, source release ID, and source manifest SHA-256 in the target release history.

### Campaign presentation workflow

1. In Development, seed the catalog from the current game build. The catalog includes the protected mission layout and the safe campaign-document baseline; seeding publishes nothing.
2. Open **Campaign presentation**, choose Meridian Strike or Ember Reach, and open its private draft. It starts from the active signed release, falling back to bundled source.
3. Edit campaign identity, company display name, intro/finale copy, operation codes, and existing structured dialogue. Save creates an immutable numbered private revision.
4. Validate, add an optional developer note, and review the generated release summary. Publication creates one signed manifest snapshot containing all current maps and campaign documents.
5. Rollback creates a newly signed release from a prior whole-content snapshot. It restores campaign documents and maps together and never rewrites history.

### Full tactical-map release

Use **Publish all validated maps** for a complete official map snapshot. It validates that every seeded mission has a private draft with canonical WebP art, then creates one signed release containing every map. The operation cannot publish a partial pack; fix the listed missing or invalid drafts first.

Mission order, combat forces, objectives, rewards, economy, progression, entitlements, machine unlocks, story functions, media paths, portraits, and battle trigger timing remain compiled and cannot be edited in Studio. At runtime the player applies the signed presentation overlay to the compiled campaign pack, so those protected fields and executable functions are retained.

### Tactical map workflow

1. Open Content Studio and complete Google sign-in with Fredrik’s approved account.
2. Select **Seed catalog**. This uploads the official mission catalog generated from the current game source; it does not publish map changes. Reseeding may update source-owned fixed mission coordinates while preserving the same mission identities and board dimensions. After releases exist, the service accepts a correction only if every immutable released map remains valid against the corrected catalog, preserving safe rollback.
3. For each legacy browser draft, run the local development game on its original origin with `npm run dev -- --port 8080`, open **Custom Scenarios → Campaign Maps**, and choose **Export Draft**. This temporary migration UI is compiled only into Vite development and is restricted at runtime to `localhost:8080`; it is absent from player, standalone, and Steam builds.
4. In Content Studio, choose **Import legacy ZIP**. JPEG, PNG, and WebP map art is converted locally to canonical WebP before upload. The terrain grid remains visible over the art by default; use the art and terrain-overlay controls to compare them. If the image aspect does not fit the hex board, use a suggested grid size and confirm the resize before uploading again.
5. Use **Official placements** to select and move a deployment, escape, objective, defended-objective, or enemy marker, then click its destination hex. Selecting any terrain brush immediately returns to terrain-paint mode. In terrain mode, hold the primary mouse button and drag across hexes to paint successive cells; selecting **Plain** clears terrain back to open ground. Only positions are editable: the count and identity of each marker, enemy chassis/skill/AI, objective type, narrative, economy, and progression remain protected source content. Private drafts may be saved even when a moved marker currently falls outside the board or on impassable terrain. **Validate tactical map** reports that repair requirement, while **Publish official revision** remains blocked until every protected marker is in bounds, passable, and legally separated. A successful release is immutable and becomes active atomically.
6. Before confirmation, Studio shows the service-generated, immutable release summary: campaign, scenario, board size, changed map fields, map-format version, and official-map snapshot count. An optional developer note is appended to that summary. The generated summary is stored in release history; it never includes credentials, local paths, or private draft-storage identifiers.
7. Rollback creates a new release from a prior snapshot; it never rewrites history.

The first player release can be empty: player clients retain bundled campaign maps until an official live map patch exists. This is the release-zero fallback and preserves current behavior.

## Operational boundaries

- Official art is canonical WebP stored in private draft R2 paths and immutable release R2 paths. A production Cloudflare Images delivery layer may mirror these canonical artifacts, but its delivery bytes must be hash-stable before it is added to the signed manifest.
- Player clients verify the Ed25519 manifest before activation and SHA-256-check every map asset before rendering it. They use the last verified manifest/assets offline and fall back to bundled maps when no cache exists.
- Content is activated only during application bootstrap. A new release never replaces a map or campaign document during an active session.
- Released placement overrides are part of the signed official map patch. Player builds apply only those verified position changes; custom scenarios can never override campaign deployment, exits, objectives, or enemies.
- The community scenario repository remains strictly for player-made scenarios. It has no route, role, or write capability for official campaign content.
