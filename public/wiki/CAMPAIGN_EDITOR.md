# Campaign Editor

In-game authoring for custom theaters. Compose local Custom Scenarios into a playable `CampaignPack`.

## Workflow

1. **Build scenarios** in Title → Custom Scenarios (map, enemies, objective, map art).
2. **Open Campaign Workshop** (Title → Campaign Workshop).
3. **New campaign** → fill Meta (id must start with `custom-` or `user-`).
4. **Missions** → add scenarios in order (linear unlock: 1 → 2 → … → final).
5. **Dialogue / Intro / Aftermath** → author talks and media paths.
6. **Validate** → fix hard errors; warnings are advisory.
7. **Save**, then **Play** (or start from Theaters if listed).
8. **Export ZIP** → share / sell / re-import a self-contained pack folder.

## Media paths

Each campaign pack owns media under:

```
public/assets/campaigns/<campaign_id>/
```

Shared company UI chrome:

```
public/assets/campaigns/shared/
```

Suggested filenames (also shown as placeholders in the editor):

| Role                  | Path                                                     |
| --------------------- | -------------------------------------------------------- |
| Theater card          | `/assets/campaigns/<id>/theater-card.jpeg`               |
| Intro video           | `/assets/campaigns/<id>/campaign-intro.mp4`              |
| Intro poster / slides | `/assets/campaigns/<id>/intro-01.jpeg` … `intro-04.jpeg` |
| Aftermath video       | `/assets/campaigns/<id>/campaign-aftermath.mp4`          |
| Aftermath poster      | `/assets/campaigns/shared/hq-command-hangar.png`         |

Helpers: `src/campaigns/mediaPaths.ts`.

## ZIP format

```
Campaigns/<id>/
  campaign.json
  README.md
  PACK.md
  dialogues/<missionId>.json
  media/ASSETS.md
  missions/<scenarioId>/scenario.json
  missions/<scenarioId>/scenariomap.png|jpg|webp
```

Legacy zips with top-level `Scenarios/` still import.

Import upserts embedded scenarios, then the campaign.
