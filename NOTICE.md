# NOTICE — upstream attribution

**Piration** is an independent community port. It is not affiliated with, endorsed by, or sponsored by Proof of Play, the Pirate Nation Foundation, or their partners.

## Upstream open-source releases (Aug 2026)

| Project | URL | License (as published) |
|---------|-----|------------------------|
| Pirate Nation Unity client | https://github.com/proofofplay/piratenation-game | MIT (archival) |
| Pirate Nation art | https://github.com/proofofplay/piratenation-art | CC0-1.0 |
| Pirate Nation contracts | https://github.com/proofofplay/piratenation-contracts | MIT |
| Announcement | https://x.com/ProofOfPlay/status/2084699843868733615 | — |

Card names/stats in this repo were derived from CC0 combat card filenames in `piratenation-art`. Game systems are a clean-room Luau/JS recreation of the published architecture notes (quests, energy, gauntlet cards, ships, crew) — not a binary Unity dump.

Blockchain / $PIRATE / live backends are intentionally omitted (offline-first).

## Game assets bundled in `android/www/assets/`

The offline Android game bundles curated assets from the two upstream
archives, per their published licenses:

- **Voxel art** (ships, mobs, captain portraits, world/zone props, card art)
  from [proofofplay/piratenation-art](https://github.com/proofofplay/piratenation-art)
  — CC0-1.0. Card art filenames map to `data/cards.json`; ships/mobs/captains/
  zones are mapped in `assets/manifest.json`.
- **Music and sound effects** (menu/combat/title loops plus UI, combat, and
  harvest SFX) from [proofofplay/piratenation-game](https://github.com/proofofplay/piratenation-game)
  — MIT (Proof of Play, Inc.). Audio was converted to MP3 for web use.

`android/scripts/extract-upstream.mjs` documents the exact source paths and
licensing for every bundled asset. Stock-library sound names (e.g. "tv
gameshow buzzer", "hammering metal") appear as-is in the upstream archive.
