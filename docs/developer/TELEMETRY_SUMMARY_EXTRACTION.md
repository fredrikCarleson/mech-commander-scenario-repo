# Telemetry reporting extraction

Move the existing median, blob-listing and summary functions verbatim from
`telemetry-service.ts` to `telemetry-summary-service.ts`, preserving their public re-exports.
The service retains request validation and storage. The summary module owns reporting only;
it must not change collection, field names, authentication, date windows or conversion rules.

Safety baseline: 126 unit tests pass, including 29 collector/report tests. No known failing
unit or browser checks apply to this server-only move. Root game browser checks run separately.
No engine/AI rules are involved. After extraction, rerun the collector/report tests and
full receiver tests, TypeScript, lint, formatting and build checks.

The intended result is a service below 600 lines and a report module below 400 lines.

Completed: service 473 lines; summary module 231 lines. Public re-exports and function
bodies are preserved; type-only imports are explicit. All 126 tests, server TypeScript,
application typecheck/build, lint and changed-file formatting pass. Repository-wide
formatting also flags 117 unchanged files; those baseline files are outside this extraction.
