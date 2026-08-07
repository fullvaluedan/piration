# Piration — Project Handoff

Last updated: 2026-08-07 (Immersion Pass 8 — "Rigged Life")

## What this is

Piration is a completely offline, single-player pirate adventure built as an Android
game. The game itself is an HTML5/WebGL (Three.js) world wrapped in a Capacitor
Android shell — no Unity, no blockchain, no ads, no IAP, no network calls at
runtime. Art, models, sound, and music come from the CC0 Proof of Play
`piratenation-art` / `piratenation-game` repos (see `NOTICE.md` and
`android/scripts/extract-upstream.mjs` for sourcing).

- Live hosted build (same code as the APK): https://fullvaluedan.github.io/piration/game/
- Installable debug APK: `Piration-debug.apk` (repo root, ~115 MB)
- Privacy policy: https://fullvaluedan.github.io/piration/docs/privacy.html

## Repo layout

```
android/
  www/                  the actual game (index.html, js/, css/, assets/, data/)
  android/              Capacitor Android project (gradle)
  scripts/              servers, tests, balance sims, screenshots, asset pipeline
  store-assets/         Play Store screenshots / icon assets
docs/                   design docs + Play Store listing docs
handoff.md              this file
NOTICE.md               CC0 attribution
README.md               overview
```

The GitHub Pages site is staged from `android/www` + `docs` on a separate
`gh-pages` branch; `master` is the source of truth.

## How to run and test

Everything below runs from `android\`.

```powershell
# local web server (required for all tests/screenshots)
node scripts\serve-www.mjs 5199

# full verification: world boot -> deck -> combat -> builder -> ambush -> battle -> end
node scripts\verify-all.mjs

# UI smoke test (15 checks)
node scripts\test-ui-smoke.mjs

# progression balance sim (expect ~20h voyage-only to level 20; accept 18-22h)
node scripts\sim-progression.mjs

# endless-depth suite (deep runs per captain)
node scripts\test-endless-depth.mjs

# living-world checks: rigged animations, ambient life, banners (needs server)
node scripts\verify-immersion.mjs

