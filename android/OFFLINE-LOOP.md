# Offline loop — Piration v3

All progress is **local** (browser `localStorage` / app storage). No server, no
login, works airplane mode after first load (PWA cache).

## Core loop

```
Voyage (pick a zone)
   -> 3 random encounters (monster / elite / cache) + optional boss
        |
Card combat -> XP + Marks/Gold + resources + card drops
        |
Port: craft ships, craft parts, repair hull, recruit crew, enhance cards
        |
Level up -> new zones, rarities, ships -> captain unlock missions
        |
Endless mode -> waves + high score -> deeper unlocks
```

### 1. Energy
- Config flag `energy.unlimited` (true in test builds, UI shows `∞`).
- The real economy ships dormant behind the flag: cap 100, regen 1 per
  5 minutes, gathering costs 3, open-sea ambushes cost 8. Flipping the flag
  produces the full drain-and-regen economy.

### 2. Voyages -> encounters -> loot
- 8 zones (plus the Parrot's Perch home island), level-gated. Each voyage =
  3 random encounters; four of the zones hold a world boss.
- The game opens on a live 16:9 3D world: a turquoise sea, voxel islands,
  and a ship you sail with the left joystick. Walk ashore, swim, gather, and
  get ambushed in open water — combat drops into the same world.
- Encounters: **monster** (fight), **elite** (tough, big loot), **cache** (free
  resources), **boss** (guaranteed epic/legendary card).
- Per encounter: Fight, Bribe (skip for Marks), or Flee (hull damage).
- Rewards: XP, Marks, Gold, resources (Wood / Cotton / Iron / GoldNugget /
  CannonPart / MapFragment / Rum), and card drops. Rarity gates: Rare Lv6+,
  Epic Lv12+, Legendary Lv18+.
- Art: real voxel-style renders for cards, ships, monsters, captains, and
  islands (CC0 from the Pirate Nation art archive). Music and SFX from the
  MIT-licensed game archive play behind menus, battles, and actions.

### 3. Port
- **Shipwright:** Skiff -> Sloop -> Frigate -> Galleon (level + materials).
- **Repair:** defeats and flees damage hull durability; repair costs resources.
- **Workshop:** Cannon Part, Map Kit, Rum.
- **Recruit:** crewmates (+2% damage, +4 HP each, cap +10%).
- **Enhance:** spend Marks + a duplicate to +1 damage/shield (+2 heal), max +3.

### 4. Captains
- 8 lore captains, each with an elemental affinity (rock-paper-scissors
  combat modifiers), a unique card pool, and a passive ability.
- Unlock missions start after level 10 and get progressively harder:
  Captain Banshee (Lv10 + 20 Endless kills), The Resource Trader
  (Lv12 + 200 resources), Commodore Chompington (Lv13 + 6 elite kills +
  4 Map Fragments), Rustbeard (Lv15 + 10 elite kills + 5 Cannon Parts),
  Captain Hightide (Lv16 + Endless wave 25 + 10 Map Fragments),
  Admiral Ironsides (Lv18 + Endless wave 35 + 12 elite kills), Royal Navy
  Admiral (Lv20 + wave 40 + 500 total kills).

### 5. Endless mode
- Waves of 1-3 monsters, scaling forever. Free 25% heal between waves, paid
  repairs. Score = 100/wave + 10/kill + 25/elite -> local top-10 leaderboard.
- Run end pays XP + Gold + Iron + Marks based on depth. Deep runs are also the
  path to the final captain unlocks.

### 6. Maxing out (~20 hours)
- Level cap 20 (total ~33,300 XP), Galleon, all eight captains, and a fully
  enhanced deck. Verified in the 18-22h band by `scripts/sim-progression.mjs`.
- Decks: 8 cards, no duplicates, >=2 captain signature cards, 5 presets
  (deck builder in the Collection panel).
- Home island builder: grid-snapped decorations with rotation and undo.

## Where to play
```
cd android && npm run serve   ->   http://localhost:5173
```
Or open `android/www/index.html` in a browser. Hard refresh if an old service
worker sticks (`sw.js` is v7).
