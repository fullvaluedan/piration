// Captures 16:9 (1920x1080) screenshots of the real game: the 3D sailing
// world plus overlay panels. Run with scripts/serve-www.mjs on port 5199.

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { demoState } from "./demo-state.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/danom/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "store-assets", "screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
});
await page.addInitScript((save) => {
  localStorage.setItem("piration_v3", save);
}, JSON.stringify(demoState()));

const shot = (name) => page.screenshot({ path: join(outDir, name) });
const click = async (sel, wait = 400) => {
  await page.click(sel, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(wait);
};

await page.goto("http://127.0.0.1:5199/", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(5000); // world + models
console.log("world shot");
await shot("1-world-sailing.png");

await click("#menuBtn");
await click('button[data-tab="shipyard"]');
await shot("2-shipyard.png");

await click('button[data-tab="voyage"]');
await click('button[data-zone="trade"]');
await click("#sailBtn", 1100);
await click("#fightBtn");
await page.waitForTimeout(700);
await shot("3-combat.png");
for (let i = 0; i < 30; i++) {
  if (await page.$("#collectBtn")) break;
  const card = await page.$("[data-hand]:not(.disabled)");
  if (card) {
    await click("[data-hand]:not(.disabled)", 100);
    continue;
  }
  if (!(await page.$("#endTurn"))) break;
  await click("#endTurn", 150);
}
await click("#collectBtn", 500);
await click("#dockBtn", 500);

await click("#menuBtn");
await click('button[data-tab="captains"]');
await shot("4-captains.png");
await click('button[data-tab="collection"]');
await shot("5-collection.png");
await click('button[data-tab="endless"]');
await shot("6-endless.png");

await browser.close();
console.log("screenshots written to", outDir);
