# Meridian Strike — How to Play

Welcome to **Meridian Strike**, a single-player tactical mech RPG. You command a small mercenary company: choose pilots and machines, fight turn-based battles on a hex grid, and bring your crew home with experience, salvage, and (hopefully) intact chassis.

---

## What you are trying to do

1. Run missions from **Headquarters**.
2. Win tactical battles by completing each mission’s **objective**.
3. Earn **pilot XP**, manage **repairs / injuries / days**, and grow your company.
4. Keep your machines in fighting shape — **damage carries over** between missions.

A new campaign starts with **6 pilots**, a **gated light/medium hangar**, and a **six-mission** contract chain (later ops unlock as you progress).

---

## Starting the game

On the title screen:

- **New Campaign** — starts fresh. Confirming erases the previous save.
- **Continue Game** — loads your last campaign from local storage.
- **Difficulty** — Story · Veteran · Iron Contract (affects rewards, repair, and injury pressure).

The game auto-saves as you play (except on the title screen).

---

## Campaign flow

```text
Headquarters → Mission Briefing → Deployment → Battle → After-Action Report → Headquarters
```

Optional: **Mercenary board** side contracts, **Custom Scenarios** / editor (sandbox — does not damage campaign hangars).

### Headquarters

- Company funds, reputation, **day clock**, streak
- **Missions** — campaign contract board
- **Mercenary board** — optional paid side ops
- **Repair bay** — schedule / rush repairs; bay time advances calendar days
- **Machines** / **Pilots** — chassis condition, injuries, XP, traits

### Deployment

1. Select up to **4** machines under the mission **mass limit** (and any chassis restrictions).
2. Prefer the **recommended mass** when shown — lean drops can pay a bonus.
3. Assign **one pilot per machine** (injured pilots may be unavailable).
4. **Start battle** stays disabled until every selected machine has a pilot.

**OUT OF ACTION** hulls must be repaired before they can drop again.

---

## The battlefield

Battles use a **hex grid** with plains, forest, rock, crater, water, deep water, wall, building, and ruins.

### Turn structure — plan, then resolve

1. **Planning** — queue up to **2 orders** (AP) per friendly machine. Nothing moves yet.
2. **Resolve** — press **▶ End round**. Your orders play out one machine at a time (ghosts, paths, projectiles, combat log, director cards).
3. **Enemy phase** — AI acts with visible telegraphs where applicable.

Then a new round begins.

### Giving orders

- Select a machine on the map or squad bar.
- **Move is the default order mode.** Click any highlighted destination without first pressing Move.
- Planned moves show a **destination ghost**; planned shots show badges / telegraphs.
- Remove a queued order with **✕** in the right panel.
- The right command panel keeps orders and weapons visible. Hover the selected **pilot name** (or
  focus it with the keyboard) for attributes, their current combat bonuses, and the pilot's trait.
  Hover a mech on the battlefield for its detailed armor/structure schematic.
- Ending the round with unused friendly actions opens an in-game confirmation listing the affected
  machines. If confirmed, those machines hold and still cool at end of activation.

| Order          | Effect                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| **Move**       | Walk to a highlighted hex (terrain cost + occupancy rules)                |
| **Fire salvo** | Press **Fire salvo**, then click a target or building to queue the attack |
| **Brace**      | Reduce incoming damage until next activation                              |
| **Cool**       | Vent extra heat (1 AP)                                                    |

Hit % while planning uses **planned positions** (including allies’ planned destinations where relevant).

### Movement honesty

- Valid move hexes highlight when a machine is selected (not only after pressing Move).
- Friendly machines do **not** block each other's planned paths, whether stationary, waiting to move, or already at their own final hex.
- Final hexes are still exclusive. A machine leaving a needed hex resolves first; planned swaps/rotations are atomic. If multiple machines contest the same otherwise-empty destination, the highest-**Reflex** pilot resolves first and claims it.
- A later destination contender does not overlap or fake-move. It advances to the furthest clear hex on the intended route when possible, reports **Stopped short**, plays the move-failure cue, and explains the abort on the Battle Director channel. If it cannot leave its current hex, it logs `MOVE_FAILED` instead.
- A queued follow-up salvo is still attempted from the stop-short hex. Any mounts with a valid solution fire; the rest discharge clear and still pay their committed heat, so fallback movement cannot become a heat exploit.
- If the board changes and a queued move/fire can no longer resolve, the game **drops it from the plan** and shows an **Orders adjusted** notice — you will not silently keep an illegal order.
- During playback, a blocked move does **not** fake-walk then snap back. Failed orders are logged and the pilot may speak on the Battle Director channel.

