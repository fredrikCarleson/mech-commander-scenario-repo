# Meridian Strike Community Repository

Moderated distribution service for Meridian Strike scenarios and complete linear campaigns.

## Architecture

- React/Vite catalogue and admin review UI
- Netlify Function API under `/api/v1`
- Netlify Blobs for public assets, ownership records, pending submissions, and immutable revisions
- Shared Zod schemas and bounded ZIP validation

Only approved packages appear publicly. Submitting an update never takes the currently approved revision offline.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:8888`; port 5173 is the Vite UI without the Netlify API.

## Authentication

Public browsing, downloads, thumbnails, and ratings are anonymous. Upload, update, status, and withdrawal operations require a short-lived creator session. The wiki `/admin` Google button sends an identity token. The Steam/desktop game sends a loopback authorization code; this API exchanges it with Google.

Authorization uses the immutable Google `sub` claim:

- The first uploader becomes the content owner.
- Only that owner can submit revisions or withdraw the listing.
- Admin access requires a subject listed in `ADMIN_GOOGLE_SUBS`; email is not an authorization key.

Configure:

| Variable                       | Purpose                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `GOOGLE_WEB_CLIENT_IDS`        | Accepted Web OAuth audiences                                         |
| `GOOGLE_DESKTOP_CLIENT_IDS`    | Accepted installed-app OAuth audiences                               |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | Wiki-only secret for desktop code exchange. Never ship in the game   |
| `GOOGLE_CLIENT_ID(S)`          | Development-only migration fallback                                  |
| `VITE_GOOGLE_CLIENT_ID`        | Public Web client ID for the wiki admin sign-in button               |
| `ADMIN_GOOGLE_SUBS`            | Comma-separated immutable admin subject IDs                          |
| `SESSION_SIGNING_SECRET`       | At least 32 random bytes for one-hour creator sessions               |
| `SESSION_SIGNING_SECRET_ID`    | Non-secret environment identity (`development/candidate/production`) |
| `COMMUNITY_ENVIRONMENT`        | Explicit `development`, `staging`, or `production`                   |
| `COMMUNITY_API_ORIGIN`         | Exact API origin from the environment matrix                         |
| `SCENARIO_BLOB_STORE`          | Exact isolated Blob namespace from the environment matrix            |
| `COMMUNITY_MUTATION_MODE`      | `authenticated`, or `disabled` for the forward-compatible rollback   |
| `COMMUNITY_CORS_ORIGINS`       | Comma-separated trusted wiki and packaged desktop origins            |

Google Web authorized JavaScript origins should include `http://localhost:8888` and `https://meridian-strike-wiki.netlify.app`.

## API

Scenario routes use `/scenarios`; campaign routes use the equivalent `/campaigns` paths.

