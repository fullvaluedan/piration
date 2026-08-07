import { createRequire } from "node:module";
import { demoState } from "./demo-state.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/danom/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
page.on("requestfailed", (r) => console.log("REQFAIL:", r.url().slice(0, 120), r.failure()?.errorText));
await page.addInitScript((save) => localStorage.setItem("piration_v3", save), JSON.stringify(demoState()));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => ({
  appDisplay: document.getElementById("app")?.style.display,
  bodyText: document.body.innerText.slice(0, 300),
  canvas: !!document.querySelector("#worldCanvas"),
  hud: !!document.getElementById("menuBtn"),
}));
console.log("STATE:", JSON.stringify(info));
await page.click("#menuBtn", { timeout: 5000 }).catch((e) => console.log("menu click fail:", e.message.slice(0, 120)));
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({
  appDisplay: document.getElementById("app")?.style.display,
  contentLen: document.getElementById("content")?.innerText.length,
}));
console.log("AFTER:", JSON.stringify(after));
await browser.close();
