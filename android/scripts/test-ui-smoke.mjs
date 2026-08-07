// UI smoke test: boots www/js/ui.js in Node with a stubbed DOM and clicks
// through every screen (help, voyage, combat, endless, shipyard, captains,
// collection). Catches render/handler errors without a browser.
//
// Run: node scripts/test-ui-smoke.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsJson = readFileSync(join(root, "www/data/cards.json"), "utf8");
const gameJson = readFileSync(join(root, "www/data/game.json"), "utf8");
const manifestJson = readFileSync(join(root, "www/assets/manifest.json"), "utf8");

// ---------- stubs ----------
const elements = new Map();
const tabHandlers = {};

function makeEl(id) {
  const handlers = {};
  const o = {
    id,
    innerHTML: "",
    textContent: "",
    disabled: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) {
      handlers[type] = fn;
    },
    click(type = "click") {
      if (handlers[type]) handlers[type]({ target: this });
    },
    closest() {
      return null;
    },
    querySelectorAll: () => [],
  };
  o._handlers = handlers;
  return o;
}

function el(id) {
  if (!elements.has(id)) elements.set(id, makeEl(id));
  return elements.get(id);
}

const PRESETS = {
  zone: ["shallows", "trade", "opensea", "reefs", "triangle", "abyss"],
  hand: ["0", "1", "2", "3", "4", "5", "6", "7"],
  ship: ["sloop", "brig", "galleon", "dreadnought"],
  recipe: ["cannon_part", "map_kit", "rum_barrel"],
  enhance: ["cannon_blast", "broadside", "musket_shot"],
  unlock: ["captainbanshee", "resourcetrader", "rustbeard", "captainhightide", "royalnavyadmiral", "commodore", "admiralironsides"],
  switch: ["captainbanshee", "resourcetrader", "rustbeard", "captainhightide", "royalnavyadmiral", "commodore", "admiralironsides"],
};

function fakeButtons(sel) {
  const m = sel.match(/\[data-(\w+)\]/);
  if (!m) return [];
  const attr = m[1];
  const vals = PRESETS[attr] || ["x"];
  return vals.map((v) => {
    const b = el(`btn_${attr}_${v}`);
    b.dataset[attr] = v;
    return b;
  });
}

globalThis.document = {
  body: { classList: { toggle() {} } },
  querySelector: (sel) => el(sel.replace(/^#/, "")),
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  createElement: (tag) => {
    const b = makeEl("dyn_" + tag + "_" + Math.random().toString(36).slice(2, 8));
    b.tagName = String(tag).toUpperCase();
    return b;
  },
};
el("content").querySelectorAll = (sel) => fakeButtons(sel);
globalThis.window = globalThis;
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.confirm = () => true;
globalThis.prompt = () => null;
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("cards.json")) return { json: async () => JSON.parse(cardsJson) };
  if (String(url).includes("game.json")) return { json: async () => JSON.parse(gameJson) };
  if (String(url).includes("manifest.json")) return { json: async () => JSON.parse(manifestJson) };
  throw new Error("unexpected fetch " + url);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failures += 1;
}
function html() {
  return el("content").innerHTML || "";
}

function clickTab(tab) {
  const tabEl = el("tabs");
  const handler = tabEl.addEventListener;
  // capture the real handler by re-invoking registration? Instead dispatch:
  const fakeBtn = { dataset: { tab }, classList: { toggle() {} } };
  tabEl._click({ target: { closest: (s) => (s.includes("data-tab") ? fakeBtn : null) } });
}

// ui.js registers the tabs listener with addEventListener; intercept it.
const realAdd = el("tabs").addEventListener.bind(el("tabs"));
el("tabs").addEventListener = function (type, fn) {
  this._click = fn;
  realAdd(type, fn);
};

// ---------- run ----------
await import("../www/js/ui.js");
await sleep(200);

check("boot rendered stats", html().length > 0 || el("stats").innerHTML.length > 0);
check("help screen shown", html().includes("How to play"));
el("helpOk").click();
check("voyage screen after help", html().includes("Set Sail") || html().includes("Sunny Shallows"));

// sail a voyage to combat
const zoneBtn = el("btn_zone_shallows");
zoneBtn.click();
el("sailBtn").click();
await sleep(900);
if (html().includes("Claim cache")) {
  el("claimCache").click();
} else if (html().includes("Fight")) {
  el("fightBtn").click();
}

let guard = 0;
while (!html().includes("Collect loot") && !html().includes("Return to port") && guard++ < 40) {
  if (html().includes("End turn")) {
    // play one affordable card then end turn
    const handBtn = el("btn_hand_0");
    if (!handBtn.disabled) handBtn.click();
    el("endTurn").click();
  } else if (html().includes("Collect loot") || html().includes("Continue")) {
    el("collectBtn").click();
  } else if (html().includes("Fight")) {
    el("fightBtn").click();
  } else if (html().includes("Claim cache")) {
    el("claimCache").click();
  } else if (html().includes("Hunt the boss")) {
    el("skipBoss").click();
  } else {
    console.log("VOYAGE STUCK AT:", html().slice(0, 300));
    break;
  }
}
check("voyage combat finished or resolvable", html().includes("Collect loot") || html().includes("Return to port") || html().includes("Victory") || html().includes("Defeated"));
el("collectBtn")?.click();
el("dockBtn")?.click();
el("continueBtn")?.click();
check("back at port after voyage", html().includes("High Seas") || !html().includes("End turn"));

// endless flow
clickTab("endless");
check("endless menu", html().includes("Endless Mode"));
el("startEndless").click();
guard = 0;
while (guard++ < 80 && !html().includes("Run complete")) {
  if (html().includes("End turn")) {
    el("btn_hand_0").click();
    el("endTurn").click();
  } else if (html().includes("Collect loot") || html().includes("Continue")) {
    el("collectBtn").click();
  } else if (html().includes("Next wave")) {
    el("nextWave").click();
  } else if (html().includes("Retire with loot")) {
    el("retireBtn").click();
  } else {
    console.log("ENDLESS STUCK AT:", html().slice(0, 300));
    break;
  }
}
check("endless run completed or in progress", html().includes("Run complete") || html().includes("Endless Mode") || html().includes("End turn"));
el("backEndless")?.click();

// remaining tabs render
for (const [tab, needle] of [
  ["shipyard", "Shipwright"],
  ["captains", "Captain"],
  ["collection", "Enhance cards"],
  ["voyage", "High Seas"],
]) {
  clickTab(tab);
  check(`${tab} tab renders`, html().includes(needle));
}

// shipyard interactions
clickTab("shipyard");
el("recruitBtn")?.click();
el("btn_recipe_cannon_part")?.click();
el("btn_ship_sloop")?.click();
check("shipyard interactions ran", html().includes("Cargo"));

// captains interactions
clickTab("captains");
el("btn_unlock_captainbanshee")?.click();
el("btn_switch_captainbanshee")?.click();
check("captains interactions ran", html().includes("Captain"));

// collection interactions
clickTab("collection");
el("btn_enhance_cannon_blast")?.click();
check("collection interactions ran", html().includes("Enhance cards"));

// help toggle
el("helpBtn").click();
check("help reopens", html().includes("How to play"));
el("helpOk").click();

console.log(failures ? `\n${failures} failures` : "\nAll UI smoke tests passed");
process.exit(failures ? 1 : 0);
