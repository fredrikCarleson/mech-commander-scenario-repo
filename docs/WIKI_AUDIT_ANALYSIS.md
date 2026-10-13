# Wiki Audit and Synchronization Analysis

**Date:** October 13, 2026  
**Repositories Involved:**

- **Wiki Repo (Target):** `c:\Antigravityprojects\mech-commander-scenario-repo` (Branch: `main`)
- **Game Engine Repo (Reference):** `C:\cursor\mech-command` (Branch: `main`, Commit: `341922e`)

---

## 1. Sync & Repository Status

1. **`mech-commander-scenario-repo`**:
   - Synchronized with `origin/main` via `git pull` (Fast-forwarded 2 commits, clean working tree).
2. **`mech-command`**:
   - Located at `C:\cursor\mech-command` (and mirrored scratch clone).
   - Synchronized with `origin/main` via `git pull` (Fast-forwarded 51 commits to commit `341922e`).
   - **Protection Status:** Read-only reference mode strictly maintained. No changes will be applied to `mech-command`.

---

## 2. Executive Summary of Wiki Discrepancies

A comprehensive comparison between `mech-command/docs/` and `mech-commander-scenario-repo/public/wiki/` shows that the scenario repo wiki is substantially out of date across **all core game systems**:

| Area                           | Current Scenario Repo Wiki Status                   | Actual Game State (`mech-command`)                                                                          | Severity     |
| :----------------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----------- |
| **Campaigns & Theaters**       | Only Theaters I & II documented                     | **Theater III: The Crucible Circuit** added (8 bouts, 1v1 ladder, wager mechanics)                          | **High**     |
| **Core Battle Calculations**   | Separate rear structure, range intervals, old cover | **Shared-Core Torso model**, +15% rear flanking, exact range bonus/penalties                                | **Critical** |
| **Targeting & Called Shots**   | Vague or legacy called shots                        | **Focused Aim rework** (Gunnery 7, 4× weight, -25/-40 accuracy, AI usage)                                   | **Critical** |
| **Mobility & Facing**          | Standard movement only                              | **Sprint (2.5×, -5% evasion)**, **Crawl (both legs lost)**, **Stationary Turning**                          | **High**     |
| **Special Orders**             | Move, Fire, Brace, Cool                             | Added **Ram** (1-2 AP, Space confirm) and **Flee** (resolved escape hexes)                                  | **High**     |
| **Pilot Progression & Skills** | Obsolete attribute formulas (±4%, etc.)             | **Active Pilot Skills at 7** (Overwatch, Vent, Shared Focus, Evasive Stance, Push Through), concrete traits | **Critical** |
| **Hangar & Refits**            | Fixed stock chassis mounts only                     | **Refit Facility** (200,000 c), weapon swap limits, **Equipment modules** (Heat Sink, Jets, Sensors, Armor) | **High**     |
| **Enemy AI Behavior**          | Very basic or undocumented                          | Bounded sequence planner, tabu movement memory, AI called shots, flanking intent                            | **Medium**   |
| **Map Design & Modding**       | Truncated guide (6.5 KB vs 15.5 KB)                 | Full generator parameters, tactical affordances, Guided/Advanced workshop workflow                          | **Medium**   |
| **New Wiki Pages**             | Missing several docs present in mech-command        | Missing `The_Crucible_Circuit_bible.md`, `COMMS_VOICEOVER.md`, `CONTENT_STUDIO.md`, etc.                    | **Medium**   |

---

## 3. Deep-Dive: Specific Changes Required by Topic

### A. New Campaign: Theater III — The Crucible Circuit (`crucible_circuit`)

