const STORAGE_KEY = "piration_android_v1";

const CONFIG = {
  // TEST FLAG — set false before Play Store release
  dev: { unlimitedEnergy: true },
  starting: { marks: 100, gold: 0, energy: 999, energyMax: 999, regenSec: 180 },
  questTiers: [
    {
      id: "skullduggery",
      name: "Skullduggery",
      desc: "Combat raids — XP, mats, chance at attack cards.",
      energy: 3,
      durationSec: 5,
      rewards: { marks: [12, 22], gold: [0, 2], xp: [15, 28], mats: 2, cardChance: 0.45, cardKinds: ["Attack", "Skill"] },
    },
    {
      id: "exploration",
      name: "Exploration",
      desc: "Islands — best mats, map scraps, utility cards.",
      energy: 2,
      durationSec: 4,
      rewards: { marks: [8, 14], gold: [0, 1], xp: [10, 18], mats: 3, cardChance: 0.35, cardKinds: ["Defend", "Skill", "Resource"] },
    },
    {
      id: "privateering",
      name: "Privateering",
      desc: "Trade routes — marks/gold, rare card chance.",
      energy: 4,
      durationSec: 6,
      rewards: { marks: [20, 40], gold: [1, 4], xp: [12, 20], mats: 1, cardChance: 0.55, cardKinds: ["Attack", "Defend", "Skill"] },
    },
  ],
  gauntlet: {
    energyCost: 5,
    playerMaxHp: 40,
    enemyBaseHp: 28,
    playerMaxAp: 3,
    handSize: 5,
    difficulties: [
      { id: "easy", name: "Easy", hpMult: 0.85, dmgMult: 0.8, rewardMult: 1 },
      { id: "normal", name: "Normal", hpMult: 1, dmgMult: 1, rewardMult: 1.4 },
      { id: "hard", name: "Hard", hpMult: 1.35, dmgMult: 1.25, rewardMult: 2 },
    ],
  },
  ships: [
    { id: "skiff", name: "Skiff", hull: 30, cannons: 1, slots: 2, cost: null },
    { id: "sloop", name: "Sloop", hull: 45, cannons: 2, slots: 3, cost: { Wood: 12, Cotton: 6, Iron: 4 } },
    { id: "brig", name: "Brig", hull: 65, cannons: 3, slots: 4, cost: { Wood: 24, Cotton: 12, Iron: 10, GoldNugget: 2 } },
    { id: "galleon", name: "Galleon", hull: 90, cannons: 4, slots: 5, cost: { Wood: 40, Cotton: 20, Iron: 18, GoldNugget: 5, CannonPart: 3 } },
  ],
  materials: ["Wood", "Cotton", "Iron", "GoldNugget", "CannonPart", "MapFragment", "Rum"],
  itemRecipes: [
    { id: "cannon_part", name: "Cannon Part", desc: "Iron for ship guns.", gives: { CannonPart: 1 }, cost: { Iron: 5, Marks: 40 } },
    { id: "map_kit", name: "Map Kit", desc: "Chart scraps.", gives: { MapFragment: 3 }, cost: { Wood: 2, Cotton: 2, Marks: 25 } },
    { id: "rum_barrel", name: "Rum Barrel", desc: "Recruit fuel.", gives: { Rum: 1 }, cost: { Cotton: 3, Marks: 30 } },
  ],
  recruitCost: { Marks: 75, Rum: 1 },
  enemyNames: ["Brine Raider", "Skull Sloop", "Coral Wraith", "Iron Privateer", "Dread Dinghy", "Siren Barge"],
  crewNames: ["Pegleg Pat", "Salty Rue", "Cannon Mia", "Mapmaker Oz", "Reef Raider", "Jonah Flint"],
};

let CARDS = { list: [], byId: {}, starter: [] };
let state = null;
let tab = "quests";
let toastTimer = null;

const $ = (sel) => document.querySelector(sel);
const content = () => $("#content");

function now() {
  return Math.floor(Date.now() / 1000);
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2400);
}

