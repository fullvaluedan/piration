// Piration v3 core — pure game logic, no DOM.
// Everything operates on a plain `state` object so the same code runs in the
// browser (ui.js) and in Node (scripts/sim-progression.mjs).

export const MAX_LEVEL = 30;
export const SAVE_VERSION = 3;

const RESOURCE_KEYS = [
  "Wood",
  "Cotton",
  "Iron",
  "GoldNugget",
  "CannonPart",
  "MapFragment",
  "Rum",
];

export function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

export function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function xpNeeded(game, level) {
  const b = game.balance;
  return Math.floor(b.xpCurveBase * Math.pow(level, b.xpCurvePower));
}

export function shipById(game, id) {
  return game.ships.find((s) => s.id === id);
}

export function captainById(game, id) {
  return game.captains.find((c) => c.id === id);
}

export function zoneById(game, id) {
  return game.zones.find((z) => z.id === id);
}

export function monsterById(game, id) {
  return game.monsters.find((m) => m.id === id);
}

export function recipeById(game, id) {
  return game.recipes.find((r) => r.id === id);
}

export function currentCaptain(state, game) {
  return captainById(game, state.captainId);
}

export function charLevel(state) {
  return state.character.level;
}

// ---------- inventory helpers ----------

export function canPay(inv, cost) {
  for (const [k, v] of Object.entries(cost || {})) {
    if ((inv[k] || 0) < v) return k;
  }
  return null;
}

export function pay(inv, cost) {
  for (const [k, v] of Object.entries(cost || {})) {
    inv[k] = (inv[k] || 0) - v;
  }
}

export function grant(inv, gain) {
  for (const [k, v] of Object.entries(gain || {})) {
    inv[k] = (inv[k] || 0) + v;
  }
}

export function resourceCount(inv) {
  return RESOURCE_KEYS.reduce((n, k) => n + (inv[k] || 0), 0);
}

// ---------- state ----------

export function defaultInventory(game) {
  const inv = { Marks: 100, Gold: 0 };
  for (const m of RESOURCE_KEYS) inv[m] = 0;
  inv.Wood = 8;
  inv.Cotton = 4;
  inv.Iron = 2;
  return inv;
}