| Method   | Path                        | Access                                              | Purpose                                                                |
| -------- | --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST`   | `/auth/session`             | Google identity token or desktop authorization code | Issue creator session                                                  |
| `GET`    | `/auth/me`                  | Creator                                             | Verify creator session                                                 |
| `GET`    | `/:type`                    | Public                                              | Paginated approved catalogue                                           |
| `POST`   | `/:type`                    | Creator                                             | Submit new content for review                                          |
| `GET`    | `/:type/:id`                | Public                                              | Approved metadata                                                      |
| `PUT`    | `/:type/:id`                | Owner                                               | Submit immutable revision                                              |
| `DELETE` | `/:type/:id`                | Owner                                               | Withdraw/archive listing                                               |
| `GET`    | `/:type/:id/status`         | Owner                                               | Submission and revision state                                          |
| `GET`    | `/:type/:id/thumbnail`      | Public                                              | Approved WebP preview                                                  |
| `GET`    | `/:type/:id/download`       | Public                                              | Approved ZIP                                                           |
| `POST`   | `/:type/:id/ratings`        | Public                                              | Rate approved content                                                  |
| `GET`    | `/admin/:type`              | Admin                                               | Pending review queue                                                   |
| `POST`   | `/admin/:type/:id/approve`  | Admin                                               | Promote pending revision                                               |
| `POST`   | `/admin/:type/:id/reject`   | Admin                                               | Archive pending revision                                               |
| `POST`   | `/admin/:type/:id/rollback` | Admin                                               | Reactivate a verified immutable revision                               |
| `DELETE` | `/admin/:type/:id`          | Admin                                               | Tombstone public access; retain immutable revisions for audit/recovery |

Here `:type` is `scenarios` or `campaigns`.

## Revision storage

Public keys retain the approved package and metadata. Private ownership and submission sidecars control mutations and moderation. Revision assets are append-only under:

```text
revisions/scenarios/<repository-id>/<revision>/...
revisions/campaigns/<repository-id>/<revision>/...
```

Legacy records without ownership must be assigned to a verified Google identity by an admin, or republished as a new fork.

An authorized release operator can create a read-only, byte-preserving inventory outside this
repository. It requires `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`, records each Blob's ETag,
metadata, byte count, and SHA-256, and fails if the inventory changes while it runs:

```bash
npm run inventory:export -- --store <store-name> --environment production --output <path-outside-repository>
```

Do not run that command merely to test it; it reads the configured external store. The local
migration planner itself is dry-run by default and never connects to Netlify:

```bash
npm run migration:dry-run -- --input ./path/to/exported-snapshot.json
```

Add `--output ./path/to/new-local-file.json` only to create a migrated local snapshot. It uses exclusive creation, preserves legacy public keys and byte payloads for rollback compatibility, emits source SHA-256 values, creates no ownership claims, and can be rerun idempotently. Exporting, backing up, applying, or restoring production Blob data remains a separately authorized operator action.

After an authorized backup and dry-run review, apply additive writes with an explicit confirmation (never pass the token on the command line):

```bash
node scripts/community-blob-apply.mjs --store mech-scenarios --environment production --input <path-outside-repository> --confirm production
```

## Package validation

Scenario ZIPs contain four root files: `manifest.json`, `scenario.json`, `map.json`, and `thumbnail.webp`.

Campaign ZIPs contain root `manifest.json` and `thumbnail.webp`, plus a self-contained `Campaigns/<stable-id>/` tree with `campaign.json`, embedded mission scenarios, and optional managed media.

Both validators enforce compressed and decompressed limits, safe paths, allowed extensions, schemas, supported versions, and valid WebP thumbnails. The server never trusts client-side validation.

## Commands

| Command                  | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `npm run dev`            | Netlify Dev with Functions and local Blobs             |
| `npm run typecheck`      | TypeScript project build                               |
| `npm test`               | Unit and service tests                                 |
| `npm run test:telemetry` | Test local telemetry endpoints and print curl examples |
| `npm run lint`           | Oxlint                                                 |
| `npm run format:check`   | Prettier verification                                  |
| `npm run build`          | Production build                                       |

## Gameplay Telemetry

Anonymous gameplay telemetry endpoints receive player drop-off and retention metrics from the _Meridian Strike_ desktop game client (documented in `fredrikCarleson/mech-command`).

### Endpoints

- `POST /.netlify/functions/telemetry` (also rewritten from `/telemetry`): Receives anonymous single or batched events. Returns `204 No Content`. CORS-enabled for Electron (`Origin: null`, `file://`, localhost). Stores events in Netlify Blobs (`telemetry` store).
- `GET /.netlify/functions/telemetry-summary?days=7` (also rewritten from `/telemetry-summary`): Read-only summary protected by `TELEMETRY_ADMIN_KEY`.

### Deploying & Setting `TELEMETRY_ADMIN_KEY`

1. In the Netlify dashboard for `meridian-strike-wiki`, navigate to **Site configuration** > **Environment variables**.
2. Add:
   - **Key**: `TELEMETRY_ADMIN_KEY`
   - **Value**: A secure secret key (e.g. generated with `openssl rand -hex 24`)
   - **Scopes**: Functions / All deploys
3. For local testing, add `TELEMETRY_ADMIN_KEY` to your local `.env`.

### Querying the Summary

Send the admin key via `X-Admin-Key` or `Authorization: Bearer <key>`:

```bash
curl -H "X-Admin-Key: <TELEMETRY_ADMIN_KEY>" \
  "https://meridian-strike-wiki.netlify.app/.netlify/functions/telemetry-summary?days=7"
```

The response includes:

- Event counts and unique installations for classified schema-2 production events
- The existing activity funnel and the ordered new-player conversion funnel under `retention`
- Loss-round statistics with explicit unknown counts and battle-scoped inference
- A separate `legacy` section for older/unclassified records, preserved without rewriting history

Known development traffic is excluded from every section by default. Select
`channel=development` explicitly for diagnostics. Filter `edition`, `channel` and
`build` to compare release cohorts. See [the reporting contract](docs/RETENTION_MEASUREMENT.md)
for exact populations, fields and retention definitions.

### Local Testing

Start Netlify dev and run the verification script or test suite:

```bash
npm run dev
npm run test:telemetry
# Or run vitest:
npm test
```

Live site: `https://meridian-strike-wiki.netlify.app`

Owner/operator runbook (upload flow, dev vs staging vs production, testing): [docs/OWNER_COMMUNITY_GUIDE.md](docs/OWNER_COMMUNITY_GUIDE.md).