function defaultInv() {
  const inv = { Marks: CONFIG.starting.marks, Gold: CONFIG.starting.gold };
  for (const m of CONFIG.materials) inv[m] = 0;
  inv.Wood = 8;
  inv.Cotton = 4;
  inv.Iron = 2;
  return inv;
}

function defaultState() {
  return {
    version: 2,
    energy: CONFIG.starting.energy,
    energyMax: CONFIG.starting.energyMax,
    energyUpdatedAt: now(),
    inventory: defaultInv(),
    shipId: "skiff",
    crew: [{ name: "Cabin Hand", level: 1, xp: 0, xpToLevel: 50 }],
    // collection = owned card ids (can hold dupes as extra copies in deck pool)
    collection: CARDS.starter.slice(),
    deck: CARDS.starter.slice(),
    activeQuest: null,
    combat: null,
    stats: {
      questsDone: 0,
      gauntletsWon: 0,
      gauntletsLost: 0,
      damageDealt: 0,
      cardsFound: 0,
      xpGained: 0,
    },
  };
}

function energyCost(base) {
  return CONFIG.dev.unlimitedEnergy ? 0 : base;
}

function spendEnergy(amount) {
  if (CONFIG.dev.unlimitedEnergy) {
    state.energy = state.energyMax;
    return true;
  }
  regenEnergy();
  if (state.energy < amount) return false;
  state.energy -= amount;
  state.energyUpdatedAt = now();
  return true;
}

function pickCardDrop(kinds) {
  const pool = CARDS.list.filter((c) => !kinds || kinds.includes(c.kind));
  if (!pool.length) return null;
  return pool[randInt(0, pool.length - 1)];
}

function grantCard(card, reason) {
  if (!card) return null;
  state.collection.push(card.id);
  state.deck.push(card.id);
  state.stats.cardsFound = (state.stats.cardsFound || 0) + 1;
  return card;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function load() {
  try {
    // migrate v1
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem("pn_android_v2") || localStorage.getItem("pn_android_v1");
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || !s.version) return defaultState();
    if (!s.deck?.length) s.deck = CARDS.starter.slice();
    if (!s.collection?.length) s.collection = s.deck.slice();
    if (!s.inventory) s.inventory = defaultInv();
    if (!s.stats) s.stats = {};
    s.stats.cardsFound = s.stats.cardsFound || 0;
    s.stats.xpGained = s.stats.xpGained || 0;
    if (CONFIG.dev.unlimitedEnergy) {
      s.energy = CONFIG.starting.energyMax;
      s.energyMax = CONFIG.starting.energyMax;
    }
    return s;
  } catch {
    return defaultState();
  }
}

function regenEnergy() {
  if (CONFIG.dev.unlimitedEnergy) {
    state.energy = state.energyMax;
    state.energyUpdatedAt = now();
    return;
  }
  const elapsed = Math.max(0, now() - (state.energyUpdatedAt || now()));
  const gain = Math.floor(elapsed / CONFIG.starting.regenSec);
  if (gain > 0 && state.energy < state.energyMax) {
    state.energy = Math.min(state.energyMax, state.energy + gain);
    state.energyUpdatedAt += gain * CONFIG.starting.regenSec;
  } else if (state.energy >= state.energyMax) {
    state.energyUpdatedAt = now();
  }
}

function shipById(id) {
  return CONFIG.ships.find((s) => s.id === id);
}

function canPay(cost) {
  for (const [k, v] of Object.entries(cost || {})) {
    if ((state.inventory[k] || 0) < v) return k;
  }
  return null;
}

function pay(cost) {
  for (const [k, v] of Object.entries(cost || {})) {
    state.inventory[k] = (state.inventory[k] || 0) - v;
  }
}

function grant(gain) {
  for (const [k, v] of Object.entries(gain || {})) {
    state.inventory[k] = (state.inventory[k] || 0) + v;
  }
}

