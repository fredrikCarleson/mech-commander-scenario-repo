# Game retention reporting

The Meridian Strike client sends schema-2 metadata to the existing `telemetry` Netlify function.
The receiver persists whitelisted fields in the `telemetry` blob store; arbitrary payload
fields are discarded. Legacy clients remain accepted. The primary summary keeps
its metric shapes but now uses classified schema-2 records; older/unclassified
records are reported under `legacy` instead of mixing into production figures.

## Delivery contract

Schema 2 requires UUID event/session IDs, version, build, edition (`full`/`demo`), channel
(`steam`/`standalone`/`development`) and elapsed session milliseconds. It accepts the
existing events plus session start, tutorial start/resume/restart/lesson, company founded,
battle entered, after-action acknowledged and repair scheduled.
Outcome events accept `missionId`, `battleId`, `rounds`, `round` and `mechsLost`.
`rounds` is the combat-round counter (including a partial final round), not a
separate count of fully completed rounds. `mechsLost` is a non-negative integer
count of destroyed friendly machines in that battle, not permanent write-offs.
It is stored with the event; this change does not add a separate hull-loss aggregate.

Versioned events use deterministic keys containing original UTC date, install ID and event ID.
Retries do not duplicate records or spend the daily budget again. Legacy events keep their
existing storage path. The existing 500-event daily installation limit remains; schema-2
over-budget requests return 429 with Retry-After, while legacy clients retain 204 behavior.
The client retries rather than acknowledging a lost event. Partial batch retries are safe.
Daily budget accounting is best-effort across simultaneous function invocations; deterministic
event keys prevent duplicated storage, but the counter is not an atomic distributed quota.

## Authenticated report

```text
GET /.netlify/functions/telemetry-summary?days=30&edition=demo&channel=steam&build=<build>
X-Admin-Key: <existing TELEMETRY_ADMIN_KEY>
```

The admin key remains server-side and in authorized operator requests. No new client secret
or public dashboard is introduced. Invalid filters return 400; missing authentication returns 401.
`days` is bounded to 1–90. Read the new `retention` property:

- `funnel` follows each known new installation in order: first session, founding,
  first campaign/Mercenary deployment, that battle's outcome (win or loss), acknowledged
  after-action to HQ, then a distinct second deployment after an earlier attempt.
- Training/custom battles and resumes do not satisfy deployment conversion.
- `lessons` counts unique installations entering/completing each tutorial lesson.
- `returns` reports eligible/returned installations and rates for UTC calendar day 1 and 7.
  The entire follow-up day must have elapsed before its cohort enters the denominator.
  A missing mature cohort yields null. Legacy installations without a known first session
  are excluded rather than being relabelled new players.

Development is excluded from every report section by default; explicitly request
`channel=development` for diagnostics. Primary totals, activity funnel and loss-round
statistics include only classified schema-2 events on the selected channel(s).
With no channel filter, Steam and standalone are included. The response's `filters`
states that selection. The `legacy` object contains the same activity metrics for
older/unclassified records, with explicit filters applied there too. Records without
build/edition/channel metadata cannot satisfy a filtered release query. No stored
records are deleted, migrated or rewritten by reporting.

The admin page's explicit `includeLegacy=1` (or `true`) option still includes
legacy/unclassified events in primary activity totals for historical inspection.
The response then identifies `filters.schemaVersion: "all"`; `legacy` stays
separately inspectable, new-install retention still excludes it, and development
remains excluded unless explicitly selected. The mean, edition/build breakdowns,
and `missingCount` compatibility field remain available to the dashboard.

Edition filters separate Demo and Full. Build filters select the initial-install cohort for
the funnel and returns; later-build activity can still satisfy follow-up. Lesson counts and
activity totals use the selected build directly. With no build filter, all builds
are included. The top-level `funnel` retains the incoming change's cohort subsets;
use `retention.funnel` for new-player conversion.

`combatRoundsBeforeMissionLoss` uses a positive integer `rounds`, then `round`, then
the maximum prior `combat_round.round` matching installation, mission and battle ID
(either event-level or `context.battleId`). It never infers from another attempt or
later event. Missing/invalid counts without a matching battle stay unknown:
`totalLosses` includes all selected losses, `sampleCount` counts known rounds, and
`unknownCount` counts the rest. Empty samples have null median/min/max. Explicit old
round-1 values remain as supplied; the server cannot reconstruct their actual rounds.
`missingCount` aliases `unknownCount` for dashboard compatibility. Mean/median/min/max
use every known sample; the diagnostic `rounds` list is capped at 50 entries.

## Development collection

The updated game disables development/test collection until an explicit collector
endpoint is configured. Steam/standalone retain production collection, subject to
opt-out. Use the build channel, not Origin, to distinguish test traffic: packaged
Electron also serves its renderer from localhost. Browser telemetry tests explicitly
opt in to a routed collector. The local smoke script labels events `development`
and selects that channel when reading the summary.

These are anonymous installation observations, not individual accounts or Steam purchase
conversion. Opt-out, offline queue overflow, browser storage resets and shared desktop
Demo/Full identities affect coverage. A release cannot prove improved retention until real
players have used it and follow-up cohorts mature.

## Verification

`npm test -- tests/telemetry.test.ts tests/telemetry-retention.test.ts tests/telemetry-report-quality.test.ts` checks old-client
compatibility, current client metadata, privacy field stripping, deduplication, late delivery,
retryable rate limiting, ordered loss-to-second-battle conversion, replays/resumes,
edition/channel separation, build updates, UTC cohort maturity and authenticated filters.
It also covers all-section development filtering, separate legacy populations,
battle-specific round inference, unknown loss counts and persisted/validated `mechsLost`.
Run the repository's test, typecheck, lint, formatting and build gates before merging.
