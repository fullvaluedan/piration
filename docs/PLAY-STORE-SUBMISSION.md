# Piration — Play Store submission kit

Everything needed to create and fill the Google Play listing is in this repo.
The full click-path for Play Console is at the bottom.

## App identity

- **App name:** Piration
- **Default language:** English (United States)
- **Type:** Game · free
- **Category:** Games > Role Playing
- **Tags (up to 5):** offline, pirates, card, roguelike, rpg
- **Package (already configured):** `com.fullvaluedan.piration`

## Store listing copy

**Short description (≤80 chars):**
`Offline pirate RPG: random monster encounters, card battles, captains & endless high scores.`

**Full description:**

```
Sail offline in Piration, a complete single-player pirate RPG that never needs
a connection. No ads. No accounts. No energy timers.

EVERY VOYAGE IS A GAMBLE
Pick a zone and sail. Each voyage rolls random encounters - monsters, elites,
treasure caches, and a zone boss. Fight, bribe, or flee. Monsters drop
resources, Marks, Gold, and cards. Lose and your hull pays the price.

SIX CAPTAINS, SIX STYLES
Unlock captains through monster and resource missions. Each captain wields a
different card pool and a passive ability: glass-cannon Salty Bones, healing
Siren, burst-damage Ironbeard, draw-engine Mapmaker Oz, and the endgame Dread
Captain Cetus.

BUILD THE PERFECT SHIP
Craft five hulls from Skiff to Dreadnought, recruit crew, and enhance cards
with duplicates. Level up to reach new zones, rarities, and ships.

ENDLESS WAVES, ONE HIGH SCORE
Survive waves of scaling monsters, cash out before you sink, and chase your
best score on the captain's log.

~20 hours to max out a single character. Progress saves on your device.

Piration is an independent community archive port inspired by open-sourced
Pirate Nation materials (CC0/MIT). Not affiliated with Proof of Play.
```

**Privacy policy URL (working now):**
https://raw.githack.com/fullvaluedan/piration/master/docs/privacy.html

Preferred once the GitHub Actions queue clears:
https://fullvaluedan.github.io/piration/privacy.html
(Pages is configured via `.github/workflows/pages.yml`; a queued legacy build
delays the first `github.io` deployment. Both URLs serve the same
`docs/privacy.html`.)

## Assets (in `android/store-assets/`)

- **Icon:** `icon-512.png` (512x512)
- **Feature graphic:** `feature-graphic.png` (1024x500)
- **Screenshots** (1080x1920, real in-game captures, `screenshots/`):
  1. Voyage — zone select
  2. Encounter — monster intro
  3. Combat — card battle with enemy intent
  4. Victory — loot results
  5. Endless — wave combat with live score
  6. Shipyard — ships, repair, workshop
  7. Captains — unlock missions
  8. Collection — cards and enhancement

Upload 6 of the 8 (1, 3, 5, 6, 7, 8) in the listing for a full phone gallery.

## Data safety & rating (recommended answers)

- **Data collection:** No data is collected or shared. No ads, no analytics,
  no account, no crash reporting. All progress is local.
- **Content rating:** Games > Role Playing; fantasy/cartoon violence (cannon
  and sword combat, no blood/gore). Suggested target age: 12+.
- **Permissions:** no sensitive permissions. (Capacitor's webview includes
  INTERNET, which Play treats as non-sensitive.)

## Console click-path

1. Play Console → **Create app** (top-right).
2. App name: `Piration` · Default language: `English (United States)` ·
   App or game: `Game` · Free or paid: `Free` → **Create app**.
3. Left menu → **App content** → complete the declaration prompts:
   - Privacy policy: paste the URL above.
   - Ads: no. · Rating questionnaire: answers above. · Target audience: 12+.
   - Data safety: "No" on collection/sharing.
4. **Store listing** → fill short + full description, upload icon, feature
   graphic, and screenshots. Set category + tags. Save as draft.
5. **App access / monetization:** no login required; no products.
6. **Production** → create a release and upload the signed AAB (see below),
   or save the draft first — everything persists.

## Producing the signed AAB

On a machine with Android Studio + JDK 17:

```bash
cd android
npm install
npx cap sync android
npx cap open android
```

Android Studio → Build → Generate Signed Bundle/APK → create a keystore
(keep it safe; needed for every future update) → `bundleRelease`. Upload the
resulting AAB in Play Console → Production → Create new release, then complete
the rollout checklist.

## Checklist status

- [x] Game complete, offline, balance verified (~20h max-out)
- [x] Icon, feature graphic, screenshots generated
- [x] Privacy policy live (raw.githack CDN; GitHub Pages configured)
- [x] Listing copy drafted
- [ ] Create app in Play Console (2-minute flow above)
- [ ] Upload AAB (needs Android Studio + your keystore)
