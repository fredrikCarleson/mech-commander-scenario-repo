# Game retention reporting

The Meridian Strike client sends schema-2 metadata to the existing `telemetry` Netlify function.
The receiver persists whitelisted fields in the `telemetry` blob store; arbitrary payload
fields are discarded. Legacy clients and top-level summary fields remain compatible.

## Delivery contract

Schema 2 requires UUID event/session IDs, version, build, edition (`full`/`demo`), channel
(`steam`/`standalone`/`development`) and elapsed session milliseconds. It accepts the
existing events plus session start, tutorial start/resume/restart/lesson, company founded,
battle entered, after-action acknowledged and repair scheduled.

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

Development is excluded by default; explicitly request `channel=development` for test events.
Edition filters separate Demo and Full. Build filters select the initial-install cohort for
the funnel and returns; later-build activity can still satisfy follow-up. Lesson counts and
legacy top-level event totals use the selected build directly. With no build filter, all builds
are included. The older top-level `funnel` remains an unordered legacy activity summary;
use `retention.funnel` for new-player conversion.

These are anonymous installation observations, not individual accounts or Steam purchase
conversion. Opt-out, offline queue overflow, browser storage resets and shared desktop
Demo/Full identities affect coverage. A release cannot prove improved retention until real
players have used it and follow-up cohorts mature.

## Verification

`npm test -- tests/telemetry.test.ts tests/telemetry-retention.test.ts` checks old-client
compatibility, current client metadata, privacy field stripping, deduplication, late delivery,
retryable rate limiting, ordered loss-to-second-battle conversion, replays/resumes,
edition/channel separation, build updates, UTC cohort maturity and authenticated filters.
Run the repository's test, typecheck, lint, formatting and build gates before merging.
