---
name: game-wiki-authoring
description: >-
  Use this skill whenever authoring, reviewing, or updating game wiki pages,
  campaign lore, gameplay manuals, or community modding guides. Enforces an
  immersive, player-first perspective, evocative universe storytelling,
  strict protection of sensitive technical/backend code, and visible spoiler warnings.
---

# Game Wiki Authoring & Lore Curation Skill

This skill defines the standards for authoring, updating, and curating public-facing
wiki articles for **Meridian Strike** and similar tactical game universes.

The primary mission of the wiki is to **immerse players in the game universe**,
**explain game systems clearly**, and **empower community creators**—without
breaking immersion or exposing internal technical architectures.

---

## The 5 Core Pillars

```text
1. Player-First Perspective    → Write for commanders and creators, not software engineers.
2. The Anti-Leak Boundary      → Never expose internal code, file paths, or backend schemas.
3. Immersive Universe Lore     → Tell chronicles as gripping military sci-fi stories.
4. Visible Spoiler Safeguards  → Protect first-time players with prominent warning banners.
5. Engaging Tactical Design    → Present mechanics through clean tables and strategic guidance.
```

---

## 1. The Anti-Leak Boundary (Strict Rule)

A game wiki must never reveal backend implementations that break immersion, expose
unreleased features, or provide instructions that could be used to exploit or mod
the game outside supported channels.

### Prohibited Content (Never Include):
- **Internal File Paths:** Never list repository paths like `src/...`, `public/assets/...`, or `docs/developer/...`.
- **Database & Storage Keys:** Never expose internal storage identifiers (e.g., `meridian-strike:save-v1`, `aftermathSeen`).
- **Internal APIs & Secrets:** Never describe serverless functions, authentication endpoints, Cloudflare workers, or client secret procedures.
- **Raw Code Trees & Folder Structures:** Never display internal archive trees (e.g., `Campaigns/<id>/campaign.json`) or file-naming hash algorithms.
- **Developer Function / Variable Names:** Never cite code functions (e.g., `commsVoiceFileName()`) or enum tags (e.g., `crucible_champion`).
- **Internal Task Lists:** Never include developer roadmap checklists (`- [ ] Steamworks overlay...`) or developer issue references.

### How to Translate Technical Details:
| Developer Technical Source | Public Player Wiki Translation |
| :--- | :--- |
| Raw JSON file structure tree | Conceptual description of package contents (maps, dialogue, art) |
| Hardcoded path `public/assets/voice/` | In-game menu path: **Settings → Audio → Voice Comms** |
| Function call `commsVoiceFileName()` | Feature description: "Plays context-sensitive pilot callouts" |
| Enum `crucible_undefeated_champion` | Narrative epilogue: *"The Flawless Legend"* |
| TypeScript generation parameters | Clean design guidance tables (e.g., "Terrain Distribution") |
| Storage key `meridian-strike:career-v1` | Player concept: *"Career Profile (persists across companies)"* |

---

## 2. Immersive Lore & Storytelling

Lore and chronicle articles should read like compelling, high-quality military science fiction.

- **Chronicles as Stories:** Present military campaigns, battles, and tournament bouts as dramatic narrative events. Describe the dust, the roar of the engines, cockpit heat warnings, pilot choices under fire, and the psychological weight of command.
- **No Developer Meta-Tags:** Strictly avoid structural script notes (e.g., `Narrative function: Call to adventure...`, `Supreme ordeal...`, test seed identifiers). Let the story speak for itself through narrative momentum.
- **Narrative Epilogues:** When documenting multiple endings or campaign states, write them as historical accounts and company legends rather than a list of variable states.
- **Ground the Universe:** Treat the universe as a real, living setting. Use evocative, gritty prose that reflects industrial mercenary life, corporate betrayal, and frontier survival.

---

## 3. Mandatory Spoiler Safeguards

Every page containing campaign plot revelations, character betrayals, mission objectives, or ending conditions must open with a prominent, visually distinct alert blockquote:

```markdown
> [!WARNING]
> **SPOILER ALERT: Major Campaign Narrative Spoilers**
> This chronicle reveals complete story arcs, mission operations, character confrontations, and ending outcomes for [Campaign Name]. If you have not yet completed this campaign in the game, proceed with caution!
```

---

## 4. Tactical Manuals & Gameplay Guides

Player manuals (such as *How to Play*, *Controls & Interface*, *Weapons*, and *Mechs*) must be precise, accessible, and engaging:

- **Clean Scannability:** Use structured Markdown tables, bulleted highlights, and bold terminology so players can quickly look up information during battle.
- **Strategic Context:** Do not merely state raw numbers—explain *why* they matter tactically (e.g., explaining the risk/reward of standing in shallow water for cooling versus taking the defensive penalty).
- **Direct Accessibility:** Clearly document keyboard shortcuts, mouse inputs, and controller behavior, including interface ergonomics and accessibility notes.

---

## 5. Map Design & Workshop Guides

When guiding players on creating scenarios or designing custom maps:

- **Design Philosophy Over Code:** Provide concrete design principles, tactical affordances (flanking routes, covered advances, sniper perches, cooling basins), and balanced terrain percentages.
- **In-Game Tooling:** Frame all instructions around the player-facing **Scenario Editor** and **Campaign Workshop** interfaces.
- **No AI Prompts or Script Dumps:** Never dump raw coding prompts or code snippets into mapping guides. Convert them into clear tables, design checklists, and rules of thumb.

---

## Authoring Checklist

Before finalizing any wiki page update, verify each item:

- [ ] **Audience:** Is this written for a player, commander, or community creator?
- [ ] **No Leaks:** Are all repository paths, internal keys, functions, and folder trees removed?
- [ ] **Spoilers:** Does the page include a visible `> [!WARNING]` banner if story details are revealed?
- [ ] **Story Quality:** Are chronicles written as immersive stories free of developer planning tags?
- [ ] **Clarity:** Are game mechanics and rules explained with clean tables and clear tactical language?
- [ ] **Formatting:** Is Markdown properly formatted, validated, and free of broken links?
