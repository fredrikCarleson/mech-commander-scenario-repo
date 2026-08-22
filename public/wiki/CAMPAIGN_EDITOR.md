# Campaign Workshop

The Campaign Workshop composes your local custom scenarios into a linear theater you can play, export, or publish to the community catalogue.

Official Meridian Strike / Ember Reach campaigns are a separate bundled workflow. Do not copy official campaign IDs into community packs.

The Steam **demo** does not include Campaign Workshop.

---

## Play community campaigns

Approved campaigns appear on this site under [Campaigns](/campaigns) and inside the Full Edition game. Installing a campaign also installs its embedded missions. Updating an installed campaign is always an **explicit** player action; a failed update keeps the last playable local revision.

Imported community campaigns are read-only. Use **Fork to edit** before changing one as your own work. Forking creates new campaign and scenario IDs so you do not overwrite someone else's content.

---

## Authoring workflow

1. Build and playtest each mission in **Custom Scenarios**.
2. Open **Campaign Workshop** and create a campaign. The stable ID must start with `custom-` or `user-` and cannot change after save.
3. Add missions in play order.
4. Author dialogue, intro, and aftermath. Use PNG, JPEG, or WebP images. **Community campaigns cannot include video.**
5. Fix validation errors. Balance warnings are advisory.
6. Save and playtest locally. This works signed out and offline.
7. Export a ZIP to share privately, or sign in with Google and **publish** for community review.

Do not publish an imported campaign as your own. Fork it first.

---

## Community package

The game adds catalogue files on top of the workshop ZIP:

```text
manifest.json
thumbnail.webp
Campaigns/<stable-id>/
  campaign.json
  dialogues/<missionId>.json
  media/   (images only)
  missions/<scenarioId>/scenario.json
  missions/<scenarioId>/scenariomap.png|jpg|webp
```

The same size and image limits as scenarios apply (4,000,000 compressed bytes, 20 MiB expanded, 1 MiB per image). Mission IDs and order are locked after the first approved revision; a later update that reorders or replaces missions is rejected and must be published as a new campaign fork.

---

## Publish from the game

1. Full Edition **desktop** app, Google sign-in from the creator panel.
2. Publish from Campaign Workshop. The first upload is revision 1 and stays pending until an admin approves it.
3. Later **Update** uploads create revision 2, 3, … The last **approved** revision stays public while the new one is reviewed.
4. **Withdraw** removes the public listing. Existing local installs keep working. Immutable approved revisions remain addressable for reinstall.
5. Approval and rejection happen at [Community Review](./SCENARIO_APPROVAL).

The website has no public upload form. Admin review is at `https://meridian-strike-wiki.netlify.app/admin`.
