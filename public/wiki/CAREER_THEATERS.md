# Career & Theaters

Company career (profile) unlocks theaters. The Continue save is one living company.

## Player model

| Verb                  | Effect                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| **Continue**          | Resume the active company in its current theater                           |
| **Theaters**          | Pick / inspect theaters; start or ship out                                 |
| **Deploy to theater** | Soft transition — keep pilots/hangar/funds; reset theater clock & missions |
| **Replay theater**    | Same company, reset that theater's mission graph                           |
| **New Company**       | Hard reset Continue company; **career unlocks kept**                       |

## Persistence

| Store       | Key                            | Survives New Company? |
| ----------- | ------------------------------ | --------------------- |
| Career      | `meridian-strike:career-v1`    | Yes                   |
| Continue    | `meridian-strike:save-v1`      | No (cleared)          |
| Named saves | `meridian-strike:save-named:*` | Yes                   |

Aftermath-seen lives on the career theater record (`aftermathSeen`). Legacy `${campaignId}:campaign-aftermath-seen-v1` keys migrate on load.

## Unlock graph (v1)

1. **Meridian Strike** — always available (founding war, 6 contracts)
2. **Ember Reach** — unlocks when Meridian Strike is cleared (Theater II, 9 contracts)

## Code map

- `src/campaign/career.ts` — load/save, clear records, unlock checks
- `src/campaign/theaters.ts` — catalog
- `src/campaign/theaterTransition.ts` — soft deploy / replay
- `src/ui/screens/TheaterSelect.tsx` — selection UI
- Final victory → `recordTheaterClear` in `afterAction.ts`
