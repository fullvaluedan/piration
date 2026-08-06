# Offline loop (Pirate Nation archive port)

All progress is **local** (browser `localStorage` / app storage). No server, no login, works airplane mode after first load (PWA cache).

## Core loop

```
Quest (fast timer)
   → XP + Marks/Gold + mats + chance of cards
        ↓
Craft (ships / rum / cannon parts)
        ↓
Gauntlet (card combat)
   → big XP + mats + guaranteed card drop(s)
        ↓
Stronger crew / bigger ship / fatter deck
        ↓
repeat
```

### 1. Energy (test mode = unlimited)
- Production design: actions cost energy; regen over time.
- **Testing now:** `CONFIG.dev.unlimitedEnergy = true` → energy shows **∞**, costs are 0.
- Flip to `false` before Play Store.

### 2. Quests → XP + resources + cards
| Quest | Focus | Card chance |
|-------|--------|-------------|
| Skullduggery | XP + combat loot | ~45% Attack/Skill |
| Exploration | most mats | ~35% Defend/Skill/Resource |
| Privateering | Marks/Gold | ~55% mixed |

On **Collect loot** you get:
- **XP** on lead pirate (levels up → better gauntlet HP scaling)
- **Marks / Gold**
- **Resources:** Wood, Cotton, Iron, GoldNugget, CannonPart, MapFragment, Rum
- **Card** roll (added to collection + deck)

### 3. Gauntlet → XP + cards
- Spend energy (0 in test), play cards for AP each turn.
- **Win:** XP + Marks/Gold/Iron + **1 card** (Hard = 2).
- **Lose:** +5 XP, 20% salvage Defend/Resource card.

### 4. Craft / crew
- Ship line: Skiff → Sloop → Brig → Galleon (costs mats).
- Workshop: Cannon Part, Map Kit, Rum.
- Recruit: 75 Marks + 1 Rum (needs berths = ship slots).

### 5. Cards
- Start with 12-card starter deck (CC0 Pirate Nation card names).
- Drops append copies → larger deck in gauntlet.
- **Crew** tab lists collection counts.

## Where to play
```
C:\Users\danre\scripts\piratenation-roblox\android-game\www\index.html
```
Or: `cd android-game && npm run serve` → open the URL.

Hard refresh if an old service worker sticks (`sw.js` is v2).
