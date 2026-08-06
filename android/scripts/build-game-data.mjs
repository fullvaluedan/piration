// Builds www/data/game.json from www/data/cards.json.
// Deterministic: card pools and rarities are seeded from card ids, so
// regenerating the file never reshuffles the design.
//
// Run: node scripts/build-game-data.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(
  readFileSync(join(root, "www/data/cards.json"), "utf8"),
).cards;

// ---------- deterministic rng ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const rng = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STARTER_IDS = new Set([
  "cannon_blast",
  "basic_attack_plan",
  "basic_relief",
  "broadside",
  "musket_shot",
  "patch_work",
  "careful_aim",
  "evasive_maneuvers",
]);

const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

// ---------- rarity ----------
// Strong signatures are rarer; a little seeded noise keeps it organic.
function rarityFor(card) {
  if (STARTER_IDS.has(card.id)) return "common";
  const r = mulberry32(hashStr("rarity:" + card.id));
  const roll = r();
  if (card.kind === "Resource") return roll < 0.5 ? "rare" : "epic";
  if (card.damage >= 7) return roll < 0.7 ? "epic" : "legendary";
  if (card.damage >= 6) return roll < 0.8 ? "rare" : "epic";
  if (card.shield >= 5) return roll < 0.85 ? "rare" : "epic";
  if (card.shield >= 2 && card.heal >= 4)
    return roll < 0.5 ? "rare" : "epic";
  if (card.damage >= 4 && roll < 0.14) return "rare";
  if (card.draw >= 1 && roll < 0.14) return "rare";
  return "common";
}

const rarity = Object.fromEntries(cards.map((c) => [c.id, rarityFor(c)]));

// ---------- captain pools ----------
// kindMix: percentage of pool per kind. Pools are drawn seeded per captain,
// so regenerating is stable and each captain reads differently.
const CAPTAIN_DEFS = [
  {
    id: "morgaine",
    name: "Captain Morgaine",
    title: "The Evenhanded",
    starter: true,
    unlock: null,
    focus: "Balanced fleet doctrine",
    ability: {
      name: "Tactician",
      desc: "Draw 6 cards each turn instead of 5.",
      kind: "draw",
      value: 1,
    },
    icon: "⚓",
    poolSize: 52,
    kindMix: { Attack: 0.5, Defend: 0.17, Skill: 0.23, Resource: 0.1 },
  },
  {
    id: "bones",
    name: "Salty Bones",
    title: "The Undying Gunner",
    starter: false,
    unlock: { level: 10, endlessKills: 20 },
    focus: "Cannons first, questions never",
    ability: {
      name: "Cannon Madness",
      desc: "Your Attack cards deal +1 damage.",
      kind: "atkBonus",
      value: 1,
    },
    icon: "☠",
    poolSize: 48,
    kindMix: { Attack: 0.74, Defend: 0.05, Skill: 0.11, Resource: 0.1 },
  },
  {
    id: "siren",
    name: "Siren",
    title: "The Tidecaller",
    starter: false,
    unlock: { level: 12, resourcesCollected: 200 },
    focus: "Outlast every storm",
    ability: {
      name: "Mermaid's Blessing",
      desc: "Heal 3 HP at the start of each of your turns.",
      kind: "healPerTurn",
      value: 3,
    },
    icon: "🧜",
    poolSize: 46,
    kindMix: { Attack: 0.3, Defend: 0.3, Skill: 0.3, Resource: 0.1 },
  },
  {
    id: "ironbeard",
    name: "Ironbeard",
    title: "The Press Gang",
    starter: false,
    unlock: { level: 15, eliteKills: 10, CannonPart: 5 },
    focus: "Overwhelming firepower",
    ability: {
      name: "Press Gang",
      desc: "+1 AP each turn.",
      kind: "apBonus",
      value: 1,
    },
    icon: "⚔",
    poolSize: 46,
    kindMix: { Attack: 0.52, Defend: 0.1, Skill: 0.13, Resource: 0.25 },
  },
  {
    id: "oz",
    name: "Mapmaker Oz",
    title: "The Chartwright",
    starter: false,
    unlock: { level: 16, endlessWave: 25, MapFragment: 10 },
    focus: "Draw the whole ocean",
    ability: {
      name: "Chart Master",
      desc: "Draw 2 extra cards on turn 1 and +50% card drop luck.",
      kind: "drawAndLuck",
      value: 2,
    },
    icon: "🗺",
    poolSize: 48,
    kindMix: { Attack: 0.3, Defend: 0.2, Skill: 0.4, Resource: 0.1 },
  },
  {
    id: "cetus",
    name: "Cetus",
    title: "The Dread Captain",
    starter: false,
    unlock: { level: 20, endlessWave: 40, totalKills: 500 },
    focus: "Perfection of the pirate arts",
    ability: {
      name: "Dread Aura",
      desc: "Enemies deal 10% less damage.",
      kind: "enemyDmgReduction",
      value: 0.1,
    },
    icon: "🐙",
    poolSize: 54,
    kindMix: { Attack: 0.44, Defend: 0.2, Skill: 0.21, Resource: 0.15 },
  },
];

