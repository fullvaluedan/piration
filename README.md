# Piration

Offline-first **Pirate Nation** archive port for **Android** (and a Roblox place).

Not affiliated with Proof of Play. Built from their 2026 open-source dump (MIT client notes + **CC0** art names). See [NOTICE.md](NOTICE.md).

## Play (Android web / PWA)

```bash
cd android
npm install
npm run serve
# open http://localhost:5173
```

Or open `android/www/index.html` in a browser.

**Windows:** double-click `PLAY.bat` in the project root — it starts the local
server and opens the game. (The web app needs a local http server; opening
`index.html` directly won't load its modules.)

### Offline loop
Random monster encounters (no energy) → XP + loot + card drops → craft ships /
enhance cards / recruit crew at port → level up → unlock captains via monster
and resource missions → Endless high-score mode. Full write-up:
[android/OFFLINE-LOOP.md](android/OFFLINE-LOOP.md), design:
[docs/GAME-DESIGN.md](docs/GAME-DESIGN.md).

### Balance
`android/scripts/sim-progression.mjs` plays the real game logic with a scripted
bot and verifies the ~20-hour max-out curve, ship/captain unlocks, and Endless
depth. `android/scripts/test-endless-depth.mjs` checks max-gear Endless waves.

## Roblox

```bash
cd roblox
../tools/rojo.exe build -o PirateNation.rbxlx
# open PirateNation.rbxlx in Roblox Studio
```

Remote publish: [roblox/REMOTE-TEST.md](roblox/REMOTE-TEST.md).

## Google Play path

See [docs/PLAY-STORE.md](docs/PLAY-STORE.md) and the ready-to-paste submission
kit in [docs/PLAY-STORE-SUBMISSION.md](docs/PLAY-STORE-SUBMISSION.md)
(icon, feature graphic, real screenshots, privacy policy URL, listing copy).
Capacitor shell: `com.fullvaluedan.piration` (see android package config).

## Repo layout

```
piration/
  android/     # Capacitor + offline HTML5 game (primary)
  roblox/      # Rojo Luau place
  docs/        # store + design notes
  NOTICE.md    # upstream attribution
```

## License

MIT for original Piration code. Upstream art/code keep CC0/MIT as published by Proof of Play.
