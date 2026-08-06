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

**Test mode:** unlimited energy (`android/www/js/app.js` → `CONFIG.dev.unlimitedEnergy = true`).

### Offline loop
Quests → XP + resources + card chance → craft ships → gauntlet (XP + card drops) → crew/deck grow. Full write-up: [android/OFFLINE-LOOP.md](android/OFFLINE-LOOP.md).

## Roblox

```bash
cd roblox
../tools/rojo.exe build -o PirateNation.rbxlx
# open PirateNation.rbxlx in Roblox Studio
```

Remote publish: [roblox/REMOTE-TEST.md](roblox/REMOTE-TEST.md).

## Google Play path

See [docs/PLAY-STORE.md](docs/PLAY-STORE.md). Capacitor shell: `com.fullvaluedan.piration` (see android package config).

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
