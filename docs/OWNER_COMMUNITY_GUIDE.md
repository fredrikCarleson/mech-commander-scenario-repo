# Owner guide — community publishing

This is the operator runbook for **you** (game owner / admin). Players use the public wiki. Do not paste secrets, session JWTs, Netlify tokens, or Google client secrets into chat or git.

Public site: `https://meridian-strike-wiki.netlify.app`  
Admin queue: `https://meridian-strike-wiki.netlify.app/admin`

Related: [COMMUNITY_OPERATOR_SETUP.md](./COMMUNITY_OPERATOR_SETUP.md), [COMMUNITY_MIGRATION_AND_ROLLBACK.md](./COMMUNITY_MIGRATION_AND_ROLLBACK.md).

---

## Two different “environments”

Do not mix these up.

### 1. Game build environment (how the `.exe` is compiled)

| Game env | What it is | Community API it should call |
| --- | --- | --- |
| **development** | `npm run dev` / unpackaged Electron on your machine | Local Netlify **or** production, depending on `.env.local` |
| **staging** | Packaged candidate / Steam private branch | Candidate API only |
| **production** | Steam public Full build | Production API only |

Edition is separate: **Full** has Custom Scenarios, Campaign Workshop, Mercenary Board, and publishing. **Demo** has none of those.

### 2. Community API environment (Netlify identity + Blob store)

| API env | URL | Blob store | When to use |
| --- | --- | --- | --- |
| **development** | `http://localhost:8888/api/v1` | `mech-scenarios-development-v1` | Throwaway uploads, validator tests, admin-queue practice |
| **staging** | `https://candidate--meridian-strike-wiki.netlify.app/api/v1` | `mech-scenarios-candidate-v1` | Packaged sign-in and publish tests that must not touch live maps |
| **production** | `https://meridian-strike-wiki.netlify.app/api/v1` | `mech-scenarios` | Real players. Live catalogue. |

Each store, session secret, and API origin is isolated on purpose. A staging Function **cannot** be pointed at the production Blob store; it fail-closes.

Sessions do **not** transfer. Sign in again on each environment. `SESSION_SIGNING_SECRET` is different for local, preview, and production.

---

## How you upload a scenario

Publishing is **only** from the Full Edition desktop app. Not the website, not the demo, not browser hot-reload.

