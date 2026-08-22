# Community data migration and rollback runbook

This repository contains local planning and verification tooling only. It does not connect to a Netlify site and must not be represented as a completed production migration.

## Authorized read-only inventory

The export command uses Netlify API access and never calls a Blob mutation method. It reads every
paginated key with strong consistency, captures the value, Blob metadata and ETag, records a SHA-256
and byte count for every payload, then repeats the key/ETag inventory. It fails if data changed during
the export. The destination must exist outside the repository, must not already contain the named
file, and is created with owner-only permissions where the host supports them.

An authorized release operator supplies a least-privilege Netlify token through
`NETLIFY_AUTH_TOKEN` and the site identifier through `NETLIFY_SITE_ID`, then runs:

```powershell
npm run inventory:export -- --store <production-store-name> --environment production --output D:\secure-backups\community-before-migration.json
```

Do not pass the token on the command line, commit the export, or run this command merely to test the
script. Record the command's Blob count and whole-file SHA-256 in the restricted release log. A
successful export is not a restore rehearsal and is not evidence that production migration ran.

## Local dry run

1. Obtain an authorized, read-only Blob export outside this repository in snapshot schema version 1 (`schemaVersion` plus a `blobs` key map), using the procedure above.
2. Record the export location, record count, and independent archive checksum in the release log.
3. Run `npm run migration:dry-run -- --input <snapshot.json>`.
4. Review every reported record. `ownerless: true` is intentional: the migration never infers ownership from email or display name.
5. Optionally create a new local snapshot with `--output <new-file.json>`. The output path must not already exist.
6. Run the dry run against that output. `proposedWriteCount` must be zero.

The planner verifies every legacy package against its recorded SHA-256, copies package and thumbnail
bytes to immutable revision keys, adds revision metadata, and preserves every legacy public key,
rating, counter, and byte payload. Drafts receive submission sidecars and immutable pending assets but
no ownership claim. A legacy `archived` scenario without evidence of a prior published revision is
treated as a rejected submission, with an explicit migration audit reason; it is not promoted into a
publicly retrievable release. Already versioned archived records retain their approved release.

Partially migrated revision bytes must match their legacy source bytes or the plan fails closed.
Campaign packages are inspected to retain their exact ordered mission IDs, and stable campaign IDs
receive an ownerless migration reservation so no new uploader can claim them. Missing assets,
checksum mismatches, malformed campaign identity, and conflicting stable-ID claims also fail closed.

## Forward deployment

Deploy the API build before the game build, with the explicit production environment matrix and authenticated mutation mode. A release operator must separately configure the Netlify rate-limit rules, Google audiences, CORS origins, session secret identity/value, and admin subjects. Back up Blob data before any authorized apply step. Validate public legacy and revision-specific routes against the backup inventory before promoting a Steam candidate.

## Safe rollback

The approved rollback artifact is this API contract with `COMMUNITY_MUTATION_MODE=disabled`; it is not the old anonymous-mutation deploy. Disabled mode retains catalogue, detail, thumbnail, latest/revision download, and rating behavior, while creator/admin content mutations return JSON 503. Because migration is additive and legacy public keys remain intact, both the forward and rollback builds read the same public records and last-approved bytes.

Do not delete immutable release blobs during rollback. An administrative deletion only tombstones public access and removes mutable keys; immutable bytes remain available for authorized audit/recovery. Production restore or retention cleanup requires separate authorization and a reviewed tool.