- **What Changed:**
  - Theater III is officially in the game catalog (`THEATER_CATALOG` in `src/campaign/theaters.ts`), unlocking upon clearing _Ember Reach_.
  - **Structure:** 8 championship 1v1 bouts in the Grand Crucible arena:
    1. _Opening Bell_ (25t limit, SPARK in Lancer-25, 18,000 c)
    2. _The Fox's Ground_ (35t limit, FOX in Ravenfall-35, 22,000 c)
    3. _The Professional_ (40t limit, WALL in Warden-40, 26,000 c)
    4. _House Favorite_ (55t limit, DARLING in Ironclad-55, 32,000 c)
    5. _Longshot_ (60t limit, LONGSHOT in Tempest-60, 38,000 c)
    6. _Iron Saint_ (75t limit, SAINT in Titan-75, 45,000 c)
    7. _The Fallen Crown_ (80t limit, FALLEN in Colossus-80, 52,000 c)
    8. _King of the Crucible_ (80t limit, CROWN in Colossus-80, 70,000 c)
  - **Tournament Rules:**
    - "Deployed hulls are the wager": Deployed machine is permanently surrendered upon defeat.
    - Pilot is never surrendered; standard injuries apply.
    - Victory awards the defeated champion's mech in post-battle condition into the persistent hangar.
    - No fail-forward; no fleeing/escape hexes.
    - Defeat allows challenging the same opponent again if another eligible operational hull exists in company inventory.
- **Wiki Impact:**
  - `CAREER_THEATERS.md`: Add Theater III description, unlock chain, and rules.
  - Create new Wiki document: `CRUCIBLE_CIRCUIT_CHRONICLES.md` (or import `The_Crucible_Circuit_bible.md`).
  - Update `src/pages/WikiPage.tsx` sidebar navigation to include the new campaign.

---

### B. Combat Mechanics & Battle Calculation Overhaul

1. **Shared-Core Torso & Flanking Rules (`FLANKING_SHARED_CORE_PLAN.md`, commit `236aec4`):**
   - **Old Rule:** Core and Rear Torso had independent structure pools.
   - **New Rule:** Front and rear armor protect **one shared core structure pool**. Rear hits penetrate rear armor directly into core structure (front armor does not intervene).
   - **Flanking Bonus:** Rear-arc attacks gain **+15% hit chance**, and hit location rolls heavily bias toward the torso.
   - **Destruction:** Breaching either Core structure or Command capsule destroys the mech.
   - **Limb Overflow:** Damage exceeding limb structure still flows into frontal core armor.
   - **Chassis Stats Updates (`MECHS_AND_CHASSIS.md`):**
     - _DART-20:_ Front Armor 6 / Shared Structure 15 / Rear Armor 3
     - _LANCER-25:_ Front Armor 8 / Shared Structure 18 / Rear Armor 4
     - _RAVENFALL-35:_ Front Armor 10 / Shared Structure 21 / Rear Armor 5
     - _WARDEN-40:_ Front Armor 12 / Shared Structure 23 / Rear Armor 6
     - _IRONCLAD-55:_ Front Armor 16 / Shared Structure 29 / Rear Armor 8
     - _TEMPEST-60:_ Front Armor 14 / Shared Structure 27 / Rear Armor 7
     - _TITAN-75:_ Front Armor 20 / Shared Structure 35 / Rear Armor 10
     - _COLOSSUS-80:_ Front Armor 22 / Shared Structure 38 / Rear Armor 10

2. **Range Bands & Accuracy Multipliers (`WEAPONS_AND_EQUIPMENT.md`):**
   - **Optimal Range:** Flat **+10% hit bonus** within the ideal band (optimal range down to a 2-hex grace floor). Damage is constant across all ranges.
   - **Too Close (Minimum Range):** Long-range weapons suffer **-10% hit per hex** inside the grace floor. Point-blank weapons (optimal <= 2) ignore this penalty.
   - **Beyond Optimal:** Flat **-15% long-range penalty** up to Maximum Range. Firing beyond Max Range is illegal.
   - **Cover:** Forest grants 15% direct fire cover; Craters grant 10%; Ruins grant 15%. Indirect missiles ignore terrain cover.

3. **Called Shot Overhaul (`CONTROLS_AND_INTERFACE.md`):**
   - Requires **Gunnery 7**.
   - Multiplies target location weight by **4×**; rolls location normally on hit (no guaranteed hit).
   - Incurs **-25 accuracy penalty** (or **-40** when targeting Command).
   - Front Core requires frontal arc; Rear requires rear arc.
   - Qualified enemy AI can also use Called Shots against vulnerable player sections.

4. **Movement & Positioning Options:**
   - **Sprint:** Spends both AP for 250% movement budget. Grants **-5% incoming hit chance** until next activation. Cannot be combined with other orders.
   - **Crawl:** When **both legs are destroyed**, normal Move is replaced by Crawl (1 adjacent walkable hex per activation, costs 1 AP). No movement defense, no sprint, no jump, no ram.
   - **Stationary Turn:** Free facing change once per activation if no move is queued (preserves both AP).
   - **End Facing:** Selectable ending orientation for all moves.