# Play Store screenshots (needs server)
node scripts\make-screenshots.mjs
```

For hands-on testing: open the hosted link on a phone/PC, or sideload
`Piration-debug.apk` on Android. The Codex desktop HTML preview cannot run
WebGL reliably — always use the hosted link or the APK.

## Game design summary

- Core loop: sail the open world → gather resources on islands → random monster
  ambushes (no energy gate in test builds; `energy.unlimited` in `game.json`) →
  card combat → loot → craft ships/cards → level crew → unlock captains →
  chase the Endless high score → decorate your island.
- 8 islands with distinct archetypes (atoll, mesa, mountain, standard) and CC0
  landmarks; hub is Parrot's Perch.
- Combat: 8-card decks, elemental RPS captains, 60+ curated cards, 5 presets.
- 8 lore captains with unique card pools; unlock via missions after level 10.
- Endless mode: scaling waves, global high score, retire-with-loot.
- Maxing one character (level 20 + galleon + captains + enhanced cards) takes
  ~20 hours by design (sim-verified: 20.1h voyage-only).
- Island builder: grid-snap decor, undo, auto-save. Everything saves to
  localStorage; the game is fully playable offline.

## Immersion status (what ships in this build)

1. Shader sky (fbm clouds, sun glow, haze, distant storm cell with lightning).
2. Gerstner ocean: 4-wave normals, fresnel, glitter, sparkle, caustics, island
   foam/shoreline, lagoon vs deep-sea color.
3. Bloom + color grade, vertex-AO terrain, cliffs, rocks, palms, instanced meshes.
4. Real-time shadows; ships/mobs/player cast onto the sea.
5. Wave-riding ships, wake foam, seagulls, buoys, hit-stop, speed FOV, wind audio.
6. Island archetypes + CC0 landmarks (huts, village, shipwreck, stonehenge, ruins).
7. All combat in the live 3D world (bottom-docked card strip), auto quality
   governor, Lady Lara player model.
8. **Pass 8 (current)**: plays the CC0 rigged animations — ship idle (sails,
   flags, oars, hull), player walk/run/idle/swim/tread, mob idle/attack/hit —
   plus ambient life (3 migrating bird V-flocks, island butterfly/dust motes),
   in-world event banners (encounter, boss/elite/monster tag, victory, defeat,
   level-up, island reached), battle spawn splash, walk bob/lean + sandy
   footstep dust, and swim ripples.

## Verification evidence (latest run)

- `verify-all.mjs`: **ALL CLEAN** (world boot, deck, combat, builder, ambush
  spawn/engage/battle-end, zero page errors).
- `test-ui-smoke.mjs`: 15/15 passed.
- `sim-progression.mjs`: Lv20 at 20.1h voyage-only (target band 18-22h).
- `test-endless-depth.mjs`: deep runs wave 19-56 across 4 captains.
- `verify-immersion.mjs`: 14/14 checks (ship/player/mob clips play and advance,
  flocks/motes alive, banners spawn, attack/hit one-shots fire).
- Visual metrics from captured frames: sailing scene ~45k unique colors,
  battle frames ~49-74k unique colors; walk and battle frames show clear
  animation motion (61-99% of pixels change between sampled poses).

## Fixed on this pass

- **Atoll island crash**: `buildIsland` called a JS `smoothstep()` that never
  existed, which threw during island generation and silently broke the whole 3D
  world (UI-only smoke tests still passed, so it was easy to miss). Added the
  helper; `verify-all` now boots the world and resolves ambushes.
- Stale test harness data: `test-endless-depth.mjs` referenced the old ship
  `dreadnought` and old captain ids; updated to the current ship/captain roster.

## Known gaps / next steps

- Device FPS/thermal audit on a real phone (auto quality governor helps but is
  not phone-verified).
- More distinct 3D battle enemy models (only anglerfish/deepone/charybdis have
  dedicated rigs; other mobs map onto them).
- Play Store: app registration, signed AAB, and listing content still need the
  Google Play Console steps (user in-progress; see `docs/PLAY-STORE*.md`).
- Optional: celebrate animation on boss kill, quest dialogue banners, more
  ambient variation (fireflies at dusk, migrating whales).

## Publish / rebuild recipe (run after each code pass)

```powershell
npx cap sync android
git add -A; git commit -m "message"; git push origin master

# stage + force-push the hosted site, then trigger a Pages build
$site = "D:\tmp\ghpages-site"
Remove-Item -Recurse -Force $site -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$site\docs","$site\game" | Out-Null
Copy-Item -Recurse -Force docs\* "$site\docs\"
Copy-Item -Recurse -Force android\www\* "$site\game\"
"" | Set-Content "$site\.nojekyll" -Encoding ascii
git -C $site init -q -b gh-pages; git -C $site add -A
git -C $site -c user.name=fullvaluedan -c user.email=fullvaluedan@users.noreply.github.com commit -q -m publish
git -C $site remote add origin https://github.com/fullvaluedan/piration.git
git -C $site push -f origin gh-pages
gh api repos/fullvaluedan/piration/pages/builds -X POST

# rebuild the APK (Java 21 + Android SDK at C:\Android)
$env:JAVA_HOME="C:\Android\jdk-21.0.12+8"; $env:ANDROID_HOME="C:\Android"
cd android\android; .\gradlew.bat --no-daemon assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk "D:\ChatGPT\piraton-repo\Piration-debug.apk" -Force
```

Wait ~60-90s, then verify the hosted page boots with zero console errors.

## Constraints

- 16:9 landscape, offline-first, no runtime network, no blockchain, no ads/IAP.
- Art must come from the CC0 upstream repos where possible.
- Don't ship a "good enough" pass; verify with evidence and keep pushing visual
  quality and feel.