function addCrewXp(amount) {
  const p = state.crew[0];
  if (!p || amount <= 0) return { levels: 0 };
  p.xp += amount;
  state.stats.xpGained = (state.stats.xpGained || 0) + amount;
  let levels = 0;
  while (p.xp >= p.xpToLevel) {
    p.xp -= p.xpToLevel;
    p.level += 1;
    levels += 1;
    p.xpToLevel = Math.floor(p.xpToLevel * 1.35);
  }
  return { levels };
}

function fmtCost(cost) {
  return Object.entries(cost || {})
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
}

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

function drawCards(combat, n) {
  for (let i = 0; i < n; i++) {
    if (!combat.drawPile.length) {
      if (!combat.discard.length) break;
      combat.drawPile = shuffle(combat.discard);
      combat.discard = [];
    }
    if (combat.drawPile.length) combat.hand.push(combat.drawPile.shift());
  }
}

function checkCombatEnd() {
  const c = state.combat;
  if (!c || c.over) return;
  if (c.enemyHp <= 0) {
    c.over = true;
    c.won = true;
    c.enemyHp = 0;
    const mult = c.rewardMult || 1;
    const marks = Math.floor(35 * mult);
    const gold = Math.floor(3 * mult);
    const iron = Math.floor(2 * mult);
    const xp = Math.floor(30 * mult);
    state.inventory.Marks += marks;
    state.inventory.Gold += gold;
    state.inventory.Iron = (state.inventory.Iron || 0) + iron;
    const { levels } = addCrewXp(xp);
    // always drop 1 card on win; hard can drop 2
    const drops = [];
    const n = c.difficulty === "hard" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const card = grantCard(pickCardDrop(null));
      if (card) drops.push(card.name);
    }
    state.stats.gauntletsWon += 1;
    const dropTxt = drops.length ? ` Cards: ${drops.join(", ")}` : "";
    c.log.push(`Victory! +${marks} Marks +${gold} Gold +${xp} XP +${iron} Iron.${dropTxt}`);
    toast(`Win! +${xp} XP` + (levels ? ` LEVEL UP` : "") + (drops[0] ? ` · ${drops[0]}` : ""));
  } else if (c.playerHp <= 0) {
    c.over = true;
    c.won = false;
    c.playerHp = 0;
    state.stats.gauntletsLost += 1;
    // consolation: tiny XP + small chance of defend card
    addCrewXp(5);
    if (Math.random() < 0.2) {
      const card = grantCard(pickCardDrop(["Defend", "Resource"]));
      if (card) c.log.push(`Salvaged card: ${card.name}`);
    }
    c.log.push("Your ship was boarded… defeat. (+5 XP)");
    toast("Defeated at sea (+5 XP)");
  }
}

/* ---------- actions ---------- */

function startQuest(tierId) {
  if (state.activeQuest) return toast("Quest already running");
  if (state.combat) return toast("Finish combat first");
  const tier = CONFIG.questTiers.find((t) => t.id === tierId);
  if (!tier) return;
  if (!spendEnergy(tier.energy)) return toast("Not enough energy");
  const t = now();
  state.activeQuest = {
    tierId: tier.id,
    name: tier.name,
    startedAt: t,
    endsAt: t + tier.durationSec,
    seed: randInt(1, 1e9),
  };
  toast("Set sail: " + tier.name);
  save();
  render();
}

function collectQuest() {
  const q = state.activeQuest;
  if (!q) return;
  if (now() < q.endsAt) return toast("Still at sea…");
  const tier = CONFIG.questTiers.find((t) => t.id === q.tierId);
  let s = q.seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const marks = ri(...tier.rewards.marks);
  const gold = ri(...tier.rewards.gold);
  const xp = ri(...tier.rewards.xp);
  state.inventory.Marks += marks;
  state.inventory.Gold += gold;
  const matsGot = [];
  const pool = CONFIG.materials;
  for (let i = 0; i < tier.rewards.mats; i++) {
    let m = pool[ri(0, pool.length - 1)];
    if ((m === "CannonPart" || m === "Rum") && rnd() > 0.35) m = "Wood";
    state.inventory[m] = (state.inventory[m] || 0) + 1;
    matsGot.push(m);
  }
  const { levels } = addCrewXp(xp);
  let cardMsg = "";
  if (rnd() < (tier.rewards.cardChance || 0)) {
    const card = grantCard(pickCardDrop(tier.rewards.cardKinds));
    if (card) cardMsg = ` · CARD: ${card.name}`;
  }
  state.stats.questsDone += 1;
  state.activeQuest = null;
  const lvlMsg = levels ? ` · LEVEL UP x${levels}` : "";
  toast(`+${marks} Marks · +${gold} Gold · +${xp} XP${lvlMsg} · ${matsGot.join(", ")}${cardMsg}`);
  save();
  render();
}

