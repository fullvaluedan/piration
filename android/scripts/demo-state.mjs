import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "../www/js/core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsData = JSON.parse(readFileSync(join(root, "www/data/cards.json"), "utf8"));
const game = JSON.parse(readFileSync(join(root, "www/data/game.json"), "utf8"));
export const cards = {
  list: cardsData.cards,
  byId: Object.fromEntries(cardsData.cards.map((c) => [c.id, c])),
  game,
};

export function demoState() {
  const s = core.newGame(cards, game);
  s.sawHelp = true;
  s.hints = { voyage: true, shipyard: true, endless: true, captains: true, collection: true };
  s.character.level = 9;
  s.character.xp = 0;
  s.character.xpToNext = core.xpNeeded(game, 9);
  s.shipId = "brig";
  s.shipDura = 75;
  s.inventory = {
    Marks: 1240,
    Gold: 45,
    Wood: 38,
    Cotton: 21,
    Iron: 16,
    GoldNugget: 3,
    CannonPart: 2,
    MapFragment: 1,
    Rum: 2,
  };
  s.crew = [{ name: "Pegleg Pat" }, { name: "Salty Rue" }, { name: "Cannon Mia" }];
  const rarity = game.cardRarity;
  const pick = (pred, n) => cards.list.filter(pred).slice(0, n).map((c) => c.id);
  const starters = cards.list.filter((c) =>
    ["cannon_blast", "basic_attack_plan", "basic_relief", "broadside", "musket_shot", "patch_work", "careful_aim", "evasive_maneuvers"].includes(c.id),
  );
  const pool = starters.map((c) => c.id);
  pool.push(...pick((c) => rarity[c.id] === "common" && !pool.includes(c.id), 14));
  pool.push(...pick((c) => rarity[c.id] === "rare" && !pool.includes(c.id), 8));
  pool.push(...pick((c) => rarity[c.id] === "epic" && !pool.includes(c.id), 6));
  pool.push(...pick((c) => rarity[c.id] === "legendary" && !pool.includes(c.id), 3));
  s.collection = pool.concat(pool.slice(0, 4));
  s.enhancements = { cannon_blast: 2, broadside: 1, basic_attack_plan: 1 };
  s.stats = {
    voyages: 22,
    fights: 34,
    wins: 30,
    losses: 4,
    kills: 64,
    eliteKills: 4,
    bossKills: 1,
    endlessKills: 21,
    endlessBestWave: 12,
    endlessBestScore: 1450,
    endlessRuns: 3,
    resourcesCollected: 310,
    cardsFound: 41,
    xpGained: 4120,
    marksEarned: 9340,
    bribeCount: 2,
    cacheCount: 6,
  };
  s.leaderboard = [
    { score: 1450, wave: 12, kills: 21, captain: "morgaine", date: Date.now() - 86400000 },
    { score: 980, wave: 9, kills: 15, captain: "morgaine", date: Date.now() - 172800000 },
    { score: 620, wave: 7, kills: 11, captain: "morgaine", date: Date.now() - 259200000 },
  ];
  return s;
}
