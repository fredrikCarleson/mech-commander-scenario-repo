# Mech Commander Community Scenario Repository — Implementation Plan

## 1. Repository structure

```
mech-commander-scenario-repo/
├── PLAN.md
├── README.md
├── netlify.toml
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── shared/                          # Isomorphic types, Zod schemas, validation
│   ├── constants.ts
│   ├── blob-keys.ts
│   ├── compatibility.ts
│   ├── schemas/
│   │   ├── manifest.ts
│   │   ├── map.ts
│   │   ├── scenario-file.ts
│   │   ├── metadata.ts
│   │   └── api.ts
│   └── validation/
│       ├── zip-security.ts
│       └── package-validator.ts
├── netlify/functions/
│   ├── lib/
│   │   ├── blob-store.ts
│   │   ├── scenario-service.ts
│   │   └── http.ts
│   └── api-v1.ts                    # Single router for /api/v1/*
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/global.css
│   ├── api/client.ts
│   ├── lib/
│   │   ├── client-id.ts
│   │   └── package-preview.ts
│   ├── components/
│   └── pages/
│       ├── CataloguePage.tsx
│       ├── DetailPage.tsx
│       ├── UploadPage.tsx
│       └── ApiInfoPage.tsx
├── tests/
│   ├── schemas.test.ts
│   ├── package-validator.test.ts
│   ├── scenario-service.test.ts
│   └── compatibility.test.ts
└── fixtures/
    ├── valid-package/               # Source files for building test ZIPs
    └── build-fixtures.ts
```

## 2. Domain model

### Scenario package (upload artifact)

Immutable ZIP-compatible archive with exactly four root-level files:

| File             | Purpose                                      |
| ---------------- | -------------------------------------------- |
| `manifest.json`  | Authoritative metadata + schema version      |
| `scenario.json`  | Game scenario definition                     |
| `map.json`       | Map layout; supplies width/height dimensions |
| `thumbnail.webp` | Preview image (WebP only)                    |

### Stored metadata (`ScenarioMetadata`)

Server-owned record in Netlify Blobs (one blob per scenario). Fields:

- `metadataSchemaVersion` — repository record format version
- `id` — server-generated UUID v4
- `title`, `description`, `authorDisplayName`
- `gameVersion`, `scenarioFormatVersion`
- `difficulty`, `recommendedTonnage`, `maximumTonnage`, `estimatedPlayTimeMinutes`
- `tags`, `mapDimensions: { width, height }`
- `averageRating`, `ratingCount`, `downloadCount`
- `packageFileSize`, `checksumSha256`
- `createdAt`, `updatedAt` (ISO 8601)
- `publicationStatus` — `published` | `draft` | `archived`
- `compatibility` — derived support flags + warnings

### Rating record (`ScenarioRatings`)

Separate blob per scenario: `{ ratings: [{ clientId, rating, updatedAt }] }`. One rating per `clientId`; POST replaces existing entry.

## 3. Scenario-package specification

### manifest.json (schema version `1.0.0`)

```json
{
  "schemaVersion": "1.0.0",
  "title": "string",
  "description": "string",
  "author": "string",
  "gameVersion": "semver string",
  "scenarioFormatVersion": "semver string",
  "difficulty": "recruit|regular|veteran|elite",
  "recommendedTonnage": 3600,
  "maximumTonnage": 4800,
  "estimatedPlayTimeMinutes": 45,
  "tags": ["urban", "night"]
}
```

### map.json

```json
{
  "schemaVersion": "1.0.0",
  "width": 32,
  "height": 24
}
```

### scenario.json

Minimum: valid JSON object with `schemaVersion` and `name` fields (extensible for game).

### Supported versions

Declared in `shared/constants.ts`. Upload rejected if manifest/map/scenario `schemaVersion` or manifest game/format versions are unsupported.

## 4. Netlify Blob layout

Store name: `mech-scenarios` (configurable via `SCENARIO_BLOB_STORE`).

| Key pattern                 | Content type          | Mutable                         |
| --------------------------- | --------------------- | ------------------------------- |
| `meta/{scenarioId}.json`    | ScenarioMetadata JSON | Yes (counts, ratings aggregate) |
| `pkg/{scenarioId}.zip`      | Raw package bytes     | No (immutable after upload)     |
| `ratings/{scenarioId}.json` | Ratings array         | Yes                             |