function startGauntlet(diffId) {
  if (state.combat) return toast("Already in combat");
  if (state.activeQuest) return toast("Finish or wait out your quest");
  const diff = CONFIG.gauntlet.difficulties.find((d) => d.id === diffId);
  if (!diff) return;
  if (!spendEnergy(CONFIG.gauntlet.energyCost)) return toast("Not enough energy");

  const ship = shipById(state.shipId) || shipById("skiff");
  const deck = shuffle(state.deck.slice());
  const hand = [];
  for (let i = 0; i < CONFIG.gauntlet.handSize && deck.length; i++) hand.push(deck.shift());
  const enemyHp = Math.floor(CONFIG.gauntlet.enemyBaseHp * diff.hpMult + ((state.crew[0]?.level || 1) - 1) * 2);
  const enemyName = CONFIG.enemyNames[randInt(0, CONFIG.enemyNames.length - 1)];

  state.combat = {
    difficulty: diff.id,
    rewardMult: diff.rewardMult,
    turn: 1,
    playerHp: CONFIG.gauntlet.playerMaxHp + Math.floor(ship.hull / 5),
    playerMaxHp: CONFIG.gauntlet.playerMaxHp + Math.floor(ship.hull / 5),
    playerShield: 0,
    playerAp: CONFIG.gauntlet.playerMaxAp + Math.max(0, ship.cannons - 1),
    playerMaxAp: CONFIG.gauntlet.playerMaxAp + Math.max(0, ship.cannons - 1),
    enemyHp,
    enemyMaxHp: enemyHp,
    enemyShield: 0,
    enemyName,
    enemyDmg: Math.floor(5 * diff.dmgMult),
    hand,
    drawPile: deck,
    discard: [],
    log: [`Engaged ${enemyName}!`],
    over: false,
    won: false,
  };
  save();
  render();
}

function playCard(handIndex) {
  const c = state.combat;
  if (!c || c.over) return;
  const cardId = c.hand[handIndex];
  const card = CARDS.byId[cardId];
  if (!card) return;
  if (c.playerAp < card.ap) return toast("Not enough AP");
  c.playerAp -= card.ap;
  c.hand.splice(handIndex, 1);
  c.discard.push(cardId);

  if (card.damage > 0) {
    [c.enemyHp, c.enemyShield] = applyDamage(c.enemyHp, c.enemyShield, card.damage);
    state.stats.damageDealt += card.damage;
    c.log.push(`${card.name} hits for ${card.damage}`);
  }
  if (card.shield > 0) {
    c.playerShield += card.shield;
    c.log.push(`${card.name} +${card.shield} shield`);
  }
  if (card.heal > 0) {
    c.playerHp = Math.min(c.playerMaxHp, c.playerHp + card.heal);
    c.log.push(`${card.name} repairs ${card.heal}`);
  }
  if (card.draw > 0) {
    drawCards(c, card.draw);
    c.log.push(`${card.name}: draw ${card.draw}`);
  }
  if (card.kind === "Resource") {
    c.playerAp = Math.min(c.playerMaxAp + 1, c.playerAp + 1);
    c.log.push(`${card.name} grants +1 AP`);
  }
  checkCombatEnd();
  save();
  render();
}

