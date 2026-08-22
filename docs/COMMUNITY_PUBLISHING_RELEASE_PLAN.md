# Community Publishing and Steam Release Plan

Status: implementation in progress after blocker-resolution amendment  
Prepared: 2026-08-21  
Implementation authorized: **Yes - release owner request dated 2026-08-22**  
Production deployment authorized: **No**

Independent review: **Reviewer 1 — amendments required before implementation approval**

This document is the implementation checklist for safely completing, committing, and deploying community scenario and campaign publishing for Meridian Strike. It covers both repositories and the small number of external configuration changes required for the shipped Steam `.exe`.

Nothing in this document authorizes a production change. Checkboxes should be marked complete only when the named evidence exists.

## 1. Repository and service labels

Every task is labeled with its change location.

| Label                | Repository or service                             | Local path / location                    |
| -------------------- | ------------------------------------------------- | ---------------------------------------- |
| **[COMMUNITY REPO]** | `fredrikCarleson/mech-commander-scenario-repo`    | `C:\VSCode\mech-commander-scenario-repo` |
| **[GAME REPO]**      | `fredrikCarleson/mech-command`                    | `C:\VSCode\mech-command`                 |
| **[NETLIFY]**        | `meridian-strike-wiki` site, Functions, and Blobs | Netlify dashboard                        |
| **[GOOGLE]**         | Google OAuth configuration                        | Google Cloud Console                     |
| **[STEAM]**          | Full and demo release validation                  | Steamworks / Steam client                |
| **[CLOUDFLARE]**     | Official campaigns and DLC only                   | Existing Workers deployment              |

## 2. Agreed architecture

- [x] **[ALL]** Keep official campaigns and DLC on the existing Cloudflare service.
- [x] **[ALL]** Keep player-created scenarios and campaigns in the separate Netlify community service.
- [x] **[ALL]** Require a verified player login before a scenario or campaign can be submitted or updated.
- [x] **[ALL]** Keep browsing, downloading, and rating approved community content anonymous.
- [x] **[ALL]** Require manual admin approval before a new upload or revision becomes public.
- [x] **[ALL]** Treat the Steam `.exe` as the primary supported player client.
- [x] **[ALL]** Keep community creation and community content out of the Steam demo edition.
- [x] **[ALL]** Do not allow video files in player-created campaigns.
- [x] **[ALL]** Limit each image in a community campaign package to 1 MiB.
- [x] **[ALL]** Use a conservative total compressed upload limit of 4,000,000 bytes and a decompressed limit of 20 MiB for community packages.
- [x] **[ALL]** Do not add R2, a second database, a second Netlify site, or chunked upload unless the simple Netlify design proves insufficient in real packaged-client testing.

