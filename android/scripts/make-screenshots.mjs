// Captures phone-sized screenshots of the real game UI (headless Chromium).
// Requires: local server running (scripts/serve-www.mjs), bundled playwright.
// Output: android/store-assets/screenshots/*.png (1080x1920)
//
// Run: node scripts/make-screenshots.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { demoState } from "./demo-state.mjs";

const require = createRequire(import.meta.url);
const playwrightPath =
  "C:/Users/danom/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "store-assets", "screenshots");
mkdirSync(outDir, { recursive: true });

const demo = JSON.stringify(demoState());
const URL = "http://127.0.0.1:5199/";

console.log("launching chromium…");
const browser = await chromium.launch();
console.log("chromium launched");
const page = await browser.newPage({
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 2,
});
console.log("page created");
await page.addInitScript((save) => {
  localStorage.setItem("piration_v3", save);
}, demo);

const shot = (name) => page.screenshot({ path: join(outDir, name) });
const click = async (sel, wait = 350) => {
  await page.click(sel, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(wait);
};

await page.goto(URL, { waitUntil: "load", timeout: 30000 });
console.log("page loaded");
await page.waitForSelector("#stats", { timeout: 15000 });
console.log("stats visible");
await page.waitForTimeout(500);

// 1) zones
await shot("1-voyage-zones.png");
console.log("shot 1");

// 2) encounter intro (skip caches)
await click('button[data-zone="trade"]', 600);
await click("#sailBtn", 900);
for (let i = 0; i < 4; i++) {
  const hasCache = await page.$("#claimCache");
  if (hasCache) {
    await click("#claimCache");
  } else {
    break;
  }
}
await page.waitForTimeout(400);
await shot("2-encounter.png");
console.log("shot 2");

// 3) combat
await click("#fightBtn");
await page.waitForTimeout(600);
await shot("3-combat.png");
console.log("shot 3");

// play one card to show the hand in action
const playable = await page.$("[data-hand]:not(.disabled)");
if (playable) {
  await click("[data-hand]:not(.disabled)", 120);
}
await shot("3b-combat-card.png");
console.log("shot 3b");

// 4) victory result
for (let i = 0; i < 30; i++) {
  if (await page.$("#collectBtn")) break;
  const card = await page.$("[data-hand]:not(.disabled)");
  if (card) {
    await click("[data-hand]:not(.disabled)", 100);
    continue;
  }
  const endTurn = await page.$("#endTurn");
  if (!endTurn) break;
  await click("#endTurn", 150);
}
if (await page.$("#collectBtn")) {
  await click("#collectBtn", 500);
  await shot("4-victory.png");
  console.log("shot 4");
  await click("#dockBtn");
}

// 5) endless combat
await click('button[data-tab="endless"]');
await click("#startEndless");
await page.waitForTimeout(600);
await shot("5-endless.png");
console.log("shot 5");

// 6) shipyard
await click('button[data-tab="shipyard"]');
await page.waitForTimeout(400);
await shot("6-shipyard.png");
console.log("shot 6");

// 7) captains
await click('button[data-tab="captains"]');
await page.waitForTimeout(400);
await shot("7-captains.png");
console.log("shot 7");

// 8) collection
await click('button[data-tab="collection"]');
await page.waitForTimeout(400);
await shot("8-collection.png");
console.log("shot 8");

await browser.close();
console.log("screenshots written to", outDir);