const KINDS = ["Attack", "Defend", "Skill", "Resource"];
const buckets = Object.fromEntries(KINDS.map((k) => [k, []]));
for (const c of cards) buckets[c.kind]?.push(c.id);
for (const k of KINDS) buckets[k] = seededShuffle(buckets[k], hashStr("bucket:" + k));

function buildPool(def, allIds) {
  const target = {};
  let soFar = 0;
  for (const k of KINDS) {
    const n = Math.floor(def.poolSize * def.kindMix[k]);
    target[k] = n;
    soFar += n;
  }
  // remainder goes to the dominant kind
  const dom = Object.entries(def.kindMix).sort((a, b) => b[1] - a[1])[0][0];
  target[dom] += def.poolSize - soFar;

  const picked = new Set();
  for (const k of KINDS) {
    const want = target[k];
    let i = 0;
    while (picked.size < def.poolSize && picked.size < allIds.size && i < buckets[k].length && want > countKind(picked, k)) {
      const id = buckets[k][i];
      // starter cards always available to Morgaine
      if (def.id === "morgaine" && STARTER_IDS.has(id)) {
        picked.add(id);
      } else if (!picked.has(id) && !STARTER_IDS.has(id)) {
        picked.add(id);
      }
      i++;
    }
  }
  // guarantee starter deck for Morgaine
  if (def.id === "morgaine") {
    for (const id of STARTER_IDS) picked.add(id);
  }
  return seededShuffle([...picked], hashStr("pool:" + def.id)).sort((a, b) => a.localeCompare(b));
}

function countKind(pool, kind) {
  let n = 0;
  for (const id of pool) if (byId[id]?.kind === kind) n++;
  return n;
}

const captains = CAPTAIN_DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  title: def.title,
  starter: def.starter,
  unlock: def.unlock,
  focus: def.focus,
  ability: def.ability,
  icon: def.icon,
  pool: buildPool(def, new Set(cards.map((c) => c.id))),
}));

