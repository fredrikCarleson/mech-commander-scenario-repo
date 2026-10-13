# The Crucible Circuit — Deployment Chronicles

For ninety days every year, active frontier conflicts lose viewers, military sensor networks redirect relays, weapons manufacturers reserve hospitality suites, and mercenary companies throughout known space turn their attention to a single proving ground: **The Grand Crucible**.

Its champions are professional duelists, decorated combat veterans, corporate demonstration pilots, and hardened survivors bound by one immutable arena law:

> **One pilot. One machine. Winner claims the defeated machine.**

Following their campaigns in Meridian Strike and Ember Reach, the Meridian Company receives an official circuit invitation. This is not an employer hiring guns to protect a mining settlement, nor a defensive stand against Commander Vex. It is a calculated gamble of everything the company has built.

---

## Tournament Rules & Architecture

- **1v1 Championship Duels:** All engagements are single-machine duels on the Grand Crucible proving grounds.
- **The Wager:** _Deployed hulls are the wager._ If Meridian loses a bout, the deployed machine is permanently forfeited to the arena. Pilots are never surrendered; normal injury and recovery rules apply.
- **The Prize:** Victory transfers the defeated opponent's machine directly into Meridian's persistent hangar in its post-battle damaged condition.
- **Rising Tonnage Ceilings:** The tournament ladder enforces strict mass limits starting at 25 tons and escalating to 80 tons. Players may deploy below the ceiling, but receive no handicap compensation.
- **Persistent Company Ledger:** 90 campaign days to complete the circuit. Repair Bay times and pilot injury recovery advance the same calendar.
- **No Flee / Fail-Forward:** Escape hexes are absent and defeat cannot be skipped. However, if another operational machine in the company roster meets the mass criteria, the player may challenge the opponent again.
- **Voluntary Withdrawal:** After every victory, the commander may choose to withdraw from the tournament, locking in company earnings, captured machines, and prestige.

---

## OP-801 — Opening Bell

- **Opponent:** Niko Serrin (_"The Spark"_)
- **Chassis:** LANCER-25 (Mass Limit: 25 t)
- **Purse:** 18,000 c

The lower brackets belong to the young, the hungry, and the desperate. Niko Serrin enters the arena with lightning reflexes and an aggressively tuned Lancer, eager to build a reputation off the veterans from Ember Reach. The fight tests raw skirmishing agility and heat discipline in close quarters.

_Narrative function:_ Entrance into the arena; proving the company can adapt from open-field lance doctrine to single-combat dueling.

---

## OP-802 — The Fox's Ground

- **Opponent:** Aya Corven (_"Fox"_)
- **Chassis:** RAVENFALL-35 (Mass Limit: 35 t)
- **Purse:** 22,000 c

Aya Corven treats the arena like private hunting grounds. Piloting an agile Ravenfall, she exploits line-of-sight breaks along the ridge lines and cooling pools to set up flanking shots against slower opponents. Victory requires discipline, patience, and baiting her into exposing her weaker rear armor.

_Narrative function:_ Understanding terrain affordances and counter-flanking under the gaze of thousands of spectators.

---

## OP-803 — The Professional

- **Opponent:** Bram Calder (_"The Wall"_)
- **Chassis:** WARDEN-40 (Mass Limit: 40 t)
- **Purse:** 26,000 c

Bram Calder brings twenty seasons of mercenary combat into the ring. He wastes no heat on theatrics, holds optimal firing lanes with surgical patience, and punishes every reckless charge. Calder's Warden is built to outlast, forcing Meridian into a grueling battle of attrition.

_Narrative function:_ Professional confrontation; contrasting mercenary survival doctrine with arena entertainment.

---

## OP-804 — House Favorite

- **Opponent:** Juno Varek (_"Darling of the Crucible"_)
- **Chassis:** IRONCLAD-55 (Mass Limit: 55 t)
- **Purse:** 32,000 c

The middle tier introduces the circuit's true celebrities. Juno Varek commands the arena crowd with flamboyant aggression and an up-armored Ironclad designed to trade punishing blows at point-blank range. Defeating Varek turns the arena audience hostile, painting Meridian as the ruthless outsiders.

_Narrative function:_ The threshold of fame; testing whether Meridian can withstand the physical and psychological pressure of the main card.

---

## OP-805 — Longshot

- **Opponent:** Severin Holt (_"Longshot"_)
- **Chassis:** TEMPEST-60 (Mass Limit: 60 t)
- **Purse:** 38,000 c

Severin Holt rarely lets opponents close within visual range. From elevated positions behind armored blast aprons, his Tempest rains indirect missile fire and heavy cannon salvos across the entire stadium. Rushing him blindly means running through a deadly kill zone under continuous bombardment.

_Narrative function:_ Navigating long-range fire lanes and closing distance against heavy siege loadouts.

---

## OP-806 — Iron Saint

- **Opponent:** Ilyan Drave (_"Iron Saint"_)
- **Chassis:** TITAN-75 (Mass Limit: 75 t)
- **Purse:** 45,000 c

Revered almost like a religious icon within the tournament, Ilyan Drave pilots an imposing Titan assault frame. Drave fights with calm, relentless momentum, absorbing fire with reinforced frontal armor plates while methodically dismantling his target piece by piece.

_Narrative function:_ The heavy assault crucible; surviving an exchange with one of the most durable hulls on the circuit.

---

## OP-807 — The Fallen Crown

- **Opponent:** Maeve Ardan (_"The Fallen Crown"_)
- **Chassis:** COLOSSUS-80 (Mass Limit: 80 t)
- **Purse:** 52,000 c

A former reigning champion who lost her title in a legendary final, Maeve Ardan fights with bitter ferocity. Her Colossus siege platform is armed to obliterate armor instantly. She views every challenger as an obstacle between her and the rematch she believes she is owed.

_Narrative function:_ Penultimate test; facing a fighter who has won everything and lost everything.

---

## OP-808 — King of the Crucible

- **Opponent:** Cassian Rook (_"The Crown"_)
- **Chassis:** COLOSSUS-80 (_"Crown of Ash"_) (Mass Limit: 80 t)
- **Purse:** 70,000 c

The reigning grand champion. Cassian Rook's _Crown of Ash_ is a masterpiece of custom heavy engineering, manned by a pilot whose combat awareness, precision, and cool composure have gone unchallenged for three consecutive seasons. There are no gimmicks, no secondary objectives, and no retreat. Only the final duel to determine the undisputed master of the Crucible.

_Narrative function:_ The ultimate peak of the mercenary profession; risking the company's finest machine for immortality on the Grand Circuit.

---

## Epilogue States

Depending on the commander's decisions and outcomes across the 90-day season, the company settles into one of several historical records:

- **`crucible_champion`:** Defeated Cassian Rook and claimed the championship crown and purse.
- **`crucible_undefeated_champion`:** Won all eight consecutive bouts without forfeiting a single company machine.
- **`crucible_withdrew_early`:** Made a calculated withdrawal between rounds, banking captured prize machines and purse earnings.
- **`crucible_eliminated`:** Lost an operational machine without possessing another eligible hull or running out of tournament calendar days.
