// Piration balance simulator.
// Plays the REAL game logic (www/js/core.js) with a scripted "average player"
// bot and reports time-to-max, win rates, income vs sinks, and Endless depth.
//
// Run: node scripts/sim-progression.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "../www/js/core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsData = JSON.parse(readFileSync(join(root, "www/data/cards.json"), "utf8"));
const game = JSON.parse(readFileSync(join(root, "www/data/game.json"), "utf8"));
const cards = {
  list: cardsData.cards,
  byId: Object.fromEntries(cardsData.cards.map((c) => [c.id, c])),
  game,
};

let fights = 0;
let wins = 0;
let losses = 0;
let voyageFights = 0;
let voyageWins = 0;
let voyageLosses = 0;
let endlessFights = 0;
let endlessWins = 0;
let endlessLosses = 0;
let cacheCount = 0;
let bribeCount = 0;
let fleeCount = 0;
let totalTurns = 0;
let totalSeconds = 0;
let voyageSeconds = 0;
let endlessSeconds = 0;
let resourcesEarned = 0;
let marksEarned = 0;
let cardsFound = 0;
let eliteKills = 0;
let bossKills = 0;
const loggedCraftFails = new Set();
let lastVoyageLost = false;

function log(msg) {
  console.log(msg);
}

function botTurn(state) {
  const c = state.combat;
  if (!c || c.over) return;
  let guard = 0;
  while (!c.over && guard++ < 24) {
    let idx = -1;
    let best = -Infinity;
    c.hand.forEach((id, i) => {
      const base = cards.byId[id];
      if (!base || c.ap < base.ap) return;
      let s = 0;
      if (base.damage) s = base.damage * 10;
      if (base.kind === "Resource") s = 9;
      if (base.draw) s += 5;
      if (base.shield && c.playerHp < c.playerMaxHp * 0.7) s = base.shield * 4;
      if (base.heal && c.playerHp < c.playerMaxHp * 0.85) s = base.heal * 6;
      if (s > best) {
        best = s;
        idx = i;
      }
    });
    if (idx < 0) break;
    core.playCard(state, cards, game, idx);
  }
  if (!state.combat?.over) core.endTurn(state, cards, game);
}

function fightToEnd(state) {
  let guard = 0;
  while (!state.combat?.over && guard++ < 200) botTurn(state);
  const won = state.combat?.over && state.combat.won;
  totalTurns += state.combat?.turn || 1;
  return won;
}

function timeForCombat(state) {
  // mobile pacing: taps, animations, reading cards
  return (16 + (state.combat?.turn || 4) * 7) * 1.45;
}

function voyage(state, doBoss) {
  const level = core.charLevel(state);
  const zone = pickZone(state);
  core.startVoyage(state, game, zone.id);
  totalSeconds += 12;
  voyageSeconds += 12;
  let guard = 0;
  while (core.currentEncounter(state, game) && guard++ < 6) {
    const e = core.currentEncounter(state, game);
    if (e.type === "cache") {
      const r = core.collectCache(state, game);
      totalSeconds += 10;
      voyageSeconds += 10;
      cacheCount += 1;
      resourcesEarned += Object.values(r.loot || {}).reduce((a, b) => a + b, 0);
      marksEarned += r.marks || 0;
      continue;
    }
    // flee elites when battered
    const hpPct = state.voyage?.playerHp / core.playerMaxHp(state, game);
    if (e.isElite && hpPct < 0.6) {
      core.fleeEncounter(state, game);
      fleeCount += 1;
      totalSeconds += 10;
      voyageSeconds += 10;
      continue;
    }
    // fight or bribe: 9 in 10 fights, occasionally bribe to simulate players
    if (Math.random() < 0.9) {
      const started = core.startFight(state, cards, game);
      if (!started.ok) {
        core.fleeEncounter(state, game);
        fleeCount += 1;
        continue;
      }
      const won = fightToEnd(state);
      totalSeconds += timeForCombat(state);
      voyageSeconds += timeForCombat(state);
      fights += 1;
      voyageFights += 1;
      if (won) {
        wins += 1;
        voyageWins += 1;
        eliteKills += e.isElite ? 1 : 0;
      } else {
        losses += 1;
        voyageLosses += 1;
      }
      const res = core.collectCombatResult(state, cards, game);
      if (res.kind === "voyage_defeat") {
        lastVoyageLost = true;
        return false;
      }
      lastVoyageLost = false;
      if (res.card) cardsFound += 1;
      marksEarned += res.marks || 0;
      resourcesEarned += Object.values(res.loot || {}).reduce((a, b) => a + b, 0);
    } else {
      const r = core.bribeEncounter(state, game);
      if (r.ok) {
        bribeCount += 1;
        totalSeconds += 12;
        voyageSeconds += 12;
      }
    }
  }
  // optional boss
  const boss = core.currentEncounter(state, game);
  const bossHpPct = state.voyage?.playerHp / core.playerMaxHp(state, game);
  const shipOk = state.shipId === "galleon";
  if (doBoss && boss?.type === "boss" && bossHpPct >= 0.8 && shipOk) {
    if (core.startFight(state, cards, game).ok) {
      const won = fightToEnd(state);
      totalSeconds += timeForCombat(state);
      voyageSeconds += timeForCombat(state);
      fights += 1;
      voyageFights += 1;
      if (won) {
        wins += 1;
        voyageWins += 1;
        bossKills += 1;
      } else {
        losses += 1;
        voyageLosses += 1;
      }
      const res = core.collectCombatResult(state, cards, game);
      if (res.card) cardsFound += 1;
      marksEarned += res.marks || 0;
      resourcesEarned += Object.values(res.loot || {}).reduce((a, b) => a + b, 0);
    }
  }
  core.returnToPort(state);
  totalSeconds += 20;
  voyageSeconds += 20;
  return true;
}

