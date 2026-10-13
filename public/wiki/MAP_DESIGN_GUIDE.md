# Map Design Guide

In Meridian Strike, battlefields are not just decorative backgrounds—they are active tactical systems. A thoughtfully designed map creates tension, enables diverse lance compositions, and rewards commanders who exploit terrain.

---

## The Four Core Elements of Map Design

Every engaging tactical map balances four critical design components:

1. **Open Fire Lanes:** Clear sightlines where fire-support mechs and long-range ballistics can engage across distance.
2. **Cover & Line-of-Sight Blockers:** Forests, ridges, and urban ruins that shield brawlers from early bombardment and enable covert approaches.
3. **Movement Obstacles:** Rough ground, craters, and water features that force commanders to make risk/reward routing choices.
4. **Valuable Positions Worth Contesting:** Sniper hills, shallow cooling basins, and defensible chokepoints that draw opposing forces into conflict.

A map fails when it leans too far in any single direction:

- _Too open:_ Long-range artillery dominates immediately, making slower brawlers unplayable.
- _Too dense:_ Movement becomes tedious, blocking tactical maneuvering.
- _Too flat:_ Positioning ceases to matter, turning combat into a static slugfest.
- _Too random:_ Battlefield features lack logical clusters, making tactical planning feel accidental.

---

## Recommended Terrain Distribution

When painting a standard 15×15 hex grid in the in-game Map Editor, use the following distribution as a baseline for balanced competitive play:

| Terrain Type                         | Recommended Share | Tactical Role & Purpose                                                     |
| :----------------------------------- | :---------------: | :-------------------------------------------------------------------------- |
| **Plain / Open Ground**              |   **45% – 55%**   | Provides core movement corridors and firing lanes.                          |
| **Forest / Dense Cover**             |   **15% – 25%**   | Grants +15% direct-fire defense; breaks line of sight for brawlers.         |
| **Rough / Craters / Rubble**         |   **8% – 15%**    | Grants +10% cover while imposing extra movement costs.                      |
| **Elevation / Ridges / Hills**       |   **10% – 15%**   | Grants line-of-sight elevation and attack bonuses over lower ground.        |
| **Shallow Water / Pools**            |    **3% – 8%**    | Grants +3 cooling per turn at the cost of a -5% defensive exposure penalty. |
| **Impassable / Chasms / Deep Water** |    **2% – 5%**    | Channels movement into chokepoints; jump-capable units can bypass.          |

---

## Tactical Map Archetypes

Rather than distributing terrain uniformly, design around distinct map archetypes that highlight specific combat doctrines:

### 1. Balanced Proving Ground

- **Focus:** Varied tactical options suitable for balanced lance compositions.
- **Layout:** Generous central plains flanked by forested approach corridors, with two low ridge lines providing contestable high ground.
- **Gameplay:** Long-range mechs control the center, while scouts and skirmishers maneuver along the flanks to threaten rear arcs.

### 2. High-Ground Artillery Duel

- **Focus:** Fire support, spotting, and elevated sightlines.
- **Layout:** 60% open ground with prominent central and flanking ridges. Sparse forest pockets provide brief cover while moving between firing positions.
- **Gameplay:** Controlling high ground is paramount. Fast jump-capable scouts are essential for spotting targets for heavy missile platforms.

### 3. Forest Ambush

- **Focus:** Short-range brawling, sensory stealth, and close-quarters skirmishing.
- **Layout:** Up to 30% dense forest clusters and broken terrain. Firing lanes rarely exceed 4 to 6 hexes.
- **Gameplay:** Long-range snipers struggle to find clear trajectories. Heavy brawlers and nimble skirmishers dominate by setting ambushes around blind corners.

### 4. Defended Canyon / Chokepoint

- **Focus:** Defensive holding actions and breakthrough assaults.
- **Layout:** High impassable rock walls channeling movement through 2 or 3 distinct passes.
- **Gameplay:** Defenders set up overwatch corridors; attackers must use jump jets or concentrated firepower to force a breach.

---

## Building Tactical Affordances

When laying out your map, deliberately craft these six tactical opportunities:

### 1. Flanking Corridors

Create side routes where fast skirmishers can advance out of main sightlines to threaten enemy rear arcs. A good flank route takes 2 to 3 turns of movement and carries moderate risk.

### 2. Covered Advance Routes

Ensure short-range brawlers can close distance without being annihilated in the open. Link crater depressions, forest groves, and ridge shadows so mechs can advance from cover to cover.

### 3. Sniper Perches

Place elevated firing positions that offer clear lines of sight across key corridors. Keep them dangerous by ensuring they can be contested or flanked from behind.

### 4. Cooling Pools

Shallow water provides a tactical dilemma: standing in water grants +3 extra heat dissipation per turn, but leaves the machine exposed with a -5% defense penalty.

### 5. Kill Zones

Deliberately open stretches of ground between opposing approach routes. Smart players will use overwatch to lock down kill zones or bait reckless enemies into crossing them.

### 6. Contested Objectives

Place mission objectives (such as relays, capture points, or convoys) in contested midfield space roughly equidistant from initial engagement lines, exposed from at least two firing angles.

---

## Spawn & First-Contact Guidelines

- **Spawn Distance:** On a standard 15×15 map, opposing lances should deploy **9 to 13 hexes apart**. Deploying closer leads to an immediate chaotic brawl; deploying further results in sluggish opening turns.
- **Initial Line of Sight:** Always place natural terrain breaks between player and enemy spawn zones to prevent instant round-one alpha strikes.
- **First Contact Timing:** Meaningful tactical contact should occur around **Round 2 or 3**, allowing both sides one turn of positioning and maneuvering.

---

## Combat Terrain Reference

| Terrain                | Move Cost  | Defense Modifier | Line of Sight    | Tactical Notes                                        |
| :--------------------- | :--------: | :--------------: | :--------------- | :---------------------------------------------------- |
| **Plain**              |    1 AP    |  Baseline (0%)   | Open             | Standard ground.                                      |
| **Forest**             |    2 AP    | **+15% defense** | Partial / Blocks | Excellent cover against direct fire; missiles ignore. |
| **Crater**             |    2 AP    | **+10% defense** | Open             | Good emergency cover in open expanses.                |
| **Ruins / Rubble**     |    2 AP    | **+15% defense** | Partial          | Urban obstacle; breaks long-range line of sight.      |
| **Elevation (+1)**     |   1–2 AP   | Height Advantage | Elevated LOS     | Grants +5% hit bonus when firing on lower targets.    |
| **Shallow Water**      |    2 AP    | **-5% defense**  | Open             | **+3 Cooling per turn**; high risk, high reward.      |
| **Deep Water / Chasm** | Impassable |        —         | Open             | Jump units only.                                      |

---

## Map Quality Checklist

Before submitting a map to the community catalogue, verify that it answers "Yes" to these questions:

- [ ] Can a fast skirmisher find a viable flanking route to threaten rear arcs?
- [ ] Can an armored brawler close the distance without taking unavoidable open fire?
- [ ] Can a long-range fire support platform find at least two useful firing lanes?
- [ ] Is there at least one risky but rewarding position (such as a sniper ridge or cooling basin)?
- [ ] Are there at least two distinct approach paths to the primary objective?
- [ ] Does terrain break line of sight without making movement feel cramped or frustrating?
- [ ] Would the battlefield play meaningfully differently with different lance weight classes?
