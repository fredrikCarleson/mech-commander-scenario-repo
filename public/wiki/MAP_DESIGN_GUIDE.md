## Core principle

> Campaign maps are **authored hex** layouts (see `src/engine/missionTerrain.ts` and the historical [`MAP_REFINEMENT_PROGRESS.md`](../archive/MAP_REFINEMENT_PROGRESS.md)); ratios below that mention elevation-heavy square generators are aspirational guidance, not the live pipeline.

A good tactical mech map needs four things:

```text
1. Open fire lanes
2. Cover and line-of-sight blockers
3. Movement obstacles
4. Valuable positions worth fighting over
```

A bad map is either:

```text
Too open  → long-range units dominate
Too dense → movement becomes slow and frustrating
Too flat  → positioning does not matter
Too random → tactics feel accidental
```

---

# Recommended terrain ratios

For a balanced standard map, start with this:

| Terrain type                     | Recommended share | Purpose                                        |
| -------------------------------- | ----------------: | ---------------------------------------------- |
| Plain / open ground              |        **45–60%** | Movement, fire lanes, maneuver space           |
| Forest / cover                   |        **15–25%** | Defensive positioning, ambush, approach routes |
| Rough / rocks / rubble           |         **8–15%** | Slows movement, creates route decisions        |
| Elevation / hills / ridges       |        **10–20%** | Tactical advantage, line of sight, objectives  |
| Water / marsh / pools            |         **3–10%** | Chokepoints, cooling zones, risk/reward        |
| Impassable / cliffs / deep water |          **0–8%** | Shape the battlefield, but use sparingly       |
| Objectives / special zones       |          **1–5%** | Focus conflict and movement                    |

For your current game, I would use this as the **default generator profile**:

```ts
const balancedTemperateMap = {
  plain: 0.5,
  forest: 0.2,
  rough: 0.1,
  elevation: 0.12,
  water: 0.05,
  impassable: 0.03,
};
```

That gives enough open ground for movement and shooting, but enough cover and terrain to create tactics.

---

# Better map archetypes

Instead of one random generator, create **map archetypes**. Each archetype teaches a different tactical lesson.

## 1. Balanced battlefield

Best for standard battles.

```ts
const mapProfile_balanced = {
  plain: 0.5,
  forest: 0.2,
  rough: 0.1,
  elevation: 0.12,
  water: 0.05,
  impassable: 0.03,
};
```

Tactical use:

- medium mechs can maneuver
- long-range weapons get lanes
- short-range mechs can use forests and ridges to approach
- player has several viable plans

---

## 2. Long-range duel map

Best for fire-support battles.

```ts
const mapProfile_openFireLanes = {
  plain: 0.62,
  forest: 0.1,
  rough: 0.08,
  elevation: 0.15,
  water: 0.03,
  impassable: 0.02,
};
```

Tactical use:

- high ground matters
- long-range weapons shine
- fast scouts can spot and flank
- cover exists, but does not dominate

Important: never make it _completely_ open. Add 2–3 safe approach routes.

---

## 3. Ambush / forest map

Best for close-range brawls and scouting.

```ts
const mapProfile_forestAmbush = {
  plain: 0.38,
  forest: 0.32,
  rough: 0.12,
  elevation: 0.1,
  water: 0.05,
  impassable: 0.03,
};
```

Tactical use:

- line of sight is broken
- short-range units can close distance
- scouts matter
- enemies can hide or flank

Warning: if forest goes above **35–40%**, the map may become slow and messy.

---

## 4. Canyon / chokepoint map

Best for defense missions.

```ts
const mapProfile_canyon = {
  plain: 0.42,
  forest: 0.0,
  rough: 0.18,
  elevation: 0.22,
  water: 0.03,
  impassable: 0.15,
};
```

Tactical use:

- routes matter
- heavy mechs can anchor chokepoints
- fast mechs can flank through side paths
- missiles and indirect fire become useful