// ---------- authored balance data ----------
const GAME = {
  version: 3,
  balance: {
    playerBaseHp: 30,
    hpPerHull: 0.6,
    maxApBase: 4,
    apPerCannon: 1,
    handSize: 5,
    xpCurveBase: 80,
    xpCurvePower: 1.12,
    enemyLevelScale: 0.02,
    enemyLevelScaleCap: 1.4,
    crewDmgBonusPct: 2,
    crewHpBonus: 4,
    maxCrewDmgBonusPct: 10,
    enhanceMax: 3,
    enhanceCost: { Marks: 30 },
    bribeCostMult: 0.6,
    fleeDurabilityLoss: 0.12,
    defeatDurabilityLoss: 0.25,
    repairCost: { Marks: 6, Wood: 0.25 },
    healBetweenEncountersPct: 0.1,
    healBetweenWavesPct: 0.25,
    endlessRepairCostPerHp: 2,
    endlessScorePerWave: 100,
    endlessScorePerKill: 10,
    endlessScorePerElite: 25,
    endlessXpPerWave: 12,
    endlessXpPerKill: 4,
    endlessGoldPerWave: 1,
    endlessIronPerWave: 1,
    endlessBaseHp: 62,
    endlessBaseDmg: 8,
    endlessWaveScale: 0.08,
    endlessDmgScale: 0.05,
    endlessEliteFromWave: 6,
    endlessEliteChance: 0.25,
    maxEndlessEnemies: 3,
    rarityLevels: { rare: 6, epic: 12, legendary: 18 },
  },
  zones: [
    {
      id: "shallows",
      name: "Sunny Shallows",
      desc: "Safe water for a green crew. Wood, Cotton, first blood.",
      minLevel: 1,
      enemyHp: 24,
      enemyDmg: 5,
      voyageLength: 3,
      encounterWeights: { monster: 0.72, elite: 0.1, cache: 0.18 },
      monsterPool: ["brine_goblin", "coral_wraith", "guppy_raider"],
      elitePool: ["tide_hydra"],
      boss: { id: "shallow_king", name: "King of the Shallows", hpMult: 2.0, dmgMult: 1.3 },
      lootWeights: { Wood: 34, Cotton: 28, Iron: 14, Rum: 6, Marks: 12, Gold: 4, MapFragment: 2 },
      lootMin: 2,
      lootMax: 4,
      marks: [12, 26],
      gold: [0, 2],
      xpBase: 20,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.28,
      eliteCardChance: 0.7,
      bossCardRarity: "epic",
    },
    {
      id: "trade",
      name: "Trade Routes",
      desc: "Fat merchant convoys. Marks and Cotton, sharper teeth.",
      minLevel: 3,
      enemyHp: 38,
      enemyDmg: 7,
      voyageLength: 3,
      encounterWeights: { monster: 0.7, elite: 0.13, cache: 0.17 },
      monsterPool: ["armada_raider", "brine_goblin", "salvage_crab"],
      elitePool: ["tide_hydra", "smuggler_brig"],
      boss: { id: "armada_captain", name: "Armada Captain", hpMult: 2.1, dmgMult: 1.3 },
      lootWeights: { Wood: 24, Cotton: 26, Iron: 18, Rum: 7, GoldNugget: 3, Marks: 16, Gold: 6 },
      lootMin: 2,
      lootMax: 4,
      marks: [18, 38],
      gold: [0, 4],
      xpBase: 24,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.34,
      eliteCardChance: 0.8,
      bossCardRarity: "epic",
    },
    {
      id: "opensea",
      name: "Open Sea",
      desc: "Deep water. Iron-heavy wrecks and serious guns.",
      minLevel: 6,
      enemyHp: 54,
      enemyDmg: 10,
      voyageLength: 3,
      encounterWeights: { monster: 0.68, elite: 0.16, cache: 0.16 },
      monsterPool: ["iron_privateer", "leviathan_matron", "salvage_crab", "armada_raider"],
      elitePool: ["smuggler_brig", "kraken_spawn"],
      boss: { id: "leviathan", name: "Leviathan Matron", hpMult: 2.1, dmgMult: 1.35 },
      lootWeights: { Wood: 20, Cotton: 18, Iron: 24, GoldNugget: 6, Rum: 6, CannonPart: 4, Marks: 16, Gold: 6 },
      lootMin: 3,
      lootMax: 5,
      marks: [26, 52],
      gold: [1, 6],
      xpBase: 28,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.42,
      eliteCardChance: 0.9,
      bossCardRarity: "epic",
    },
    {
      id: "reefs",
      name: "Sunken Reefs",
      desc: "Gold nuggets in the coral. Elites prowl every channel.",
      minLevel: 10,
      enemyHp: 72,
      enemyDmg: 13,
      voyageLength: 3,
      encounterWeights: { monster: 0.62, elite: 0.22, cache: 0.16 },
      monsterPool: ["reef_horror", "iron_privateer", "kraken_spawn", "leviathan_matron"],
      elitePool: ["kraken_spawn", "siren_barge", "reef_horror"],
      boss: { id: "reef_king", name: "Reef Horror King", hpMult: 2.2, dmgMult: 1.35 },
      lootWeights: { Wood: 16, Cotton: 13, Iron: 22, GoldNugget: 12, Rum: 8, CannonPart: 8, MapFragment: 6, Marks: 18, Gold: 8 },
      lootMin: 3,
      lootMax: 6,
      marks: [36, 70],
      gold: [2, 9],
      xpBase: 32,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.5,
      eliteCardChance: 1,
      bossCardRarity: "epic",
    },
    {
      id: "triangle",
      name: "Devil's Triangle",
      desc: "Map fragments and madness. Only hard crews sail here.",
      minLevel: 14,
      enemyHp: 92,
      enemyDmg: 16,
      voyageLength: 3,
      encounterWeights: { monster: 0.6, elite: 0.24, cache: 0.16 },
      monsterPool: ["triangle_sphinx", "siren_barge", "reef_horror", "kraken_spawn"],
      elitePool: ["siren_barge", "abyssal_tender", "triangle_sphinx"],
      boss: { id: "triangle_sphinx", name: "Triangle Sphinx", hpMult: 2.2, dmgMult: 1.4 },
      lootWeights: { Wood: 14, Cotton: 11, Iron: 20, GoldNugget: 13, Rum: 10, CannonPart: 10, MapFragment: 12, Marks: 18, Gold: 10 },
      lootMin: 4,
      lootMax: 7,
      marks: [48, 92],
      gold: [3, 12],
      xpBase: 36,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.58,
      eliteCardChance: 1,
      bossCardRarity: "legendary",
    },
    {
      id: "abyss",
      name: "The Abyss",
      desc: "Endgame waters. Legendary loot for legendary crews.",
      minLevel: 18,
      enemyHp: 116,
      enemyDmg: 20,
      voyageLength: 3,
      encounterWeights: { monster: 0.56, elite: 0.28, cache: 0.16 },
      monsterPool: ["abyssal_tender", "triangle_sphinx", "siren_barge", "abyssal_tyrant"],
      elitePool: ["abyssal_tyrant", "abyssal_tender", "siren_barge"],
      boss: { id: "abyssal_tyrant", name: "Abyssal Tyrant", hpMult: 2.3, dmgMult: 1.4 },
      lootWeights: { Wood: 12, Cotton: 9, Iron: 18, GoldNugget: 15, Rum: 12, CannonPart: 12, MapFragment: 14, Marks: 20, Gold: 12 },
      lootMin: 4,
      lootMax: 8,
      marks: [60, 120],
      gold: [4, 16],
      xpBase: 40,
      eliteXpMult: 2.5,
      bossXpMult: 4,
      cardChance: 0.66,
      eliteCardChance: 1,
      bossCardRarity: "legendary",
    },
  ],
  monsters: [
    { id: "brine_goblin", name: "Brine Goblin", desc: "Small, mean, everywhere.", hpMult: 0.8, dmgMult: 0.85 },
    { id: "coral_wraith", name: "Coral Wraith", desc: "Sails through hulls.", hpMult: 0.95, dmgMult: 1.0 },
    { id: "guppy_raider", name: "Guppy Raider", desc: "Fast and cocky.", hpMult: 0.7, dmgMult: 1.1 },
    { id: "armada_raider", name: "Armada Raider", desc: "Disciplined cannon fire.", hpMult: 1.0, dmgMult: 1.0 },
    { id: "salvage_crab", name: "Salvage Crab", desc: "Crustacean with a grudge.", hpMult: 1.15, dmgMult: 0.9 },
    { id: "iron_privateer", name: "Iron Privateer", desc: "Pirates with a budget.", hpMult: 1.1, dmgMult: 1.05 },
    { id: "leviathan_matron", name: "Leviathan Matron", desc: "Mother of the deep.", hpMult: 1.25, dmgMult: 1.1 },
    { id: "reef_horror", name: "Reef Horror", desc: "Coral grown around rage.", hpMult: 1.3, dmgMult: 1.05 },
    { id: "kraken_spawn", name: "Kraken Spawn", desc: "Tentacles, tentacles everywhere.", hpMult: 1.2, dmgMult: 1.15 },
    { id: "siren_barge", name: "Siren Barge", desc: "Sings you onto the rocks.", hpMult: 1.1, dmgMult: 1.2 },
    { id: "triangle_sphinx", name: "Triangle Sphinx", desc: "Riddles in cannonballs.", hpMult: 1.35, dmgMult: 1.2 },
    { id: "abyssal_tender", name: "Abyssal Tender", desc: "Favored of the deep.", hpMult: 1.4, dmgMult: 1.25 },
    { id: "abyssal_tyrant", name: "Abyssal Tyrant", desc: "Nothing sails past twice.", hpMult: 1.5, dmgMult: 1.3 },
    { id: "tide_hydra", name: "Tide Hydra", desc: "Three heads, no mercy.", hpMult: 1.6, dmgMult: 1.2, elite: true },
    { id: "smuggler_brig", name: "Smuggler Brig", desc: "Fast, loaded, hostile.", hpMult: 1.55, dmgMult: 1.25, elite: true },
    { id: "kraken_spawn_elite", name: "Kraken Elder", desc: "The spawn grew up.", hpMult: 1.7, dmgMult: 1.3, elite: true },
    { id: "siren_barge_elite", name: "Siren Matriarch", desc: "Her song never ends.", hpMult: 1.65, dmgMult: 1.35, elite: true },
    { id: "reef_horror_elite", name: "Reef Horror Prime", desc: "The reef's king.", hpMult: 1.75, dmgMult: 1.3, elite: true },
    { id: "abyssal_tender_elite", name: "Abyssal Herald", desc: "Announces the end.", hpMult: 1.8, dmgMult: 1.4, elite: true },
    { id: "abyssal_tyrant_elite", name: "Abyssal Tyrant Prime", desc: "The deep itself.", hpMult: 1.85, dmgMult: 1.45, elite: true },
  ],
  ships: [
    { id: "skiff", name: "Skiff", level: 1, hull: 30, cannons: 1, slots: 2, cost: null },
    { id: "sloop", name: "Sloop", level: 3, hull: 50, cannons: 2, slots: 3, cost: { Wood: 15, Cotton: 8, Iron: 5, Marks: 150 } },
    { id: "brig", name: "Brig", level: 8, hull: 75, cannons: 3, slots: 4, cost: { Wood: 30, Cotton: 16, Iron: 12, GoldNugget: 2, Marks: 400 } },
    { id: "galleon", name: "Galleon", level: 14, hull: 105, cannons: 4, slots: 5, cost: { Wood: 50, Cotton: 26, Iron: 22, GoldNugget: 5, CannonPart: 4, Marks: 800 } },
    { id: "dreadnought", name: "Dreadnought", level: 20, hull: 145, cannons: 5, slots: 6, cost: { Wood: 75, Cotton: 40, Iron: 35, GoldNugget: 8, CannonPart: 6, MapFragment: 5, Marks: 1500 } },
  ],
  recipes: [
    { id: "cannon_part", name: "Cannon Part", desc: "Gun metal for shipwrights.", gives: { CannonPart: 1 }, cost: { Iron: 5, Marks: 40 } },
    { id: "map_kit", name: "Map Kit", desc: "Chart scraps for deep water.", gives: { MapFragment: 3 }, cost: { Wood: 2, Cotton: 2, Marks: 25 } },
    { id: "rum_barrel", name: "Rum Barrel", desc: "Recruiting fuel.", gives: { Rum: 1 }, cost: { Cotton: 3, Marks: 30 } },
  ],
  recruitCost: { Marks: 75, Rum: 1 },
  crewNames: ["Pegleg Pat", "Salty Rue", "Cannon Mia", "Mapmaker Oz Jr", "Reef Raider", "Jonah Flint", "Barnacle Bess", "Dicey Dan"],
  cardRarity: rarity,
  captains,
};

writeFileSync(join(root, "www/data/game.json"), JSON.stringify(GAME, null, 2) + "\n");

// quick report
const kindCount = (pool) => {
  const out = {};
  for (const id of pool) {
    const k = byId[id]?.kind;
    out[k] = (out[k] || 0) + 1;
  }
  return Object.entries(out).map(([k, n]) => `${k}:${n}`).join(" ");
};
const rarityCount = {};
for (const r of Object.values(rarity)) rarityCount[r] = (rarityCount[r] || 0) + 1;
console.log("game.json written.");
console.log("rarity:", JSON.stringify(rarityCount));
for (const c of captains) {
  console.log(`${c.id}: pool ${c.pool.length}  [${kindCount(c.pool)}]`);
}