> **REVIEWER 2 — BLOCKER: The plan does not define an isolated non-production community environment.**
>
> A second Netlify site is not necessarily required, but a deploy preview using the current store adapters reads and writes the same site-wide Blob namespace by default. The plan later requires a candidate API test “without changing production records” while the packaged Electron authentication controller and production renderer are both pinned to the production community origin. That test cannot be performed safely or faithfully until the plan defines separate development/staging/production Blob store names (or another proven isolation mechanism), environment-specific session secrets and Google audiences, and a reviewed packaged API-origin setting. The isolation mechanism must include a test that writes a sentinel in the candidate environment and proves it is absent from production.
>
> Evidence:
>
> - community site: `netlify/functions/lib/netlify-blob-store.ts`, `createNetlifyBlobStore()` calls `getStore()` with the site-wide `SCENARIO_BLOB_STORE`/default name.
> - community site: `netlify/functions/lib/netlify-campaign-blob-store.ts`, `createNetlifyCampaignBlobStore()` uses the same store name.
> - game: `electron/main.cjs`, `COMMUNITY_ORIGIN` is hard-coded to `https://meridian-strike-wiki.netlify.app` and is passed to `createCommunityAuthController()`.
> - game: `src/api/communityRepository.ts`, `SCENARIO_REPO_API_BASE` defaults to the production Netlify API outside development.
> - Netlify documents that Blobs are site-scoped stores and that consistency/configuration is selected at store creation: [Netlify Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

### Why the total package limit is required

Netlify Functions have a 6 MB buffered request/response limit. Binary request bodies can incur Base64 overhead, leaving roughly 4.5 MB of usable payload. A 1 MiB per-image rule alone is not enough because a campaign may contain several images. The 4,000,000-byte compressed-package limit is therefore the authoritative network limit; the per-image rule is an additional content rule.

The limits must be constants in both applications, not adjustable production environment variables. This prevents the game and server from silently accepting different package sizes.

## 3. Scope boundaries

### In scope

- Authenticated community submissions from the full Steam `.exe`.
- Ownership based on the immutable Google `sub` identifier.
- Scenario and campaign submissions, revisions, status, withdrawal, moderation, and publication.
- Netlify Blobs storage and the existing Netlify catalogue/admin site.
- Safe migration of existing published and draft records.
- Compatibility with existing community scenarios and maps.
- Explicit campaign provenance so community content cannot be treated as official DLC.
- Release, rollback, and packaged Steam-client verification.

### Out of scope

- Moving official Cloudflare content to Netlify.
- Moving community content to Cloudflare or R2.
- Community video hosting.
- A new account database or password system.
- Steam identity integration for this release; Google remains the creator identity provider.
- Enabling creation or community content in the demo.
- Reworking official campaign intro/aftermath videos.

## 4. Verified baseline

These items describe the investigation baseline and are already complete. They are not implementation claims.

- [x] **[COMMUNITY REPO]** Fetched GitHub and verified local `main` matched `origin/main` at `371f994d77639e9d1345dd79cddb018539eaea04` when reviewed.
- [x] **[COMMUNITY REPO]** Recorded that the worktree contains substantial uncommitted work: authenticated sessions, revisions, campaign API/storage, UI changes, tests, and related documentation/configuration.
- [x] **[COMMUNITY REPO]** Ran the existing validation suite successfully: tests, typecheck, lint, Vite build, and Netlify Function bundle.
- [x] **[GAME REPO]** Fetched GitHub and verified a clean worktree matching `origin/main` at `2361de0b3e264fec251b674192514dafa0ba9be0` when reviewed.
- [x] **[GAME REPO]** Ran focused community tests and typecheck successfully.
- [x] **[GAME REPO]** Reviewed all Markdown documentation under `C:\VSCode\mech-command\docs` for community, campaign, edition, release, entitlement, and Cloudflare requirements.
- [x] **[NETLIFY]** Confirmed the current production site serves the scenario API, but the new `/api/v1/campaigns` and `/api/v1/auth/me` routes are not deployed yet and currently fall through to the SPA HTML response.
- [x] **[NETLIFY]** Confirmed the dashboard already has `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, and `VITE_GOOGLE_CLIENT_ID`.
- [x] **[COMMUNITY REPO]** Confirmed the five existing published scenario packages are approximately 330-449 KB and comfortably fit the proposed limit.
- [x] **[CLOUDFLARE]** Confirmed official dev, staging, and production manifest endpoints respond successfully.
- [x] **[CLOUDFLARE]** Confirmed the official-content Worker tests, typecheck, and explicit-config production dry run pass.

### Known baseline risks

- **[COMMUNITY REPO]** The uncommitted changes have not yet been split into reviewable commits.
- **[COMMUNITY REPO]** Campaign validation currently allows `.mp4` and `.webm`, allows 50 MiB compressed / 120 MiB decompressed, and does not enforce a 1 MiB image limit.
- **[COMMUNITY REPO]** Legacy draft records can appear in the new admin queue but do not yet have all revision/submission records required by the new approval path.
- **[COMMUNITY REPO]** Blob promotion consists of several writes and is not a database transaction; it must be made idempotent and ordered so a failed approval cannot take the currently approved revision offline.
- **[COMMUNITY REPO]** The public website upload client does not send creator authorization. Player upload should be removed/hidden there because uploads will originate in the game.
- **[COMMUNITY REPO]** `google48b8a2507ad09bf5.html` at repository root is an untracked stale duplicate; the working public verification file is under `public/`.
- **[GAME REPO]** Desktop OAuth currently requires a client secret, which must never be shipped in an `.exe`.
- **[GAME REPO]** Production release configuration currently forces campaign authoring off, so the full Steam build cannot publish yet.
- **[GAME REPO]** Campaign source resolution currently treats every campaign as `bundled-official`, which is unsafe for community imports and future DLC entitlement decisions.
- **[GAME REPO]** The custom campaign editor and validator currently support video fields and larger media.
- **[GAME REPO]** Some current documentation incorrectly mixes the private official Content Studio with the player community workflow.

## 5. Target authentication and authorization model

### Player and admin flow

1. The full Steam `.exe` opens the system browser for Google OAuth.
2. The desktop client uses authorization-code flow with PKCE, a random loopback callback port, `state`, and `nonce`.
3. The desktop client exchanges the authorization code without a packaged client secret.
4. The game sends the Google ID token to `POST /api/v1/auth/session`.
5. Netlify verifies signature, issuer, expiry, email verification, and an accepted audience.
6. Netlify issues a short-lived community session token containing the immutable Google `sub`.
7. Electron stores the session using `safeStorage`; upload/update requests send it as a bearer token.
8. The first uploader becomes the owner. Only that `sub` may update, check private status, or withdraw the item.
9. Admin access additionally requires the `sub` to be present in `ADMIN_GOOGLE_SUBS`.

### Required configuration

| Variable                               | Location                     | Action                        | Secret?              | Notes                                                                                                                       |
| -------------------------------------- | ---------------------------- | ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID`                | **[NETLIFY]**                | Keep                          | No                   | Web OAuth client ID used by the website admin sign-in button.                                                               |
| `GOOGLE_CLIENT_ID`                     | **[NETLIFY]**                | Keep during migration         | No                   | Existing Web OAuth audience and backward-compatible single-value setting.                                                   |
| `GOOGLE_CLIENT_IDS`                    | **[NETLIFY]**                | Add                           | No                   | Comma-separated accepted Web and Desktop OAuth client IDs. Do not replace the Web ID with only the Desktop ID.              |
| `SESSION_SIGNING_SECRET`               | **[NETLIFY]**                | Add                           | **Yes**              | At least 32 cryptographically random bytes. Never commit, log, or place in a Vite variable. Rotating it signs everyone out. |
| `ADMIN_GOOGLE_SUBS`                    | **[NETLIFY]**                | Add                           | Sensitive identifier | Comma-separated immutable Google subject IDs for administrators.                                                            |
| `ADMIN_EMAILS`                         | **[NETLIFY]**                | Keep temporarily, then retire | Sensitive identifier | Existing admin migration fallback only; email must not remain the final authorization key.                                  |
| `COMMUNITY_GOOGLE_OAUTH_CLIENT_ID`     | **[GAME build environment]** | Add to full release build     | No                   | Public Desktop OAuth client ID embedded in the full Steam build.                                                            |
| `COMMUNITY_GOOGLE_OAUTH_CLIENT_SECRET` | **[GAME build environment]** | Remove requirement            | **Must not ship**    | No distributed desktop application can keep this secret.                                                                    |

No `ADMIN_API_KEY`, Cloudflare credential, R2 credential, or package-limit environment variable is required for the target player workflow.

## 5A. Implementation contracts resolving Reviewer 2 blockers

These contracts are the implementation authority for the dependent checklist items. They do not authorize deployment, dashboard changes, production data access, or migration execution.

### Community environment matrix

| Concern                    | Development                                              | Candidate / staging                                                                                | Production                                                                                                         |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| API origin                 | `http://localhost:8888/api/v1`                           | Explicit HTTPS deploy-preview or staging branch URL ending in `/api/v1`; never the production host | `https://meridian-strike-wiki.netlify.app/api/v1`                                                                  |
| Netlify context            | `dev`                                                    | `deploy-preview` or `branch-deploy`                                                                | `production`                                                                                                       |
| `COMMUNITY_ENVIRONMENT`    | `development`                                            | `staging`                                                                                          | `production`                                                                                                       |
| Blob store                 | `mech-scenarios-development-v1`                          | `mech-scenarios-candidate-v1`                                                                      | Existing `mech-scenarios`, preserving legacy records                                                               |
| Blob consistency           | Strong for service reads                                 | Strong for service reads                                                                           | Strong for service reads; immutable release reads may later be relaxed only after activation correctness is proven |
| Google audiences           | Separate development Web/Desktop public client IDs       | Separate staging Web/Desktop public client IDs                                                     | Reviewed production Web/Desktop public client IDs                                                                  |
| Session secret identity    | `development-v1` and a local-only secret                 | `candidate-v1` and a candidate-only secret                                                         | `production-v1` and a production-only secret                                                                       |
| Admin subjects             | Development-only subjects                                | Candidate-only subjects                                                                            | Reviewed production subjects                                                                                       |
| CORS                       | Loopback Vite/Netlify and packaged loopback origins only | Candidate site plus packaged loopback origin                                                       | Production site plus packaged loopback origin                                                                      |
| Packaged game API          | Explicit development value                               | Explicit candidate value; build fails if it is missing or points to production                     | Pinned production value                                                                                            |
| Packaged Desktop client ID | Public development Desktop ID                            | Public staging Desktop ID                                                                          | Public production Desktop ID; no client secret                                                                     |

The server validates the environment/store/secret-identity combination at startup. Staging and production fail closed when any identity is absent, when a store name does not match the matrix, or when a candidate origin/store resolves to production. Netlify contextual variables provide actual OAuth audiences, secrets, and admin subjects; secret values never appear in this file, Vite variables, package files, logs, or tests. A local sentinel/configuration test must prove the candidate and production store names differ. A deployed sentinel proof remains a release-owner-operated external acceptance step.

### Campaign and release identity

- **Repository record ID:** server-generated UUID used in API URLs and ownership records.
- **Stable campaign ID:** the `custom-*` or `user-*` campaign ID used by saves and the runtime registry. It is claimed atomically with `onlyIfNew` and remains reserved after withdrawal or administrative deletion.
- **Immutable release ID:** `<repository UUID>:r<positive revision>`. Its package, thumbnail, approved descriptor, and checksum are append-only.
- **Installed revision:** the local campaign record stores repository ID, stable campaign ID, release revision/ID, checksum, and the exact derived local scenario IDs.
- **Save compatibility:** saves continue to identify the stable campaign and derived mission IDs. An update is publishable only when its stable campaign ID and ordered embedded mission-ID list exactly match the first approved release. Mission insertion, removal, rename, or reorder requires a new stable campaign ID/fork. This keeps progression and existing saves compatible without changing the save schema.

Catalogue metadata advertises the latest approved revision and available approved revisions. `GET /campaigns/:repoId/releases/:revision` and `/download` expose supported immutable releases. Update discovery compares the installed revision with the latest approved revision; adoption is always an explicit player action. The client downloads and verifies the selected release fully before touching local persistence. A failed update retains the prior local campaign, scenarios, media, revision, and save compatibility.

Owner withdrawal removes the mutable catalogue/detail/latest-download pointer but does not delete local installations or approved immutable releases. Revision-specific downloads remain available for reinstall/rollback while the record is withdrawn. Explicit administrative deletion writes an audit tombstone, disables every public route and owner mutation for the record, and retains immutable release blobs for audit/recovery; it does not make them publicly retrievable. Immutable assets are removed only by a separately authorized retention job, which is outside this release.

### Crash-recoverable local installation and update

Campaign import uses the game's existing bounded ZIP reader. Before persistence it verifies the catalogue/header SHA-256, parses every entry, validates campaign/scenario/dialogue/media semantics, derives all local IDs, rejects official/reserved collisions, checks local conflicts, and estimates required storage.

A durable IndexedDB install journal is written before the first scenario mutation. It contains the complete staged replacement plus backups of every campaign/scenario record that may be changed. Writes then proceed in deterministic order and the journal is removed last. Any exception immediately compensates from the journal. Startup recovery compensates an interrupted journal before loading custom registries. Delete/uninstall uses the same mechanism and removes only embedded scenarios whose trusted installation provenance matches the campaign/repository record. Retrying therefore cannot encounter orphaned deterministic IDs, and update failure cannot destroy the last playable revision.

### Blob serialization and activation

All mutation-dependent reads are strong. Store adapters expose ETags and conditional writes. Stable campaign IDs use an atomic claim key with `onlyIfNew`; claims contain repository ID, owner `sub`, and initial checksum so an interrupted same-owner retry can resume safely. Submission and public-pointer transitions use `onlyIfMatch` (or `onlyIfNew` for their first write). Stale update, approve, reject, withdraw, delete, and retry commands return HTTP 409.

Approval requires the reviewed revision in the command. Immutable package, thumbnail, and release descriptor are written and checksum-verified first. Backward-compatible mutable package/thumbnail copies are refreshed next. The conditional public metadata pointer is activated last, and pending cleanup is retryable. Public downloads resolve the immutable release named by the metadata pointer, so a partial legacy-copy write cannot mismatch the active checksum. Download counters are best-effort analytics and never block delivery; ratings use conditional retry rather than uncoordinated last-write-wins updates.

### Abuse control and client IP trust

Module-local rate-limit maps are removed. Two source-controlled Netlify rate-limit rules cover (1) session creation and (2) scenario/campaign create, revision, and rating paths. They aggregate by Netlify's trusted `ip` plus domain at the platform edge, before Function body buffering; application code never trusts client-supplied forwarding headers. Limits have bounded windows and rewrite excess requests to a JSON HTTP-429 function. Local tests verify both deployed rule configurations and independent handler instances; Netlify deploy-log validation remains an external release gate.

### Forward-compatible rollback

`COMMUNITY_MUTATION_MODE` is explicit: `authenticated` for the forward candidate or `disabled` for the rollback artifact. Missing/unknown values fail closed outside local development. Disabled mode keeps anonymous catalogue, detail, thumbnail, immutable/latest download, and rating reads compatible but returns JSON 503 for all content/authenticated mutations; it can read migrated public metadata and never restores anonymous update/delete behavior. Forward and rollback fixtures must use the same legacy public keys and additive response schemas. The currently deployed anonymous-mutation build is not an approved rollback target.

## 6. Implementation checklist

### Phase 0 - Preserve and classify the existing work

- [x] **[COMMUNITY REPO]** Create a named feature branch before modifying the current dirty worktree.
- [x] **[COMMUNITY REPO]** Review every modified and untracked file and classify it as required, unrelated, generated, or stale.
- [x] **[COMMUNITY REPO]** Confirm the root Google verification HTML is redundant, then remove only that stale untracked duplicate; preserve `public/google48b8a2507ad09bf5.html`.
- [x] **[COMMUNITY REPO]** Confirm no `.env`, access token, OAuth secret, session secret, Netlify token, or Blob credential is staged.
- [x] **[COMMUNITY REPO]** Record the pre-change test results and current production API responses in the pull request or release evidence.
- [x] **[GAME REPO]** Create a separate named feature branch; never combine the two repositories in one commit history.
- [x] **[BOTH REPOS]** Inspect project-specific agent/instruction files before implementation. Gameplay or UI work in the game repository must follow its game-design review instructions.

**Gate 0:** Work is preserved on feature branches, secrets are absent, and the exact starting diff is reviewable.

### Phase 1 - Define one shared community package policy

- [x] **[COMMUNITY REPO]** Change scenario and campaign compressed request limits to 4,000,000 bytes.
- [x] **[COMMUNITY REPO]** Change campaign decompressed limit to 20 MiB.
- [x] **[COMMUNITY REPO]** Remove `.mp4` and `.webm` from the campaign package allow-list.
- [x] **[COMMUNITY REPO]** Reject every image inside a community campaign package if its uncompressed size exceeds 1 MiB.
- [x] **[COMMUNITY REPO]** Keep a strict extension allow-list and reject unknown files, dangerous extensions, unsafe paths, duplicate/conflicting paths, excessive entry counts, and ZIP bombs.
- [x] **[COMMUNITY REPO]** Deep-validate every embedded campaign mission and map, not just the presence of `scenario.json` filenames.
- [x] **[COMMUNITY REPO]** Verify embedded mission IDs match campaign references and that IDs cannot collide with reserved official content identifiers.
- [x] **[GAME REPO]** Mirror the exact 4,000,000-byte compressed, 20 MiB decompressed, no-video, and 1 MiB image rules before upload.
- [x] **[GAME REPO]** Show package size and a clear validation error before attempting a network request.
- [x] **[BOTH REPOS]** Add boundary tests at one byte below, exactly at, and one byte above each relevant limit.
- [x] **[BOTH REPOS]** Add malicious ZIP tests for traversal, absolute paths, backslashes, drive letters, NULs, duplicate paths, disallowed extensions, oversized entry count, and decompression overflow.
- [x] **[BOTH REPOS]** Use the existing shared safe-ZIP abstraction in the game; do not introduce an independent permissive ZIP parser.

**Gate 1:** The game cannot create a package that Netlify rejects because of a different size/media policy, and the server independently revalidates everything.

> **REVIEWER 2 — MEDIUM: “No video” must be enforced semantically, not only by filename extension.**
>
> The current game importer trusts each `media/manifest.json` entry's `role` and `mimeType` strings, while the server validator does not validate that manifest. Removing `.mp4`/`.webm` from an extension allow-list still permits an image-named entry to claim a video role/MIME type, and it does not prove that an image contains the expected image format. Add allow-listed media roles, extension/MIME agreement, image signature/dimension validation, rejection of all custom campaign video fields/roles, and equivalent tests in both repositories.
>
> Evidence:
>
> - game: `src/customCampaigns/zip.ts`, `parseCampaignMedia()` accepts arbitrary string `role` and `mimeType` values.
> - community site: `shared/validation/campaign-package-validator.ts`, `validateCampaignPackage()` validates extensions and only checks the root WebP signature; it does not validate `media/manifest.json` or nested image signatures.

### Phase 2 - Complete Netlify authentication and ownership

- [x] **[COMMUNITY REPO]** Finish `POST /api/v1/auth/session` and `GET /api/v1/auth/me` with JSON responses on all paths.
- [x] **[COMMUNITY REPO]** Verify Google tokens against both configured Web and Desktop audiences.
- [x] **[COMMUNITY REPO]** Require verified email but use Google `sub`, not email, as the authorization identifier.
- [x] **[COMMUNITY REPO]** Issue one-hour signed sessions and reject missing, malformed, expired, or incorrectly signed sessions.
- [x] **[COMMUNITY REPO]** Require authentication for new submissions, revisions, private status, and withdrawal.
- [x] **[COMMUNITY REPO]** Require matching owner `sub` for updates/status/withdrawal.
- [x] **[COMMUNITY REPO]** Require `ADMIN_GOOGLE_SUBS` for admin routes; the implementation deliberately omits an email authorization fallback so mutable email is never an admin identity.
- [x] **[COMMUNITY REPO]** Add tests for multiple accepted audiences, wrong audience, unverified email, changed email with same `sub`, expired session, wrong owner, and non-admin access.
- [x] **[COMMUNITY REPO]** Ensure logs and error responses never include raw Google ID tokens or community session tokens.

**Gate 2:** Anonymous users can browse but cannot mutate content; creators can mutate only their own content; admins are authorized by immutable subject ID.

### Phase 3 - Make moderation and Blob writes failure-safe

- [x] **[COMMUNITY REPO]** Preserve the currently approved revision while a replacement revision is pending.
- [x] **[COMMUNITY REPO]** Store submitted packages and thumbnails under immutable revision keys before changing public metadata.
- [x] **[COMMUNITY REPO]** Make approval idempotent so retrying after a partial failure cannot duplicate or corrupt state.
- [x] **[COMMUNITY REPO]** Order approval writes so the public pointer/metadata changes last; cleanup of pending records must be retryable and non-destructive.
- [x] **[COMMUNITY REPO]** Make rejection leave the existing approved revision public.
- [x] **[COMMUNITY REPO]** Ensure permanent deletion is an explicit admin-only operation and cannot be triggered through owner withdrawal.
- [x] **[COMMUNITY REPO]** Add injected-failure tests at every approval write step and verify the previous public revision remains downloadable.
- [x] **[COMMUNITY REPO]** Remove or correct documentation that describes multi-write Blob promotion as transactional/atomic.

**Gate 3:** An interrupted approval never removes or corrupts the last approved scenario/campaign.

> **REVIEWER 2 — HIGH: The race-safety work must explicitly account for Netlify Blobs consistency and conditional writes.**
>
> “Pointer last” ordering alone does not serialize two Functions. The current adapters use default eventually consistent reads, while stable campaign-ID reservation is a list-then-create check and moderation mutations are read/modify/write sequences. Two concurrent creates can therefore publish distinct repository records with the same `stableCampaignId`, and concurrent update/approve/withdraw requests can act on stale state. Define which reads are strong, use `onlyIfNew`/`onlyIfMatch` (or a separately justified lock) for stable-ID claims and state transitions, and test conflicts across independent service instances. Do not rely on the in-memory test store to prove this property.
>
> Evidence:
>
> - community site: `netlify/functions/lib/campaign-service.ts`, `assertStableIdAvailable()` scans metadata/submissions before `uploadCampaign()` creates a new random repository ID; there is no atomic stable-ID claim.
> - community site: `netlify/functions/lib/netlify-campaign-blob-store.ts` and `netlify/functions/lib/netlify-blob-store.ts` create stores without `consistency: "strong"` and do not pass conditional-write options.
> - Netlify states that Blob reads are eventually consistent by default, updates/deletes may take up to 60 seconds to propagate, and writes support ETag/creation preconditions: [Netlify Blobs consistency and conditional writes](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

> **REVIEWER 2 — MEDIUM: Non-critical counters must not make approved downloads unavailable.**
>
> Both download services await a read/modify/write of public metadata to increment `downloadCount` before returning an otherwise valid package. A transient metadata-write failure therefore turns a healthy approved download into HTTP 500, and concurrent downloads lose increments under last-write-wins semantics. Separate analytics/counters from release metadata or make them best-effort and independently observable; apply equivalent failure tests to ratings, whose ratings-document and metadata writes can currently split.
>
> Evidence:
>
> - community site: `netlify/functions/lib/campaign-service.ts`, `downloadCampaign()` awaits `setMetadata(updated)` before returning bytes.
> - community site: `netlify/functions/lib/scenario-service.ts`, `downloadScenario()` uses the same pattern.
> - community site: both `submitRating()` implementations update the ratings document and public metadata as separate Blob writes.

> **REVIEWER 2 — BLOCKER: Campaign identity, release identity, and save compatibility are not defined end to end.**
>
> The proposal creates immutable server revision assets but exposes only a mutable `GET /campaigns/:repoId/download` package. The game records the installed repository revision on the local campaign record, but campaign saves identify only the campaign ID; they do not pin a content revision. The UI has no update path, and an installed campaign cannot actually be reinstalled after deletion because deletion removes only the campaign record while deterministic embedded scenario IDs remain and collide on the next install. An approved revision may also rename/reorder/remove missions, which can invalidate saved mission results and progression.
>
> Before implementation, choose and document one compatible contract: either constrain revisions so they are save-compatible, or persist/pin a release identity and keep revision-specific packages publicly retrievable for the supported save lifetime. Define update detection, user consent, atomic replacement, rollback/downgrade behavior, mission-ID rules, media cleanup, and withdrawn/deleted release behavior. Add cross-version save/load tests and install/update/retry tests. “Delete before reinstalling” is not a valid update strategy in the current game.
>
> Evidence:
>
> - game: `src/customCampaigns/types.ts`, `CustomCampaignRecord.communityPublication` stores `repoId` and `revision`.
> - game: `src/ui/screens/CustomCampaigns.tsx`, `onInstall()` rejects an already installed stable ID, derives mission IDs from repository ID plus ordinal, and rejects any existing derived mission record.
> - game: `src/customCampaigns/registry.ts`, `deleteCustomCampaign()` deletes only the campaign record; it does not delete embedded scenario records.
> - game: campaign save state is keyed by `campaignId` and mission IDs; no community release revision is persisted (`src/campaign/save.ts`, `src/campaign/saveValidation.ts`, and the campaign state definitions).
> - community site: `netlify/functions/lib/campaign-service.ts`, `downloadCampaign()` reads the mutable public package key through `getPackage(id)`, not a caller-selected immutable revision key.

### Phase 4 - Preserve and migrate existing community data

- [x] **[COMMUNITY REPO]** Build a read-only inventory/export procedure for all production Blob keys, metadata, packages, thumbnails, ratings, ownership records, submissions, and revisions.
- [ ] **[NETLIFY]** Run the export and store the backup outside the repository before migration; record counts and SHA-256 hashes.
- [x] **[COMMUNITY REPO]** Add an idempotent dry-run migration that reports proposed changes without writing.
- [x] **[COMMUNITY REPO]** Preserve existing public scenario IDs, packages, checksums, ratings, download counts, creation dates, and publication state.
- [x] **[COMMUNITY REPO]** Keep legacy published scenarios public even when no owner record exists.
- [x] **[COMMUNITY REPO]** Treat ownerless legacy published records as read-only until a separate verified claim or admin assignment is completed; never infer ownership from display name/email.
- [x] **[COMMUNITY REPO]** Convert each legacy draft that should remain reviewable into a valid revision-1/submission record, or explicitly archive it after review.
- [x] **[COMMUNITY REPO]** Add migration fixtures covering published, draft, archived, rated, and partially migrated records.
- [ ] **[NETLIFY]** Run migration once, rerun it to prove idempotency, then compare counts and hashes with the backup.

**Gate 4:** All existing approved maps remain visible, downloadable, and byte-identical; all retained drafts can be approved or rejected through the new path.

### Phase 5 - Finish the community website and API contract

- [x] **[COMMUNITY REPO]** Keep catalogue, detail, download, rating, and admin review surfaces on the website.
- [x] **[COMMUNITY REPO]** Remove or hide the public website upload route and navigation; player publishing is performed from the game.
- [x] **[COMMUNITY REPO]** Finish campaign catalogue/detail/download/admin functionality using the same moderation semantics as scenarios.
- [x] **[COMMUNITY REPO]** Ensure all `/api/v1/*` routes return JSON errors and never fall through to `index.html`.
- [x] **[COMMUNITY REPO]** Keep public scenario response fields and package schema backward compatible with the game.
- [x] **[COMMUNITY REPO]** Document the complete API contract, authentication headers, status values, revision behavior, and package rules.
- [x] **[COMMUNITY REPO]** Add API integration tests for anonymous browse, authenticated create, owner revision, admin approval/rejection, download, rating, withdrawal, and forbidden cross-owner mutation.
- [x] **[COMMUNITY REPO]** Correct minor campaign catalogue presentation issues after functional/API gates pass.

**Gate 5:** The website is a catalogue/admin tool, the API contract is stable, and both scenario and campaign endpoints return the expected JSON/binary content types.

> **REVIEWER 2 — HIGH: Local campaign installation is not transactional and cannot safely retry.**
>
> The current game writes each embedded scenario to IndexedDB before writing the campaign. A validation, quota, or storage failure after any scenario write leaves orphaned deterministic IDs; the next attempt fails because those IDs already exist. Add a preflight over the complete parsed package, a staged/rollback-capable local transaction (or explicit compensating cleanup), and tests for failure after every local write. The same mechanism should support the update contract required above without destroying the last playable local revision.
>
> Evidence:
>
> - game: `src/ui/screens/CustomCampaigns.tsx`, `onInstall()` calls `upsertCustomScenario()` in a loop and only then calls `upsertCustomCampaign()`.
> - game: `src/customScenarios/storage.ts` and `src/customCampaigns/storage.ts` use separate IndexedDB databases/transactions, so the sequence is not atomic.

> **REVIEWER 2 — HIGH: The game does not verify the downloaded package checksum before import.**
>
> Campaign catalogue metadata requires `checksumSha256`, and the API also emits `X-Checksum-Sha256`, but `downloadCommunityCampaignPackage()` discards the response header and `downloadAndParseCommunityCampaign()` immediately parses the bytes. Deep structural validation does not detect a valid-but-wrong package returned after a partial promotion, stale edge read, or storage mismatch. Require SHA-256 verification against the selected release metadata before any local write; treat a mismatch as a retryable consistency/integrity failure and test it. Apply the same contract to scenario downloads.
>
> Evidence:
>
> - game: `src/api/communityCampaignRepository.ts`, `campaignMetadataSchema` requires `checksumSha256`, but `downloadCommunityCampaignPackage()` returns only bytes.
> - game: `src/api/communityCampaignPackage.ts`, `downloadAndParseCommunityCampaign()` parses downloaded bytes without hashing them.
> - community site: `netlify/functions/api-v1.ts` sends `X-Checksum-Sha256` for downloads.

> **REVIEWER 2 — MEDIUM: Preserve the existing `/upload` bookmark as an explanatory migration surface.**
>
> Removing the upload action and navigation is consistent with game-only publishing, but deleting the route would break existing bookmarks and wiki links. Keep `/upload` as a non-mutating page that explains the new in-game flow (or issue a stable redirect to such a page), and add a link regression check.

### Phase 6 - Make desktop Google sign-in safe for distribution

- [ ] **[GOOGLE]** Create or verify a Desktop OAuth client for the shipped game and configure the OAuth consent screen for production use.
- [ ] **[GOOGLE]** Keep the existing Web OAuth client for the Netlify admin website.
- [x] **[GAME REPO]** Remove the desktop client-secret requirement and omit `client_secret` from the PKCE token exchange.
- [x] **[GAME REPO]** Package only the public Desktop client ID in the full build.
- [x] **[GAME REPO]** Keep the existing system-browser, loopback callback, random port, PKCE S256, `state`, and `nonce` protections.
- [x] **[GAME REPO]** Keep community session storage behind Electron `safeStorage` and ensure sign-out deletes it.
- [x] **[GAME REPO]** Ensure the renderer cannot read OAuth tokens except through the narrowly scoped trusted IPC operations needed for authenticated API calls.
- [x] **[GAME REPO]** Add tests proving the packaged configuration needs an ID but no secret and fails closed when the ID is missing or invalid.
- [ ] **[GAME REPO]** Audit the unpacked and packaged application for OAuth secrets, Netlify tokens, Cloudflare secrets, session tokens, `.env` files, and private build metadata.

**Gate 6:** A clean-machine packaged `.exe` can sign in through Google, and the shipped files contain no client secret or service credential.

### Phase 7 - Enable only the intended game editions and surfaces

- [x] **[GAME REPO]** Change feature policy so community scenario/campaign authoring and publishing are available in the full Steam edition.
- [x] **[GAME REPO]** Keep these features disabled in the demo edition.
- [x] **[GAME REPO]** Decide explicitly whether non-Steam standalone full builds retain creator features; encode the decision in tests rather than relying on development mode.
- [x] **[GAME REPO]** Update production release-environment logic so it no longer unconditionally forces full-edition campaign authoring off.
- [x] **[GAME REPO]** Keep QA/dev unlocks and mock creator identities out of public builds.
- [x] **[GAME REPO]** Require sign-in only at mutation time; do not block anonymous browsing/downloading or normal offline play.
- [x] **[GAME REPO]** Provide clear UI states for signed out, signing in, session expired, pending approval, approved, rejected with reason, and withdrawn.
- [x] **[GAME REPO]** Verify scenarios approved by the community service appear as Mercenary missions without changing map interpretation or gameplay schema.

**Gate 7:** Full Steam players can publish after sign-in, demo players cannot access creator/community surfaces, and ordinary game startup/offline play does not depend on Netlify or Google.

### Phase 8 - Remove community video support and enforce image limits

- [x] **[GAME REPO]** Remove video selection controls from the custom campaign editor.
- [x] **[GAME REPO]** Remove managed custom/community video files from campaign ZIP generation and import.
- [x] **[GAME REPO]** Make custom campaign aftermath work with text and still images; do not require `videoSrc` or other video-only fields.
- [x] **[GAME REPO]** Reject imported community campaign packages containing `.mp4` or `.webm` even if manually constructed.
- [x] **[GAME REPO]** Enforce 1 MiB for every managed campaign image, including the repository thumbnail.
- [x] **[GAME REPO]** Preserve official compiled intro/aftermath video playback and official Cloudflare content behavior.
- [x] **[GAME REPO]** Add compatibility tests for a valid image-only campaign, a 1 MiB image, an oversized image, a video entry, and text-only aftermath fallback.

**Gate 8:** Community packages are image/text/data only, while official campaign media remains unaffected.

### Phase 9 - Correct campaign provenance and entitlement boundaries

- [x] **[GAME REPO]** Replace the hard-coded `bundled-official` source result with explicit provenance supplied by loaders/registries.
- [x] **[GAME REPO]** Distinguish at least `bundled-official`, official downloadable/DLC, `local-editor`, and `community-import`.
- [x] **[GAME REPO]** Reserve official campaign IDs and reject collisions during local import and community download.
- [x] **[GAME REPO]** Ensure local/community campaigns bypass commercial entitlement checks without gaining official-content trust.
- [x] **[GAME REPO]** Ensure remote official policy cannot grant official/DLC identity to a community package.
- [x] **[GAME REPO]** Add tests for ID collisions, spoofed entitlement metadata, each provenance source, offline policy fallback, owned/unowned DLC, and community import.

**Gate 9:** A community ZIP cannot impersonate an official/free/DLC campaign or influence official entitlement decisions.

### Phase 10 - Update current documentation

- [x] **[COMMUNITY REPO]** Update `README.md`, `.env.example`, package rules, API documentation, and approval guide to match the final implementation.
- [x] **[COMMUNITY REPO]** Replace or clearly supersede the old root `PLAN.md` where it conflicts with authenticated/revisioned publishing and current size limits.
- [x] **[GAME REPO]** Update `docs/developer/COMMUNITY_REPO_INTEGRATION.md` to document secretless Desktop OAuth with PKCE.
- [x] **[GAME REPO]** Update `docs/wiki/CAMPAIGN_EDITOR.md` and custom campaign pack documentation to remove community video instructions and state both image and total package limits.
- [x] **[GAME REPO]** Update `docs/wiki/MODDING_AND_CUSTOM_SCENARIOS.md` so players use the in-game Scenario Library/Campaign Workshop, not the private official Content Studio.
- [x] **[GAME REPO]** Update edition/release validation documentation to state that full Steam community publishing is enabled and demo publishing remains disabled.
- [x] **[GAME REPO]** Update campaign entitlement/provenance documentation after the blocker is resolved.
- [x] **[GAME REPO]** Preserve historical audits as historical evidence; add dated superseded notes instead of rewriting old findings as if they never occurred.
- [x] **[BOTH REPOS]** Ensure user-facing wording consistently distinguishes official DLC, local custom content, and moderated community content.

**Gate 10:** Current documentation matches shipped behavior and historical reports remain auditable.

## 7. External configuration checklist

These tasks are deliberately separate from source-code changes.

### Google Cloud Console

- [ ] **[GOOGLE]** Record the existing Web OAuth client ID without copying any client secret into a repository or ticket.
- [ ] **[GOOGLE]** Create/verify the Desktop OAuth client and record its public client ID.
- [ ] **[GOOGLE]** Verify the consent-screen publishing status, application name, support email, privacy links, and required scopes (`openid email`).
- [ ] **[GOOGLE]** Confirm website authorized JavaScript origins include local admin development and `https://meridian-strike-wiki.netlify.app` for the Web client.
- [ ] **[GOOGLE]** Test the Desktop loopback flow from a clean packaged build, not only Electron development mode.
- [ ] **[GOOGLE]** Rotate/revoke any historical Desktop OAuth credential whose secret was previously packaged, after the secretless build is proven.

### Netlify environment

- [ ] **[NETLIFY]** Keep existing `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` values.
- [ ] **[NETLIFY]** Add `GOOGLE_CLIENT_IDS` containing both public Web and Desktop client IDs.
- [ ] **[NETLIFY]** Generate and add `SESSION_SIGNING_SECRET` without printing or committing it.
- [ ] **[NETLIFY]** Determine the admin's immutable Google `sub` through a verified signed-in session and add it to `ADMIN_GOOGLE_SUBS`.
- [ ] **[NETLIFY]** Confirm the admin UI works using subject authorization before removing `ADMIN_EMAILS`.
- [ ] **[NETLIFY]** Remove `ADMIN_EMAILS` only after the migration test and rollback window are complete.
- [ ] **[NETLIFY]** Do not add `ADMIN_API_KEY` unless a separately reviewed automation use case is introduced.

### Cloudflare

- [x] **[CLOUDFLARE]** Make no community-storage or authentication change.
- [x] **[CLOUDFLARE]** Re-run official manifest and DLC smoke tests before and after the game change.
- [ ] **[CLOUDFLARE]** Treat cleanup of the local Wrangler generated-config/path issue as a separate operational task; it is not a blocker for community publishing.

## 8. Commit strategy

Do not make a single cross-cutting commit from the current dirty state. Each repository must remain independently buildable at meaningful checkpoints.

Suggested **[COMMUNITY REPO]** commits:

- [ ] `chore: preserve and classify community publishing work`
- [ ] `feat: require creator sessions and immutable ownership`
- [ ] `feat: add revision-safe scenario and campaign moderation`
- [ ] `fix: enforce Netlify-safe package and media limits`
- [ ] `fix: migrate legacy records without breaking published maps`
- [ ] `test: cover auth, packages, moderation failures, and migration`
- [ ] `docs: document community publishing operations and release`

Suggested **[GAME REPO]** commits:

- [ ] `fix: classify official local and community campaign sources`
- [ ] `feat: support secretless desktop community sign-in`
- [ ] `fix: enforce image-only Netlify-safe campaign packages`
- [ ] `feat: enable authenticated publishing in full Steam builds`
- [ ] `test: cover release editions auth packages and provenance`
- [ ] `docs: align community and Steam release guidance`

Exact commit boundaries may change if compilation requires two items to land together, but unrelated formatting/generated-file churn must not be mixed into functional commits.

## 9. Verification matrix

### Automated repository checks

- [x] **[COMMUNITY REPO]** `npm run typecheck`
- [x] **[COMMUNITY REPO]** `npm test`
- [x] **[COMMUNITY REPO]** `npm run lint`
- [ ] **[COMMUNITY REPO]** `npm run format:check`
- [x] **[COMMUNITY REPO]** `npm run build`
- [x] **[COMMUNITY REPO]** Bundle the Netlify Function exactly as production will.
- [x] **[GAME REPO]** Run typecheck, lint/format checks, full unit tests, and the documented fast release gate.
- [ ] **[GAME REPO]** Build/package full Steam and demo artifacts using the production release scripts.
- [ ] **[GAME REPO]** Audit packaged artifacts for secrets and forbidden development/QA files.

Local evidence on 2026-08-22: every task-owned community file passes a scoped Prettier check. The
repository-wide community `format:check` remains unchecked because 42 pre-existing, unrelated files
do not match the current Prettier configuration and were deliberately not reformatted. Production
packaging remains unchecked because the reviewed public Desktop OAuth client ID and clean release
environment are external prerequisites.

### Existing-map regression checks

- [ ] **[BOTH REPOS]** Download every currently published scenario from production and verify its checksum against the pre-deploy inventory.
- [ ] **[GAME REPO]** Import and load each existing map/scenario in the packaged full build.
- [ ] **[GAME REPO]** Start each scenario as a Mercenary mission and verify map dimensions, terrain, deployment zones, objectives, extraction zones, and units load correctly.
- [ ] **[GAME REPO]** Confirm scenario browsing still works when signed out.
- [ ] **[GAME REPO]** Confirm a Netlify outage blocks only community network features and does not block normal/offline game startup.

### End-to-end scenario flow

- [ ] **[STEAM + NETLIFY]** Launch a private-branch full build through the Steam client on a clean user profile.
- [ ] **[STEAM + GOOGLE]** Sign in through the system browser and return successfully to the `.exe`.
- [ ] **[STEAM + NETLIFY]** Upload a valid small scenario and confirm it is pending and not public.
- [ ] **[NETLIFY]** Sign in to the website as admin using `ADMIN_GOOGLE_SUBS`, review it, and approve it.
- [ ] **[STEAM]** Refresh the Mercenary Board, download the approved scenario, launch it, and complete a basic map/gameplay smoke test.
- [ ] **[STEAM + NETLIFY]** Upload a revision and verify the old approved version remains public until the revision is approved.
- [ ] **[NETLIFY]** Reject a revision with a reason and verify the old approved version remains public.
- [ ] **[STEAM + NETLIFY]** Verify a different signed-in user cannot update, view private status, or withdraw the item.

> **REVIEWER 2 — MEDIUM: Rejection reasons are accepted by the plan but absent from its data/API work.**
>
> The pending implementation's reject routes accept no body and its submission schemas have no rejection-reason field, yet Phase 7 requires a “rejected with reason” UI and this test requires a reason. Add the reason schema, length/content rules, moderator identity/timestamp audit fields, private status response, and tests, or remove the unsupported acceptance claim.
>
> Evidence:
>
> - community site: `netlify/functions/api-v1.ts`, campaign/scenario reject handlers call the services without a request body.
> - community site: `shared/schemas/campaign.ts` and `shared/schemas/metadata.ts`, submission schemas contain no rejection result/reason.

### End-to-end campaign flow

- [ ] **[STEAM]** Create an image-only campaign whose images are each at or below 1 MiB and whose ZIP is below 4,000,000 bytes.
- [ ] **[STEAM + NETLIFY]** Upload it, approve it through the admin site, download it on a clean profile, and launch its first mission.
- [ ] **[STEAM]** Progress far enough to verify mission linkage, save/load, dialogue, still-image intro/aftermath, and completion fallback without video.
- [x] **[BOTH REPOS]** Verify oversized images, oversized total ZIPs, videos, malformed missions, unsafe paths, and official-ID collisions are rejected by both client preflight and server validation.

### Edition and official-content regression

- [ ] **[STEAM]** Confirm the full Steam build exposes the intended community creation/publishing surfaces.
- [ ] **[STEAM]** Confirm the demo build exposes none of the custom scenario, campaign editor, Workshop, community import/loading, or Mercenary Board surfaces defined as excluded by the edition policy.
- [ ] **[CLOUDFLARE + GAME REPO]** Verify existing official campaigns and DLC still download/load through Cloudflare and preserve their entitlement behavior and video media.

**Final test gate:** No production rollout until all applicable checks above pass against an actual packaged build launched through Steam, not only browser/Electron development mode.

## 10. Deployment sequence

- [ ] **[BOTH REPOS]** Obtain independent code/plan review and resolve every blocker.
- [ ] **[NETLIFY]** Export and verify the production Blob backup.
- [ ] **[GOOGLE]** Finish Desktop OAuth and consent configuration.
- [ ] **[NETLIFY]** Add the new environment variables while keeping migration fallbacks.
- [ ] **[COMMUNITY REPO]** Deploy a preview/local candidate and run API/auth/package/moderation tests without changing production records.
- [ ] **[GAME REPO]** Point a non-production packaged build at the candidate API and complete scenario/campaign end-to-end tests.

> **REVIEWER 2 — BLOCKER:** These two steps depend on the environment isolation and packaged API-origin work identified in the Reviewer 2 blocker under “Agreed architecture.” Add an explicit environment matrix and isolation proof before either checkbox can be actionable.

- [ ] **[COMMUNITY REPO + NETLIFY]** Merge and deploy the community API/site first.
- [ ] **[NETLIFY]** Verify `/api/v1/auth/me`, `/api/v1/campaigns`, scenario routes, content types, admin login, existing maps, and Blob migration in production.
- [ ] **[GAME REPO]** Update and publish the community `version-policy.json` only after the compatible API is live.
- [ ] **[GAME REPO + STEAM]** Build the final production artifacts, rerun the secret audit, and publish first to a private Steam branch.
- [ ] **[STEAM]** Complete clean-machine/full-flow acceptance testing from the Steam client.
- [ ] **[STEAM]** Promote the tested artifact to the intended public branch.
- [ ] **[NETLIFY]** Remove the temporary `ADMIN_EMAILS` fallback only after the observation/rollback window.

The API deploy must precede the Steam client rollout because old game builds can continue using the backward-compatible scenario API, while the new game requires auth/campaign routes that do not exist in the current production deployment.

## 11. Rollback plan

- [x] **[COMMUNITY REPO]** Preserve backward-compatible public Blob keys and API response fields through the rollout window.
- [ ] **[NETLIFY]** Record the last known-good deploy ID before promoting the new site.
- [ ] **[NETLIFY]** If API behavior fails, restore the last known-good deploy and retain the Blob backup/migration report.

> **REVIEWER 2 — BLOCKER: Restoring the current last-known-good deploy would restore anonymous mutation endpoints.**
>
> The committed production baseline permits unauthenticated scenario `PUT`, and permits unauthenticated deletion of draft records. Its update path overwrites the public package/thumbnail/metadata keys and temporarily removes a previously published scenario from the public catalogue by marking it draft. A rollback after ownership migration must not re-expose those endpoints. Prepare and test a forward-compatible rollback artifact that preserves authenticated writes (or disables all mutations while keeping public reads/downloads available); do not use the current production deploy as the security rollback target.
>
> Evidence:
>
> - committed baseline: `git show HEAD:netlify/functions/api-v1.ts`, the scenario `PUT` route calls `updateScenario()` without `requireAdmin()` or creator authentication; draft `DELETE` is also anonymous.
> - committed baseline: `git show HEAD:netlify/functions/lib/scenario-service.ts`, `updateScenario()` overwrites `pkg`, `thumb`, and `meta` and sets `publicationStatus: "draft"`.
> - proposed working tree: `netlify/functions/api-v1.ts` intentionally adds creator authentication, so reverting the deploy would remove that boundary.

- [x] **[COMMUNITY REPO]** Ensure new moderation writes never overwrite immutable revision assets, making pointer/metadata rollback possible.
- [ ] **[STEAM]** Keep the prior Steam build available on a rollback branch/depot.
- [ ] **[STEAM]** If packaged sign-in/publishing fails, roll back the Steam build without changing Cloudflare official content.
- [ ] **[NETLIFY]** If `SESSION_SIGNING_SECRET` must be rotated, record that all creator/admin sessions will be invalidated and users must sign in again.
- [ ] **[CLOUDFLARE]** No rollback action should be needed because this plan does not alter official-content infrastructure.

## 12. Release acceptance criteria

The work is complete only when all statements below are true.

- [ ] Existing approved community scenarios and maps still download and play correctly.
- [ ] Anonymous users cannot submit or alter scenarios/campaigns.
- [ ] A signed-in full Steam user can submit a scenario and an image-only campaign.
- [ ] Creators can affect only content owned by their immutable Google subject ID.
- [ ] The admin can approve/reject from the existing Netlify site using subject-based authorization.
- [ ] Pending content is not publicly discoverable or downloadable.
- [ ] Failed/rejected revisions do not take the last approved revision offline.
- [ ] Community videos and images over 1 MiB are rejected.
- [ ] Every compressed community upload is at or below 4,000,000 bytes and every expanded package is at or below 20 MiB.
- [ ] Community campaigns cannot impersonate official campaigns or DLC.
- [ ] The full production Steam `.exe` supports the complete intended flow without a client secret.
- [ ] The demo remains free of excluded creator/community features.
- [ ] Official Cloudflare campaigns, DLC entitlement, and official videos continue working.
- [ ] Both repositories pass their automated release gates and packaged artifacts pass the secret audit.
- [ ] Production backup, migration evidence, deploy IDs, checksums, and rollback instructions are recorded.

## 13. Sanity-review prompts

The independent reviewer should answer these before implementation begins:

- [ ] Does any planned client code contain a value that must remain secret?
- [ ] Can the old public scenario API and all existing maps survive both forward deployment and rollback?
- [ ] Is the 4,000,000-byte limit enforced before request creation and again before server ZIP parsing?
- [ ] Can a partial Blob write make approved content disappear or point metadata at missing assets?
- [ ] Can an email change, reused display name, or forged package claim another creator's content?
- [ ] Can community content obtain an official/DLC source classification or collide with a reserved ID?
- [ ] Are all community video paths removed without breaking official campaign video paths?
- [ ] Do full, demo, dev, QA, and production feature policies have explicit automated tests?
- [ ] Is the decisive acceptance test run from the Steam client using the packaged `.exe` on a clean profile?
- [ ] Is there a verified Blob backup and a practical rollback path before production migration?

## 14. Progress record

Use this section during implementation rather than relying only on checked boxes.

| Date       | Phase / checkbox               | Repository or service             | Commit / deploy / evidence   | Result and notes                                                                                     |
| ---------- | ------------------------------ | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-08-21 | Investigation and plan created | Both repos + Netlify + Cloudflare | Baseline SHAs recorded above | Ready for independent sanity review; no implementation or deployment performed.                      |
| 2026-08-21 | Independent plan review        | Reviewer 1                        | See section 15               | Architecture approved in principle; implementation remains blocked on the required amendments below. |

## 15. Reviewer 1 - required amendments before implementation

Reviewer 1 reviewed this plan against the current game and community-repository worktrees on 2026-08-21. The target architecture is sound: official content remains isolated on Cloudflare, community content remains on Netlify, writes require verified creator identity, and public browsing remains anonymous. Do not begin implementation or deploy until every required amendment below has been incorporated into the implementation plan and acceptance tests.

### R1-1 - Define how the packaged Steam client receives its public Desktop OAuth client ID

The current Electron community-auth controller reads `COMMUNITY_GOOGLE_OAUTH_CLIENT_ID` from runtime `process.env`. A build-time environment variable is not automatically available to an installed `.exe`; the production packaging path must intentionally include a public configuration value.

- [x] **[GAME REPO]** Define a packaged runtime configuration mechanism that includes the public Desktop OAuth client ID and no client secret, service credential, session token, or Netlify token.
- [x] **[GAME REPO]** Make the Electron main process read the client ID only from that reviewed packaged configuration mechanism.
- [ ] **[GAME REPO]** Add a packaged-artifact test proving the full Steam package contains the required public client ID, contains no secret, and fails closed when the ID is missing or malformed.
- [ ] **[STEAM + GOOGLE]** Run the actual secretless PKCE sign-in flow from a clean installed full build before release.

Google documents that a native installed-app client may have a `client_secret`, but it cannot be treated as confidential. The security requirement is therefore that the shipped client must not rely on a confidential secret; PKCE, state, nonce, and loopback callback validation remain the controls that protect the authorization-code flow. See [Google's installed-app OAuth guidance](https://developers.google.com/identity/protocols/oauth2).

### R1-2 - Preserve offline local campaign authoring

Verified identity is required for community-server mutation, not for creating, editing, playtesting, importing, or exporting local custom campaigns. A temporary inability to reach Google or Netlify must not lock a full-edition player out of their local campaign work.

- [x] **[GAME REPO]** Keep local custom campaign authoring, playtesting, import, export, and forks available while signed out and offline.
- [x] **[GAME REPO]** Require sign-in only when the player submits a new community item, submits a revision, checks private server status, or withdraws a community item.
- [x] **[GAME REPO]** Do not use a mutable email address as the authoritative owner decision for local editing. Server ownership is determined only from the Google `sub`; local UI may show an ownership hint but must offer a safe fork path and must not misidentify a creator after an email change.
- [x] **[GAME REPO]** Add tests for signed-out local editing, offline local editing, changed email with the same server-side `sub`, imported read-only campaigns, and community publish requiring sign-in.

### R1-3 - Make moderation commands revision-specific and race-safe

Approval must apply to the exact revision an administrator reviewed. A later author update must not silently replace that reviewed revision, and an interrupted Blob write must never make the last approved version unavailable or mismatched with its metadata.

- [x] **[COMMUNITY REPO]** Include the pending revision in admin review data and require it in approve/reject commands; return a conflict if it no longer matches the current pending revision.
- [x] **[COMMUNITY REPO]** Serialize or explicitly reject a new revision while an earlier revision is awaiting review. Do not let an author replace the moderator's review target without an explicit new review cycle.
- [x] **[COMMUNITY REPO]** Write immutable revision assets first, verify them, update the public package/thumbnail copies, then change the public metadata pointer last. Delete or archive the submission only after the pointer is confirmed.
- [x] **[COMMUNITY REPO]** Make the workflow idempotent and add injected-failure tests for every write and retry point.
- [x] **[COMMUNITY REPO]** Define withdrawal while a revision is pending: archive the public revision and pending submission deliberately, without copying pending metadata over an older public package or thumbnail.

### R1-4 - State the compatibility boundary for older game clients

Authentication for all community writes intentionally makes anonymous publishing by older clients unavailable. The deployment sequence must not claim that all old scenario API behavior remains compatible.

- [x] **[GAME REPO + COMMUNITY REPO]** Document that old clients retain only anonymous catalogue, detail, download, and rating behavior during the compatibility window.
- [x] **[GAME REPO]** Use the community version policy to block an incompatible old client before it offers publishing or revision actions.
- [x] **[COMMUNITY REPO]** Keep public read response fields and binary download behavior backward compatible through the rollback window; do not retain unauthenticated mutation as a compatibility shortcut.
- [x] **[BOTH REPOS]** Add rollout tests for an old read-only client, an incompatible old publishing client, and a new authenticated publishing client.

### R1-5 - Make the package policy immutable, shared, and safe before decompression

The target policy says that the 4,000,000-byte compressed limit and 20 MiB expanded limit are constants rather than production environment overrides. The implementation must enforce that exact policy consistently before extracting ZIP entries; it must not rely on a permissive ZIP library to inflate an unbounded archive first.

- [x] **[BOTH REPOS]** Define the same versioned package-policy constants: 4,000,000 compressed bytes, 20 MiB expanded bytes, no `.mp4` or `.webm`, and 1 MiB maximum for every campaign image including its thumbnail.
- [x] **[COMMUNITY REPO]** Remove production environment overrides for those limits, or make any override a test-only dependency that cannot be enabled in production.
- [x] **[COMMUNITY REPO]** Inspect ZIP central-directory metadata and enforce path, duplicate-path, entry-count, per-entry, total-expanded, and extension rules before inflating entry data.
- [x] **[GAME REPO]** Use the existing safe ZIP abstraction for community package generation and import, and expose the same validation result before network upload.
- [x] **[BOTH REPOS]** Add boundary and malicious-archive tests before accepting campaign upload endpoints in production.

### R1-6 - Remove alternate admin authorization for this release

The target model authorizes administrators using `ADMIN_GOOGLE_SUBS`. An `ADMIN_API_KEY` path would be an alternate production authorization mechanism and is outside this release's agreed workflow.

- [x] **[COMMUNITY REPO]** Remove or permanently disable the `ADMIN_API_KEY` authorization branch for this release.
- [ ] **[NETLIFY]** Confirm that no `ADMIN_API_KEY` remains configured in the production site after the controlled migration window.
- [x] **[COMMUNITY REPO]** Add tests proving that only a verified creator session or a valid Google identity with a configured admin `sub` can use admin routes, as applicable to the final website flow.

### R1-7 - Expand the release acceptance matrix for operational abuse resistance

- [x] **[COMMUNITY REPO]** Apply upload rate limits consistently to creation and revision requests, and rate-limit session-creation attempts separately.
- [x] **[COMMUNITY REPO]** Test concurrent update, approve, reject, withdraw, and retry sequences for both scenarios and campaigns.
- [x] **[GAME REPO]** Test a signed-out/offline full build to prove ordinary local gameplay and local authoring do not depend on Google or Netlify.
- [ ] **[BOTH REPOS]** Treat the existing automated checks as necessary but insufficient; the final release gate remains a clean-machine packaged Steam test using real Google sign-in and a non-production Netlify candidate.

> **REVIEWER 2 — HIGH: “Rate-limit” must mean a production-wide control, not a per-Function-instance map.**
>
> The current limiter is an in-memory `Map`, so cold starts and horizontally separate Function instances have independent buckets. It is also called only for create routes, not revisions or session creation. That does not provide the abuse boundary needed before buffering and parsing attacker-controlled ZIPs. Select a production-wide mechanism, define trusted client-IP extraction, cover create/update/session endpoints, and test behavior across separate service instances. If Netlify-native controls cannot provide the required semantics, revisit the “no second database/service” constraint rather than claiming the in-memory limiter is sufficient.
>
> Evidence:
>
> - community site: `netlify/functions/lib/rate-limit.ts`, `uploadBuckets` is a module-local `Map`.
> - community site: `netlify/functions/api-v1.ts`, `checkUploadRateLimit()` is called for campaign/scenario `POST` only; campaign/scenario `PUT` and `/auth/session` do not call it.

**Reviewer 1 approval condition:** The plan may move from independent-review stage to implementation authorization only after R1-1 through R1-7 are incorporated, covered by tests, and accepted by the release owner.

# Reviewer 2 — Architecture Review Summary

## Overall assessment

**NOT READY FOR IMPLEMENTATION**

The Netlify-community/Cloudflare-official split is appropriate and the proposed authentication direction is broadly compatible with the current clients. The release plan nevertheless omits three contracts that can cause production-data exposure or strand installed campaigns and saves. Resolve the blockers below in the plan before authorizing implementation.

## Blockers

1. **Non-production isolation is undefined.** A preview/candidate can currently share the production site-wide Blob store, while the packaged game/auth client is pinned to the production origin.
2. **Campaign release/update/save identity is undefined.** Immutable server revisions are not publicly addressable, saves do not pin a revision, campaign updates are unsupported, and delete/reinstall is not viable with the current deterministic embedded-scenario IDs.
3. **The rollback target is unsafe.** Restoring the current production deploy would restore unauthenticated scenario mutation endpoints after the ownership migration.

## High-risk issues

- Netlify Blob mutation decisions need strong reads plus conditional/serialized state transitions; list-then-create cannot guarantee unique stable campaign IDs.
- Local campaign installation writes across separate IndexedDB databases without rollback and leaves retries blocked after a partial failure.
- The game does not hash downloaded packages against catalogue/release metadata before import.
- The current module-local rate limiter is not a production-wide abuse control and does not cover revisions or session creation.
- Campaign package media roles, MIME types, and nested image signatures are not yet validated semantically.
- The plan's campaign acceptance flow does not test revision adoption against an in-progress saved campaign.

## Verified architectural assumptions

- The released game uses `https://meridian-strike-wiki.netlify.app/api/v1` for community scenario/campaign metadata and downloads (`src/api/communityRepository.ts`, `src/api/communityCampaignRepository.ts`).
- Community campaign downloads enter the existing `parseCampaignZip()` pipeline, which accepts `Campaigns/<id>/campaign.json`, nested `missions/<scenarioId>/scenario.json` plus map art, optional `dialogues/`, managed `media/`, and the legacy top-level `Scenarios/` layout (`src/customCampaigns/zip.ts`).
- The game performs bounded safe ZIP extraction and deep game-side campaign/scenario validation before registration (`src/lib/safeZip.ts`, `src/customCampaigns/zip.ts`, `src/customCampaigns/validation.ts`, `src/customScenarios/validation.ts`).
- Installed custom/community scenarios and campaigns are persisted locally in IndexedDB and registered as runtime campaign packs; installed content remains locally available without a catalogue request (`src/customScenarios/storage.ts`, `src/customCampaigns/storage.ts`, `src/customCampaigns/registry.ts`).
- Community/custom campaigns use the `custom-`/`user-` ID boundary and are converted to free runtime packs; official campaign policy is loaded from the separate signed official-content path (`src/customCampaigns/types.ts`, `src/customCampaigns/toCampaignPack.ts`, `src/officialContent/runtime.ts`).
- Official content currently has a separate Cloudflare Worker with stable `CONTENT_DB`/`CONTENT_BUCKET` binding names and distinct development, staging, and production D1/R2 resources (`C:\VSCode\mech-command\services\official-content\wrangler.toml`).
- The pending desktop OAuth code uses a system browser, random loopback port, PKCE S256, `state`, and `nonce`, then exchanges a Google ID token for a Netlify community session stored with Electron `safeStorage` (`electron/community-auth.cjs`). Google continues to support loopback redirects for Desktop OAuth clients, and its installed-app token exchange documents `client_secret` as optional: [Google loopback guidance](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration), [Google native-app OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app).
- The production Netlify site currently returns five published scenarios as JSON, while `/api/v1/campaigns` and `/api/v1/auth/me` fall through to SPA HTML. This independently confirms the baseline routing claim recorded in the plan.
- Netlify's current documented buffered Function payload limit is 6 MB, with binary payload Base64 overhead reducing the effective binary limit to approximately 4.5 MB; the proposed 4,000,000-byte ceiling is therefore conservative: [Netlify Functions limits](https://docs.netlify.com/build/functions/configuration/?fn-language=js).

## Unverified assumptions

- **UNVERIFIED:** The Netlify dashboard environment-variable inventory (`ADMIN_EMAILS`, Google client IDs, secrets) cannot be established from repository contents.
- **UNVERIFIED:** The Google Cloud client types, consent-screen publishing state, accepted redirect configuration, and admin subject configuration require console evidence and a clean packaged sign-in test.
- **UNVERIFIED:** The complete production Blob key inventory, consistency setting, ownership of legacy records, and recoverability of a backup require a read-only export plus restore rehearsal.
- **UNVERIFIED:** The plan's historical claims that particular full/focused test suites and Cloudflare live endpoint checks passed were not treated as current release evidence; all mandated checks must be rerun after this document edit and again on the implementation candidates.
- **UNVERIFIED:** No deployed community campaigns exist today because the production campaign route is absent; compatibility must be established with server-generated fixtures and the clean-profile game flow, not inferred from scenario success.

## Required changes before implementation

1. Add a development/staging/production matrix covering Netlify deploy URL, Blob namespace/consistency, session secret, Google Web/Desktop audiences, admin subjects, CORS origin policy, packaged community API origin, and proof that candidate writes cannot reach production.
2. Define campaign identity versus immutable release identity, public revision retrieval/retention, update discovery, save pinning or strict revision-compatibility rules, withdrawal/deletion semantics, and rollback/downgrade behavior.
3. Design atomic or compensating local campaign install/update across scenario and campaign persistence, including orphan cleanup and repeatable retry.
4. Require downloaded ZIP SHA-256 verification and add a cross-repository contract fixture that the server publishes and the game catalog schema/importer consumes.
5. Use strong/conditional Blob operations or a proven serialization mechanism for stable-ID claims and moderation transitions; add multi-instance concurrency and injected-failure tests.
6. Replace the rollback target with a tested read-compatible build that retains authenticated or disabled mutations.
7. Make abuse controls production-wide, keep non-critical analytics from blocking downloads, and resolve the rejection-reason schema/API mismatch.

## Recommended implementation order

1. Resolve the environment, campaign release, and rollback contracts in this document.
2. Freeze versioned API/package fixtures and security limits in both repositories.
3. Implement isolated storage, conditional moderation, migration/export/restore tooling, and server tests.
4. Implement secretless packaged OAuth, explicit provenance, checksum verification, and transactional local install/update behavior in the game.
5. Run cross-repository, legacy-client, saved-campaign, clean-profile, and failure-injection tests in the isolated candidate environment.
6. Deploy the backward-compatible API first, observe it, then promote the tested Steam artifact with the safe rollback builds retained.

## Regression boundaries

- Preserve all existing public scenario repository IDs, metadata fields, download URLs, ZIP bytes/checksums, thumbnails, ratings, counts, and wiki/detail links through the migration and rollback window.
- Preserve anonymous scenario catalogue/detail/download/rating behavior for supported old clients; unauthenticated mutation is intentionally not preserved.
- Preserve both accepted game import layouts: native nested campaign missions and legacy top-level `Scenarios/` entries.
- Preserve IndexedDB-installed content, named/autosaves, local import/export, local authoring/playtesting, and ordinary offline startup without Google or Netlify.
- Preserve the `custom-`/`user-` community ID boundary and reject official campaign-ID collisions before any local write.
- Preserve the signed official Cloudflare manifest, official media, DLC/entitlement behavior, and separate D1/R2 environment bindings.
- Preserve demo exclusion of custom/community content while enabling only the explicitly approved full-edition surfaces.
- Preserve the production Netlify domain and stable `/api/v1` and wiki/bookmark paths; removed mutation UI should resolve to an explanatory page rather than a broken route.
