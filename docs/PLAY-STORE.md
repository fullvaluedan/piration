# Google Play checklist — Piration

Package id target: `com.fullvaluedan.piration`

## Done in repo
- [x] Offline playable web game (no network required after assets cached)
- [x] PWA manifest + service worker
- [x] App icons 192 / 512
- [x] Capacitor config + npm deps listed
- [x] Privacy policy draft (docs/privacy.html) — host before listing
- [x] No energy system (encounters + hull repair replace timers)
- [x] Captains, unlock missions, Endless high-score mode
- [x] Balance simulated to ~20h max-out (scripts/sim-progression.mjs)

## Needs your Google account (one-time)
1. [Google Play Console](https://play.google.com/console) developer signup ($25 one-time)
2. Create app **Piration**
3. Install Android Studio + JDK 17 on build machine
4. From `android/`:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android
   ```
5. In Android Studio: generate upload keystore, build **signed AAB** (`bundleRelease`)
6. Play Console → Production/Internal testing → upload AAB
7. Store listing: title, short/full description, screenshots (phone), feature graphic 1024x500, icon 512
8. Content rating questionnaire, target audience, data safety (we store only on-device — no account)

## Data safety answers (draft)
- Data collected: **none** off device
- Progress: local only
- No ads / no IAP in current build (add later if needed)
- Privacy policy URL: host `docs/privacy.html`

## Blockers on Hermes PC (as of last build)
- JDK / Android SDK not installed → cannot produce AAB here until toolchain is installed
- Play Console account must be yours
