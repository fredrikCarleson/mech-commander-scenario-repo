# Scenario Approval & Guidelines

To ensure a high-quality, safe, and stable experience for all players, every custom scenario uploaded to the **Meridian Strike Community Repository** must pass through a two-phase approval process before becoming publicly visible in the catalog.

This process consists of **Automated Technical Validation** followed by a **Manual Community Review**.

---

## Phase 1: Automated Technical Validation

When you click the **Upload** button for your scenario in the **Campaign Editor**, your client automatically bundles your content and sends it to the repository server. The server immediately subjects this package to a series of technical checks. If any of these checks fail, your upload will be rejected immediately with an error code.

1. **Data Completeness:**
   The server ensures your scenario has all the required settings to function properly, such as enemy forces, lance drop limits, and environmental conditions. If you missed a critical setting in the Campaign Editor, it will catch it here.

2. **Map Stability Check:**
   The server verifies that all units, player deploy zones, and extraction zones actually exist within the physical bounds of the map you painted. This prevents scenarios from crashing the game for other players.

3. **Game Version Compatibility:**
   Your scenario is checked against the current version of the live game. If your scenario relies on an outdated format that is no longer supported, it will be rejected to prevent unexpected errors.

4. **Safety & Security Scanning:**
   The scenario bundle is scanned to guarantee it only contains safe, game-approved data files and screenshots. This ensures the community is protected from malicious content and excessively large files.

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

- **Approved:** If the admin approves your scenario, its status changes to `published`. It will instantly appear in the public catalog for all players to download, play, and rate!
- **Rejected:** If the admin rejects your scenario, you will need to fix the issues listed in the rejection reason and upload the scenario again from the Campaign Editor.