5. **Orders & UI Controls:**
   - **Ram:** 1 AP if adjacent, or 2 AP move-and-ram. Confirmed with `Space`.
   - **Flee:** Withdraws units that have _already resolved_ their movement onto an escape hex.
   - **Enemy Intel Card:** Hovering an enemy in Move or Fire mode provides a unified card showing armor, structure, heat, weapons, and hit probability.

---

### C. Pilots, Traits & Active Skills

1. **Active Skills (Unlocked at Attribute Rating 7):**
   - **Gunnery 7:** _Called Shot_ (Aim location picker, 4× weight, -25/-40 accuracy).
   - **Reflex 7:** _Overwatch_ (1 AP, front 3 directions arc, reactive attack against moving targets).
   - **Technical 7:** _Emergency Vent_ (1 AP, removes 8 heat, usable during shutdown).
   - **Command 7:** _Shared Focus_ (1 AP, marks target for +10 allied hit chance for the round).
   - **Instinct 7:** _Evasive Stance_ (1 AP, -15 incoming hit chance until next activation).
   - **Resolve 7:** _Push Through_ (0 AP during shutdown, drops heat to capacity - 1, keeps 1 recovery AP).

2. **Concrete Pilot Traits (`PILOTS_AND_SKILLS.md`):**
   - Mara Voss (`Calm Under Fire`): Reduces heat-driven accuracy penalties.
   - Elias Ren (`Reckless`): +10 hit at optimal range; slightly easier to hit.
   - Tala Orin (`Mechanically Gifted`): +2 cooling per turn.
   - Jonas Vale (`Natural Leader`): Stronger command aura for nearby allies.
   - Sera Kest (`Cautious`): +10 defense when stationary.
   - Darius Kane (`Stubborn`): Ignores 25% damage when heavily injured.

3. **Attributes & Injuries:**
   - Attributes capped at 10.
   - Resolve clarified: currently provides no direct combat modifier or injury protection.
   - Injury Recovery: Command shock (5 days), Core concussion (10 days), Ejection trauma (15 days).
   - Iron Contract: destroyed machines can inflict fatal pilot casualties (KIA). Starting 6 pilots are non-replaceable.

---

### D. Hangar, Weapon & Equipment Refits

1. **Refit Facility (`MECHS_AND_CHASSIS.md`):**
   - Unlocked in Repair Bay for 200,000 c after first completed main contract.
   - Swaps weapon hardpoints within chassis size and capacity constraints.
2. **Equipment Modules:**
   - Chassis < 50 tons: 2 equipment slots; Chassis >= 50 tons: 3 equipment slots.
   - Modules:
     - **Heat Sink:** +2 cooling during Cool and turn-end dissipation.
     - **Jump Jets:** Enables jump movement for ground frames across chasms/deep water.
     - **Sensor Suite:** +3 detection range in tactical sensor missions.
     - **Armor Plating:** +2 temporary armor on all intact locations per deployment.
   - Installation costs credits and days; removal costs 5,000 c + 1 day.

---

### E. Enemy AI Behavior Updates

- **AI Architecture (`ENEMY_AI.md`):**
  - Bounded 1-2 AP sequence planner with deterministic scoring and live execution replanning.
  - Profiles: `aggressive`, `objective`, `siege`, `escort`, `skirmisher`, `flank`, `sniper`.
  - **Tabu Movement Memory:** Retains up to 6 positions/contexts to prevent repetitive cycling or ping-pong movements.
  - **Target Hysteresis & Damage Allocation:** Prevents sporadic target switching and overkill; coordinates lance focus without hardcoding focus on the weakest player.
  - **Tactical Realism:** Avoids exposing weak rear armor; high-skill AI pilots employ called shots against exposed player parts.

---

### F. Map Design & Workshop / Community Publishing

1. **`MAP_DESIGN_GUIDE.md`:**
   - Restore comprehensive 15.5 KB version containing full tactical generation parameters, spawn/distance guidelines, tactical affordances (flanking routes, covered advances, sniper positions, kill zones, cooling pools), and design checklists.
