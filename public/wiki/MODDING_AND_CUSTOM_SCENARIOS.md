# Modding & custom scenarios

Meridian Strike Full Edition includes player-facing authoring, import, playtest, and community
publishing tools inside the game. The repository's Content Studio workspace is an internal workflow
for official content and is not required or supported for community publishing.

## Play community content

1. Open **Custom Scenarios** or **Campaign Workshop** from the title screen.
2. Browse the community catalogue and choose **Install**, or import a local ZIP.
3. Launch the installed scenario or campaign from its normal in-game screen.

Community campaign updates are explicit: the installed revision remains playable until the player
chooses to update. Removing an installed campaign also removes only its provenance-matched embedded
scenarios. The Demo Edition does not expose custom/community content.

## Create and playtest

- Use **Scenario Editor** to create or edit a local scenario, then save and playtest it.
- Use **Campaign Workshop** to combine eligible scenarios, write dialogue, and add intro or aftermath
  slides.
- Local authoring, saving, ZIP import/export, and playtesting work while signed out and offline.
- Imported campaigns are read-only; fork one before editing it as your own local work.

Community packages accept PNG, JPEG, and WebP images within the documented limits. Custom campaign
video fields and video files are intentionally unsupported; bundled official campaigns keep their
existing video support.

## Publish

1. Validate and save the content in the in-game editor.
2. Sign in from the community creator panel. Sign-in is required for publishing, ownership checks,
   updates, and withdrawal—not for local authoring.
3. Choose **Publish**. New uploads and updates enter moderation as immutable numbered revisions.

An approved revision stays available while a newer update is reviewed. An author can withdraw the
public listing without erasing retained immutable release records. Administrative deletion creates a
tombstone and prevents public retrieval; it is distinct from author withdrawal.

Player-facing wiki: `https://meridian-strike-wiki.netlify.app/wiki/MODDING_AND_CUSTOM_SCENARIOS`  
Owner/admin env guide: [`docs/OWNER_COMMUNITY_GUIDE.md`](../OWNER_COMMUNITY_GUIDE.md)