function endlessBurst(state, maxFights) {
  core.startEndless(state, cards, game);
  let n = 0;
  let guard = 0;
  while (guard++ < 1000 && n < maxFights) {
    if (!state.combat) {
      if (state.endless?.waveEnemiesLeft > 0) {
        core.endlessNextEnemy(state, cards, game);
      } else {
        core.endlessNextWave(state, cards, game);
      }
      continue;
    }
    const won = fightToEnd(state);
    totalSeconds += timeForCombat(state);
    endlessSeconds += timeForCombat(state);
    fights += 1;
    endlessFights += 1;
    n += 1;
    if (won) {
      wins += 1;
      endlessWins += 1;
    } else {
      losses += 1;
      endlessLosses += 1;
    }
    const res = core.collectCombatResult(state, cards, game);
    if (res.card) cardsFound += 1;
    marksEarned += res.marks || 0;
    resourcesEarned += Object.values(res.loot || {}).reduce((a, b) => a + b, 0);
    if (res.kind === "endless_end") break;
    if (res.kind === "endless_wave_cleared") {
      let guard2 = 0;
      while (guard2++ < 5 && state.endless?.hp < core.playerMaxHp(state, game) * 0.8) {
        const r = core.endlessRepair(state, game);
        if (!r.ok) break;
      }
    }
  }
  const wave = state.stats.endlessBestWave;
  core.retireEndless(state, cards, game, true);
  return wave;
}

function deepEndless(state) {
  core.startEndless(state, cards, game);
  let guard = 0;
  while (guard++ < 1500 && state.endless) {
    if (!state.combat) {
      if (state.endless.waveEnemiesLeft > 0) {
        core.endlessNextEnemy(state, cards, game);
      } else {
        core.endlessNextWave(state, cards, game);
        let guard2 = 0;
        while (guard2++ < 6 && state.endless?.hp < core.playerMaxHp(state, game) * 0.85) {
          const r = core.endlessRepair(state, game);
          if (!r.ok) break;
        }
      }
      continue;
    }
    const won = fightToEnd(state);
    totalSeconds += timeForCombat(state);
    endlessSeconds += timeForCombat(state);
    fights += 1;
    endlessFights += 1;
    if (won) {
      wins += 1;
      endlessWins += 1;
    } else {
      losses += 1;
      endlessLosses += 1;
    }
    const res = core.collectCombatResult(state, cards, game);
    if (res.card) cardsFound += 1;
    marksEarned += res.marks || 0;
    resourcesEarned += Object.values(res.loot || {}).reduce((a, b) => a + b, 0);
    if (res.kind === "endless_end") return res;
  }
  const r = core.retireEndless(state, cards, game, true);
  if (r.ok) return r;
  return {
    wave: state.stats.endlessBestWave,
    score: state.stats.endlessBestScore,
    kills: state.stats.endlessKills,
  };
}