Important: always provide at least **2–3 viable routes**, never just one corridor.

---

## 5. Wetlands / cooling map

Best if heat is important.

```ts
const mapProfile_wetlands = {
  plain: 0.42,
  forest: 0.18,
  rough: 0.08,
  elevation: 0.07,
  water: 0.2,
  impassable: 0.05,
};
```

Tactical use:

- water offers cooling but slows movement
- players can risk exposure for heat management
- heavy energy-weapon mechs get an interesting choice

Water should not just block movement. It should create a **temptation**.

---

## 6. Lunar / low-cover map

Best for brutal open combat.

```ts
const mapProfile_lunar = {
  plain: 0.58,
  forest: 0.0,
  rough: 0.18,
  elevation: 0.14,
  water: 0.04,
  impassable: 0.06,
};
```

Tactical use:

- fewer hiding places
- craters and ridges become cover
- movement and range control matter more
- damage is more punishing

Replace forest with:

- crater fields
- rubble
- rock spires
- fissures
- wreckage

---

# The most important design rule: terrain must form shapes

Do **not** scatter terrain randomly cell by cell.

Bad:

```text
forest, plain, forest, plain, rock, plain, forest
```

Good:

```text
forest cluster
ridge line
river curve
crater field
rocky outcrop
open valley
```

Great maps are made from **features**, not individual tiles.

Use this generator logic:

```ts
const featureRules = {
  forestClusters: { count: [3, 6], size: [4, 12] },
  ridgeLines: { count: [1, 3], length: [5, 12] },
  roughPatches: { count: [3, 7], size: [2, 6] },
  waterFeatures: { count: [0, 2], length: [4, 12] },
  craterFields: { count: [1, 4], size: [2, 5] },
  openFireLanes: { count: [2, 4], width: [2, 4] },
};
```

The map should first create large shapes, then assign hex terrain.

---

# Tactical ingredients every good map should have

## 1. At least two major fire lanes

A fire lane is a line where long-range weapons can matter.

Recommended:

```text
2–4 major fire lanes per map
Length: 8–15 hexes
Width: 2–4 hexes
```

Use them to let missile/laser/cannon units contribute.

But never make all fire lanes point directly from spawn to spawn.

Better:

```text
diagonal fire lane
central valley
ridge-to-ridge angle
objective overlook
```

---

## 2. At least two covered approach routes

Short-range mechs need ways to close.

Recommended:

```text
2–3 covered approach routes
Each route should include forest, ridge shadows, rough terrain, or crater cover
```

A good player should be able to think:

> “I can get my brawler close if I move through the woods and stay behind the ridge.”

---

## 3. High ground that is useful but risky

High ground should give advantage, but not be free.

Good high ground:

```text
+ better line of sight
+ better firing angles
- exposed from multiple directions
- slower to reach
- vulnerable to flanking
```

Recommended:

```text
2–4 elevation zones
1 central contested ridge
1–2 side ridges
1 risky sniper perch
```

Do not place one perfect hill in the player spawn. That removes the decision.

---

## 4. Chokepoints, but never only one

Chokepoints create tactical drama.

But one chokepoint creates boredom.

Recommended:

```text
2–3 chokepoints
Each with at least one alternate route
```

Good pattern:

```text
main road through valley
rough side path
risky water crossing
high ridge flank
```

---

## 5. Objectives should pull players into danger

Never put objectives in safe corners.

Good objective placement:

```text
near contested center
partly exposed
reachable by multiple routes
covered from some angles
threatened from others
```

Recommended:

```text
Primary objective: 45–60% across the map from player spawn
Secondary objective: off-center, creates split-force decision
Extraction zone: not the same as spawn
```

---

# Practical parameters for a 15×15 map

A 15×15 square grid gives 225 cells.

For a balanced map:

```ts
const map15x15Balanced = {
  totalCells: 225,

  plain: 115, // ~51%
  forest: 45, // ~20%
  rough: 25, // ~11%
  elevation: 25, // ~11%
  water: 10, // ~4%
  impassable: 5, // ~2%
};
```

But again: do not place them randomly. Place them as features.

Example feature plan:

```ts
const balancedFeaturePlan = {
  forestClusters: [
    { size: 10, location: 'left-center' },
    { size: 8, location: 'right-flank' },
    { size: 6, location: 'near objective' },
    { size: 5, location: 'player approach' },
  ],

  ridges: [
    { length: 9, direction: 'diagonal', location: 'center' },
    { length: 6, direction: 'horizontal', location: 'enemy side' },
  ],

  roughPatches: [
    { size: 5, location: 'central valley' },
    { size: 4, location: 'left flank' },
    { size: 4, location: 'near enemy approach' },
  ],

  water: [{ type: 'stream', length: 8, location: 'right side', crossingPoints: 2 }],

  openFireLanes: [
    { direction: 'diagonal', from: 'player-left', to: 'center' },
    { direction: 'horizontal', from: 'center', to: 'enemy-right' },
  ],
};
```

---

# Spawn and engagement distances

For your game, this matters a lot.

## Recommended starting distance

For a 15×15 map:

```text
Player and enemy should usually start 9–13 cells apart.
```

Too close:

- no maneuvering
- immediate brawl

Too far:

- slow opening turns
- long-range units dominate

## First contact timing

A good tactical map should usually create first meaningful contact around:

```text
Round 2–3
```

Not immediately on round 1, unless it is an ambush mission.

---

# How maps let players win through tactics

You asked the key question: how can players use the map to win?

Here are the tactical affordances you want to deliberately build.

## 1. Flanking routes

Create side paths where faster mechs can threaten rear or side positions.

Parameter:

```ts
flankingRoutes: {
  count: 2,
  risk: "medium",
  cover: "partial",
  travelTimeRounds: 2-4
}
```

Good flank routes are:

- not too safe
- not too long
- useful for scouts/skirmishers

---

## 2. Covered advance

Let brawlers close distance without being instantly destroyed.

Parameter:

```ts
coveredAdvanceRoutes: {
  count: 2,
  coverDensity: 0.4,
  brokenLineOfSight: true
}
```

Use:

- forest
- ridges
- craters
- smoke/fog later
- buildings/wreckage later

---

## 3. Sniper positions

Create good firing positions, but make them contestable.

Parameter:

```ts
sniperPositions: {
  count: 2,
  elevation: 2,
  exposure: "high",
  escapeRoutes: 1
}
```

A sniper hill should be powerful but dangerous if the enemy pushes it.

---

## 4. Heat/cooling tradeoff

Water or coolant pools should create temptation.

Parameter:

```ts
coolingZones: {
  count: 1-3,
  tacticalValue: "high",
  exposure: "medium-high"
}
```

Example:

> A heavy energy mech can stand in shallow water and fire more often, but becomes easier to target.

---

## 5. Kill zones

Create areas where standing still is dangerous.

Parameter:

```ts
killZones: {
  count: 2,
  width: 2-4,
  length: 5-10,
  cover: "low"
}
```

These are open zones crossed under fire.

A good player can:

- avoid them
- bait enemies into them
- overwatch them later

---

## 6. Objective tension

The objective should force commitment.

Bad objective:

```text
Stand safely behind cover and win.
```

Good objective:

```text
Take the relay in the center, but doing so exposes you to two firing angles.
```

Parameter:

```ts
objectivePlacement: {
  distanceFromPlayerSpawn: 0.55,
  coverNearby: "partial",
  exposedFromAtLeastTwoAngles: true,
  alternateApproaches: 2
}
```

---

# Terrain effect recommendations

For Meridian Strike:

```ts
const terrainEffects = {
  plain: {
    moveCost: 1,
    defense: 0,
    losBlock: false,
  },

  forest: {
    moveCost: 2,
    defense: 10,
    accuracyPenaltyAgainstTarget: 10,
    losBlock: 'partial',
  },

  rough: {
    moveCost: 2,
    defense: 0,
    stabilityPenalty: 5,
  },

  rocks: {
    moveCost: 2,
    defense: 5,
    losBlock: 'partial',
  },

  elevation1: {
    moveCost: 1,
    attackBonusIfHigher: 5,
    losBonus: true,
  },

  elevation2: {
    moveCost: 2,
    attackBonusIfHigher: 10,
    exposed: true,
  },

  shallowWater: {
    moveCost: 2,
    coolingBonus: 3,
    defense: -5,
  },

  deepWater: {
    impassable: true,
  },

  crater: {
    moveCost: 2,
    defense: 5,
    stabilityPenalty: 5,
  },
};
```

Keep the numbers small. If terrain bonuses are too large, the map becomes more important than the mechs.

---

# Map quality checklist

A good map should answer “yes” to most of these:

```text
Can a fast mech flank?
Can a heavy mech anchor a position?
Can a long-range mech find useful fire lanes?
Can a short-range mech approach without suicide?
Is there at least one risky but rewarding position?
Are there at least two routes to the objective?
Does terrain break line of sight without making the map cramped?
Can the player recover from a bad first move?
Does the map create choices by round 2?
Would the map play differently with a different lance composition?
```

If yes, the map is probably good.

---

# Generator parameters I would give Cursor

Use this as your actual design spec:

```ts
export const tacticalMapGenerationParams = {
  mapSize: {
    cols: 15,
    rows: 15,
  },

  terrainRatios: {
    plain: [0.45, 0.6],
    forest: [0.15, 0.25],
    rough: [0.08, 0.15],
    elevation: [0.1, 0.2],
    water: [0.03, 0.1],
    impassable: [0.0, 0.08],
  },

  features: {
    forestClusters: {
      count: [3, 6],
      sizeCells: [4, 12],
      minDistanceBetweenClusters: 3,
    },

    roughPatches: {
      count: [3, 7],
      sizeCells: [2, 8],
    },

    ridgeLines: {
      count: [1, 3],
      lengthCells: [5, 12],
      widthCells: [1, 3],
      shouldCreatePartialLineOfSightBreaks: true,
    },

    waterFeatures: {
      count: [0, 2],
      lengthCells: [4, 12],
      crossingPoints: [1, 3],
      avoidBlockingMapCompletely: true,
    },

    craterFields: {
      count: [1, 4],
      sizeCells: [2, 6],
    },

    impassableFeatures: {
      maxPercentOfMap: 0.08,
      mustNotSplitMapIntoDisconnectedAreas: true,
    },
  },

  tacticalStructure: {
    majorFireLanes: [2, 4],
    coveredApproachRoutes: [2, 3],
    flankingRoutes: [2, 3],
    chokepoints: [1, 3],
    alternateRoutesPerChokepoint: 1,
    sniperPositions: [1, 3],
    riskyRewardPositions: [2, 4],
  },

  spawnRules: {
    startingDistanceCells: [9, 13],
    avoidDirectUnblockedLineOfSightAtStart: true,
    firstContactTargetRound: [2, 3],
    eachSideHasAtLeastTwoOpeningRoutes: true,
  },

  objectiveRules: {
    placeObjectivesNearContestedSpace: true,
    distanceFromPlayerSpawnRatio: [0.45, 0.65],
    requireAtLeastTwoApproachRoutes: true,
    avoidSafeCornerObjectives: true,
    objectiveShouldBeExposedFromAtLeastTwoAngles: true,
  },

  readabilityRules: {
    avoidSingleCellNoise: true,
    terrainMustFormClusters: true,
    avoidLargeFeatureRectangles: true,
    avoidPerfectSymmetry: true,
    preserveClearMovementAreas: true,
  },
};
```
