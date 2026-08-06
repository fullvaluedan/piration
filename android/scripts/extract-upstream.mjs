// Extracts curated CC0/MIT assets from the upstream Pirate Nation repos into
// www/assets/, and converts audio to compressed web formats.
//
// Sources:
//  - https://github.com/proofofplay/piratenation-art  (CC0-1.0)
//  - https://github.com/proofofplay/piratenation-game (MIT, audio included)
//
// Run: node scripts/extract-upstream.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ART = "D:/ChatGPT/_upstream/piratenation-art";
const GAME = "D:/ChatGPT/_upstream/piratenation-game";
const REPO_PATH = { [ART]: "proofofplay/piratenation-art", [GAME]: "proofofplay/piratenation-game" };
const FFMPEG = "C:/Users/danom/ffmpeg/ffmpeg-8.1.1-essentials_build/bin/ffmpeg.exe";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "www", "assets");

function gitList(repo, filter) {
  const out = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean).filter((p) => filter(p));
}

async function fetchBlob(repo, path) {
  const raw = execFileSync("git", ["-C", repo, "show", `HEAD:${path}`], {
    maxBuffer: 512 * 1024 * 1024,
  });
  const head = raw.slice(0, 200).toString("utf8");
  if (head.startsWith("version https://git-lfs")) {
    const url =
      "https://github.com/" +
      REPO_PATH[repo] +
      "/raw/main/" +
      path.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`download failed ${res.status} ${path}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return raw;
}

function write(relPath, data) {
  const dest = join(OUT, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, data);
  return relPath;
}

async function batch(items, fn, size = 8) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

const report = [];
function log(msg) {
  report.push(msg);
  console.log(msg);
}

const allArt = gitList(ART, () => true);
const norm = (s) => s.replace(/\s+/g, " ").trim();

// ---------- cards ----------
const cardPaths = allArt.filter((p) => p.startsWith("Combat Cards/") && p.endsWith(".png"));
const manifest = { cards: {}, ships: {}, mobs: {}, captains: {}, zones: {}, audio: {} };
for (const p of cardPaths) {
  const base = p.split("/").pop();
  const id = base.replace(/^Card_Art_/i, "").replace(/\.png$/i, "").toLowerCase();
  const rel = write(`cards/${base}`, await fetchBlob(ART, p));
  manifest.cards[id] = rel;
}
log(`cards: ${cardPaths.length}`);

// ---------- ships ----------
const shipDefs = [
  ["skiff", "item_2x2_pirateskiffgothic"],
  ["sloop", "item_4x8_piratesloopgothic"],
  ["brig", "item_5x12_piratemaraudergothic"],
  ["galleon", "item_4x8_pirategaellongothic"],
  ["dreadnought", "item_5x10_piratefrigategothic"],
];
for (const [id, name] of shipDefs) {
  const folder = allArt.find((p) => p.includes("ships/") && norm(p).includes(name) && p.includes("/PNG/"));
  if (!folder) {
    log(`ship ${id}: NOT FOUND (${name})`);
    continue;
  }
  const dir = folder.slice(0, folder.indexOf("/PNG/") > 0 ? folder.indexOf("/PNG/") : folder.lastIndexOf("/"));
  const pngs = allArt.filter((p) => p.startsWith(dir + "/PNG/"));
  const pick = pngs.find((p) => p.endsWith("/Front.png")) || pngs.find((p) => p.endsWith("/A.png"));
  if (!pick) {
    log(`ship ${id}: no PNG render in ${dir}`);
    continue;
  }
  manifest.ships[id] = write(`ships/${id}.png`, await fetchBlob(ART, pick));
  log(`ship ${id}: ${pick}`);
}

// ---------- mobs ----------
const mobDefs = [
  ["brine_goblin", "blowfish", "blowfish_water"],
  ["coral_wraith", "foam monster", "Foam Monster"],
  ["guppy_raider", "anglerfish", "anglerfish_water"],
  ["armada_raider", "megasquito", "Megasquito"],
  ["salvage_crab", "croc", "croc_water"],
  ["iron_privateer", "shipwrecked", "shipwrecked_water"],
  ["leviathan_matron", "demogorgonwhale", "demogorgonwhale_white"],
  ["reef_horror", "deep one", "Deep One"],
  ["kraken_spawn", "giantsquid", "giantsquidmob_water"],
  ["siren_barge", "harpy", "harpy_water"],
  ["triangle_sphinx", "stormling", "stormling"],
  ["abyssal_tender", "charybdis", "Charybdis"],
  ["abyssal_tyrant", "mecha charybdis", "Mecha Charybdis Water"],
  ["tide_hydra", "livingwave", "livingwave"],
  ["smuggler_brig", "shipwrecked", "shipwrecked_fire"],
  ["kraken_spawn_elite", "giantsquid", "giantsquidmob_lightning"],
  ["siren_barge_elite", "harpy", "harpy_lightning"],
  ["reef_horror_elite", "deep one", "Deep One"],
  ["abyssal_tender_elite", "charybdis", "Charybdis Fire"],
  ["abyssal_tyrant_elite", "mecha charybdis", "Mecha Charybdis Fire"],
];
for (const [id, token, variant] of mobDefs) {
  const inMobs = allArt.filter((p) => p.includes("Mob Enemies"));
  const byToken = inMobs.filter((p) => norm(p).toLowerCase().includes(token.toLowerCase()));
  const variantPath = byToken.find((p) => norm(p).toLowerCase().includes(variant.toLowerCase()));
  const base = variantPath || byToken.find((p) => norm(p).toLowerCase().includes("neutral")) || byToken[0];
  if (!base) {
    log(`mob ${id}: NOT FOUND (${token})`);
    continue;
  }
  const dir = base.slice(0, base.lastIndexOf("/"));
  const score = (p) => {
    const base = p.split("/").pop().toLowerCase();
    if (base.startsWith("ui_mob")) return 5;
    if (base.endsWith("thumbnail_x256.png")) return 4;
    if (base.endsWith("thumbnail.png")) return 3;
    if (base.endsWith("thumbnail_x128.png")) return 2;
    if (base.endsWith(".png") && !base.includes(".vxm.") && !base.includes("preview")) return 1;
    return 0;
  };
  const pick = byToken.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a))[0];
  if (!pick) {
    log(`mob ${id}: no png found near ${base}`);
    continue;
  }
  manifest.mobs[id] = write(`mobs/${id}.png`, await fetchBlob(ART, pick));
  log(`mob ${id}: ${pick}`);
}

// ---------- captains ----------
const captainDefs = [
  ["morgaine", "ladylara", "avatar_ladylara_pfp_001.png"],
  ["bones", "captainbanshee", "avatar_captainbanshee_pfp_002.png"],
  ["siren", "captainbanshee", "arcade_pfp_the_banshee.png"],
  ["ironbeard", "rustbeard", "avatar_rustbeard_thumbnail_001.png"],
  ["oz", "captainhightide", "avatar_captainhightide_pfp.png"],
  ["cetus", "royalnavyadmiral", "avatar_royalnavyadmiral_pfp_001.png"],
];
for (const [id, token, file] of captainDefs) {
  const pick = allArt.find(
    (p) => p.includes("Lore Characters") && norm(p).toLowerCase().includes(token.toLowerCase()) && p.endsWith(file),
  );
  if (!pick) {
    log(`captain ${id}: NOT FOUND (${token}/${file})`);
    continue;
  }
  manifest.captains[id] = write(`captains/${id}.png`, await fetchBlob(ART, pick));
  log(`captain ${id}: ${pick}`);
}

// ---------- zones (world prop renders) ----------
const zoneDefs = [
  ["shallows", "Shipwright"],
  ["trade", "Tailor Shop"],
  ["opensea", "Easter Island Deco"],
  ["reefs", "Lost Settlements"],
  ["triangle", "Haunted Buildings"],
  ["abyss", "Mecha Buildings"],
];
for (const [id, token] of zoneDefs) {
  const byToken = allArt.filter(
    (p) => p.includes("world items") && norm(p).toLowerCase().includes(token.toLowerCase()),
  );
  const png = byToken.find((p) => p.endsWith("/PNG/Front.png")) ||
    byToken.find((p) => p.endsWith("/PNG/A.png")) ||
    byToken.find((p) => p.endsWith(".png") && (p.includes("/PNG/") || p.includes("/Thumbnails/")));
  if (!png) {
    log(`zone ${id}: NOT FOUND (${token})`);
    continue;
  }
  manifest.zones[id] = write(`world/${id}.png`, await fetchBlob(ART, png));
  log(`zone ${id}: ${png}`);
}

// ---------- audio ----------
function ffmpeg(src, dest, extra = []) {
  try {
    execFileSync(FFMPEG, ["-y", "-i", src, ...extra, dest], { stdio: "pipe", maxBuffer: 1 << 30 });
  } catch (e) {
    const msg = String(e.stderr || e.message);
    throw new Error(msg.split("\n").slice(-8).join("\n"));
  }
}

async function extractAudio(srcRel, destName, convert) {
  const data = await fetchBlob(GAME, srcRel);
  const tmp = join(ROOT, ".tmp-audio", destName + (convert ? ".wav" : ".mp3"));
  mkdirSync(dirname(tmp), { recursive: true });
  writeFileSync(tmp, data);
  const outRel = `audio/${destName}.mp3`;
  if (convert) {
    try {
      ffmpeg(tmp, join(OUT, outRel), ["-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2"]);
    } catch (e) {
      ffmpeg(tmp, join(OUT, outRel), ["-codec:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]);
    }
  } else {
    mkdirSync(dirname(join(OUT, outRel)), { recursive: true });
    writeFileSync(join(OUT, outRel), data);
  }
  return outRel;
}

const A = "Assets/_PirateNation_/";
const music = {
  menu: [`${A}Audio/Music/Exploration v10 LOOP - Normalized.wav`, true],
  combat: [`${A}Audio/Music/Combat v16 LOOP 1.wav`, true],
  title: [`${A}Audio/Music/Pirate Nation Main Theme v5 ending.wav`, true],
};
manifest.audio.music = {};
for (const [k, [path, conv]] of Object.entries(music)) {
  try {
    manifest.audio.music[k] = await extractAudio(path, `music_${k}`, conv);
    log(`music ${k}: ok`);
  } catch (e) {
    log(`music ${k}: FAIL ${e.message.slice(0, 120)}`);
  }
}

const sfxMap = {
  ui_click: `${A}Audio/SFX/SFX_GeneralUISelection/computer_mac_keyboard_single_stroke_01.mp3`,
  card: `${A}Game/Combat/Assets/FX/Card_Game_Movement_Deal_Single_Small_01.wav`,
  whoosh: `${A}Game/Combat/Assets/FX/VFX/Status/SFX/S_Whoosh_02.wav`,
  coin: `${A}Animations/buildings/WishingWell/Audio/S_Coin_Plop_Splash.wav`,
  reward: `${A}Audio/SFX/SFX_RewardCollection/Copy of short_flourish_03.mp3`,
  craft: `${A}Audio/SFX/SFX_CraftingCompleted/short_flourish_03.mp3`,
  quest: `${A}Audio/SFX/SFX_QuestComplete/reveal_bright_01.mp3`,
  start: `${A}Audio/SFX/SFX_QuestStarted/boxing_bell_03_x2.mp3`,
  fail: `${A}Audio/SFX/SFX_ActionFailed/tv_gameshow_buzzer_04.mp3`,
  chest: `${A}Audio/SFX/SFX_ChestOpening/household_door_open_07.mp3`,
  cannon: `${A}Game/BattleVFX/Audio/Guns, Artillery, Cannon, Impact, Low 01 SND52407.wav`,
  hit: `${A}Game/BattleVFX/Audio/Destruction, Crash & Debris, Car Crash, Heavy, Wood Crash SND14097.wav`,
  splash: `${A}Game/BattleVFX/Audio/Water, Splash, Water Splash, Dive, Impact SND81144 1.wav`,
  buff: `${A}Game/Combat/Assets/FX/VFX/Status/SFX/S_Status_Buff.wav`,
  debuff: `${A}Game/Combat/Assets/FX/VFX/Status/SFX/S_Status_Debuff.wav`,
  sail: `${A}Audio/SFX/SFX_ShipMovement/PN_ShipMovementOUT.mp3`,
  level: `${A}Game/BattleVFX/Audio/Musical, Stinger, Medieval Riser, Impact, Bell, Drums SND60171.wav`,
};
manifest.audio.sfx = {};
for (const [k, path] of Object.entries(sfxMap)) {
  const convert = !path.toLowerCase().endsWith(".mp3");
  try {
    manifest.audio.sfx[k] = await extractAudio(path, `sfx_${k}`, convert);
    log(`sfx ${k}: ok`);
  } catch (e) {
    log(`sfx ${k}: FAIL ${e.message.slice(0, 120)}`);
  }
}

write("manifest.json", JSON.stringify(manifest, null, 2));
log("manifest written");

// cleanup temp
import { rmSync } from "node:fs";
rmSync(join(ROOT, ".tmp-audio"), { recursive: true, force: true });