function endTurn() {
  const c = state.combat;
  if (!c) return;
  if (c.over) {
    state.combat = null;
    save();
    render();
    return;
  }
  const dmg = c.enemyDmg + Math.floor(c.turn / 3);
  [c.playerHp, c.playerShield] = applyDamage(c.playerHp, c.playerShield, dmg);
  c.log.push(`${c.enemyName} fires for ${dmg}`);
  checkCombatEnd();
  if (!c.over) {
    c.turn += 1;
    c.playerAp = c.playerMaxAp;
    c.playerShield = Math.max(0, Math.floor(c.playerShield * 0.5));
    c.discard.push(...c.hand);
    c.hand = [];
    drawCards(c, CONFIG.gauntlet.handSize);
    c.log.push(`--- Turn ${c.turn} ---`);
  }
  save();
  render();
}

function craftShip(shipId) {
  if (state.shipId === shipId) return toast("Already own this hull");
  const order = ["skiff", "sloop", "brig", "galleon"];
  const cur = order.indexOf(state.shipId);
  const want = order.indexOf(shipId);
  if (want !== cur + 1) return toast("Craft the next ship in line");
  const ship = shipById(shipId);
  const miss = canPay(ship.cost);
  if (miss) return toast("Need more " + miss);
  pay(ship.cost);
  state.shipId = shipId;
  toast("Launched the " + ship.name + "!");
  save();
  render();
}

function craftItem(id) {
  const r = CONFIG.itemRecipes.find((x) => x.id === id);
  if (!r) return;
  const miss = canPay(r.cost);
  if (miss) return toast("Need more " + miss);
  pay(r.cost);
  grant(r.gives);
  toast("Crafted " + r.name);
  save();
  render();
}

function recruit() {
  const ship = shipById(state.shipId);
  if (state.crew.length >= ship.slots) return toast("Ship crew full — upgrade hull");
  const miss = canPay(CONFIG.recruitCost);
  if (miss) return toast("Need more " + miss);
  pay(CONFIG.recruitCost);
  const name = CONFIG.crewNames[randInt(0, CONFIG.crewNames.length - 1)];
  state.crew.push({ name, level: 1, xp: 0, xpToLevel: 50 });
  toast(name + " joined the crew!");
  save();
  render();
}

function resetSave() {
  if (!confirm("Wipe local save and start over?")) return;
  state = defaultState();
  save();
  toast("New captain");
  render();
}

/* ---------- UI ---------- */

function refreshStats() {
  regenEnergy();
  const inv = state.inventory;
  const crew = state.crew[0];
  const uniq = new Set(state.collection || []).size;
  const energyLabel = CONFIG.dev.unlimitedEnergy
    ? `Energy ∞`
    : `Energy ${state.energy}/${state.energyMax}`;
  $("#stats").innerHTML = `
    <strong>${energyLabel}</strong>
    · <strong>Marks</strong> ${inv.Marks}
    · <strong>Gold</strong> ${inv.Gold}
    · <strong>Ship</strong> ${state.shipId}
    · <strong>${crew?.name || "-"}</strong> Lv${crew?.level || 1} (${crew?.xp || 0}/${crew?.xpToLevel || 50} XP)
    · <strong>Cards</strong> ${uniq} unique / ${(state.collection || []).length} owned
  `;
}