### Fire flow

1. Check weapon loadout / heat / Emergency Overload if needed.
2. Press **Fire salvo**.
3. Click an enemy or targetable building. That click immediately queues every checked weapon with a
   valid firing solution; there is intentionally no separate **Confirm fire** step.

Returning to Move or selecting another friendly clears the pending target and aim line. This keeps
target state attached to the mech currently receiving orders and prevents stale fire lines from
appearing in another mech's movement plan.

Confirming commits the whole selected salvo. If an early weapon destroys the target, every remaining
selected mount still fires and adds heat. This is intentional: double salvos cannot avoid their heat
cost through overkill timing.

---

## Movement rules (short)

- Each chassis has a **movement budget**; terrain costs more than plains.
- Rock / deep water / wall / building are **jump-only** for jump-capable scouts; heavier frames cannot cross them.
- Forest = cover; water helps cooling.
- Destroyed legs and high heat reduce movement.

---

## Combat & heat (short)

- Base hit chance **65%**, modified by gunnery, range, movement, cover, heat, traits, command aura (clamped ~10–95%).
- Damage hits a **location** (armor then structure). Arms disable mounts; command/core kills the machine.
- Brace cuts damage taken. Second fire in one activation multiplies heat (**2.5×**).
- A committed salvo always pays the heat of every selected usable mount, including overkill shots.
- Soft overheat can lock guns until you Cool or arm **Emergency Overload** (overflow becomes self-damage).

---

## Pilots

Attributes: Reflex, Gunnery, Technical, Command, Resolve (injuries / campaign pressure), Instinct. Each pilot has a **trait**. Higher Reflex resolves earlier when no vacate dependency constrains the order and wins contested destinations. Match Gunnery to shooters, Technical to hot platforms, Command to support. During battle, hover or focus the pilot name at the top of the command panel to see the live numeric effect of each attribute.

XP from participation, kills, and objectives. Level-up: +1 to one attribute (max 10).

---

## Campaign missions (current)

| Op     | Mission         | Mass (rec.) | Objective (summary)              |
| ------ | --------------- | ----------: | -------------------------------- |
| OP-101 | Border Signal   |   60t (45t) | Destroy all hostiles             |
| OP-202 | Silent Relay    |   85t (70t) | Hold the relay hex to download   |
| OP-303 | Hold the Line   | 200t (170t) | Survive rounds; defend the hex   |
| OP-404 | Cut the Head    | 155t (135t) | Assassinate the marked commander |
| OP-505 | Deep Extract    | 145t (110t) | Reach extract under pressure     |
| OP-606 | VEX: Last Stand | 220t (220t) | Finale confrontation             |

Exact enemy lists, unlock gates, and optional bonuses are on the contract board / briefing.

---

## Between missions

- **Damage persists** until repaired in the Repair bay (schedule vs rush).
- **Salvage** after victories can yield parts / chassis progress.
- **Injuries** can bench pilots for days.
- Destroyed command/core → **OUT OF ACTION** until repaired or written off.

---

## Quick tips

1. Read hit % and block reasons before confirming fire.
2. Move then shoot when accuracy matters; brace when you must tank.
3. Watch heat — a locked gun is a dead weight.
4. Check destination ghosts and the **Orders adjusted** banner before End round.
5. Lean mass and optional objectives pay; over-deploying early ops is gated for a reason.
6. Custom / editor fights are sandbox — use them to learn maps, not to repair campaign debt.

---

## Controls summary

| Screen       | Main actions                                  |
| ------------ | --------------------------------------------- |
| Title        | New Campaign / Continue / difficulty          |
| Headquarters | Missions, mercenary, repair, machines, pilots |
| Briefing     | Back / authorize deployment                   |
| Deployment   | Pick machines + pilots → Start battle         |
| Battle       | Plan Move / Fire / Brace / Cool → ▶ End round |
| After-action | Salvage / level-ups → return to HQ            |

---

## Still open (product)

- [ ] Deeper machine customization / loadout builder
- [ ] Steam / desktop storefront packaging polish <!-- (see docs/steam-readiness.md) -->
- [ ] Optional voiceover files for new order-failure pilot lines (cards work without audio)

Good hunting, Commander.