function doPortChores(state) {
  // equip the strongest unlocked captain
  let best = null;
  let bestN = -1;
  for (const cap of game.captains) {
    if (!state.unlockedCaptains.includes(cap.id)) continue;
    const power = state.collection
      .filter((id) => cap.pool.includes(id))
      .reduce((s, id) => s + core.cardPower(cards, state, id), 0);
    if (power > bestN) {
      bestN = power;
      best = cap;
    }
  }
  if (best && best.id !== state.captainId) {
    core.switchCaptain(state, game, best.id);
    log(`  captain switch → ${best.name}`);
  }
  // repair when needed
  if (core.repairCost(state, game)) core.repairShip(state, game);
  // craft next affordable ship
  const order = game.ships.map((s) => s.id);
  const cur = order.indexOf(state.shipId);
  const next = game.ships[cur + 1];
  if (next && core.charLevel(state) >= next.level) {
    const r = core.craftShip(state, game, next.id);
    if (r.ok) log(`  craft: ${next.name} @ Lv${state.character.level}`);
    else if (!loggedCraftFails.has(next.id)) {
      loggedCraftFails.add(next.id);
      log(`  craft FAIL ${next.name} (${r.reason}): ${JSON.stringify(state.inventory)}`);
    }
  }
  // recruit if possible
  const ship = core.shipById(game, state.shipId);
  while (state.crew.length < ship.slots) {
    const r = core.recruitCrew(state, game);
    if (!r.ok) break;
  }
  // enhance strongest duplicate
  const counts = {};
  for (const id of state.collection) counts[id] = (counts[id] || 0) + 1;
  const cands = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([id]) => ({ id, p: core.cardPower(cards, state, id) }))
    .sort((a, b) => b.p - a.p);
  for (const c of cands) {
    const cur = state.enhancements?.[c.id] || 0;
    if (cur >= game.balance.enhanceMax) continue;
    const r = core.enhanceCard(state, cards, game, c.id);
    if (!r.ok && r.reason.includes("Marks")) break;
  }
  // unlock captains as missions complete
  for (const cap of game.captains) {
    if (state.unlockedCaptains.includes(cap.id)) continue;
    if (core.canUnlock(state, game, cap.id)) {
      const r = core.unlockCaptain(state, cards, game, cap.id);
      if (r.ok) log(`  unlocked: ${cap.name}`);
    }
  }
}

function pickZone(state) {
  const level = core.charLevel(state);
  const unlocked = game.zones.filter((z) => z.minLevel <= level);
  if (!unlocked.length) return game.zones[0];
  // if the next ship is missing a resource, farm the zone richest in it
  const order = game.ships.map((s) => s.id);
  const next = game.ships[order.indexOf(state.shipId) + 1];
  if (next && next.cost) {
    const missing = Object.entries(next.cost).find(
      ([k, v]) => (state.inventory[k] || 0) < v,
    );
    if (missing && missing[0] !== "Marks") {
      const res = missing[0];
      const best = [...unlocked].sort(
        (a, b) => (b.lootWeights[res] || 0) - (a.lootWeights[res] || 0),
      )[0];
      if ((best.lootWeights[res] || 0) >= 15) return best;
    }
  }
  // adapt: after a defeat, farm one tier down to recover
  const idx = lastVoyageLost ? unlocked.length - 2 : unlocked.length - 1;
  return unlocked[Math.max(0, idx)];
}

function reportProgress(state, label) {
  const hours = totalSeconds / 3600;
  log(
    `${label}: Lv${state.character.level} | fights ${fights} | ${hours.toFixed(1)}h | ship ${state.shipId} | crew ${state.crew.length} | cards ${state.collection.length} | endless wave ${state.stats.endlessBestWave} | kills ${state.stats.kills} | resources ${resourcesEarned} | marks ${marksEarned}`,
  );
}

// ---------- smoke tests ----------
function smokeTests() {
  log("--- smoke tests ---");
  let s = core.newGame(cards, game);
  if (s.collection.length < 12) throw new Error("starter deck too small");
  if (core.combatDeck(s, cards, game).length > 30) throw new Error("deck cap broken");
  const voy = core.startVoyage(s, game, "shallows");
  if (!voy.ok) throw new Error("voyage start failed");
  if (s.voyage.encounters.length !== 3) throw new Error("voyage length wrong");
  const e = core.currentEncounter(s, game);
  if (e.type === "cache") core.collectCache(s, game);
  else {
    const started = core.startFight(s, cards, game);
    if (!started.ok) throw new Error("fight start failed");
    fightToEnd(s);
    if (!s.combat.over) throw new Error("fight never ended");
    const res = core.collectCombatResult(s, cards, game);
    if (!["voyage_continue", "voyage_end", "voyage_defeat"].includes(res.kind))
      throw new Error("bad result kind " + res.kind);
  }
  // captain unlock flow
  s.stats.endlessKills = 20;
  s.character.level = 10;
  if (!core.canUnlock(s, game, "captainbanshee")) throw new Error("banshee mission should be met");
  const u = core.unlockCaptain(s, cards, game, "captainbanshee");
  if (!u.ok) throw new Error("banshee unlock failed");
  if (u.cards.length !== 10) throw new Error("starter grant wrong size");
  // endless flow
  s = core.newGame(cards, game);
  core.startEndless(s, cards, game);
  let guard = 0;
  while (guard++ < 40 && s.endless) {
    if (!s.combat) {
      if (s.endless.waveEnemiesLeft > 0) core.endlessNextEnemy(s, cards, game);
      else core.endlessNextWave(s, cards, game);
      continue;
    }
    fightToEnd(s);
    if (!s.combat?.over) throw new Error("endless fight stuck");
    const res = core.collectCombatResult(s, cards, game);
    if (res.kind === "endless_end") break;
  }
  if (s.endless) core.retireEndless(s, cards, game, true);
  // serialize round trip
  const raw = core.serialize(s);
  const back = core.deserialize(raw, cards, game);
  if (back.character.level !== s.character.level) throw new Error("round trip failed");
  log("smoke tests OK");
  log(`total XP to max: ${core.totalXpToMax(game)}`);
}