function renderQuests() {
  let html = `<div class="section"><h2>Quests</h2>
    <p class="muted">Spend energy (test: unlimited) → wait → collect <strong>XP</strong>, <strong>resources</strong>, chance of <strong>cards</strong>.</p>`;
  if (CONFIG.dev.unlimitedEnergy) {
    html += `<p class="pill">DEV: unlimited energy ON</p>`;
  }
  if (state.activeQuest) {
    const left = Math.max(0, state.activeQuest.endsAt - now());
    html += `<p>Active: <strong>${state.activeQuest.name}</strong> — ${left}s remaining</p>`;
    html += `<button class="btn" id="collectBtn" ${left > 0 ? "disabled" : ""}>${left > 0 ? "At sea…" : "Collect loot"}</button>`;
  } else {
    for (const tier of CONFIG.questTiers) {
      const cost = energyCost(tier.energy);
      html += `<div class="row">
        <p><strong>${tier.name}</strong> <span class="pill">${cost === 0 ? "0 Energy" : cost + " Energy"}</span>
        <span class="pill">card ${(tier.rewards.cardChance * 100) | 0}%</span><br/>
        <span class="muted">${tier.desc}</span></p>
        <button class="btn" data-quest="${tier.id}">Sail</button>
      </div>`;
    }
  }
  html += `</div>
  <div class="section"><h2>Offline loop</h2>
    <p class="muted">1) Quest for mats/XP/cards → 2) Craft ship/items → 3) Gauntlet for bigger XP + guaranteed card drops → 4) Recruit crew → stronger runs. Everything saves in localStorage. No network.</p>
  </div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-quest]").forEach((b) =>
    b.addEventListener("click", () => startQuest(b.dataset.quest))
  );
  $("#collectBtn")?.addEventListener("click", collectQuest);
}

function renderGauntlet() {
  const c = state.combat;
  if (!c) {
    let html = `<div class="section"><h2>Gauntlet</h2>
      <p class="muted">Card ship battles. Cost: ${CONFIG.gauntlet.energyCost} Energy.</p>`;
    for (const d of CONFIG.gauntlet.difficulties) {
      html += `<button class="btn" style="margin:4px 6px 4px 0" data-diff="${d.id}">${d.name}</button>`;
    }
    html += `</div>`;
    content().innerHTML = html;
    content().querySelectorAll("[data-diff]").forEach((b) =>
      b.addEventListener("click", () => startGauntlet(b.dataset.diff))
    );
    return;
  }

  const php = Math.max(0, Math.round((c.playerHp / c.playerMaxHp) * 100));
  const ehp = Math.max(0, Math.round((c.enemyHp / c.enemyMaxHp) * 100));
  let html = `<div class="section"><h2>Battle vs ${c.enemyName}</h2>
    <div>You HP ${c.playerHp} · Shield ${c.playerShield} · AP ${c.playerAp}/${c.playerMaxAp}</div>
    <div class="hpbar"><i style="width:${php}%"></i></div>
    <div>Enemy HP ${c.enemyHp} · Shield ${c.enemyShield} · Turn ${c.turn}</div>
    <div class="hpbar enemy"><i style="width:${ehp}%"></i></div>`;

  if (c.over) {
    html += `<p class="${c.won ? "victory" : "defeat"}">${c.won ? "VICTORY" : "DEFEAT"}</p>
      <button class="btn" id="leaveBattle">Leave battle</button>`;
  } else {
    html += `<div class="hand">`;
    c.hand.forEach((id, i) => {
      const card = CARDS.byId[id];
      const dis = !card || c.playerAp < card.ap;
      html += `<button class="card ${dis ? "disabled" : ""}" data-hand="${i}" ${dis ? "disabled" : ""}>
        <strong>${card?.name || id}</strong>
        [${card?.kind}] AP${card?.ap}<br/>
        DMG ${card?.damage} · SH ${card?.shield}<br/>
        HEAL ${card?.heal}${card?.draw ? ` · DRAW ${card.draw}` : ""}
      </button>`;
    });
    html += `</div>
      <div class="row" style="margin-top:10px">
        <button class="btn danger" id="endTurn">End turn</button>
      </div>`;
  }
  html += `</div>
    <div class="section"><h2>Log</h2>
      <div class="log">${(c.log || []).slice(-10).join("\n")}</div>
    </div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-hand]").forEach((b) =>
    b.addEventListener("click", () => playCard(+b.dataset.hand))
  );
  $("#endTurn")?.addEventListener("click", endTurn);
  $("#leaveBattle")?.addEventListener("click", endTurn);
}