**Never** store all scenarios in one JSON document. Listing uses `list({ prefix: 'meta/' })`.

## 5. API contracts

Base path: `/api/v1`

### `GET /scenarios`

Query: `page`, `limit`, `search`, `difficulty`, `maxTonnage`, `tags` (comma-separated), `sort` (`newest`|`rating`|`downloads`)

Response:

```json
{
  "items": [ScenarioMetadata],
  "page": 1,
  "limit": 20,
  "total": 42,
  "totalPages": 3
}
```

### `GET /scenarios/:id`

Returns full `ScenarioMetadata` or 404.

### `GET /scenarios/:id/download`

Returns `application/zip` with `Content-Disposition: attachment`. Increments `downloadCount`.

### `POST /scenarios`

Body: raw ZIP (`Content-Type: application/zip` or `application/octet-stream`).

Response `201`: `{ "id": "...", "metadata": ScenarioMetadata }`

Errors: `400` validation, `413` size, `415` wrong content type.

### `POST /scenarios/:id/ratings`

Body: `{ "rating": 1-5, "clientId": "uuid" }`

Replaces prior rating from same `clientId`. Updates aggregate on metadata.

Response `200`: `{ "averageRating", "ratingCount", "yourRating" }`

## 6. Validation strategy

| Layer  | Responsibility                                                            |
| ------ | ------------------------------------------------------------------------- |
| Client | ZIP inspect + Zod parse for instant UX preview; blocks submit until valid |
| Server | Re-run all checks; never trust client; assign ID, checksum, timestamps    |

Shared `package-validator.ts` used by both (imported in client preview and server upload).

Validation order:

1. Compressed size limit
2. ZIP parse + path security
3. Decompressed size limit
4. Required files present, no extras
5. Extension / MIME allow-list
6. JSON parse + Zod schema
7. Version compatibility
8. WebP magic-byte check on thumbnail

## 7. Security controls

- `MAX_COMPRESSED_BYTES` = 10 MiB
- `MAX_DECOMPRESSED_BYTES` = 50 MiB
- Reject `..`, `\`, leading `/`, Windows drive letters, NUL bytes in paths
- Allow-list root files only: four required names
- Reject `.html`, `.js`, `.svg`, executables, etc.
- Thumbnail: `.webp` only, validate RIFF/WEBP header
- JSON only for `*.json` files; no HTML rendering of user content (React text nodes only)
- IDs and SHA-256 computed server-side only
- `Content-Security-Policy` header on static site

## 8. Testing strategy

Vitest unit/integration tests:

| Test file                   | Coverage                                                          |
| --------------------------- | ----------------------------------------------------------------- |
| `schemas.test.ts`           | Zod accept/reject cases                                           |
| `package-validator.test.ts` | Valid upload, missing manifest, bad version, oversized, traversal |
| `scenario-service.test.ts`  | Listing filters, rating replacement, mock blob store              |
| `compatibility.test.ts`     | Version matrix                                                    |

Fixtures: programmatic ZIP builder in `fixtures/build-fixtures.ts` + static JSON sources.

## 9. Milestones

| #   | Milestone                                      | Verification                                  |
| --- | ---------------------------------------------- | --------------------------------------------- |
| M1  | Scaffold, config, PLAN, constants, Zod schemas | `npm run typecheck`                           |
| M2  | ZIP validation + shared package validator      | `npm test` (validator tests)                  |
| M3  | Blob store + scenario service + API router     | `npm test` (service tests)                    |
| M4  | React pages + API client + styling             | `npm run build`                               |
| M5  | Fixtures, README, netlify.toml polish          | `npm run format`, `npm test`, `npm run build` |

## 10. Environment configuration

| Variable                 | Default          | Purpose                   |
| ------------------------ | ---------------- | ------------------------- |
| `SCENARIO_BLOB_STORE`    | `mech-scenarios` | Netlify Blobs store name  |
| `MAX_COMPRESSED_BYTES`   | `10485760`       | Override upload limit     |
| `MAX_DECOMPRESSED_BYTES` | `52428800`       | Override decompress limit |

Local dev: `netlify dev` with Netlify Blobs local emulation.