2. **`CAMPAIGN_EDITOR.md` & `MODDING_AND_CUSTOM_SCENARIOS.md`:**
   - Update for Guided vs Advanced editor modes.
   - Clarify immutable campaign IDs (`custom-` / `user-`), Google Desktop OAuth publishing, explicit local update prompts, and the exclusion of community video files.
   - Mention admin verification via immutable Google `sub` identity.

---

## 4. File-by-File Update Matrix

| Wiki File in `public/wiki/`               | Status                        | Key Actions Required                                                                                                                      |
| :---------------------------------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `CAREER_THEATERS.md`                      | Outdated                      | Add Theater III (The Crucible Circuit), 8 bouts, wager mechanics, and unlock requirements.                                                |
| `CONTROLS_AND_INTERFACE.md`               | Incomplete (2.4 KB vs 9.0 KB) | Add Facing, Sprint, Crawl, Called Shots, Overwatch, Active Pilot Skills, and accessibility notes.                                         |
| `HOW_TO_PLAY.md`                          | Outdated                      | Update calendar rules, Enemy Intel hover, Ram/Flee orders, crawl rules, refit mention, Iron Contract death.                               |
| `MECHS_AND_CHASSIS.md`                    | Outdated stats                | Update all 8 chassis to Shared Core Structure + Rear Armor, add Weapon Refit and Equipment modules.                                       |
| `WEAPONS_AND_EQUIPMENT.md`                | Outdated mechanics            | Replace range intervals with exact optimal ranges, add +10% optimal bonus, -10% too-close penalty, -15% long-range penalty, cover values. |
| `PILOTS_AND_SKILLS.md`                    | Incorrect formulas            | Update concrete trait bonuses, max level 10 cap, injury recovery days, note that Resolve provides no direct combat math.                  |
| `MAP_DESIGN_GUIDE.md`                     | Truncated (6.5 KB vs 15.5 KB) | Synchronize with complete 15.5 KB guide including generator specs and tactical affordances.                                               |
| `CAMPAIGN_EDITOR.md`                      | Needs sync                    | Sync with updated workshop workflow, ZIP layout, ownership model, and moderation rules.                                                   |
| `MODDING_AND_CUSTOM_SCENARIOS.md`         | Needs sync                    | Update with explicit update mechanics, read-only fork requirements, and image constraints.                                                |
| `SCENARIO_APPROVAL.md`                    | Minor edits                   | Update admin URL references and moderation rules.                                                                                         |
| `MERIDIAN_STRIKE_CHRONICLES.md`           | Narrative tweaks              | Align narrative descriptions with actual gameplay mechanisms (OP-505 extract window, etc.).                                               |
| `EMBER_REACH_CHRONICLES.md`               | Narrative tweaks              | Align narrative descriptions with actual gameplay mechanisms (Aster Vale records, array).                                                 |
| **NEW:** `CRUCIBLE_CIRCUIT_CHRONICLES.md` | **Missing**                   | Create player-facing documentation for Theater III based on `The_Crucible_Circuit_bible.md`.                                              |
| **NEW:** `COMMS_VOICEOVER.md`             | **Missing**                   | Import/create guide for optional comms audio and settings.                                                                                |

---

## 5. UI & Navigation Updates Required in Scenario Repo

In `src/pages/WikiPage.tsx`:

- Add `CRUCIBLE_CIRCUIT_CHRONICLES` under the `Campaign Lore` sidebar group.
- Optionally add `COMMS_VOICEOVER` or an `Audio & Settings` section if desired.
- Ensure all route IDs, breadcrumbs, and Schema.org metadata correspond to the updated and new pages.
- Verify `version-policy.json` to reflect version compatibility (e.g., 0.1.15+).

---

## 6. Proposed Execution Next Steps

1. **Review and approve this analysis.**
2. **Apply synchronization to existing files in `public/wiki/`** using verified text from `mech-command/docs/wiki/`.
3. **Add `CRUCIBLE_CIRCUIT_CHRONICLES.md` and `COMMS_VOICEOVER.md`** into `public/wiki/`.
4. **Update `src/pages/WikiPage.tsx`** navigation configuration to include the new content.
5. **Run test suite and build verification** (`npm run test`, `npm run build`) to ensure all markdown rendering and page routes function flawlessly.
