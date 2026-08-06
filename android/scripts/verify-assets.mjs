import { createRequire } from "node:module";
import { demoState } from "./demo-state.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/danom/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
await page.addInitScript((save) => {
  localStorage.setItem("piration_v3", save);
}, JSON.stringify(demoState()));
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
const broken = [];
page.on("requestfailed", (r) => broken.push(r.url()));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "load" });
await page.waitForTimeout(1200);
const counts = {};
for (const tab of ["voyage", "shipyard", "captains", "collection"]) {
  await page.click(`button[data-tab="${tab}"]`);
  await page.waitForTimeout(350);
  counts[tab] = await page.evaluate(() => ({
    imgs: document.querySelectorAll("img").length,
    broken: [...document.querySelectorAll("img")].filter((i) => !i.complete || i.naturalWidth === 0).length,
  }));
}
await page.click('button[data-tab="voyage"]');
await page.click('button[data-zone="trade"]');
await page.click("#sailBtn");
await page.waitForTimeout(1200);
await page.click("#fightBtn");
await page.waitForTimeout(600);
counts.combat = await page.evaluate(() => ({
  imgs: document.querySelectorAll("img").length,
  broken: [...document.querySelectorAll("img")].filter((i) => !i.complete || i.naturalWidth === 0).length,
}));
console.log("img counts:", JSON.stringify(counts));
console.log("failed requests:", broken.length ? broken.slice(0, 8) : "none");
await browser.close();
