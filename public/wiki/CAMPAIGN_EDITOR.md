# Campaign Workshop Guide

The **Campaign Workshop** is an in-game tool in Meridian Strike that allows creators to link individual tactical scenarios into an interconnected, story-driven campaign theater.

Whether crafting a multi-stage border skirmish or an epic planetary defense, the workshop guides you through setting narrative arcs, mission progression, balance curves, and custom briefings.

---

## Creator Workflow

Creating a custom campaign follows a straightforward, step-by-step authoring process inside the game:

1. **Build Your Missions:** Create and playtest each individual tactical battle in the **Scenario Editor** first to ensure balanced mechanics and engaging map layout.
2. **Open Campaign Workshop:** Select **Campaign Workshop** from the main menu and create a new campaign project. Choose between **Guided Mode** (for a structured step-by-step setup) or **Advanced Mode** (for full granular control over presentation and metadata).
3. **Define Campaign Identity:** Set the campaign's title, synopsis, author name, difficulty rating, and intended experience tags.
4. **Arrange Mission Sequence:** Add your saved scenarios in their intended play order. For each stage, define target difficulty, credit rewards, repair turnaround expectations, and whether the mission permits **fail-forward** progression upon defeat.
5. **Add Story & Dialogue:** Author narrative briefings, in-combat radio transmissions, mid-battle events, and introductory/aftermath narrative slides.
6. **Attach Visual Assets:** Choose custom artwork (PNG, JPEG, or WebP) for chapter cards, briefing slides, and catalogue thumbnails. Images are packaged and optimized automatically by the game.
7. **Validation & Balance Review:** Review the campaign balance graph in the editor. The workshop analyzes your lance drop limits, enemy opposition strength, and repair intervals to help you spot unintended difficulty spikes.
8. **Test & Share:** Playtest your campaign locally. When ready, export a self-contained package to share with friends, or sign in to publish it directly to the community catalogue.

---

## Campaign Package Architecture

When you export or publish a campaign from the workshop, the game automatically packages your work into a self-contained campaign archive. You do not need to assemble files manually:

- **Campaign Identity & Rules:** Contains the overall title, description, difficulty tier, author credit, and campaign rules.
- **Mission Flow & Briefings:** Stores the sequential mission tree, objective triggers, credit payouts, and custom radio dialogues.
- **Tactical Battle Maps:** Embeds each scenario's hex terrain, deployment coordinates, enemy force compositions, and victory objectives.
- **Narrative Art & Media:** Stores your custom chapter slides, intro visuals, aftermath illustrations, and the workshop thumbnail.
- **Integrity Validation:** Every packaged scenario is validated against the community safety rules before upload.

> [!NOTE]
> Community packages support high-resolution PNG, JPEG, and WebP imagery (up to 1 MiB per image, with a total package limit of 20 MiB expanded). Video files are reserved for official bundled campaigns and are not accepted in community packages.

---

## Publishing to the Community

Players with the Full Edition desktop app can publish their creations for other commanders to enjoy:

1. **Local Playtesting:** Ensure all missions can be completed and that dialogue triggers function as expected.
2. **Community Sign-In:** Sign in with Google from the in-game creator panel. Local authoring, importing, and offline playtesting never require an internet connection, but publishing requires creator authentication to establish ownership.
3. **Submit for Review:** Click **Publish** in the Campaign Workshop. Your campaign enters the community moderation queue as revision 1.
4. **Moderation Review:** An administrator reviews the package on the community review portal to ensure safety, fair playability, and appropriate content. Once approved, the campaign goes live in the public catalogue.
5. **Updates & Forking:**
   - Only the original creator's account can submit updates to an existing campaign listing.
   - While a new revision is under review, the previous approved version remains fully playable and downloadable for all players.
   - When importing someone else's community campaign, use **Fork to Edit** to create your own independent project with fresh IDs so you never overwrite another author's work.
