# Piration — Game Design (Offline Android)

Version 3 design. Everything runs on-device. No server, no energy, no timers.

## Pillars

1. **Encounters, not energy.** Sailing is the cost. Every voyage rolls random
   encounters — monsters, elites, treasure caches, zone bosses. You can play as
   much as you want, but risk and repair keep progression meaningful.
2. **Monsters pay the bills.** Every kill drops loot: resources (Wood, Cotton,
   Iron, Gold Nugget, Cannon Part, Map Fragment, Rum), Marks, Gold, and cards.
3. **Upgrading opens content.** Level gates unlock zones, ship tiers, card
   rarities, and captain unlocks. Ship upgrades give more hull, cannons
   (AP), and berths.
4. **Captains are identity.** Each captain has a different card pool and a
   passive ability. Unlocking them is a core progression goal, driven by
   monster missions and resource missions after the player hits level 10.
5. **Offline forever.** Single-file save in local storage, PWA + Capacitor
   shell, zero network. One character can be fully maxed in ~20 hours of play.

## Core loop

```
Pick a zone ──► Sail (random encounters) ──► Card combat ──► Loot + XP
                                                              │
   ▲                                                          ▼
Stronger captain/ship/deck ◄── Unlock missions ◄── Port (shipyard, tavern, workshop)
```

### Zones (difficulty tiers)

| Zone | Min level | Enemy HP | Enemy DMG | Boss |
|------|-----------|----------|-----------|------|
| Sunny Shallows | 1 | 26 | 5 | King of the Shallows |
| Trade Routes | 3 | 42 | 7 | Armada Captain |
| Open Sea | 6 | 60 | 10 | Leviathan Matron |
| Sunken Reefs | 10 | 80 | 13 | Reef Horror |
| Devil's Triangle | 14 | 105 | 16 | Triangle Sphinx |
| The Abyss | 18 | 135 | 20 | Abyssal Tyrant |

A voyage is 3 random encounters. Options per encounter: **Fight**, **Bribe**
 (skip for Marks), or **Flee** (small hull damage, no reward). Between
encounters you may continue (10% free heal) or return to port.

## Combat (card battle)

- Player HP = 30 + 60% of ship hull (+4 per crewmate).
- Max AP = 3 + cannons (ship bonus). Draw 5 cards per turn.
- Cards: Attack (damage), Defend (shield), Skill (shield + draw),
  Resource (+1 AP, 0 cost).
- Enemy shows its **intent** (Attack / Brace / Charge) each turn.
- Win: XP + loot + card drop. Lose: small XP, hull durability damage
  (repair costs resources — the main sink), voyage ends.

## Captains (8 lore captains, unlock after level 10, progressively harder)

| Captain | Element | Unlock mission |
|---------|---------|----------------|
| Lady Lara (starter) | Light | — |
| Captain Banshee | Dark | Lv 10 + kill 20 in Endless |
| The Resource Trader | Earth | Lv 12 + collect 200 resources |
| Commodore Chompington | Water | Lv 13 + 6 elite kills + 4 Map Fragments |
| Rustbeard | Fire | Lv 15 + 10 elite kills + 5 Cannon Parts |
| Captain Hightide | Air | Lv 16 + Endless wave 25 + 10 Map Fragments |
| Admiral Ironsides | Ice | Lv 18 + Endless wave 35 + 12 elite kills |
| Royal Navy Admiral | Lightning | Lv 20 + Endless wave 40 + 500 kills |

Combat uses elemental rock-paper-scissors modifiers (1.5x strong, 0.75x weak)
defined in the `elements` table in `www/data/game.json`. Each captain's card
pool is a different mix of the 151-card archive pool
(Attack / Defend / Skill / Resource), generated deterministically in
`android/scripts/build-game-data.mjs` and written into `www/data/game.json`.

## Card rarity & upgrading

- **Common** — available from level 1.
- **Rare** — drops from level 6+ (higher chance in mid zones).
- **Epic** — drops from level 12+ (elites and bosses).
- **Legendary** — drops from level 18+ (bosses and deep Endless runs).

At the tavern, cards can be **enhanced** (+1 damage or shield/heal, max +3)
by spending Marks plus duplicate copies. This is the endgame resource sink.

## Ships

| Ship | Level | Hull | Cannons | Berths |
|------|-------|------|---------|--------|
| Skiff | 1 | 30 | 1 | 2 |
| Sloop | 4 | 50 | 2 | 3 |
| Frigate | 10 | 78 | 3 | 4 |
| Galleon | 16 | 110 | 4 | 5 |

Costs mix resources + Marks. Crewmates (recruited with Marks + Rum) each give
+2% card damage and +4 max HP (cap +10%).

## Endless mode (high score)

- Waves of 1→3 monsters, scaling HP/damage. Elites appear from wave 6.
- Free 15% heal between waves; optional paid repair.
- Score = 100/wave + 10/kill + 25/elite, best score saved to a local top-10
  leaderboard (shareable as text).
- Run end grants XP and loot scaled by wave — Endless is a real progression
  path, not just a scoreboard.

## 20-hour max curve

- Character level cap: **20** (spec: 18-22h to max).
- XP per level: `floor(130 × level^1.12)`; total to max ≈ **33,300 XP**.
- The progression simulator (real game logic + scripted bot) reaches Lv20 in
  ~19.6h of voyage time — inside the required 18-22h band, enforced by
  `android/scripts/sim-progression.mjs`.
- Resource and card sinks are tuned so the last ship, last captain, and full
  enhancement track finish inside the same window.

## Files

- `www/data/cards.json` — 151-card archive pool (existing, unchanged).
- `www/data/game.json` — generated + authored balance data.
- `www/assets/` — curated CC0 voxel art (cards, ships, mobs, captains, world
  props) and MIT music/SFX, mapped by `assets/manifest.json`.
- `www/js/core.js` — pure game logic (no DOM; reused by the simulator).
- `www/js/ui.js` — rendering and input.
- `docs/PLAY-STORE.md` — Android build + store checklist.

## The world

The Voyage tab is a roamable world map: an animated sea with six voxel-art
islands, a ship marker that sails to the island you chart, and per-island zone
info. Combats render enemy and ship voxel sprites in a battle scene; cards,
captain portraits, and shipyard hulls use the same CC0 voxel art style.

## Decks

- 60 curated cards from the archive art: 8 captains x 5 signature cards plus a
  20-card neutral pool (assigned deterministically in game.json `cards`).
- Combat decks are exactly **8 cards, no duplicates, at least 2 signature
  cards** of the active captain. 5 named presets; the deck builder lives in
  the Collection panel.

## Island builder

- The home island (Parrot's Perch) supports grid-snapped placement of
  decorations and resources (trees, chests, cotton, iron, gold, crates) with
  90-degree rotation, a live green/red ghost preview, and undo. Placements
  persist in the save and rebuild in the 3D world.
