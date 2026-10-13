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

## Unlock graph

1. **Meridian Strike** — always available (founding war, 6 contracts)
2. **Ember Reach** — unlocks when Meridian Strike is cleared (Theater II, 9 contracts)
3. **The Crucible Circuit** — unlocks when Ember Reach is cleared (Theater III, 8 championship bouts)

Demo includes only the founding war. After a genuine Meridian clear, Ember Reach is visible as **Full Edition** but not playable until Full is installed. Career clear records survive a **New Company** wipe.

Title **Theaters** hydrates the Continue save for browsing and does **not** settle an ended battle; **Continue Campaign** is what recovers owed after-action or in-progress combat.

---

## Theater III: The Crucible Circuit

The Crucible Circuit (`crucible_circuit`) is a high-stakes, 90-day championship ladder held in the Grand Crucible arena.

### Tournament Structure & Format

- **1v1 Duels:** Each bout is a single machine duel between the deployed company unit and a registered arena champion.
- **Tonnage Ceilings:** Permitted deployment tonnage rises across the 8 bouts (25 tons up to 80 tons). Deploying below the ceiling is allowed, but grants no balancing compensation.
- **Wager Stakes:** _"Deployed hulls are the wager."_
  - **Victory:** Awards credits and transfers the defeated champion's machine directly into your persistent hangar in its post-battle damaged condition.
  - **Defeat:** The deployed machine is forfeited permanently to the arena. The pilot is never surrendered; normal injury and recovery rules apply.
  - **Rechallenge:** Defeat does not immediately end the run if the company still owns an operational, eligible machine within the mass limit.
  - **No Flee / Fail-Forward:** Escape hexes are absent and fail-forward is disabled.
- **Voluntary Withdrawal:** After any victory, the player may choose to withdraw from the tournament, successfully ending the theater and preserving all winnings and reputation.

### The 8 Championship Bouts

| Op         | Bout Name            | Mass Limit | Opponent Callsign | Chassis                      | Victory Purse |
| :--------- | :------------------- | :--------: | :---------------- | :--------------------------- | :-----------: |
| **OP-801** | Opening Bell         |    25 t    | SPARK             | LANCER-25                    |   18,000 c    |
| **OP-802** | The Fox's Ground     |    35 t    | FOX               | RAVENFALL-35                 |   22,000 c    |
| **OP-803** | The Professional     |    40 t    | WALL              | WARDEN-40                    |   26,000 c    |
| **OP-804** | House Favorite       |    55 t    | DARLING           | IRONCLAD-55                  |   32,000 c    |
| **OP-805** | Longshot             |    60 t    | LONGSHOT          | TEMPEST-60                   |   38,000 c    |
| **OP-806** | Iron Saint           |    75 t    | SAINT             | TITAN-75                     |   45,000 c    |
| **OP-807** | The Fallen Crown     |    80 t    | FALLEN            | COLOSSUS-80                  |   52,000 c    |
| **OP-808** | King of the Crucible |    80 t    | CROWN             | COLOSSUS-80 (_Crown of Ash_) |   70,000 c    |

---

## Code map

- `src/campaign/career.ts` — load/save, clear records, unlock checks
- `src/campaign/theaters.ts` — catalog
- `src/campaign/theaterTransition.ts` — soft deploy / replay
- `src/campaigns/crucible_circuit/` — Theater III missions, logic, and progression
- `src/ui/screens/TheaterSelect.tsx` — selection UI
- Final victory → `recordTheaterClear` in `afterAction.ts`
