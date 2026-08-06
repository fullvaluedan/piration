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

### 1. No energy
- There is no energy system. The cost of sailing is **risk**: monsters damage
  your hull, defeats cost repair resources, and tougher zones require better
  ships and decks. Play as much as you want.

### 2. Voyages -> encounters -> loot
- 6 zones, level-gated. Each voyage = 3 random encounters plus an optional boss.
- The Voyage tab is a roamable world map: animated sea, voxel-art islands,
  and a ship that sails to the island you chart.
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
- **Shipwright:** Skiff -> Sloop -> Brig -> Galleon -> Dreadnought
  (level + materials).
- **Repair:** defeats and flees damage hull durability; repair costs resources.
- **Workshop:** Cannon Part, Map Kit, Rum.
- **Recruit:** crewmates (+2% damage, +4 HP each, cap +10%).
- **Enhance:** spend Marks + a duplicate to +1 damage/shield (+2 heal), max +3.

### 4. Captains
- 6 captains, each with a unique card pool and a passive ability.
- Unlock missions start after level 10 and get progressively harder:
  Salty Bones (Lv10 + 20 Endless kills), Siren (Lv12 + 200 resources),
  Ironbeard (Lv15 + 10 elite kills + 5 Cannon Parts), Mapmaker Oz
  (Lv16 + Endless wave 25 + 10 Map Fragments), Cetus (Lv20 + wave 40 +
  500 total kills).

### 5. Endless mode
- Waves of 1-3 monsters, scaling forever. Free 25% heal between waves, paid
  repairs. Score = 100/wave + 10/kill + 25/elite -> local top-10 leaderboard.
- Run end pays XP + Gold + Iron + Marks based on depth. Deep runs are also the
  path to the final captain unlocks.

### 6. Maxing out (~20 hours)
- Level cap 30 (total ~49,300 XP), Dreadnought, all six captains, and a fully
  enhanced deck. Verified by `scripts/sim-progression.mjs`.

## Where to play
```
cd android && npm run serve   ->   http://localhost:5173
```
Or open `android/www/index.html` in a browser. Hard refresh if an old service
worker sticks (`sw.js` is v4).