// ---------- main sim ----------
smokeTests();

log("--- progression sim ---");
let state = core.newGame(cards, game);
let voyages = 0;
let endlessBursts = 0;
const cap = game.balance.maxLevel || core.MAX_LEVEL;
while (state.character.level < cap && voyages < 2000) {
  voyages += 1;
  const doBoss = voyages % 4 === 0;
  voyage(state, doBoss);
  doPortChores(state);
  if (voyages % 50 === 0) reportProgress(state, `  ${voyages} voyages`);
}
reportProgress(state, "MAX LEVEL reached");
const timeToMaxH = voyageSeconds / 3600;
log(`voyage-only time to reach Lv${cap}: ${timeToMaxH.toFixed(1)}h`);

// mission push: deep Endless runs until all captains unlock
log("--- deep endless mission runs at max gear ---");
log(
  `  state: captain ${state.captainId}, deck ${core.combatDeck(state, cards, game).length}, enh ${Object.keys(state.enhancements).length}, marks ${state.inventory.Marks}, crew ${state.crew.length}`,
);
let missionRuns = 0;
while (missionRuns < 4) {
  const locked = game.captains.filter((c) => !state.unlockedCaptains.includes(c.id));
  if (!locked.length) break;
  missionRuns += 1;
  const r = deepEndless(state);
  log(`  mission run ${missionRuns}: wave ${r.wave}, score ${r.score}, kills ${r.kills}${r.card ? " · card " + r.card : ""}`);
}

// finish chores to max: keep farming until all ships and captains
let extraVoyages = 0;
while (extraVoyages < 300) {
  const locked = game.captains.filter((c) => !state.unlockedCaptains.includes(c.id));
  const lastShip = game.ships[game.ships.length - 1];
  if (!locked.length && state.shipId === lastShip.id) break;
  extraVoyages += 1;
  voyage(state, true);
  doPortChores(state);
}

const hours = totalSeconds / 3600;
log("--- results ---");
log(`fights: ${fights} (wins ${wins}, losses ${losses})  win rate ${((wins / Math.max(1, fights)) * 100).toFixed(1)}%`);
log(`voyage: ${voyageFights} fights, ${voyageWins} wins, ${voyageLosses} losses (${((voyageWins / Math.max(1, voyageFights)) * 100).toFixed(1)}%)`);
log(`endless: ${endlessFights} fights, ${endlessWins} wins, ${endlessLosses} losses (${((endlessWins / Math.max(1, endlessFights)) * 100).toFixed(1)}%)`);
log(`avg turns/fight: ${(totalTurns / Math.max(1, fights)).toFixed(1)}`);
log(`caches ${cacheCount} · bribes ${bribeCount} · flees ${fleeCount}`);
log(`estimated play time: ${hours.toFixed(1)} hours (${(totalSeconds / 60).toFixed(0)} min)`);
log(`voyage-only time: ${(voyageSeconds / 3600).toFixed(1)}h · endless time: ${(endlessSeconds / 3600).toFixed(1)}h`);
log(`final: Lv${state.character.level} ship ${state.shipId} crew ${state.crew.length} cards ${state.collection.length}`);
log(`unlocked captains: ${state.unlockedCaptains.join(", ")}`);
log(`endless best wave ${state.stats.endlessBestWave} score ${state.stats.endlessBestScore} kills ${state.stats.kills}`);
log(`income: resources ${resourcesEarned} marks ${marksEarned} cards ${cardsFound}`);

// costs check
const totalShipCost = {};
for (const s of game.ships.slice(1)) {
  for (const [k, v] of Object.entries(s.cost)) totalShipCost[k] = (totalShipCost[k] || 0) + v;
}
const totalRecipe = {};
for (const r of game.recipes) {
  for (const [k, v] of Object.entries(r.cost)) totalRecipe[k] = (totalRecipe[k] || 0) + v;
}
log("total ship costs:", JSON.stringify(totalShipCost));
log("recipe costs (10x):", JSON.stringify(totalRecipe));