export function newGame(cards, game) {
  const starterCaptain = game.captains.find((c) => c.starter);
  const starter = starterCaptain.pool
    .filter((id) => cards.byId[id]?.kind)
    .slice(0, 12);
  const state = {
    version: SAVE_VERSION,
    captainId: starterCaptain.id,
    unlockedCaptains: [starterCaptain.id],
    character: { level: 1, xp: 0, xpToNext: xpNeeded(game, 1) },
    inventory: defaultInventory(game),
    collection: starter.slice(),
    enhancements: {},
    shipId: "skiff",
    shipDura: shipById(game, "skiff").hull,
    crew: [],
    stats: {
      voyages: 0,
      fights: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      eliteKills: 0,
      bossKills: 0,
      endlessKills: 0,
      endlessBestWave: 0,
      endlessBestScore: 0,
      endlessRuns: 0,
      resourcesCollected: 0,
      cardsFound: 0,
      xpGained: 0,
      marksEarned: 0,
      bribeCount: 0,
      cacheCount: 0,
    },
    endlessBest: null,
    leaderboard: [],
    voyage: null,
    combat: null,
    endless: null,
    sawHelp: false,
    soundOn: true,
    hints: {},
  };
  return state;
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(json, cards, game) {
  try {
    const s = JSON.parse(json);
    if (!s || s.version !== SAVE_VERSION) return newGame(cards, game);
    if (!s.character?.level) s.character = { level: 1, xp: 0, xpToNext: xpNeeded(game, 1) };
    s.character.xpToNext = xpNeeded(game, s.character.level);
    s.inventory = { ...defaultInventory(game), ...(s.inventory || {}) };
    s.enhancements = s.enhancements || {};
    s.stats = {
      voyages: 0, fights: 0, wins: 0, losses: 0, kills: 0, eliteKills: 0,
      bossKills: 0, endlessKills: 0, endlessBestWave: 0, endlessBestScore: 0,
      endlessRuns: 0, resourcesCollected: 0, cardsFound: 0, xpGained: 0,
      marksEarned: 0, bribeCount: 0, cacheCount: 0,
      ...(s.stats || {}),
    };
    if (!Array.isArray(s.collection) || !s.collection.length) {
      const cap = captainById(game, s.captainId);
      s.collection = (cap?.pool || []).slice(0, 12);
    }
    if (!s.unlockedCaptains?.length) s.unlockedCaptains = ["morgaine"];
    if (!shipById(game, s.shipId)) s.shipId = "skiff";
    if (!s.shipDura) s.shipDura = shipById(game, s.shipId).hull;
    s.crew = Array.isArray(s.crew) ? s.crew : [];
    s.leaderboard = Array.isArray(s.leaderboard) ? s.leaderboard : [];
    if (typeof s.soundOn !== "boolean") s.soundOn = true;
    if (!s.hints) s.hints = {};
    return s;
  } catch {
    return newGame(cards, game);
  }
}

// ---------- character XP ----------

export function addXp(state, game, amount) {
  if (amount <= 0) return { levels: 0, xp: 0 };
  const c = state.character;
  c.xp += amount;
  state.stats.xpGained += amount;
  let levels = 0;
  while (c.level < MAX_LEVEL && c.xp >= c.xpToNext) {
    c.xp -= c.xpToNext;
    c.level += 1;
    levels += 1;
    c.xpToNext = xpNeeded(game, c.level);
  }
  if (c.level >= MAX_LEVEL) {
    c.xpToNext = 0;
    c.xp = 0;
  }
  return { levels, xp: amount };
}

// ---------- combat deck ----------

export function ownedPoolCards(state, cards, game) {
  const cap = currentCaptain(state, game);
  if (!cap) return [];
  const pool = new Set(cap.pool);
  return (state.collection || []).filter((id) => pool.has(id));
}

export function cardPower(cards, state, id) {
  const base = cards.byId[id];
  if (!base) return 0;
  const n = state.enhancements?.[id] || 0;
  let p = 0;
  if (base.damage > 0) p += (base.damage + n) * 1.2;
  if (base.shield > 0) p += base.shield + n;
  if (base.heal > 0) p += (base.heal + 2 * n) * 1.1;
  if (base.draw > 0) p += base.draw * 1.6;
  if (base.kind === "Resource") p += 3;
  if (base.ap === 0) p += 0.6;
  return p;
}

export function combatDeck(state, cards, game) {
  const ids = ownedPoolCards(state, cards, game);
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  const entries = Object.entries(counts).map(([id, n]) => ({
    id,
    n,
    power: cardPower(cards, state, id),
  }));
  entries.sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
  const deck = [];
  for (const e of entries) {
    const copies = Math.min(e.n, 3);
    for (let i = 0; i < copies; i++) deck.push(e.id);
  }
  return deck.slice(0, 30);
}

// ---------- ship / crew ----------

export function effectiveHull(state, game) {
  const ship = shipById(game, state.shipId);
  const pct = Math.max(0, Math.min(1, (state.shipDura || ship.hull) / ship.hull));
  return Math.round(ship.hull * (0.5 + 0.5 * pct));
}

export function playerMaxHp(state, game) {
  const b = game.balance;
  const crewBonus = (state.crew?.length || 0) * b.crewHpBonus;
  return Math.round(b.playerBaseHp + effectiveHull(state, game) * b.hpPerHull + crewBonus);
}

export function playerMaxAp(state, game) {
  const b = game.balance;
  const ship = shipById(game, state.shipId);
  const cap = currentCaptain(state, game);
  const extra = cap?.ability?.kind === "apBonus" ? cap.ability.value : 0;
  return b.maxApBase + (ship.cannons - 1) + extra;
}

export function crewDmgBonus(state, game) {
  const b = game.balance;
  const n = (state.crew?.length || 0) * b.crewDmgBonusPct;
  return Math.min(b.maxCrewDmgBonusPct, n) / 100;
}

export function handSize(state, game) {
  const b = game.balance;
  const cap = currentCaptain(state, game);
  const extra = cap?.ability?.kind === "draw" ? cap.ability.value : 0;
  return b.handSize + extra;
}

export function repairCost(state, game) {
  const ship = shipById(game, state.shipId);
  const missing = Math.max(0, ship.hull - (state.shipDura || ship.hull));
  if (!missing) return null;
  const c = game.balance.repairCost;
  return { Marks: Math.ceil(missing * c.Marks), Wood: Math.ceil(missing * c.Wood), missing };
}

export function repairShip(state, game) {
  const ship = shipById(game, state.shipId);
  const cost = repairCost(state, game);
  if (!cost) return { ok: false, reason: "Ship is already seaworthy." };
  const miss = canPay(state.inventory, { Marks: cost.Marks, Wood: cost.Wood });
  if (miss) return { ok: false, reason: "Need more " + miss };
  pay(state.inventory, { Marks: cost.Marks, Wood: cost.Wood });
  state.shipDura = ship.hull;
  return { ok: true, cost };
}

export function damageShip(state, game, pct) {
  const ship = shipById(game, state.shipId);
  const loss = Math.round(ship.hull * pct);
  state.shipDura = Math.max(0, (state.shipDura || ship.hull) - loss);
}

// ---------- captains / missions ----------

export function unlockProgress(state, game, captainId) {
  const cap = captainById(game, captainId);
  if (!cap?.unlock) return { met: true, parts: [] };
  const u = cap.unlock;
  const s = state.stats;
  const parts = [];
  if (u.level) parts.push({ label: `Reach level ${u.level}`, done: charLevel(state) >= u.level });
  if (u.endlessKills) parts.push({ label: `Kill ${u.endlessKills} enemies in Endless`, done: (s.endlessKills || 0) >= u.endlessKills });
  if (u.resourcesCollected) parts.push({ label: `Collect ${u.resourcesCollected} resources`, done: (s.resourcesCollected || 0) >= u.resourcesCollected });
  if (u.eliteKills) parts.push({ label: `Defeat ${u.eliteKills} elite monsters`, done: (s.eliteKills || 0) >= u.eliteKills });
  if (u.CannonPart) parts.push({ label: `Hold ${u.CannonPart} Cannon Parts`, done: (state.inventory.CannonPart || 0) >= u.CannonPart });
  if (u.endlessWave) parts.push({ label: `Reach wave ${u.endlessWave} in Endless`, done: (s.endlessBestWave || 0) >= u.endlessWave });
  if (u.MapFragment) parts.push({ label: `Hold ${u.MapFragment} Map Fragments`, done: (state.inventory.MapFragment || 0) >= u.MapFragment });
  if (u.totalKills) parts.push({ label: `Total kills: ${u.totalKills}`, done: (s.kills || 0) >= u.totalKills });
  return { met: parts.every((p) => p.done), parts };
}

export function canUnlock(state, game, captainId) {
  return unlockProgress(state, game, captainId).met;
}

export function unlockCaptain(state, cards, game, captainId) {
  const cap = captainById(game, captainId);
  if (!cap) return { ok: false, reason: "Unknown captain" };
  if (state.unlockedCaptains.includes(captainId)) return { ok: false, reason: "Already unlocked" };
  if (!canUnlock(state, game, captainId)) return { ok: false, reason: "Mission not complete" };
  state.unlockedCaptains.push(captainId);
  const granted = grantCaptainStarter(state, cards, cap);
  return { ok: true, cards: granted };
}

function grantCaptainStarter(state, cards, cap) {
  // starter hand: 10 commons first, then fill with anything else
  const rarityMap = cards.game?.cardRarity || {};
  const commons = cap.pool.filter((id) => rarityMap[id] === "common");
  const rest = cap.pool.filter((id) => rarityMap[id] !== "common");
  const picked = [...commons, ...rest].slice(0, 10);
  state.collection = state.collection.concat(picked);
  return picked;
}

export function switchCaptain(state, game, captainId) {
  const cap = captainById(game, captainId);
  if (!cap) return { ok: false, reason: "Unknown captain" };
  if (!state.unlockedCaptains.includes(captainId)) return { ok: false, reason: "Locked" };
  state.captainId = captainId;
  return { ok: true };
}

// ---------- loot ----------

export function rollCardRarity(state, game) {
  const b = game.balance;
  const lvl = charLevel(state);
  const r = Math.random();
  if (lvl >= b.rarityLevels.legendary && r < 0.015) return "legendary";
  if (lvl >= b.rarityLevels.epic && r < 0.08) return "epic";
  if (lvl >= b.rarityLevels.rare && r < 0.28) return "rare";
  return "common";
}

export function rollCardDrop(state, cards, game, encounter, forcedRarity) {
  const zone = zoneById(game, encounter.zoneId);
  if (!zone) return null;
  let chance = encounter.isBoss ? 1 : encounter.isElite ? zone.eliteCardChance : zone.cardChance;
  const cap = currentCaptain(state, game);
  if (cap?.ability?.kind === "drawAndLuck") chance *= 1.5;
  if (Math.random() > chance && !forcedRarity) return null;
  const rarity = forcedRarity || rollCardRarity(state, game);
  const capPool = new Set(currentCaptain(state, game)?.pool || []);
  const owned = new Set(state.collection || []);
  const pool = cards.list.filter(
    (c) =>
      capPool.has(c.id) &&
      !owned.has(c.id) &&
      (cards.game?.cardRarity?.[c.id] || "common") === rarity,
  );
  const fallback = pool.length
    ? null
    : cards.list.filter(
        (c) =>
          capPool.has(c.id) &&
          (cards.game?.cardRarity?.[c.id] || "common") === rarity,
      );
  const source = pool.length ? pool : fallback;
  if (!source.length) {
    // any owned card as a duplicate
    const any = cards.list.filter((c) => capPool.has(c.id));
    if (!any.length) return null;
    return any[randInt(0, any.length - 1)];
  }
  return source[randInt(0, source.length - 1)];
}

export function grantCard(state, cards, card) {
  if (!card) return null;
  state.collection.push(card.id);
  state.stats.cardsFound += 1;
  return card;
}

export function rollLoot(state, game, zone, isElite, isBoss) {
  const keys = Object.keys(zone.lootWeights).filter((k) => k !== "Marks" && k !== "Gold");
  const total = keys.reduce((n, k) => n + zone.lootWeights[k], 0);
  let n = randInt(zone.lootMin, zone.lootMax) + (isElite ? 1 : 0) + (isBoss ? 2 : 0);
  const out = {};
  while (n-- > 0) {
    let r = Math.random() * total;
    for (const k of keys) {
      r -= zone.lootWeights[k];
      if (r <= 0) {
        out[k] = (out[k] || 0) + 1;
        break;
      }
    }
  }
  state.stats.resourcesCollected += Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

// ---------- encounters / voyage ----------

export function rollEncounter(game, zone) {
  const r = Math.random();
  const w = zone.encounterWeights;
  if (r < w.monster) {
    const id = zone.monsterPool[randInt(0, zone.monsterPool.length - 1)];
    return { type: "monster", monsterId: id, zoneId: zone.id, isElite: false, isBoss: false };
  }
  if (r < w.monster + w.elite) {
    const id = zone.elitePool[randInt(0, zone.elitePool.length - 1)];
    return { type: "monster", monsterId: id, zoneId: zone.id, isElite: true, isBoss: false };
  }
  return { type: "cache", zoneId: zone.id };
}

export function startVoyage(state, game, zoneId) {
  const zone = zoneById(game, zoneId);
  if (!zone) return { ok: false, reason: "Unknown zone" };
  if (charLevel(state) < zone.minLevel) return { ok: false, reason: `Level ${zone.minLevel} required` };
  if (state.voyage || state.combat || state.endless) return { ok: false, reason: "Already at sea" };
  const encounters = [];
  for (let i = 0; i < zone.voyageLength; i++) encounters.push(rollEncounter(game, zone));
  state.voyage = {
    zoneId,
    encounters,
    index: 0,
    bossRemaining: true,
    playerHp: playerMaxHp(state, game),
    results: [],
    startedAt: Date.now(),
  };
  state.stats.voyages += 1;
  return { ok: true };
}

export function currentEncounter(state, game) {
  if (!state.voyage) return null;
  const v = state.voyage;
  if (v.index < v.encounters.length) return v.encounters[v.index];
  if (v.bossRemaining) {
    const zone = zoneById(game, v.zoneId);
    return { type: "boss", monsterId: zone.boss.id, zoneId: zone.id, isElite: false, isBoss: true };
  }
  return null;
}

export function encounterDisplay(state, cards, game) {
  const e = currentEncounter(state, game);
  if (!e) return null;
  if (e.type === "cache") return { type: "cache", name: "Floating Cache", desc: "A drifting wreck, unguarded. Claim it." };
  const mon = monsterById(game, e.monsterId);
  const zone = zoneById(game, e.zoneId);
  const tag = e.isBoss ? "BOSS" : e.isElite ? "ELITE" : "MONSTER";
  return {
    type: e.type,
    name: mon?.name || e.monsterId,
    tag,
    desc: mon?.desc || "",
    zone: zone?.name,
    monsterId: e.monsterId,
  };
}

function cacheLoot(state, game, zone) {
  const loot = rollLoot(state, game, zone, false, false);
  const marks = randInt(8, 18);
  state.inventory.Marks += marks;
  state.stats.marksEarned += marks;
  addXp(state, game, 8);
  state.stats.cacheCount += 1;
  return { loot, marks, xp: 8 };
}

export function collectCache(state, game) {
  const v = state.voyage;
  const e = currentEncounter(state, game);
  if (!v || !e || e.type !== "cache") return { ok: false, reason: "Nothing to claim" };
  const zone = zoneById(game, v.zoneId);
  const r = cacheLoot(state, game, zone);
  v.results.push({ type: "cache", ...r });
  v.index += 1;
  return { ok: true, ...r };
}

export function bribeEncounter(state, game) {
  const v = state.voyage;
  const e = currentEncounter(state, game);
  if (!v || !e) return { ok: false, reason: "Nothing here" };
  if (e.type === "boss") {
    v.bossRemaining = false;
    v.finished = true;
    return { ok: true, cost: 0, boss: true };
  }
  const zone = zoneById(game, v.zoneId);
  const cost = Math.round((30 + zone.minLevel * 12) * game.balance.bribeCostMult);
  if ((state.inventory.Marks || 0) < cost) return { ok: false, reason: `Need ${cost} Marks` };
  state.inventory.Marks -= cost;
  state.stats.bribeCount += 1;
  v.results.push({ type: "bribe", marksSpent: cost, name: e.type === "boss" ? "boss" : "monster" });
  v.index += 1;
  addXp(state, game, 6);
  return { ok: true, cost };
}

export function fleeEncounter(state, game) {
  const v = state.voyage;
  if (!v) return { ok: false };
  const e = currentEncounter(state, game);
  damageShip(state, game, game.balance.fleeDurabilityLoss);
  v.results.push({ type: "flee" });
  if (e?.type === "boss") {
    v.bossRemaining = false;
    v.finished = true;
  } else {
    v.index += 1;
  }
  return { ok: true };
}

export function retreatFromCombat(state, cards, game) {
  const c = state.combat;
  if (!c) return { ok: false, reason: "Not in combat" };
  damageShip(state, game, game.balance.fleeDurabilityLoss);
  if (c.mode === "voyage" && state.voyage) {
    state.voyage.results.push({ type: "flee", name: c.enemy.name });
    state.voyage.finished = true;
  }
  const wasEndless = c.mode === "endless";
  state.combat = null;
  if (wasEndless && state.endless) {
    const end = retireEndless(state, cards, game, true);
    return { ok: true, retired: true, ...end };
  }
  return { ok: true };
}

export function startFight(state, cards, game) {
  const e = currentEncounter(state, game);
  if (!e || e.type !== "monster" && e.type !== "boss") return { ok: false, reason: "Nothing to fight" };
  if (state.combat) return { ok: false, reason: "Already fighting" };
  const zone = zoneById(game, e.zoneId);
  const mon = monsterById(game, e.monsterId) || { name: e.monsterId, hpMult: 1, dmgMult: 1 };
  const b = game.balance;
  const scale = Math.min(
    b.enemyLevelScaleCap,
    Math.max(1, 1 + b.enemyLevelScale * (charLevel(state) - zone.minLevel)),
  );
  const hpMult = (e.isBoss ? zone.boss.hpMult : mon.hpMult) * (e.isElite ? 1.55 : 1);
  const dmgMult = (e.isBoss ? zone.boss.dmgMult : mon.dmgMult) * (e.isElite ? 1.2 : 1);
  const maxHp = Math.round(zone.enemyHp * scale * hpMult);
  const dmg = Math.max(3, Math.round(zone.enemyDmg * scale * dmgMult));
  const enemyName = e.isBoss ? zone.boss.name : mon.name;
  const deck = shuffle(combatDeck(state, cards, game));
  const hand = [];
  const hs = handSize(state, game) + (currentCaptain(state, game)?.ability?.kind === "drawAndLuck" ? 2 : 0);
  for (let i = 0; i < hs && deck.length; i++) hand.push(deck.shift());
  state.combat = {
    mode: "voyage",
    encounter: e,
    enemy: {
      name: enemyName,
      maxHp,
      hp: maxHp,
      dmg,
      shield: 0,
      intent: "attack",
      charged: false,
    },
    playerHp: state.voyage?.playerHp ?? playerMaxHp(state, game),
    playerMaxHp: playerMaxHp(state, game),
    playerShield: 0,
    ap: playerMaxAp(state, game),
    maxAp: playerMaxAp(state, game),
    hand,
    drawPile: deck,
    discard: [],
    turn: 1,
    over: false,
    won: false,
    log: [`Engaged ${enemyName}!`],
    endless: null,
  };
  state.stats.fights += 1;
  return { ok: true };
}

// ---------- combat ----------

function applyDamage(hp, shield, dmg) {
  let s = shield;
  let h = hp;
  if (s > 0) {
    const absorb = Math.min(s, dmg);
    s -= absorb;
    dmg -= absorb;
  }
  h -= dmg;
  return [h, s];
}

function drawCards(combat, cards, state, n) {
  for (let i = 0; i < n; i++) {
    if (!combat.drawPile.length) {
      if (!combat.discard.length) break;
      combat.drawPile = shuffle(combat.discard);
      combat.discard = [];
    }
    if (combat.drawPile.length) combat.hand.push(combat.drawPile.shift());
  }
}

function cardStats(cards, state, id) {
  const base = cards.byId[id];
  const n = state.enhancements?.[id] || 0;
  return {
    ...base,
    damage: base.damage + (base.damage > 0 ? n : 0),
    shield: base.shield + (base.shield > 0 ? n : 0),
    heal: base.heal + (base.heal > 0 ? 2 * n : 0),
  };
}

function enemyDamage(combat, state, game) {
  const cap = currentCaptain(state, game);
  let dmg = combat.enemy.dmg * (combat.enemy.charged ? 1.6 : 1);
  if (cap?.ability?.kind === "enemyDmgReduction") dmg *= 1 - cap.ability.value;
  return Math.max(1, Math.round(dmg));
}

function enemyNextIntent(combat) {
  const r = Math.random();
  if (r < 0.16) return "brace";
  if (r < 0.34) return "charge";
  return "attack";
}

function enemyAct(combat, state, game) {
  const e = combat.enemy;
  const log = combat.log;
  if (e.intent === "attack") {
    const dmg = enemyDamage(combat, state, game);
    [combat.playerHp, combat.playerShield] = applyDamage(combat.playerHp, combat.playerShield, dmg);
    log.push(`${e.name} attacks for ${dmg}.`);
  } else if (e.intent === "brace") {
    const gain = 3 + Math.floor(combat.turn / 4);
    e.shield += gain;
    log.push(`${e.name} braces, +${gain} shield.`);
  } else if (e.intent === "charge") {
    e.charged = true;
    log.push(`${e.name} charges its cannons…`);
  }
  e.charged = false;
  e.intent = enemyNextIntent(combat);
}

function checkCombatEnd(state, cards, game) {
  const c = state.combat;
  if (!c || c.over) return;
  if (c.enemy.hp <= 0) {
    c.over = true;
    c.won = true;
    c.enemy.hp = 0;
    state.stats.wins += 1;
    state.stats.kills += 1;
    if (c.mode === "endless") state.stats.endlessKills += 1;
    if (c.encounter.isElite) state.stats.eliteKills += 1;
    if (c.encounter.isBoss) state.stats.bossKills += 1;
  } else if (c.playerHp <= 0) {
    c.over = true;
    c.won = false;
    c.playerHp = 0;
    state.stats.losses += 1;
  }
}

export function playCard(state, cards, game, handIndex) {
  const c = state.combat;
  if (!c || c.over) return { ok: false, reason: "Not in combat" };
  const id = c.hand[handIndex];
  const card = cardStats(cards, state, id);
  if (!card) return { ok: false, reason: "Bad card" };
  if (c.ap < card.ap) return { ok: false, reason: "Not enough AP" };
  c.ap -= card.ap;
  c.hand.splice(handIndex, 1);
  c.discard.push(id);
  const cap = currentCaptain(state, game);
  if (card.damage > 0) {
    let dmg = card.damage;
    if (cap?.ability?.kind === "atkBonus") dmg += cap.ability.value;
    dmg = Math.round(dmg * (1 + crewDmgBonus(state, game)));
    [c.enemy.hp, c.enemy.shield] = applyDamage(c.enemy.hp, c.enemy.shield, dmg);
    c.log.push(`${card.name} hits for ${dmg}.`);
  }
  if (card.shield > 0) {
    c.playerShield += card.shield;
    c.log.push(`${card.name} +${card.shield} shield.`);
  }
  if (card.heal > 0) {
    c.playerHp = Math.min(c.playerMaxHp, c.playerHp + card.heal);
    c.log.push(`${card.name} repairs ${card.heal}.`);
  }
  if (card.draw > 0) {
    drawCards(c, cards, state, card.draw);
    c.log.push(`${card.name}: draw ${card.draw}.`);
  }
  if (card.kind === "Resource") {
    c.ap = Math.min(c.maxAp + 1, c.ap + 1);
    c.log.push(`${card.name} grants +1 AP.`);
  }
  checkCombatEnd(state, cards, game);
  return { ok: true };
}

export function endTurn(state, cards, game) {
  const c = state.combat;
  if (!c) return { ok: false, reason: "Not in combat" };
  if (c.over) return { ok: false, reason: "Combat over" };
  enemyAct(c, state, game);
  checkCombatEnd(state, cards, game);
  if (!c.over) {
    c.turn += 1;
    const cap = currentCaptain(state, game);
    c.ap = c.maxAp;
    c.playerShield = Math.floor(c.playerShield * 0.5);
    if (cap?.ability?.kind === "healPerTurn") {
      c.playerHp = Math.min(c.playerMaxHp, c.playerHp + cap.ability.value);
      c.log.push(`${cap.name}'s blessing heals ${cap.ability.value}.`);
    }
    c.discard.push(...c.hand);
    c.hand = [];
    drawCards(c, cards, state, handSize(state, game) + (cap?.ability?.kind === "drawAndLuck" && c.turn === 2 ? 2 : 0));
    c.log.push(`--- Turn ${c.turn} ---`);
  }
  return { ok: true };
}

// ---------- rewards ----------

function rewardForVictory(state, cards, game) {
  const c = state.combat;
  const zone = zoneById(game, c.encounter.zoneId);
  const isElite = c.encounter.isElite;
  const isBoss = c.encounter.isBoss;
  const xpBase = zone.xpBase * (isBoss ? zone.bossXpMult : isElite ? zone.eliteXpMult : 1);
  const xp = Math.round(xpBase);
  const marks = randInt(zone.marks[0], zone.marks[1]) * (isElite ? 2 : isBoss ? 3 : 1);
  const gold = randInt(zone.gold[0], zone.gold[1]) * (isElite ? 2 : isBoss ? 3 : 1);
  const loot = rollLoot(state, game, zone, isElite, isBoss);
  const forced = isBoss ? zone.bossCardRarity : null;
  const card = rollCardDrop(state, cards, game, c.encounter, forced);
  const cardGranted = grantCard(state, cards, card);
  grant(state.inventory, { Marks: marks, Gold: gold });
  grant(state.inventory, loot);
  state.stats.marksEarned += marks;
  const xpResult = addXp(state, game, xp);
  return { xp, marks, gold, loot, card: cardGranted, levels: xpResult.levels };
}

export function collectCombatResult(state, cards, game) {
  const c = state.combat;
  if (!c || !c.over) return { kind: "none" };
  if (c.won) {
    const r = rewardForVictory(state, cards, game);
    if (c.mode === "endless") {
      const en = state.endless;
      en.kills += 1;
      if (c.encounter.isElite) en.elites += 1;
      en.score += game.balance.endlessScorePerKill + (c.encounter.isElite ? game.balance.endlessScorePerElite : 0);
      en.waveEnemiesLeft -= 1;
      state.combat = null;
      if (en.waveEnemiesLeft <= 0) {
        return { kind: "endless_wave_cleared", ...r, wave: en.wave };
      }
      return { kind: "endless_next", ...r, wave: en.wave };
    }
    // voyage
    const v = state.voyage;
    v.playerHp = Math.min(v.playerHp, c.playerHp);
    const e = c.encounter;
    const label = e.isBoss ? "boss" : e.isElite ? "elite" : "monster";
    v.results.push({ type: label, name: c.enemy.name, ...r });
    state.combat = null;
    if (e.isBoss) {
      v.bossRemaining = false;
    } else {
      v.index += 1;
    }
    const more = currentEncounter(state, game) !== null;
    if (!more) {
      v.finished = true;
      return { kind: "voyage_end", ...r };
    }
    return { kind: "voyage_continue", ...r };
  }
  // defeat
  if (c.mode === "endless") {
    const end = retireEndless(state, cards, game, false);
    return { kind: "endless_end", ...end };
  }
  damageShip(state, game, game.balance.defeatDurabilityLoss);
  const xp = 6;
  const xpResult = addXp(state, game, xp);
  const v = state.voyage;
  v.results.push({ type: "defeat", name: c.enemy.name, xp });
  state.combat = null;
  v.finished = true;
  return { kind: "voyage_defeat", xp, levels: xpResult.levels };
}

export function continueVoyage(state, game) {
  const v = state.voyage;
  if (!v || v.finished) return { ok: false };
  if (!state.combat && currentEncounter(state, game)) {
    v.playerHp = Math.min(playerMaxHp(state, game), v.playerHp + Math.round(playerMaxHp(state, game) * game.balance.healBetweenEncountersPct));
  }
  return { ok: true };
}

export function returnToPort(state) {
  const v = state.voyage;
  if (!v) return { ok: false };
  state.voyage = null;
  state.combat = null;
  return { ok: true };
}

export function skipBoss(state, game) {
  const v = state.voyage;
  if (!v) return { ok: false };
  v.bossRemaining = false;
  v.finished = true;
  return { ok: true };
}

// ---------- endless ----------

export function startEndless(state, cards, game) {
  if (state.combat || state.voyage || state.endless) return { ok: false, reason: "Busy" };
  state.endless = {
    wave: 1,
    score: 0,
    kills: 0,
    elites: 0,
    hp: playerMaxHp(state, game),
    waveEnemiesLeft: 1,
    retired: false,
  };
  state.stats.endlessRuns += 1;
  const ok = spawnEndlessEnemy(state, cards, game);
  return { ok, endless: state.endless };
}

function spawnEndlessEnemy(state, cards, game) {
  const en = state.endless;
  if (!en) return false;
  const zone = zoneById(game, "abyss");
  const b = game.balance;
  const waveScale = 1 + b.endlessWaveScale * (en.wave - 1);
  const dmgScale = 1 + (b.endlessDmgScale || b.endlessWaveScale) * (en.wave - 1);
  const isElite = en.wave >= game.balance.endlessEliteFromWave && Math.random() < game.balance.endlessEliteChance;
  const pool = isElite ? zone.elitePool : zone.monsterPool;
  const monId = pool[randInt(0, pool.length - 1)];
  const mon = monsterById(game, monId) || { name: monId, hpMult: 1, dmgMult: 1 };
  const maxHp = Math.round(b.endlessBaseHp * waveScale * mon.hpMult * (isElite ? 1.55 : 1));
  const dmg = Math.max(4, Math.round(b.endlessBaseDmg * dmgScale * mon.dmgMult * (isElite ? 1.2 : 1)));
  const deck = shuffle(combatDeck(state, cards, game));
  const hand = [];
  const hs = handSize(state, game) + (currentCaptain(state, game)?.ability?.kind === "drawAndLuck" ? 2 : 0);
  for (let i = 0; i < hs && deck.length; i++) hand.push(deck.shift());
  state.combat = {
    mode: "endless",
    encounter: { type: "monster", monsterId: monId, zoneId: "abyss", isElite, isBoss: false },
    enemy: { name: mon.name, maxHp, hp: maxHp, dmg, shield: 0, intent: "attack", charged: false },
    playerHp: en.hp,
    playerMaxHp: playerMaxHp(state, game),
    playerShield: 0,
    ap: playerMaxAp(state, game),
    maxAp: playerMaxAp(state, game),
    hand,
    drawPile: deck,
    discard: [],
    turn: 1,
    over: false,
    won: false,
    log: [`Wave ${en.wave} — ${mon.name} appears!`],
    endless: { wave: en.wave, isElite },
  };
  state.stats.fights += 1;
  return true;
}

export function endlessNextWave(state, cards, game) {
  const en = state.endless;
  if (!en) return { ok: false };
  en.wave += 1;
  en.waveEnemiesLeft = Math.min(game.balance.maxEndlessEnemies, 1 + Math.floor((en.wave - 1) / 5));
  en.score += game.balance.endlessScorePerWave;
  // free heal
  en.hp = Math.min(playerMaxHp(state, game), en.hp + Math.round(playerMaxHp(state, game) * game.balance.healBetweenWavesPct));
  spawnEndlessEnemy(state, cards, game);
  return { ok: true, wave: en.wave };
}

export function endlessNextEnemy(state, cards, game) {
  const en = state.endless;
  if (!en || en.waveEnemiesLeft <= 0) return { ok: false };
  spawnEndlessEnemy(state, cards, game);
  return { ok: true, wave: en.wave };
}

export function endlessHeal(state, game) {
  const en = state.endless;
  if (!en) return { ok: false };
  en.hp = Math.min(playerMaxHp(state, game), en.hp + Math.round(playerMaxHp(state, game) * game.balance.healBetweenWavesPct));
  return { ok: true };
}

export function endlessRepair(state, game) {
  const en = state.endless;
  if (!en) return { ok: false, reason: "Not in Endless" };
  const cost = game.balance.endlessRepairCostPerHp * 20;
  if ((state.inventory.Marks || 0) < cost) return { ok: false, reason: "Need more Marks" };
  state.inventory.Marks -= cost;
  en.hp = Math.min(playerMaxHp(state, game), en.hp + 20);
  return { ok: true, cost };
}

export function retireEndless(state, cards, game, manual = true) {
  const en = state.endless;
  if (!en) return { ok: false };
  const b = game.balance;
  const xp = en.wave * b.endlessXpPerWave + en.kills * b.endlessXpPerKill;
  const gold = en.wave * b.endlessGoldPerWave;
  const iron = en.wave * b.endlessIronPerWave;
  const marks = en.wave * 8;
  const xpResult = addXp(state, game, xp);
  grant(state.inventory, { Gold: gold, Iron: iron, Marks: marks });
  state.stats.marksEarned += marks;
  let card = null;
  if (en.wave >= 15) {
    const chance = Math.min(1, 0.2 + en.wave * 0.01);
    if (Math.random() < chance) {
      card = rollCardDrop(state, cards, game, { zoneId: "abyss", isElite: true, isBoss: false }, "epic");
      grantCard(state, cards, card);
    }
  }
  if (en.wave > (state.stats.endlessBestWave || 0)) {
    state.stats.endlessBestWave = en.wave;
    state.stats.endlessBestScore = en.score;
  }
  const entry = {
    score: en.score,
    wave: en.wave,
    kills: en.kills,
    captain: state.captainId,
    date: Date.now(),
    manual,
  };
  state.leaderboard.push(entry);
  state.leaderboard.sort((a, b) => b.score - a.score);
  state.leaderboard = state.leaderboard.slice(0, 10);
  state.endlessBest = { score: en.score, wave: en.wave, captain: state.captainId };
  const out = {
    ok: true,
    wave: en.wave,
    score: en.score,
    kills: en.kills,
    xp,
    gold,
    iron,
    marks,
    levels: xpResult.levels,
    card: card ? card.name : null,
  };
  state.endless = null;
  state.combat = null;
  return out;
}

// ---------- port actions ----------

export function craftShip(state, game, shipId) {
  const ship = shipById(game, shipId);
  if (!ship) return { ok: false, reason: "Unknown ship" };
  if (ship.id === state.shipId) return { ok: false, reason: "Already owned" };
  const order = game.ships.map((s) => s.id);
  const cur = order.indexOf(state.shipId);
  const want = order.indexOf(shipId);
  if (want !== cur + 1) return { ok: false, reason: "Craft the next ship in line" };
  if (charLevel(state) < ship.level) return { ok: false, reason: `Level ${ship.level} required` };
  const miss = canPay(state.inventory, ship.cost);
  if (miss) return { ok: false, reason: "Need more " + miss };
  pay(state.inventory, ship.cost);
  state.shipId = ship.id;
  state.shipDura = ship.hull;
  return { ok: true, ship };
}

export function craftRecipe(state, game, id) {
  const r = recipeById(game, id);
  if (!r) return { ok: false, reason: "Unknown recipe" };
  const miss = canPay(state.inventory, r.cost);
  if (miss) return { ok: false, reason: "Need more " + miss };
  pay(state.inventory, r.cost);
  grant(state.inventory, r.gives);
  return { ok: true, r };
}

export function recruitCrew(state, game) {
  const ship = shipById(game, state.shipId);
  if ((state.crew?.length || 0) >= ship.slots) return { ok: false, reason: "Berths full — upgrade the hull" };
  const miss = canPay(state.inventory, game.recruitCost);
  if (miss) return { ok: false, reason: "Need more " + miss };
  pay(state.inventory, game.recruitCost);
  const name = game.crewNames[randInt(0, game.crewNames.length - 1)];
  state.crew.push({ name });
  return { ok: true, name };
}

export function enhanceCard(state, cards, game, cardId) {
  const card = cards.byId[cardId];
  if (!card) return { ok: false, reason: "Unknown card" };
  const cur = state.enhancements?.[cardId] || 0;
  if (cur >= game.balance.enhanceMax) return { ok: false, reason: "Already max enhanced" };
  const owned = (state.collection || []).filter((id) => id === cardId).length;
  if (owned < 2) return { ok: false, reason: "Need a duplicate copy" };
  const cost = { ...game.balance.enhanceCost };
  const miss = canPay(state.inventory, cost);
  if (miss) return { ok: false, reason: "Need more " + miss };
  pay(state.inventory, cost);
  // consume one duplicate
  const idx = state.collection.indexOf(cardId);
  if (idx >= 0) state.collection.splice(idx, 1);
  state.enhancements[cardId] = cur + 1;
  return { ok: true, card, level: cur + 1 };
}

// ---------- misc ----------

export function shipStatus(state, game) {
  const ship = shipById(game, state.shipId);
  const pct = Math.round(((state.shipDura || ship.hull) / ship.hull) * 100);
  return { ship, pct };
}

export function totalXpToMax(game) {
  let sum = 0;
  for (let l = 1; l < MAX_LEVEL; l++) sum += xpNeeded(game, l);
  return sum;
}