function renderCraft() {
  const inv = state.inventory;
  const parts = Object.entries(inv)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`);

  let html = `<div class="section"><h2>Cargo</h2>
    <p class="muted">${parts.length ? parts.join(" · ") : "Empty hold"}</p></div>
    <div class="section"><h2>Shipwright</h2>
    <p>Current hull: <strong>${state.shipId}</strong></p>`;

  for (const ship of CONFIG.ships) {
    if (ship.id === "skiff") continue;
    html += `<div class="row">
      <p><strong>${ship.name}</strong><br/><span class="muted">${fmtCost(ship.cost)}</span></p>
      <button class="btn" data-ship="${ship.id}">Craft</button>
    </div>`;
  }
  html += `</div><div class="section"><h2>Workshop</h2>`;
  for (const r of CONFIG.itemRecipes) {
    html += `<div class="row">
      <p><strong>${r.name}</strong> — ${r.desc}<br/><span class="muted">${fmtCost(r.cost)}</span></p>
      <button class="btn" data-item="${r.id}">Craft</button>
    </div>`;
  }
  html += `</div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-ship]").forEach((b) =>
    b.addEventListener("click", () => craftShip(b.dataset.ship))
  );
  content().querySelectorAll("[data-item]").forEach((b) =>
    b.addEventListener("click", () => craftItem(b.dataset.item))
  );
}

function renderCrew() {
  const ship = shipById(state.shipId);
  const counts = {};
  for (const id of state.collection || []) counts[id] = (counts[id] || 0) + 1;
  const owned = Object.entries(counts)
    .map(([id, n]) => {
      const c = CARDS.byId[id];
      return { id, n, name: c?.name || id, kind: c?.kind || "?" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let html = `<div class="section"><h2>Crew</h2>`;
  for (const p of state.crew) {
    html += `<p><strong>${p.name}</strong> — Lv ${p.level} · ${p.xp}/${p.xpToLevel} XP</p>`;
  }
  html += `<p class="muted">Berths: ${state.crew.length} / ${ship.slots}</p>
    <button class="btn" id="recruit">Recruit (75 Marks + 1 Rum)</button>
  </div>
  <div class="section"><h2>Card collection</h2>
    <p class="muted">${owned.length} unique · ${(state.collection || []).length} total · deck ${state.deck.length} (all owned copies sail)</p>
    <div class="hand">`;
  for (const o of owned.slice(0, 40)) {
    html += `<div class="card"><strong>${o.name}</strong>×${o.n}<br/>[${o.kind}]</div>`;
  }
  if (owned.length > 40) html += `<p class="muted">+${owned.length - 40} more…</p>`;
  html += `</div></div>
  <div class="section"><h2>Ledger</h2>
    <p class="muted">Quests ${state.stats.questsDone} · Gauntlet W/L ${state.stats.gauntletsWon}/${state.stats.gauntletsLost}</p>
    <p class="muted">XP gained ${state.stats.xpGained || 0} · Cards found ${state.stats.cardsFound || 0} · Dmg ${state.stats.damageDealt}</p>
    <button class="btn ghost" id="reset">Reset save</button>
  </div>`;
  content().innerHTML = html;
  $("#recruit").addEventListener("click", recruit);
  $("#reset").addEventListener("click", resetSave);
}

function render() {
  refreshStats();
  if (state.combat && tab !== "gauntlet") {
    // stay if user switched; auto-jump only when combat starts from quests is optional
  }
  if (tab === "quests") renderQuests();
  else if (tab === "gauntlet") renderGauntlet();
  else if (tab === "craft") renderCraft();
  else renderCrew();
}

function bindTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    tab = btn.dataset.tab;
    $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
}

async function boot() {
  const res = await fetch("./data/cards.json");
  const data = await res.json();
  CARDS.list = data.cards;
  CARDS.byId = Object.fromEntries(data.cards.map((c) => [c.id, c]));
  const starter = [...(data.starter_ids || [])];
  const extra = [];
  for (const c of data.cards) {
    if (starter.includes(c.id)) continue;
    if (c.kind === "Attack") extra.push(c.id);
    if (starter.length + extra.length >= 12) break;
  }
  CARDS.starter = starter.concat(extra);

  state = load();
  bindTabs();
  render();
  setInterval(() => {
    if (tab === "quests" && state.activeQuest) render();
    else refreshStats();
    save();
  }, 1000);
}

boot().catch((err) => {
  console.error(err);
  $("#stats").textContent = "Failed to load cards.json";
});
