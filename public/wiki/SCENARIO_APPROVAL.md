# Community Publishing Approval & Guidelines

To ensure a high-quality, safe, and stable experience for all players, every custom scenario or campaign submitted to the **Meridian Strike Community Repository** must pass through a two-phase approval process before becoming publicly visible in the catalogue.

This process consists of **Automated Technical Validation** followed by a **Manual Community Review**.

---

## Phase 1: Automated Technical Validation

Create, import, export, fork, and playtest local content from the in-game **Scenario Library** or **Campaign Workshop**, even while signed out or offline. Sign in only when you choose to submit a new item, submit a revision, view its private moderation status, or withdraw it. The game validates the complete package before making a network request, and the server independently repeats those checks.

1. **Data Completeness:**
   The server validates the complete scenario or campaign, including each embedded mission, map, dialogue, media manifest, mission identity, and progression link.

2. **Map Stability Check:**
   The server verifies that all units, player deploy zones, and extraction zones actually exist within the physical bounds of the map you painted. This prevents scenarios from crashing the game for other players.

3. **Game Version Compatibility:**
   Your scenario is checked against the current version of the live game. If your scenario relies on an outdated format that is no longer supported, it will be rejected to prevent unexpected errors.

4. **Safety & Security Scanning:**
   Packages are limited to 4,000,000 compressed bytes and 20 MiB expanded, with bounded entry counts and strict safe paths. Every image, including a campaign thumbnail, is limited to 1 MiB and must match its declared image type. Community `.mp4`, `.webm`, video roles, dangerous files, and attempts to use reserved official campaign IDs are rejected.

_If your package passes Phase 1, it enters the **Pending** queue for Phase 2._

---

## Phase 2: Community & Content Review

Once in the Pending queue, a community administrator will manually review your scenario to ensure it adheres to our community standards.

> [!WARNING]
> Scenarios that repeatedly violate content guidelines may result in a ban from the Community Workshop.

### 1. Content Rules

Meridian Strike is designed for a broad audience. We enforce a strict **zero-tolerance policy** for the following content in scenario descriptions, titles, briefings, and radio chatter:

- Hate speech, slurs, or harassment targeting real-world individuals or groups.
- NSFW (Not Safe For Work) content, extreme gore descriptions, or sexually explicit themes.
- Real-world political or religious propaganda.

### 2. Asset Licensing

You must have the right to use the content you upload.

- The `thumbnail.webp` image must be an in-game screenshot or an image you hold the rights to use.
- Do not use copyrighted artwork, logos, or media ripped from other commercial games without explicit written permission from the copyright holder.

### 3. Gameplay Quality Standards

While we encourage brutally difficult challenge maps and creative narratives, a scenario must actually be playable. An admin may reject a scenario if it exhibits:

- **Unplayable States:** e.g., Player deploy zones placed entirely on `impassable` deep water tiles, instantly destroying the player's lance on round 1.
- **Troll/Softlock Maps:** e.g., A required extraction zone placed behind an unbroken wall of `impassable` terrain with no jump-capable mechs available.
- **Spam:** Blank scenarios, testing templates, or duplicates of existing official campaigns without meaningful modifications.

---

## The Verdict

- **Approved:** The reviewed immutable revision becomes `published` and appears in the public catalogue for players to download, play, and rate.
- **Revision pending:** A new revision stays private while the previously approved revision remains public. Updating an installed campaign is always an explicit player action.
- **Rejected:** The private owner status shows the moderator's reason. Correct the local content and submit a new revision; rejection does not take the last approved revision offline.
- **Withdrawn:** The item leaves the public catalogue, but existing offline installations continue to work and retained immutable revisions remain available according to the compatibility policy.
