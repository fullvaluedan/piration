// Max-gear Endless depth test — powers a state to level 30 / Dreadnought /
// full collection / crew, then runs Endless until death.
// Run: node scripts/test-endless-depth.mjs

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
      if (base.shield && c.playerHp < c.playerMaxHp * 0.65) s = base.shield * 4;
      if (base.heal && c.playerHp < c.playerMaxHp * 0.8) s = base.heal * 6;
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

function run(captainId) {
  const state = core.newGame(cards, game);
  state.character.level = 30;
  state.character.xp = 0;
  state.character.xpToNext = 0;
  state.shipId = "galleon";
  state.shipDura = core.shipById(game, "galleon").hull;
  state.crew = ["a", "b", "c", "d", "e", "f"];
  state.inventory.Marks = 1000000;
  state.collection = [];
  for (let copy = 0; copy < 3; copy++) {
    for (const c of cards.list) state.collection.push(c.id);
  }
  // enhance every card to +3
  for (const c of cards.list) {
    state.enhancements[c.id] = 3;
  }
  if (captainId !== "morgaine") {
    const cap = core.captainById(game, captainId);
    state.unlockedCaptains.push(cap.id);
    state.captainId = captainId;
  }
  core.startEndless(state, cards, game);
  let guard = 0;
  let end = null;
  while (guard++ < 4000 && state.endless) {
    if (!state.combat) {
      if (state.endless.waveEnemiesLeft > 0) {
        core.endlessNextEnemy(state, cards, game);
      } else {
        core.endlessNextWave(state, cards, game);
        let g2 = 0;
        while (g2++ < 10 && state.endless?.hp < core.playerMaxHp(state, game) * 0.9) {
          const r = core.endlessRepair(state, game);
          if (!r.ok) break;
        }
      }
      continue;
    }
    botTurn(state);
    if (state.combat?.over) {
      const res = core.collectCombatResult(state, cards, game);
      if (res.kind === "endless_end") {
        end = res;
        break;
      }
    }
  }
  if (!end) end = core.retireEndless(state, cards, game, true);
  return end;
}

for (const cap of ["captainbanshee", "rustbeard", "captainhightide", "admiralironsides"]) {
  const r = run(cap);
  console.log(`${cap}: wave ${r.wave}, score ${r.score}, kills ${r.kills}, xp ${r.xp}, marks ${r.marks}`);
}
