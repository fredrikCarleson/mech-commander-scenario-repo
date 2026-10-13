# Campaign Editor

The Campaign Workshop composes local Custom Scenarios into a playable linear theater.

Official campaign content is a separate workflow. See `docs/developer/CAMPAIGN_PACK_LAYOUT.md` and `docs/wiki/CONTENT_STUDIO.md`.

## Recommended workflow

1. Build and playtest each mission in **Scenario Library**.
2. Open **Campaign Workshop** and create a campaign.
3. In Guided mode, define its identity, author credit, intended difficulty, and intended experience.
4. Add missions in play order. Set target difficulty, expected duration, rewards, and fail-forward behavior.
5. Author dialogue, intro, and aftermath. Choose PNG, JPEG, or WebP images in the editor; they are packaged automatically. Community/custom videos are not supported.
6. Fix validation errors and review the campaign-wide balance curve. Balance warnings are advisory and never change combat rules.
7. Save and playtest. Unsaved work is durably recovered after navigation or restart.
8. Export a self-contained ZIP, or sign in with Google and publish it for community review.

Advanced mode exposes stable IDs and detailed presentation controls. A saved campaign ID is immutable because saves, revisions, and community ownership refer to it.

## Ownership and revisions

- Publishing requires Google sign-in in the desktop game.
- Only the Google account that first published a campaign can submit later revisions or withdraw it.
- A new revision waits for admin approval while the last approved revision remains downloadable and playable.
- Installed revisions update only after explicit player action. A failed update retains the last playable local revision.
- Local authoring, import, export, fork, and playtest remain available while signed out and offline.
- Imported community campaigns are read-only. Use **Fork to edit** to create new campaign and scenario IDs with explicit provenance.
- Admin review at `https://meridian-strike-wiki.netlify.app/admin` can approve or reject scenario and campaign revisions. Admin access is authorized by immutable Google subject ID, not an editable email address.

Owner upload and environment notes: [`docs/OWNER_COMMUNITY_GUIDE.md`](../OWNER_COMMUNITY_GUIDE.md). Public wiki: `https://meridian-strike-wiki.netlify.app/wiki/CAMPAIGN_EDITOR`.

## ZIP format

```text
Campaigns/<id>/
  campaign.json
  README.md
  PACK.md
  dialogues/<missionId>.json
  media/manifest.json
  media/<managed PNG, JPEG, or WebP images>
  media/ASSETS.md
  missions/<scenarioId>/scenario.json
  missions/<scenarioId>/scenariomap.png|jpg|webp
```

Legacy ZIPs with top-level `Scenarios/` still import. Imported campaigns remain read-only until deliberately forked.

Community/custom ZIPs have no video roles or video fields. Official bundled campaigns retain their separate video-capable format.

Community packages add root `manifest.json` and `thumbnail.webp` for server validation and catalogue presentation.

## Code map

| Module                                   | Role                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/customCampaigns/`                   | Versioning, migration, validation, balance guidance, drafts, media, storage, and ZIPs |
| `src/ui/screens/CustomCampaigns.tsx`     | Local and community campaign library                                                  |
| `src/ui/screens/CampaignEditor.tsx`      | Guided/advanced editor                                                                |
| `src/api/communityCampaignRepository.ts` | Community catalogue, publishing, and withdrawal                                       |
| `src/api/communityCampaignPackage.ts`    | Community package construction and import                                             |
