import { createRequire } from "node:module";
import { demoState } from "./demo-state.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/danom/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const bad = [];
page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
page.on("pageerror", (e) => bad.push("PAGEERROR: " + String(e).slice(0, 180)));
page.on("requestfailed", (r) => bad.push("REQFAIL: " + r.url().slice(0, 90)));

await page.addInitScript((s) => localStorage.setItem("piration_v3", s), JSON.stringify(demoState()));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(6000);

const step = (name) => console.log("STEP:", name);
step("world boot");
await page.evaluate(() => {
  const c = document.getElementById("worldCanvas");
  const gl = c && (c.getContext("webgl2") || c.getContext("webgl"));
  return gl;
});

// panel + deck builder
await page.click("#menuBtn", { timeout: 5000 });
await page.click('button[data-tab="collection"]', { timeout: 4000 });
await page.waitForTimeout(500);
step("deck auto+equip");
await page.click("#deckAuto", { timeout: 4000 });
await page.waitForTimeout(200);
const deckInfo = await page.evaluate(() => ({
  slots: document.querySelectorAll(".deck-slot").length,
  sigs: document.body.innerText.includes("signature"),
}));
console.log("DECK:", JSON.stringify(deckInfo));
await page.click("#deckEquip", { timeout: 4000 });
await page.waitForTimeout(300);

// combat via panel voyage
await page.click('button[data-tab="voyage"]', { timeout: 4000 });
await page.click('button[data-zone="trade"]', { timeout: 4000 });
await page.click("#sailBtn", { timeout: 4000 });
await page.waitForTimeout(1200);
for (let i = 0; i < 6; i++) {
  if (await page.$("#fightBtn")) {
    await page.click("#fightBtn", { timeout: 4000 });
    break;
  }
  if (await page.$("#claimCache")) {
    await page.click("#claimCache", { timeout: 4000 });
    await page.waitForTimeout(300);
    continue;
  }
  if (await page.$("#skipBoss")) {
    await page.click("#skipBoss", { timeout: 4000 });
    await page.waitForTimeout(300);
    continue;
  }
  break;
}
await page.waitForTimeout(600);
step("combat");
for (let i = 0; i < 80; i++) {
  if (await page.$("#collectBtn")) break;
  const card = await page.$("[data-hand]:not(.disabled)");
  if (card) {
    await page.click("[data-hand]:not(.disabled)", { timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(80);
    continue;
  }
  if (!(await page.$("#endTurn"))) break;
  await page.click("#endTurn", { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(120);
}
const combatEnded = await page.evaluate(() => !!document.getElementById("collectBtn"));
console.log("COMBAT ENDED:", combatEnded);
if (!combatEnded) {
  await page.click("#retreatBtn", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click("#modalActions .btn:last-child", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.click("#dockBtn", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
}
await page.click("#collectBtn", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(400);
await page.click("#dockBtn", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(400);

// island builder: disembark at hub, open build, place, undo
await page.click("#menuBtn", { timeout: 4000 }).catch(() => {});
await page.click('button[data-tab="voyage"]', { timeout: 4000 }).catch(() => {});
await page.click("#closePanelBtn", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(300);
step("builder");
// jump to hub via debug then walk
await page.click("#menuBtn", { timeout: 4000 }).catch(() => {});
await page.click('button[data-tab="collection"]', { timeout: 4000 }).catch(() => {});
await page.click("#debugJumpHub", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);
// disembark at hub
await page.click("#worldAction", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);
const buildBtnVisible = await page.evaluate(() => document.getElementById("buildBtn")?.style.display !== "none");
console.log("BUILD BTN VISIBLE:", buildBtnVisible);
if (buildBtnVisible) {
  await page.click("#buildBtn", { timeout: 4000 });
  await page.waitForTimeout(400);
  await page.click('#buildBar [data-prop="chest"]', { timeout: 4000 });
  await page.waitForTimeout(300);
  await page.click("#buildRotate", { timeout: 4000 });
  await page.waitForTimeout(200);
  await page.click("#worldAction", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  const placed = await page.evaluate(() => JSON.parse(localStorage.getItem("piration_v3") || "{}").buildings?.length || 0);
  console.log("BUILDINGS PLACED:", placed);
  await page.click("#buildUndo", { timeout: 4000 });
  await page.waitForTimeout(300);
  await page.click("#buildClose", { timeout: 4000 });
}

// combat-in-world ambush
step("ambush fx");
await page.click("#menuBtn", { timeout: 4000 }).catch(() => {});
await page.click('button[data-tab="collection"]', { timeout: 4000 }).catch(() => {});
await page.click("#debugJumpGilded", { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const w = window.__pirWorld;
  w.mode = "sail";
  w.player.visible = false;
  w.ship.position.set(0, 0, 350);
  w.ambushTimer = 0.1;
});
await page.waitForTimeout(1500);
const spawned = await page.evaluate(() => !!window.__pirWorld?.ambush);
console.log("AMBUSH SPAWNED:", spawned);
let engaged = spawned;
if (spawned) {
  await page.evaluate(() => {
    const w = window.__pirWorld;
    w.ambush.mesh.position.copy(w.ship.position);
    w.ambush.mesh.position.z -= 6;
  });
  await page.waitForTimeout(2500);
  engaged = await page.evaluate(() => !!window.__pirWorld?.battle);
}
console.log("AMBUSH ENGAGED:", engaged);
if (engaged) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: "store-assets/screenshots/0-battle-world.png" });
  for (let i = 0; i < 10; i++) {
    const card = await page.$("[data-hand]:not(.disabled)");
    if (card) {
      await page.click("[data-hand]:not(.disabled)", { timeout: 1500 }).catch(() => {});
      break;
    }
    if (await page.$("#endTurn")) {
      await page.click("#endTurn", { timeout: 1500 }).catch(() => {});
    }
  }
  await page.waitForTimeout(700);
  const fx = await page.evaluate(
    () => (window.__pirWorld?.projectiles?.length || 0) + (window.__pirWorld?.fxSprites?.length || 0),
  );
  console.log("FX OBJECTS:", fx);
  for (let i = 0; i < 80; i++) {
    if (await page.$("#collectBtn")) break;
    const c = await page.$("[data-hand]:not(.disabled)");
    if (c) {
      await page.click("[data-hand]:not(.disabled)", { timeout: 1200 }).catch(() => {});
      await page.waitForTimeout(80);
      continue;
    }
    if (!(await page.$("#endTurn"))) break;
    await page.click("#endTurn", { timeout: 1200 }).catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.click("#collectBtn", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const battleEnded = await page.evaluate(() => !window.__pirWorld?.battle);
  console.log("BATTLE ENDED:", battleEnded);
}

console.log(bad.length ? "ISSUES:\n" + bad.join("\n") : "ALL CLEAN");
await browser.close();
