# Optional comms voice-over

Meridian Strike treats visible text as the authoritative battle communication. Optional speech is a small accent layer and never controls card timing, battle resolution, or mission progression.

## Player setting

**Settings → Audio → Voice comms** defaults to **Off**, including for saves with no stored preference. Turning it on enables the curated clips below. Turning it off immediately stops active speech. The preference persists as `meridian-strike:voice-comms-v1`.

Music and sound effects have separate controls. Missing or blocked speech always falls back to the visible text without delaying the card.

## Curated release set

The runtime accepts only entries in [`voiceover_manifest.csv`](voiceover_manifest.csv):

- Two kill confirmations for each of Mara Voss, Elias Ren, Tala Orin, Jonas Vale, Sera Kest, and Darius Kane.
- Two COMMAND kill confirmations for a player unit without an identified pilot.
- Seven mission-status lines covering victory and defeat.

This is 21 eligible clips. Hostile taunts, routine invalid-order chatter, movement failures, fire failures, Brace/Cool failures, and all other generated battle text remain text-only. Files left in the asset directory but absent from the curated runtime catalogue are ignored.

The manifest and `src/ui/commsVoiceCatalog.ts` must stay identical. `src/ui/sfx.test.ts` checks the row count, catalogue membership, and computed filename for every entry.

## Asset location and filenames

Clips live in:

```text
public/assets/voice/comms/
```

Filenames are deterministic:

```text
<speaker-slug>__<line-slug>__<hash>.mp3
```

Leading direction tags such as `[urgent]`, `[grim]`, and `[relieved]` select the intended delivery but are excluded from the filename. Use `commsVoiceFileName()` rather than constructing paths by hand.

`voiceover_optional_missing.txt` lists curated clips that may be absent during development. These entries remain silent until matching licensed recordings are supplied.

## Release review

The current clips are retained only as an opt-in fallback while the demo ships text-first. A later owner-reviewed recording pass must establish speaker consistency, commercial rights, loudness normalization, and the Steam AI-content disclosure before voice can be considered release-approved. Speech ducking is deferred unless a reviewed recorded set ships.