1. Run the **desktop** game (Electron), Full Edition.
2. Confirm it is talking to the API you intend (see [Pointing the game](#pointing-the-game-at-dev-staging-or-prod)).
3. Open **Custom Scenarios**. Build, save, and **playtest** the map locally.
4. Sign in with Google on the creator panel. A system browser opens (PKCE, no client secret).
5. Click **Upload**. Wait for validation. Status becomes pending.
6. Open `/admin` **on the same environment**, sign in with the **Web** Google button (wiki admin, not the Desktop client).
7. Approve only if you want that environment’s catalogue to show it.

**Update** submits a new immutable revision. The last approved revision stays public until the new one is approved.

**Unpublish / Withdraw** takes it out of the catalogue. It does not delete immutable revision bytes.

---

## How you upload a campaign

1. Playtest every mission as a custom scenario first.
2. Open **Campaign Workshop**. Stable ID must start with `custom-` or `user-` and never changes.
3. Images only (PNG / JPEG / WebP). No community video.
4. Do not publish an imported campaign; **Fork to edit** first.
5. Sign in, then publish from the workshop. Same pending → `/admin` approve path as scenarios.
6. After the first approval, mission IDs and order are locked. A reorder needs a **new** campaign, not a revision.

---

## Admin review

- Wiki `/admin` uses the **Web** OAuth client (`VITE_GOOGLE_CLIENT_ID`).
- The game uses the **Desktop** OAuth client (`COMMUNITY_GOOGLE_OAUTH_CLIENT_ID`).
- Admin rights are `ADMIN_GOOGLE_SUBS` (your Google `sub`), not email.
- Approve/reject names a **revision**. Reject with a reason; the owner sees it on status.
- Do not approve throwaway tests on **production**. Use local or staging.
- **Save the Scientist** is a real pending production draft. Treat it as player content unless you mean to reject it.

Pending content must stay unpublished: catalogue, detail, latest download, thumbnail, and `/releases/N/download` all 404 until approval.

---

## Pointing the game at dev, staging, or prod

In `C:\VSCode\mech-command\.env.local` (gitignored):

```env
COMMUNITY_GOOGLE_OAUTH_CLIENT_ID=<Desktop client ID only>
# Optional. Omit this to use production from a non-DEV packaged build.
# VITE_SCENARIO_REPO_API_BASE=http://localhost:8888/api/v1
```

| Goal | What to run | `VITE_SCENARIO_REPO_API_BASE` |
| --- | --- | --- |
| Local end-to-end | Wiki: `npm run dev` (port 8888). Game: desktop Full. | `http://localhost:8888/api/v1` |
| Staging packaged test | Candidate Netlify site healthy. Packaged Full **staging** build. | Baked in at package time to the candidate origin. Do not ship production URL here. |
| Live players | Packaged Full **production** / Steam. | Production origin. No `.env.local` override in the artifact. |

Notes:

- `npm run dev` in the **browser** cannot publish. The UI says so. Use Electron.
- `VITE_DEV_MOCK_COMMUNITY_CREATOR_EMAIL` is browser-only fake identity. It does **not** publish. Never put it in a packaged build.
- Vite `VITE_*` values are compile-time. Changing `.env.local` does not change an already packaged `.exe`.
- CORS must include the game’s loopback origin (`http://127.0.0.1:42647`, and `42648` on staging). Production already has `42647`.
- Production packaged builds fail closed if the public Desktop client ID or HTTPS API origin is missing. They must not fall back to localhost.

For wiki local Functions, use the community repo `.env.local` from [COMMUNITY_OPERATOR_SETUP.md](./COMMUNITY_OPERATOR_SETUP.md) section 4.1. Use a **different** `SESSION_SIGNING_SECRET` than production.

---

## What to test where

### Local development

Safe to break. Confirm:

- Sign-in round-trip in Electron
- Scenario upload → pending on `http://localhost:8888/admin`
- Campaign upload with images, rejection of video
- Approve → appears in catalogue and in-game install
- Update while approved revision stays downloadable
- Withdraw; revision URL still works for previously approved revisions
- Demo build has no workshop / board / publish
- Official campaigns still load (Cloudflare, not this API)

### Staging / candidate

Use this before Steam. Same checks as local, plus:

- Packaged `.exe` (not `npm run dev`)
- Google consent screen on a clean Windows profile
- Candidate Blob store stays empty of production maps (isolated namespace)
- No production URL or production Blob name in the artifact
- Secret audit: no `GOCSPX-`, no `SESSION_SIGNING_SECRET`, no Netlify token

### Production

Players. Extra care:

- Do not upload junk
- After any Function deploy, hit `GET /api/v1/scenarios` and one known map download
- Compare ZIP SHA-256 to the backup if you touched Blobs
- Rollback for mutations is `COMMUNITY_MUTATION_MODE=disabled` (catalogue still serves). Do **not** restore the old anonymous-upload deploy
- Keep `ADMIN_EMAILS` until the observation window ends; do not add `ADMIN_API_KEY`
- Do not change Cloudflare for community work

---

## Production data (current)

Backup (keep this file): `C:\Users\fredr\secure-backups\community-before-migration.json`  
SHA-256: `0b2fa9ee265a083735fa4a6e1b7b8ac6563162aecb2731f515fa2626048dac9d`

Additive migration is already applied (`mech-scenarios`, 42 blobs). Do not run apply again unless a new backup + dry-run says writes are needed.

Authorized apply (never put the token on the command line):

```powershell
$env:NETLIFY_AUTH_TOKEN = "<session-only token>"
$env:NETLIFY_SITE_ID = "<meridian-strike-wiki site id>"
node scripts/community-blob-apply.mjs --store mech-scenarios --environment production --input C:\Users\fredr\secure-backups\community-before-migration.json --confirm production
```

The apply command refuses if live ETags drifted from that backup.

---

## Do not

- Store a Google **client secret** anywhere (Desktop clients may display one; ignore it)
- Point staging at `mech-scenarios` (production store)
- Publish from Demo or from browser hot-reload
- Approve local test maps onto production
- Commit `.env.local`
- Delete immutable revision blobs as a rollback
