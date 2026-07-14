# Mech Commander Community Scenario Repository

Production-ready MVP for browsing, uploading, downloading, and rating community scenario packages for Mech Commander.

## Architecture

- **Frontend**: React + TypeScript + Vite SPA with a restrained military sci-fi UI
- **API**: Netlify Functions (`netlify/functions/api-v1.ts`) exposing versioned REST endpoints under `/api/v1`
- **Storage**: Netlify Blobs — one metadata blob and one package blob per scenario (no monolithic JSON catalogue)
- **Shared layer**: `shared/` contains Zod schemas, constants, and ZIP validation used by both client preview and server upload

```
Browser ──► Vite SPA ──► /api/v1/* ──► Netlify Function ──► Netlify Blobs
                              │
                              └── shared validation (server re-validates everything)
```

See [PLAN.md](./PLAN.md) for the full design document.

## Local development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

### Run with Netlify CLI (recommended)

Starts Vite on port 5173 and Netlify Dev on port 8888 with Functions + Blobs emulation.

**Important:** the dev server must be running before you open the site. In a terminal:

```bash
cd C:\Users\fredr\Projects\mech-commander-scenario-repo
npm run dev
```

Wait until you see:

```
Local dev server ready: http://localhost:8888
```

Then open [http://localhost:8888](http://localhost:8888).

Use **port 8888**, not 5173. Port 5173 is Vite only and does not serve `/api/v1` routes unless Netlify Dev is proxying it.

To stop the server, press `Ctrl+C` in the terminal where `npm run dev` is running.

### Vite only (UI without API)

```bash
npm run dev:vite
```

API calls proxy to `localhost:8888` when Netlify Dev is also running. Without it, catalogue/upload API calls will fail.

## Scripts

| Command                | Purpose                               |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | Netlify Dev (SPA + Functions + Blobs) |
| `npm run build`        | Typecheck + production SPA build      |
| `npm run typecheck`    | TypeScript project build              |
| `npm test`             | Vitest unit/integration tests         |
| `npm run format`       | Prettier write                        |
| `npm run format:check` | Prettier check                        |

## API endpoints

Base path: `/api/v1`

| Method | Path                      | Description                                                                               |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/scenarios`              | Paginated list with `page`, `limit`, `search`, `difficulty`, `maxTonnage`, `tags`, `sort` |
| GET    | `/scenarios/:id`          | Scenario metadata                                                                         |
| GET    | `/scenarios/:id/download` | ZIP download (increments `downloadCount`)                                                 |
| POST   | `/scenarios`              | Upload ZIP (`Content-Type: application/zip`)                                              |
| POST   | `/scenarios/:id/ratings`  | Body: `{ "rating": 1-5, "clientId": "uuid" }`                                             |

## Netlify Blob keys

Store name: `mech-scenarios` (override with `SCENARIO_BLOB_STORE`).

| Key                 | Contents                      |
| ------------------- | ----------------------------- |
| `meta/{id}.json`    | `ScenarioMetadata` record     |
| `pkg/{id}.zip`      | Raw package bytes (immutable) |
| `thumb/{id}.webp`   | Extracted thumbnail image     |
| `ratings/{id}.json` | Per-client rating entries     |

## Scenario package specification

Root-level files only:

- `manifest.json` — title, author, versions, difficulty, tonnage, tags
- `scenario.json` — game scenario definition (`schemaVersion`, `name` minimum)
- `map.json` — `width`, `height`, `schemaVersion`
- `thumbnail.webp` — WebP preview image

Example fixtures live in `fixtures/valid-package/`. Tests build ZIP archives programmatically via `fixtures/build-fixtures.ts`.

## Environment variables

| Variable                 | Default             | Description              |
| ------------------------ | ------------------- | ------------------------ |
| `SCENARIO_BLOB_STORE`    | `mech-scenarios`    | Netlify Blobs store name |
| `MAX_COMPRESSED_BYTES`   | `10485760` (10 MiB) | Max upload size          |
| `MAX_DECOMPRESSED_BYTES` | `52428800` (50 MiB) | Max extracted size       |

## Security

- Server-side ID generation and SHA-256 checksums
- ZIP path traversal, absolute path, and directory rejection
- Compressed and decompressed size limits
- Allow-listed root files and extensions only
- Malformed JSON and unsupported schema versions rejected
- No rendering of uploaded HTML; CSP headers on static responses
- Client validation is preview-only; server never trusts the client

## Testing

```bash
npm test
```

Covers schema validation, valid/invalid uploads, path traversal, oversized packages, listing filters, rating replacement, and compatibility detection.

## Deployment

**Live site:** [https://mech-commander-scenario-repo.netlify.app](https://mech-commander-scenario-repo.netlify.app)

**Netlify dashboard:** [https://app.netlify.com/projects/mech-commander-scenario-repo](https://app.netlify.com/projects/mech-commander-scenario-repo)

### Netlify (already configured)

This project is linked to Netlify site `mech-commander-scenario-repo`. Deploy updates with:

```bash
npx netlify deploy --prod
```

Or connect GitHub for automatic deploys on push (see below).

### GitHub repository

Create and push the repository (requires [GitHub CLI](https://cli.github.com/) login):

```bash
gh auth login
gh repo create mech-commander-scenario-repo --public --source=. --remote=origin --push
```

Then connect the repo in Netlify: **Site configuration → Build & deploy → Link repository**.

### Manual Netlify setup (new sites)

1. Connect the repository to [Netlify](https://www.netlify.com/).
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Functions directory: `netlify/functions` (configured in `netlify.toml`)
5. Enable Netlify Blobs for the site.

Netlify automatically builds and deploys Functions defined in `netlify.toml` redirects.

## Pages

1. `/` — Community scenario catalogue
2. `/scenarios/:id` — Scenario detail, download, rating
3. `/upload` — Package validation preview and upload
4. `/api` — API and compatibility reference
