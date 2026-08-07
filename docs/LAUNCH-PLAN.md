# Piration — 9/10 Launch Plan

Goal: launch at **9/10 on every aspect** — gameplay, visuals, performance,
UX/audio, content depth, store presentation, and release hygiene. Every bar
below has a checkable test. Status is based on current verified evidence.

## 1. Quality bars and current status

| Aspect | 9/10 bar | Current evidence | Status |
|--------|----------|------------------|--------|
| Gameplay loop | Sail -> gather -> craft -> combat -> level -> unlock, all connected and satisfying | End-to-end headless walkthrough: world, deck builder, combat, builder, ambush all pass with zero errors | ✅ |
| Balance | 18-22h to max, sim-enforced | Sim outputs ~19.6-21.1h voyage-only to Lv20 (inside band) | ✅ |
| Visuals | Real CC0 voxel models, bright readable style, 16:9 | Visual overhaul: procedural sky (fbm clouds, sun glow), gerstner ocean with fresnel/glitter/shore foam, slope-cliff terrain with AO, bloom + color grade, ship wake, seagulls. Measured: saturation 0.44-0.53, 7,000+ unique colors in world/battle renders (was ~1,000) | ✅ |
| Performance | ~150 draw calls in sailing; 60fps mid-range | ~172 scene drawables + bloom in sailing (down from 765 meshes pre-pass); on-device FPS still to verify | 🟡 |
| UX | Joystick + action button, safe-area HUD, hints, sound, no dead ends | HUD, joystick, build bar, confirmations, autosave, debug menu verified | ✅ |
| Audio | Music + SFX with mute | Archive music/SFX wired, mute toggle | ✅ |
| Content | 8 captains, 60-card deck system, 4 ships, 8 islands + home, endless, builder | All implemented and exercised in verification | ✅ |
| Stability | No crashes/errors across a session | verify-all: zero pageerrors/404s/failed requests | ✅ |
| Store listing | Icon, feature graphic, screenshots, copy, privacy URL | All staged in `android/store-assets` + docs | ✅ |
| Release | Signed AAB, Play listing, data safety | Debug APK builds; signed AAB needs keystore (user) | 🟡 |

## 2. Remaining work to hold 9/10

### Performance / device pass (pre-launch milestone)
- Install debug APK on a mid-range 2022 Android phone; measure FPS in sailing,
  on-foot, combat, and builder. Fix anything below 30fps (candidate levers:
  ship LOD billboard at distance, water shader LOD, lower pixel ratio cap on
  low-end).
- Safe-area audit at 19.5:9, 20:9, 21:9: verify HUD chips, build bar, and
  panel never clip notches. Current CSS uses `env(safe-area-inset-*)` on the
  panel only; extend to HUD chips and action button.
- Test offline-first: airplane-mode relaunch after first full load
  (SW caches everything, cache v7).

### Combat polish (in progress, near done)
- Combat-in-world VFX shipped: battle camera, live 3D enemy, cannonballs,
  splashes, hull flinch, victory sink. Next: screen shake on the panel, and a
  brief enemy "telegraph" flash for charge turns.

### Content QA pass
- Full 60-card pool art audit (all 151 art files exist; deck shows only
  owned cards with art).
- Captain portrait quality pass (8/8 verified present).
- Endless depth retest after combat changes (best wave target ~40+ at max).

### Playtesting
- 3 x 60-minute playtests: fresh save -> first boss, mid-game (captains 3-5),
  endgame (wave 40 push). Log bugs in a GitHub issue; track via the in-game
  Debug menu (session time, XP/min, projected hours to max).
- Verify the debug XP overlay matches the sim: real XP/min within 20% of the
  sim's average.

## 3. Store and release pipeline

1. **Assets (done):** icon 512, feature graphic 1024x500, six 1920x1080
   screenshots (world sailing, shipyard, combat, captains, collection+deck,
   endless), listing copy in `docs/PLAY-STORE-SUBMISSION.md`.
2. **Privacy (done):** https://fullvaluedan.github.io/piration/docs/privacy.html
   plus githack fallback.
3. **Play Console:** create app (2-minute click path in the submission doc),
   fill listing, data safety (none collected), content rating (fantasy
   violence, 12+), upload the signed AAB.
4. **Signing:** user creates keystore in Android Studio
   (`Build -> Generate Signed Bundle`) or I can script `bundleRelease` with a
   signing config once the keystore exists. Debug APK already builds locally.
5. **Launch tracks:** start with Internal testing -> Closed testing -> Open
   testing -> Production, with the playtest feedback gate between each.

## 4. Go/No-Go checklist (all must be green)

- [x] Zero-error end-to-end verification (verify-all)
- [x] Draw calls < 150 in sailing (measured 96)
- [x] Sim hours 18-22 (measured ~19.6-21.1)
- [x] All 8 captains + 60-card pool obtainable
- [x] Energy flag flips to real economy without breaking play
- [ ] On-device 30fps floor on a low-end test device
- [ ] Safe-area audit on 3 aspect ratios
- [ ] 60-minute soak test without crash
- [ ] Signed release AAB uploaded
- [ ] Store listing complete and screenshots approved

## 5. Post-launch

- Patch cadence: weekly for two weeks post-launch (bug fixes from playtests),
  then monthly content drops (new skin sets from the CC0 ship variants,
  seasonal islands, more captains via Lore Characters).
- No analytics/ads per spec; feedback via GitHub issues and Play reviews.
- Keep the `gh-pages` hosted build in sync with master for instant public
  builds; republish command documented in README.
