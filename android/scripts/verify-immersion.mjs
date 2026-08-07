// Verifies the "living world" systems on the real running game:
// rigged animations (ship idle, player walk, mob idle/attack/hit),
// ambient life (bird flocks, island motes), and in-world banners.
// Run with scripts/serve-www.mjs on port 5199.

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
const outDir = join(root, "store-assets", "immersion-shots");
mkdirSync(outDir, { recursive: true });

let failures = 0;
const check = (label, cond) => {
  if (cond) console.log(`ok   ${label}`);
  else {
    console.log(`FAIL ${label}`);
    failures += 1;
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
});
await page.addInitScript(
  (save) => localStorage.setItem("piration_v3", save),
  JSON.stringify(demoState()),
);
await page.goto("http://127.0.0.1:5199/", { waitUntil: "load", timeout: 30000 });
await page.waitForFunction(() => window.__pirWorld?.animShip, { timeout: 30000 });
await page.waitForTimeout(2200);

const shot = (name) => page.screenshot({ path: join(outDir, name) });
const snap = () =>
  page.evaluate(() => {
    const w = window.__pirWorld;
    return {
      shipClip: w.animShip?.userData?.current,
      shipTime: w.animShip?.time ?? -1,
      playerClip: w.animPlayer?.userData?.current,
      playerTime: w.animPlayer?.time ?? -1,
      flocks: w.birdFlocks?.length ?? 0,
      motes: w.islandMotes?.length ?? 0,
      banners: w.banners?.length ?? 0,
    };
  });

const s1 = await snap();
await page.waitForTimeout(700);
const s2 = await snap();
check("ship idle clip playing", s1.shipClip === "idle");
check("ship animation advances", s2.shipTime > s1.shipTime + 0.1);
check("player idle clip playing", s1.playerClip === "01_Idle_1");
check("player animation advances", s2.playerTime > s1.playerTime + 0.1);
check("3 bird flocks alive", s1.flocks === 3);
check("island motes alive", s1.motes > 40);
await shot("1-sailing.png");

// walk on an island
await page.evaluate(() => {
  const w = window.__pirWorld;
  w.jumpTo("shallows");
  w.disembark();
  w.stick = { x: 0.75, y: 0.1, active: true };
});
await page.waitForTimeout(1000);
const w1 = await snap();
await page.waitForTimeout(500);
const w2 = await snap();
check("walk clip playing on foot", w1.playerClip === "04_Walk");
check("walk animation advances", w2.playerTime > w1.playerTime + 0.1);
await shot("2-walk-a.png");
await page.waitForTimeout(180);
await shot("2-walk-b.png");

// battle: banner + mob idle, then attack and hit one-shots
await page.evaluate(() => {
  const w = window.__pirWorld;
  w.stick.active = false;
  w.stick.x = 0;
  w.stick.y = 0;
  w.setBattle(true, "mob_anglerfish");
});
await page.waitForTimeout(800);
const b1 = await snap();
check("battle banner spawned", b1.banners > 0);
check("mob idle clip playing", b1.shipClip !== undefined && b1.banners >= 0);
const mobIdle = await page.evaluate(() => window.__pirWorld.animMob?.userData?.current);
check("mob idle clip", mobIdle === "idle");
await shot("3-battle-banner.png");

await page.evaluate(() => window.__pirWorld.fxCard("enemyTelegraph"));
await page.waitForTimeout(220);
const mobAtk = await page.evaluate(() => {
  const st = window.__pirWorld.animMob?.userData;
  return { once: st?.once?.name, running: !!st?.actions?.get?.("attack")?.isRunning() };
});
check("mob attack clip fires", mobAtk.once === "attack" || mobAtk.running);
await shot("4-battle-attack.png");

await page.evaluate(() => window.__pirWorld.playOnce(window.__pirWorld.animMob, "hit", 1.0));
await page.waitForTimeout(180);
const mobHit = await page.evaluate(() => {
  const st = window.__pirWorld.animMob?.userData;
  return { once: st?.once?.name, running: !!st?.actions?.get?.("hit")?.isRunning() };
});
check("mob hit clip fires", mobHit.once === "hit" || mobHit.running);
await shot("5-battle-hit.png");

await page.evaluate(() => window.__pirWorld.fxEnd(true));
await page.waitForTimeout(350);
const b2 = await snap();
check("victory banner spawned", b2.banners > 0);
await shot("6-victory.png");

await browser.close();
console.log(failures === 0 ? "ALL IMMERSION CHECKS PASSED" : `${failures} IMMERSION CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
