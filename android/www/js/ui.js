import * as core from "./core.js";
import { PirationWorld } from "./world3d.js";

const STORAGE_KEY = "piration_v3";

let CARDS = { list: [], byId: {}, game: null };
let state = null;
let tab = "voyage";
let toastTimer = null;
let uiPending = null; // transient result screens (not persisted)
let audioCtx = null;
let modalActive = false;
let ASSETS = null; // assets/manifest.json
let musicEl = null;
let musicKind = null;
let sfxCache = {};
let world = null;
let panelOpen = false;
let uiDeck = null;
let ambience = null;

const $ = (sel) => document.querySelector(sel);
const content = () => $("#content");

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

// ---------- feedback: sound + vibration ----------

function note(freq, start, dur, type = "sine", vol = 0.12) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + dur + 0.05);
}

function assetPath(rel) {
  return ASSETS ? "assets/" + rel : "";
}

function playFileAudio(src, volume = 0.7) {
  if (!src) return false;
  try {
    const a = sfxCache[src] || (sfxCache[src] = new Audio(src));
    a.volume = volume;
    a.currentTime = 0;
    const p = a.play();
    p?.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function playMusic(kind, force = false) {
  if (!state?.soundOn) return;
  if (musicKind === kind && !force) return;
  if (!ASSETS?.audio?.music?.[kind]) return;
  try {
    if (!musicEl) musicEl = new Audio(assetPath(ASSETS.audio.music[kind]));
    else musicEl.src = assetPath(ASSETS.audio.music[kind]);
    musicEl.loop = true;
    musicEl.volume = 0.35;
    musicKind = kind;
    const p = musicEl.play();
    p?.catch(() => {});
  } catch (_) {}
}

function stopMusic() {
  if (musicEl) {
    musicEl.pause();
    musicEl.currentTime = 0;
  }
  musicKind = null;
}

function sfx(kind) {
  if (!state?.soundOn) return;
  const file = ASSETS?.audio?.sfx?.[kind];
  if (file && playFileAudio(assetPath(file))) return;
  // fallback: lightweight synth
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const map = {
      tap: () => note(520, 0, 0.06, "triangle", 0.07),
      card: () => note(660, 0, 0.07, "triangle", 0.09),
      hit: () => note(180, 0, 0.12, "sawtooth", 0.08),
      shield: () => note(420, 0, 0.1, "sine", 0.08),
      coin: () => {
        note(880, 0, 0.08, "square", 0.05);
        note(1175, 0.08, 0.12, "square", 0.05);
      },
      win: () => {
        [523, 659, 784].forEach((f, i) => note(f, i * 0.12, 0.18, "triangle", 0.1));
      },
      lose: () => {
        [330, 262, 196].forEach((f, i) => note(f, i * 0.16, 0.22, "sawtooth", 0.08));
      },
      level: () => {
        [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.1, 0.16, "triangle", 0.11));
      },
      unlock: () => {
        [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.11, 0.2, "square", 0.07));
      },
      error: () => note(140, 0, 0.16, "sawtooth", 0.08),
    };
    (map[kind] || map.tap)();
  } catch (_) {}
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch (_) {}
}

// ---------- modal ----------

function openModal({ title, body, actions }) {
  modalActive = true;
  const overlay = $("#modal");
  overlay.classList.remove("hidden");
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  const actionsEl = $("#modalActions");
  actionsEl.innerHTML = "";
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = "btn " + (a.style || "");
    btn.textContent = a.label;
    btn.addEventListener("click", () => {
      closeModal();
      a.fn?.();
    });
    actionsEl.appendChild(btn);
  }
}

function closeModal() {
  modalActive = false;
  $("#modal").classList.add("hidden");
}

function confirmModal({ title, body, confirmLabel, danger, onConfirm }) {
  openModal({
    title,
    body,
    actions: [
      { label: "Cancel", style: "ghost", fn: () => {} },
      { label: confirmLabel, style: danger ? "danger" : "", fn: onConfirm },
    ],
  });
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, core.serialize(state));
  } catch (_) {}
}

function after(action) {
  save();
  render();
  return action;
}

function fmtCost(cost) {
  return Object.entries(cost || {})
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
}

function fmtLoot(loot) {
  if (!loot || !Object.keys(loot).length) return "";
  return Object.entries(loot)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rarityClass(id) {
  return CARDS.game?.cardRarity?.[id] || "common";
}

function rarityLabel(id) {
  const r = rarityClass(id);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function cardArt(id) {
  if (!ASSETS) return "";
  return (
    ASSETS.cards[id] ||
    ASSETS.cards[id.replace(/_/g, " ")] ||
    ASSETS.cards[id.replace(/ /g, "_")] ||
    ""
  );
}

function artImg(rel, cls, alt = "") {
  return rel ? `<img class="${cls}" src="assets/${encodeURI(rel)}" alt="${esc(alt)}" loading="lazy">` : "";
}

function monsterArt(encounter) {
  if (!ASSETS) return "";
  const direct = ASSETS.mobs[encounter?.monsterId];
  if (direct) return direct;
  const zone = core.zoneById(CARDS.game, encounter?.zoneId);
  const first = zone?.monsterPool?.[0];
  return ASSETS.mobs[first] || ASSETS.mobs.abyssal_tyrant || "";
}

function xpPct() {
  const c = state.character;
  const cap = CARDS.game?.balance?.maxLevel || core.MAX_LEVEL;
  if (c.level >= cap) return 100;
  return Math.min(100, Math.round((c.xp / Math.max(1, c.xpToNext)) * 100));
}

function bind(sel, fn) {
  const el = $(sel);
  el?.addEventListener("click", fn);
}

function maybeHint(key, msg) {
  if (state.hints?.[key]) return "";
  state.hints[key] = true;
  save();
  return `<div class="hint">💡 ${esc(msg)} <button class="btn mini ghost" id="hintClose">Got it</button></div>`;
}

function bindHintClose() {
  bind("#hintClose", () => {
    sfx("tap");
    render();
  });
}

// ---------- header ----------

function refreshStats() {
  const cap = core.currentCaptain(state, CARDS.game);
  const ship = core.shipStatus(state, CARDS.game);
  const uniq = new Set(state.collection || []).size;
  const inv = state.inventory;
  core.regenEnergy(state, CARDS.game);
  const energyLabel = CARDS.game.balance.energy.unlimited
    ? "⚡ ∞"
    : `⚡ ${state.energy}/${state.energyMax}`;
  const warn =
    ship.pct < 60
      ? `<div class="warn">⚓ Hull at ${ship.pct}% — repair at the Shipyard</div>`
      : "";
  $("#stats").innerHTML = `
    <div class="statline">
      <span>${esc(cap?.icon || "☠")} ${esc(cap?.name || "-")} · Lv${state.character.level}</span>
      <span>${xpPct()}% XP</span>
    </div>
    <div class="statline muted">
      <span>${energyLabel}</span>
      <span>Marks ${inv.Marks} · Gold ${inv.Gold}</span>
      <span>${esc(ship.ship.name)} ${ship.pct}%</span>
      <span>${uniq} cards</span>
    </div>`;
  if (warn) $("#stats").insertAdjacentHTML?.("beforeend", warn);
  const soundBtn = $("#soundBtn");
  if (soundBtn) soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
  updateTabBadges();
}

function updateTabBadges() {
  const atSea = state.voyage || state.combat || state.endless;
  const badge = $("#voyageBadge");
  if (badge) badge.style.display = atSea ? "" : "none";
  const battle = state.combat;
  if (battle) badge.textContent = battle.mode === "endless" ? "∞" : "⚔";
}

function unlockAudio() {
  if (!state?.soundOn) return;
  playMusic("menu");
  startAmbience();
}

function startAmbience() {
  if (!state?.soundOn) return;
  try {
    if (ambience) return;
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const dur = 4;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start();
    // wind layer
    const wbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const wd = wbuf.getChannelData(0);
    let wl = 0;
    for (let i = 0; i < wd.length; i++) {
      const white = Math.random() * 2 - 1;
      wl = (wl + 0.008 * white) / 1.008;
      wd[i] = wl * 4.0;
    }
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = wbuf;
    wsrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 480;
    bp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wsrc.connect(bp).connect(wg).connect(ctx.destination);
    wsrc.start();
    ambience = { src, gain: g, wind: wsrc, windGain: wg };
  } catch (_) {}
}

function stopAmbience() {
  if (ambience) {
    try {
      ambience.src.stop();
      ambience.wind?.stop();
    } catch (_) {}
    ambience = null;
  }
}

function updateMusic() {
  if (!state?.soundOn) {
    stopMusic();
    return;
  }
  playMusic(state.combat ? "combat" : "menu");
}

// ---------- voyage ----------

const ISLAND_POS = {
  shallows: { x: 16, y: 74 },
  trade: { x: 38, y: 54 },
  opensea: { x: 56, y: 72 },
  reefs: { x: 47, y: 30 },
  triangle: { x: 72, y: 34 },
  abyss: { x: 84, y: 58 },
};

let uiSelectedZone = null;
let uiSailing = false;

function renderZones() {
  const lvl = state.character.level;
  let html = maybeHint("voyage", "This is your world. Tap an island to chart a course — each voyage is 3 random encounters. Fight, bribe, or flee. No energy, ever.");
  const shipAt = state.shipAt || "shallows";
  const at = ISLAND_POS[shipAt] || ISLAND_POS.shallows;
  html += `<div class="section"><h2>High Seas</h2>
    <div class="worldmap">
      <div class="sea"></div>
      <div class="wave w1"></div>
      <div class="wave w2"></div>`;
  for (const z of CARDS.game.zones) {
    const locked = lvl < z.minLevel;
    const p = ISLAND_POS[z.id] || { x: 20, y: 20 };
    html += `<button class="island ${locked ? "locked" : ""}" data-zone="${z.id}"
      style="left:${p.x}%;top:${p.y}%" title="${esc(z.name)} — Lv ${z.minLevel}">
      ${artImg(ASSETS?.zones?.[z.id], "island-art", z.name)}
      <span class="island-label">${esc(z.name)}</span>
      ${locked ? `<span class="island-lock">🔒 Lv ${z.minLevel}</span>` : ""}
    </button>`;
  }
  html += `<div class="shipmark" id="shipmark" style="left:${at.x}%;top:${at.y}%">
      ${artImg(ASSETS?.ships?.[state.shipId], "ship-art", "your ship")}
    </div>
    </div>`;
  const sel = CARDS.game.zones.find((z) => z.id === uiSelectedZone) || null;
  if (sel) {
    const locked = lvl < sel.minLevel;
    html += `<div class="section" id="zoneInfo">
      <div class="row">
        <p><strong>${esc(sel.name)}</strong> <span class="pill danger-${sel.minLevel <= 6 ? "safe" : sel.minLevel <= 12 ? "mid" : "hard"}">Lv ${sel.minLevel}${locked ? " · Locked" : ""}</span><br/>
        <span class="muted">${esc(sel.desc)}</span></p>
        <button class="btn" id="sailBtn" ${locked || uiSailing ? "disabled" : ""}>${uiSailing ? "Sailing…" : "Set sail"}</button>
      </div>
    </div>`;
  } else {
    html += `<div class="section"><p class="muted">Tap an island to chart a course. Sail → random encounters → loot → return to port → craft, recruit, enhance → unlock captains → chase the Endless high score.</p></div>`;
  }
  content().innerHTML = html;
  bindHintClose();
  bind("#sailBtn", () => {
    if (!sel || uiSailing) return;
    uiSailing = true;
    sfx("sail");
    const mark = $("#shipmark");
    const p = ISLAND_POS[sel.id] || { x: 20, y: 20 };
    if (mark) {
      mark.style.left = p.x + "%";
      mark.style.top = p.y + "%";
    }
    setTimeout(() => {
      const r = core.startVoyage(state, CARDS.game, sel.id);
      uiSailing = false;
      if (!r.ok) return toast(r.reason);
      state.shipAt = sel.id;
      save();
      render();
    }, 750);
    render();
  });
  content().querySelectorAll("[data-zone]").forEach((b) =>
    b.addEventListener("click", () => {
      if (uiSailing) return;
      uiSelectedZone = b.dataset.zone;
      sfx("tap");
      render();
    })
  );
}

function voyageProgress() {
  const v = state.voyage;
  if (!v) return "";
  const zone = core.zoneById(CARDS.game, v.zoneId);
  const done = v.index;
  const total = zone.voyageLength + (v.bossRemaining ? 1 : 0);
  let dots = "";
  for (let i = 0; i < total; i++) {
    dots += `<span class="dot ${i < done ? "done" : ""}"></span>`;
  }
  return `<div class="prog">${dots}<span class="muted">${done}/${total}</span></div>`;
}

function renderEncounterIntro() {
  const e = core.encounterDisplay(state, CARDS, CARDS.game);
  if (!e) return renderVoyageSummary();
  const zone = core.zoneById(CARDS.game, state.voyage.zoneId);
  let html = `<div class="section"><h2>${esc(e.tag)} — ${esc(e.name)}</h2>
    ${voyageProgress()}
    <p class="muted">${esc(e.desc)}</p>`;
  if (e.type === "cache") {
    html += `<button class="btn" id="claimCache">Claim cache</button>`;
  } else {
    const bribe = Math.round((30 + zone.minLevel * 12) * CARDS.game.balance.bribeCostMult);
    html += `<div class="row"><button class="btn" id="fightBtn">⚔ Fight</button>
      <button class="btn ghost" id="bribeBtn">Bribe (${bribe} Marks)</button>
      <button class="btn danger" id="fleeBtn">Flee</button></div>`;
  }
  html += `</div>
    <div class="section"><h2>Voyage log</h2><div class="log">${esc(voyageLogText())}</div></div>`;
  content().innerHTML = html;
  bind("#claimCache", () => {
    const r = core.collectCache(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("coin");
    toast(`Cache +${r.marks} Marks · ${fmtLoot(r.loot)} · +${r.xp} XP`);
    after();
  });
  bind("#fightBtn", () => {
    const r = core.startFight(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("tap");
    after();
  });
  bind("#bribeBtn", () => {
    const r = core.bribeEncounter(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("coin");
    toast("Bribed your way past. +6 XP");
    after();
  });
  bind("#fleeBtn", () => {
    core.fleeEncounter(state, CARDS.game);
    sfx("lose");
    toast("Fled! Hull took a beating.");
    after();
  });
}

function voyageLogText() {
  return (state.voyage?.results || [])
    .map((r) => {
      if (r.type === "cache") return `Cache: +${r.marks} Marks${fmtLoot(r.loot) ? " · " + fmtLoot(r.loot) : ""}`;
      if (r.type === "bribe") return `Bribed past ${r.name} (${r.marksSpent} Marks)`;
      if (r.type === "flee") return "Fled an encounter";
      if (r.type === "defeat") return `Defeated by ${r.name} (+${r.xp} XP)`;
      const loot = fmtLoot(r.loot);
      const card = r.card ? ` · ${r.card.name}` : "";
      const lv = r.levels ? " · LEVEL UP!" : "";
      return `Beat ${r.name}: +${r.xp} XP, +${r.marks} Marks${loot ? " · " + loot : ""}${card}${lv}`;
    })
    .join("\n");
}

function renderVoyageSummary() {
  const v = state.voyage;
  const zone = core.zoneById(CARDS.game, v.zoneId);
  let html = `<div class="section"><h2>Voyage complete — ${esc(zone.name)}</h2>
    ${voyageProgress()}
    <div class="log">${esc(voyageLogText() || "Nothing happened.")}</div>
    <div class="row" style="margin-top:10px"><button class="btn" id="dockBtn">Return to port</button></div>
  </div>`;
  content().innerHTML = html;
  bind("#dockBtn", () => {
    core.returnToPort(state);
    after();
  });
}

function renderVoyageResult(result) {
  const loot = fmtLoot(result.loot);
  const card = result.card ? ` · ${esc(result.card.name)}` : "";
  const lv = result.levels ? " · LEVEL UP!" : "";
  let html = `<div class="section"><div class="banner win">VICTORY!</div>
    <h2>Loot secured</h2>
    <p class="muted">+${result.xp} XP · +${result.marks} Marks · +${result.gold} Gold${loot ? " · " + loot : ""}${card}${lv}</p>`;
  if (result.kind === "voyage_continue") {
    html += `<div class="row"><button class="btn" id="continueBtn">Continue voyage</button>
      <button class="btn ghost" id="dockBtn">Return to port</button></div>`;
  } else if (result.kind === "voyage_end") {
    html += `<button class="btn" id="dockBtn">Return to port</button>`;
  } else if (result.kind === "voyage_defeat") {
    html = `<div class="section"><div class="banner lose">SUNK!</div>
      <h2 class="defeat">Defeated</h2>
      <p class="muted">Your ship took hull damage. Repair it at the Shipyard. (+${result.xp} XP)</p>
      <button class="btn" id="dockBtn">Return to port</button>
    </div>`;
  }
  if (result.kind !== "voyage_defeat") html += `</div>`;
  content().innerHTML = html;
  bind("#continueBtn", () => {
    core.continueVoyage(state, CARDS.game);
    uiPending = null;
    sfx("tap");
    after();
  });
  bind("#dockBtn", () => {
    core.returnToPort(state);
    uiPending = null;
    sfx("tap");
    world?.setBattle(false);
    if (world) closeGamePanel();
    after();
  });
}

function renderBossPrompt() {
  const v = state.voyage;
  const zone = core.zoneById(CARDS.game, v.zoneId);
  let html = `<div class="section"><h2>${esc(zone.boss.name)} hunts you</h2>
    ${voyageProgress()}
    <p class="muted">A zone boss blocks the way home. Defeat it for a guaranteed epic card. Or slip past — no shame in living.</p>
    <div class="row"><button class="btn" id="fightBoss">⚔ Fight the boss</button>
    <button class="btn ghost" id="skipBoss">Slip past</button></div></div>`;
  content().innerHTML = html;
  bind("#fightBoss", () => {
    const r = core.startFight(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("tap");
    after();
  });
  bind("#skipBoss", () => {
    core.skipBoss(state, CARDS.game);
    sfx("tap");
    after();
  });
}

function renderVoyage() {
  if (state.combat) return renderCombat("voyage");
  if (uiPending?.kind === "voyage_continue" || uiPending?.kind === "voyage_end" || uiPending?.kind === "voyage_defeat") {
    return renderVoyageResult(uiPending);
  }
  if (!state.voyage) return renderZones();
  const e = core.currentEncounter(state, CARDS.game);
  if (e?.type === "boss") return renderBossPrompt();
  if (e) return renderEncounterIntro();
  return renderVoyageSummary();
}

// ---------- combat ----------

function enemyIntentText(combat) {
  const e = combat.enemy;
  if (e.intent === "brace") return `Brace (+${3 + Math.floor(combat.turn / 4)} shield)`;
  if (e.intent === "charge") return "Charge (next hit ×1.6)";
  let dmg = e.dmg;
  if (state.captainId === "royalnavyadmiral") dmg = Math.round(dmg * 0.9);
  if (e.charged) dmg = Math.round(dmg * 1.6);
  return `Attack (~${dmg})`;
}

function enemyIntentClass(combat) {
  return combat.enemy.intent === "brace" ? "brace" : combat.enemy.intent === "charge" ? "charge" : "attack";
}

function cardLine(id) {
  const base = CARDS.byId[id];
  if (!base) return "";
  const n = state.enhancements?.[id] || 0;
  const dmg = base.damage + (base.damage > 0 ? n : 0);
  const sh = base.shield + (base.shield > 0 ? n : 0);
  const heal = base.heal + (base.heal > 0 ? 2 * n : 0);
  let line = `[${base.kind}] AP${base.ap}`;
  if (dmg) line += ` · DMG ${dmg}`;
  if (sh) line += ` · SH ${sh}`;
  if (heal) line += ` · HEAL ${heal}`;
  if (base.draw) line += ` · DRAW ${base.draw}`;
  if (base.kind === "Resource") line += " · +1 AP";
  if (n) line += ` · <span class="en">+${n}</span>`;
  return line;
}

function renderCombat(back) {
  const c = state.combat;
  if (!c) {
    uiPending = null;
    return tab === "endless" ? renderEndless() : renderVoyage();
  }
  const php = Math.max(0, Math.round((c.playerHp / c.playerMaxHp) * 100));
  const ehp = Math.max(0, Math.round((c.enemy.hp / c.enemy.maxHp) * 100));
  const endlessLine = c.mode === "endless"
    ? `<div class="muted">Wave ${c.endless?.wave || ""} · Score ${state.endless?.score || 0} · ${state.endless?.waveEnemiesLeft || 1} this wave</div>`
    : "";
  let html = `<div class="section battle">
    <h2>${esc(c.enemy.name)} <span class="pill element-pill">${esc(c.enemy.element)}</span></h2>
    <div class="muted">${c.mode === "endless" ? `Wave ${c.endless?.wave || ""}` : ""} · ${esc(c.encounter.isElite ? "Elite" : c.encounter.isBoss ? "Boss" : "Monster")} · You sail as ${esc(core.currentCaptain(state, CARDS.game)?.element)}</div>
    <div class="battle-scene">
      ${artImg(monsterArt(c.encounter), "enemy-sprite", c.enemy.name)}
      ${artImg(ASSETS?.ships?.[state.shipId], "player-sprite", "your ship")}
    </div>
    <div class="hpbar enemy"><i style="width:${ehp}%"></i></div>
    <div class="intent ${enemyIntentClass(c)}">${esc(enemyIntentText(c))}</div>
    ${endlessLine}
    <div class="row"><span>You: ${c.playerHp}/${c.playerMaxHp} HP · ${c.playerShield} SH</span>
      <span>AP ${c.ap}/${c.maxAp} · Turn ${c.turn}</span></div>
    <div class="hpbar"><i style="width:${php}%"></i></div>
    <div class="muted deckinfo">Deck ${c.drawPile.length} · Hand ${c.hand.length} · Discard ${c.discard.length}</div>`;

  if (c.over) {
    html += `<p class="${c.won ? "victory" : "defeat"}">${c.won ? "VICTORY" : "DEFEAT"}</p>
      <button class="btn" id="collectBtn">${c.won ? "Collect loot" : "Continue"}</button>`;
  } else {
    html += `<div class="hand">`;
    c.hand.forEach((id, i) => {
      const base = CARDS.byId[id];
      const dis = !base || c.ap < base.ap;
      const hint = !base ? "" : c.ap < base.ap ? ` title="Needs ${base.ap} AP"` : "";
      html += `<button class="card ${rarityClass(id)} ${dis ? "disabled" : ""}" data-hand="${i}" ${dis ? "disabled" : ""}${hint}>
        ${artImg(cardArt(id), "card-art", base?.name)}
        <strong>${esc(base?.name || id)}</strong>
        <span class="cardline">${cardLine(id)}</span>
      </button>`;
    });
    html += `</div>
      <div class="row combat-actions">
        <button class="btn" id="endTurn">End turn</button>
        <button class="btn ghost" id="retreatBtn">Retreat</button>
      </div>`;
  }
  html += `</div>
    <div class="section"><h2>Log</h2><div class="log">${esc((c.log || []).slice(-8).join("\n"))}</div></div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-hand]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = state.combat?.hand?.[+b.dataset.hand];
      const base = id ? CARDS.byId[id] : null;
      const r = core.playCard(state, CARDS, CARDS.game, +b.dataset.hand);
      if (!r.ok) {
        sfx("error");
        toast(r.reason);
      } else {
        sfx("card");
        buzz(8);
        if (base?.damage > 0) world?.fxCard("attack", { dmg: base.damage });
        else if (base?.shield > 0) world?.fxCard("shield");
        else if (base?.heal > 0) world?.fxCard("heal");
      }
      save();
      render();
    })
  );
  bind("#endTurn", () => {
    sfx("hit");
    const wasBrace = state.combat?.enemy?.intent === "brace";
    const wasAttack = state.combat?.enemy?.intent === "attack" || state.combat?.enemy?.intent === "charge";
    const enemyDmg = state.combat?.enemy?.dmg || 0;
    if (wasBrace) world?.fxCard("enemyShield");
    else if (wasAttack) world?.fxCard("enemyTelegraph");
    core.endTurn(state, CARDS, CARDS.game);
    if (!wasBrace) world?.fxCard("enemyAttack", { dmg: enemyDmg });
    save();
    render();
  });
  bind("#retreatBtn", () => {
    confirmModal({
      title: "Retreat?",
      body: `<p class="muted">Abandon this fight? Your hull takes a beating (${Math.round(CARDS.game.balance.fleeDurabilityLoss * 100)}% durability) and the voyage ends.</p>`,
      confirmLabel: "Retreat",
      danger: true,
      onConfirm: () => {
        const r = core.retreatFromCombat(state, CARDS, CARDS.game);
        if (!r.ok) return toast(r.reason);
        world?.setBattle(false);
        sfx("lose");
        toast("Retreated");
        uiPending = null;
        save();
        render();
      },
    });
  });
  bind("#collectBtn", () => {
    uiPending = core.collectCombatResult(state, CARDS, CARDS.game);
    if (uiPending.kind === "endless_next") {
      core.endlessNextEnemy(state, CARDS, CARDS.game);
      uiPending = null;
    }
    if (uiPending?.kind === "voyage_defeat" || uiPending?.kind === "endless_end") {
      sfx("lose");
      buzz([80, 60, 120]);
      world?.fxEnd(false);
    } else if (uiPending?.levels) {
      sfx("level");
      buzz([40, 40, 80]);
      world?.fxEnd(true);
    } else {
      sfx("win");
      buzz([30, 30, 60]);
      world?.fxEnd(true);
    }
    sfx("coin");
    if (!state.combat && uiPending?.kind?.startsWith("voyage_")) {
      setTimeout(() => world?.setBattle(false), 900);
    }
    save();
    render();
  });
  world?.setBattleHp(c.playerHp / c.playerMaxHp, c.enemy.hp / c.enemy.maxHp);
}

// ---------- endless ----------

function renderEndlessMenu() {
  const best = state.stats.endlessBestWave || 0;
  const medal = ["🥇", "🥈", "🥉"];
  let html = maybeHint("endless", "Waves scale forever. Cash out with your loot before you sink — score is king.");
  html += `<div class="section"><h2>Endless Mode</h2>
    <p class="muted">Waves of monsters, no port, no mercy. Enemies scale forever. Score = ${CARDS.game.balance.endlessScorePerWave}/wave + ${CARDS.game.balance.endlessScorePerKill}/kill + ${CARDS.game.balance.endlessScorePerElite}/elite. Run ends when you sink — cash out XP and loot based on depth.</p>
    <p>Best wave: <strong>${best}</strong> · Best score: <strong>${state.stats.endlessBestScore || 0}</strong></p>
    <button class="btn" id="startEndless">Enter the Abyss</button>
  </div>
  <div class="section"><h2>Captain's Log (top scores)</h2>`;
  if (!state.leaderboard.length) {
    html += `<p class="muted">No runs yet. Set a score to remember.</p>`;
  } else {
    html += `<div class="log">`;
    state.leaderboard.forEach((e, i) => {
      const cap = core.captainById(CARDS.game, e.captain);
      html += `${medal[i] || (i + 1) + "."} ${e.score} pts — wave ${e.wave}, ${e.kills} kills (${esc(cap?.name || e.captain)}) ${new Date(e.date).toLocaleDateString()}\n`;
    });
    html += `</div>`;
  }
  html += `</div>
  <div class="section"><h2>Unlock missions</h2><p class="muted">Endless is also a mission path: kill ${CARDS.game.captains.find((c) => c.id === "captainbanshee").unlock.endlessKills} enemies to unlock Captain Banshee, reach wave ${CARDS.game.captains.find((c) => c.id === "captainhightide").unlock.endlessWave} for Captain Hightide…</p></div>`;
  content().innerHTML = html;
  bindHintClose();
  bind("#startEndless", () => {
    const r = core.startEndless(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("unlock");
    buzz(30);
    toast("The Abyss welcomes you.");
    after();
  });
}

function renderWaveCleared(result) {
  const en = state.endless;
  const loot = fmtLoot(result.loot);
  const card = result.card ? ` · ${esc(result.card.name)}` : "";
  let html = `<div class="section"><h2>Wave ${en.wave} cleared</h2>
    <p class="muted">+${result.xp} XP · +${result.marks} Marks · +${result.gold} Gold${loot ? " · " + loot : ""}${card}</p>
    <p>Score <strong>${en.score}</strong> · HP ${en.hp}/${core.playerMaxHp(state, CARDS.game)}</p>
    <div class="row"><button class="btn" id="nextWave">Next wave</button>
      <button class="btn ghost" id="repairBtn">Repair +20 HP (${CARDS.game.balance.endlessRepairCostPerHp * 20} Marks)</button>
      <button class="btn danger" id="retireBtn">Retire with loot</button></div>
  </div>`;
  content().innerHTML = html;
  bind("#nextWave", () => {
    const r = core.endlessNextWave(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
    uiPending = null;
    sfx("tap");
    after();
  });
  bind("#repairBtn", () => {
    const r = core.endlessRepair(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("coin");
    toast("Repaired +20 HP");
    after();
  });
  bind("#retireBtn", () => {
    confirmModal({
      title: "Retire with loot?",
      body: `<p class="muted">End the run now? You keep XP, loot, and your score (wave ${en.wave}, ${en.score} pts).</p>`,
      confirmLabel: "Retire",
      onConfirm: () => {
        uiPending = core.retireEndless(state, CARDS, CARDS.game, true);
        sfx("win");
        save();
        render();
      },
    });
  });
}

function renderEndlessSummary(result) {
  let html = `<div class="section"><h2>Run complete</h2>
    <p class="muted">Wave ${result.wave} · Score ${result.score} · ${result.kills} kills</p>
    <p class="muted">+${result.xp} XP${result.levels ? " · LEVEL UP!" : ""} · +${result.gold} Gold · +${result.iron} Iron · +${result.marks} Marks${result.card ? " · " + esc(result.card) : ""}</p>
    <button class="btn" id="backEndless">Back to Endless</button>
  </div>`;
  content().innerHTML = html;
  bind("#backEndless", () => {
    uiPending = null;
    sfx("tap");
    after();
  });
}

function renderEndless() {
  if (state.combat) return renderCombat("endless");
  if (uiPending?.kind === "endless_wave_cleared") return renderWaveCleared(uiPending);
  if (uiPending?.kind === "endless_end") return renderEndlessSummary(uiPending);
  if (state.endless) {
    // should not normally be reached
    uiPending = null;
  }
  return renderEndlessMenu();
}

// ---------- shipyard ----------

function renderShipyard() {
  const inv = state.inventory;
  const parts = Object.entries(inv)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`);
  const shipStatus = core.shipStatus(state, CARDS.game);
  const rCost = core.repairCost(state, CARDS.game);
  const ship = core.shipById(CARDS.game, state.shipId);

  let html = maybeHint("shipyard", "Defeats and flees damage your hull. Repair here, then craft bigger ships for more AP and berths.");
  html += `<div class="section"><h2>Cargo</h2>
    <p class="muted">${parts.length ? parts.join(" · ") : "Empty hold"}</p></div>
    <div class="section"><h2>Hull — ${esc(shipStatus.ship.name)}</h2>
    <div class="ship-display">${artImg(ASSETS?.ships?.[state.shipId], "ship-big", shipStatus.ship.name)}</div>
    <div class="hpbar"><i style="width:${shipStatus.pct}%"></i></div>
    <p class="muted">Durability ${shipStatus.pct}% · hull ${ship.hull} · cannons ${ship.cannons} (AP) · berths ${ship.slots}</p>`;
  if (rCost) {
    html += `<p class="muted">Repair costs: ${rCost.Marks} Marks + ${rCost.Wood} Wood</p>
      <button class="btn" id="repairBtn">Repair ship</button>`;
  } else {
    html += `<p class="muted">Seaworthy.</p>`;
  }
  html += `</div>
    <div class="section"><h2>Shipwright</h2>`;
  for (const s of CARDS.game.ships) {
    if (s.id === state.shipId) continue;
    const order = CARDS.game.ships.map((x) => x.id);
    const isNext = order.indexOf(s.id) === order.indexOf(state.shipId) + 1;
    const levelOk = state.character.level >= s.level;
    const missing = core.canPay(state.inventory, s.cost);
    const afford = missing === null;
    const reason = !isNext
      ? "Craft the previous hull first"
      : !levelOk
        ? `Requires level ${s.level}`
        : !afford
          ? `Missing: ${missing}`
          : "";
    html += `<div class="row">
      ${artImg(ASSETS?.ships?.[s.id], "ship-thumb", s.name)}
      <p><strong>${esc(s.name)}</strong> <span class="pill">Lv ${s.level}</span><br/>
      <span class="muted">hull ${s.hull} · AP ${s.cannons} · berths ${s.slots}</span><br/>
      <span class="muted">${fmtCost(s.cost)}${reason ? ` · <span class="warn">${esc(reason)}</span>` : ""}</span></p>
      <button class="btn" data-ship="${s.id}" ${!isNext || !levelOk || !afford ? "disabled" : ""}>Craft</button>
    </div>`;
  }
  html += `</div>
    <div class="section"><h2>Workshop</h2>`;
  for (const r of CARDS.game.recipes) {
    const missing = core.canPay(state.inventory, r.cost);
    const afford = missing === null;
    html += `<div class="row">
      <p><strong>${esc(r.name)}</strong> — ${esc(r.desc)}<br/><span class="muted">${fmtCost(r.cost)} → ${fmtCost(r.gives)}</span></p>
      <span class="muted">${afford ? "" : `<span class="warn">Missing: ${missing}</span>`}</span>
      <button class="btn" data-recipe="${r.id}" ${afford ? "" : "disabled"}>Craft</button>
    </div>`;
  }
  html += `</div>
    <div class="section"><h2>Crew quarters</h2>
    <p class="muted">${state.crew.length}/${ship.slots} crew · each gives +2% damage and +4 HP (cap +10%)</p>
    <button class="btn" id="recruitBtn" ${state.crew.length >= ship.slots ? "disabled" : ""}>Recruit (${fmtCost(CARDS.game.recruitCost)})</button>
    </div>`;
  content().innerHTML = html;
  bindHintClose();
  bind("#repairBtn", () => {
    const r = core.repairShip(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("coin");
    toast("Ship repaired");
    after();
  });
  content().querySelectorAll("[data-ship]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.craftShip(state, CARDS.game, b.dataset.ship);
      if (!r.ok) return toast(r.reason);
      world?.setShip(r.ship.id);
      sfx("unlock");
      buzz([30, 60]);
      toast("Launched the " + r.ship.name + "!");
      after();
    })
  );
  content().querySelectorAll("[data-recipe]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.craftRecipe(state, CARDS.game, b.dataset.recipe);
      if (!r.ok) return toast(r.reason);
      sfx("coin");
      toast("Crafted " + r.r.name);
      after();
    })
  );
  bind("#recruitBtn", () => {
    const r = core.recruitCrew(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    sfx("coin");
    toast(r.name + " joined the crew!");
    after();
  });
}

// ---------- captains ----------

function renderCaptains() {
  let html = maybeHint("captains", "Unlock captains by completing monster and resource missions after level 10. Each has a unique deck.");
  html += `<div class="section"><h2>Captain's Deck</h2>
    <p class="muted">Level ${state.character.level} · ${state.character.xp}/${Math.max(1, state.character.xpToNext)} XP · ${xpPct()}% to next level</p>
    <div class="hpbar"><i style="width:${xpPct()}%"></i></div>
    <p class="muted">Each captain wields a different card pool and a passive ability. Unlock them by completing monster and resource missions.</p>
  </div>`;
  for (const cap of CARDS.game.captains) {
    const unlocked = state.unlockedCaptains.includes(cap.id);
    const equipped = state.captainId === cap.id;
    const prog = core.unlockProgress(state, CARDS.game, cap.id);
    const poolCount = new Set(cap.pool).size;
    const owned = state.collection.filter((id) => cap.pool.includes(id)).length;
    html += `<div class="section captain">
      <div class="row">
        ${artImg(ASSETS?.captains?.[cap.id], "captain-portrait", cap.name)}
        <p><strong>${cap.icon} ${esc(cap.name)}</strong> <span class="muted">— ${esc(cap.title)}</span><br/>
        <span class="muted">${esc(cap.focus)} · ${poolCount} card pool · ${owned} owned</span><br/>
        <span class="pill">${esc(cap.ability.name)}: ${esc(cap.ability.desc)}</span></p>
        ${equipped ? `<span class="pill equipped">EQUIPPED</span>` : ""}
      </div>`;
    if (!unlocked) {
      html += `<div class="mission">`;
      for (const p of prog.parts) {
        html += `<p class="${p.done ? "done" : "muted"}">${p.done ? "✓" : "○"} ${esc(p.label)}</p>`;
      }
      html += `</div>
        <button class="btn" data-unlock="${cap.id}" ${prog.met ? "" : "disabled"}>${prog.met ? "Unlock " + esc(cap.name) : "Locked"}</button>`;
    } else if (!equipped) {
      html += `<button class="btn ghost" data-switch="${cap.id}">Equip</button>`;
    }
    html += `</div>`;
  }
  content().innerHTML = html;
  bindHintClose();
  content().querySelectorAll("[data-unlock]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.unlockCaptain(state, CARDS, CARDS.game, b.dataset.unlock);
      if (!r.ok) return toast(r.reason);
      sfx("unlock");
      buzz([40, 60, 80]);
      toast("Unlocked! Starter cards granted.");
      after();
    })
  );
  content().querySelectorAll("[data-switch]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.switchCaptain(state, CARDS.game, b.dataset.switch);
      if (!r.ok) return toast(r.reason);
      uiDeck = null;
      sfx("coin");
      toast("Now commanding " + core.captainById(CARDS.game, b.dataset.switch).name);
      after();
    })
  );
}

// ---------- collection ----------

function renderCollection() {
  const cap = core.currentCaptain(state, CARDS.game);
  const pool = new Set(cap.pool);
  const owned = state.collection.filter((id) => pool.has(id));
  const counts = {};
  for (const id of owned) counts[id] = (counts[id] || 0) + 1;
  const entries = Object.entries(counts)
    .map(([id, n]) => ({ id, n, power: core.cardPower(CARDS, state, id) }))
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
  const deckSize = core.combatDeck(state, CARDS, CARDS.game).length;
  const sigs = core.signatureCards(state, CARDS.game);
  const working = uiDeck || state.activeDeck || core.autoDeck(state, CARDS, CARDS.game);
  const sigCount = working.filter((id) => sigs.includes(id)).length;

  let html = maybeHint("collection", "Build an 8-card deck — no duplicates, at least 2 signature cards. Spend Marks + duplicates to enhance.");
  html += `<div class="section"><h2>${esc(cap.icon)} ${esc(cap.name)} — crew & cards</h2>
    <p class="muted">Level ${state.character.level} · ${owned.length} owned from ${cap.pool.length}-card pool · combat deck ${deckSize} cards</p>`;
  if (state.crew.length) {
    html += `<p class="muted">Crew: ${state.crew.map((c) => esc(c.name)).join(", ")}</p>`;
  } else {
    html += `<p class="muted">No crew yet — recruit at the Shipyard.</p>`;
  }
  html += `</div>
    <div class="section"><h2>Deck builder</h2>
      <p class="muted">8 cards · no duplicates · at least 2 of ${esc(cap.name)}'s signature cards (${sigCount}/2)</p>
      <div class="hand">`;
  for (const id of working) {
    const base = CARDS.byId[id];
    const isSig = sigs.includes(id);
    html += `<div class="card ${rarityClass(id)} deck-slot">
      ${artImg(cardArt(id), "card-art", base?.name)}
      <strong>${esc(base?.name || id)} ${isSig ? `<span class="sig-badge">SIG</span>` : ""}</strong>
      <button class="btn mini ghost" data-deck-rm="${id}">Remove</button>
    </div>`;
  }
  html += `</div>
      <div class="row">
        <button class="btn mini" id="deckAuto">Auto-build</button>
        <button class="btn mini ghost" id="deckClear">Clear</button>
        <button class="btn mini" id="deckEquip">Equip deck</button>
      </div>
      <p class="muted">Presets (save / load):</p>
      <div class="row">`;
  state.deckPresets.forEach((p, i) => {
    html += `<button class="btn mini ghost" data-preset-load="${i}" title="${esc(p.name)}: ${p.ids?.length || 0} cards">${esc(p.name)} (${p.ids?.length || 0})</button>`;
  });
  html += `</div>
      <div class="row"><button class="btn mini ghost" id="presetSave">Save deck to selected preset</button>
      <select id="presetPick" class="mini-select">${state.deckPresets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("")}</select></div>
      <p class="muted">Tap cards below to add/remove:</p>
      <div class="hand">`;
  for (const e of entries) {
    const inDeck = working.includes(e.id);
    const isSig = sigs.includes(e.id);
    html += `<button class="card ${rarityClass(e.id)} ${inDeck ? "in-deck" : ""}" data-deck-add="${e.id}">
      ${artImg(cardArt(e.id), "card-art", CARDS.byId[e.id]?.name)}
      <strong>${esc(CARDS.byId[e.id]?.name)} ${isSig ? `<span class="sig-badge">SIG</span>` : ""}</strong>
      <span class="cardline">${cardLine(e.id)}</span>
      ${inDeck ? `<span class="muted">✓ in deck</span>` : ""}
    </button>`;
  }
  html += `</div></div>
    <div class="section"><h2>Rarities</h2>
      <p class="muted">Rare cards drop from level ${CARDS.game.balance.rarityLevels.rare}+, Epic from ${CARDS.game.balance.rarityLevels.epic}+, Legendary from ${CARDS.game.balance.rarityLevels.legendary}+.</p>
      <p><span class="pill rarity common">Common</span> <span class="pill rarity rare">Rare</span> <span class="pill rarity epic">Epic</span> <span class="pill rarity legendary">Legendary</span></p>
    </div>
    <div class="section"><h2>Enhance cards</h2>
    <p class="muted">Spend ${fmtCost(CARDS.game.balance.enhanceCost)} + one duplicate to power up a card (+1 dmg or shield, +2 heal, max +${CARDS.game.balance.enhanceMax}).</p>
    <div class="hand">`;
  for (const e of entries.slice(0, 24)) {
    const base = CARDS.byId[e.id];
    const enh = state.enhancements?.[e.id] || 0;
    const maxed = enh >= CARDS.game.balance.enhanceMax;
    html += `<div class="card ${rarityClass(e.id)}">
      ${artImg(cardArt(e.id), "card-art", base.name)}
      <strong>${esc(base.name)} ×${e.n}</strong>
      <span class="cardline">${cardLine(e.id)}</span>
      <span class="muted">${rarityLabel(e.id)} ${enh ? `· ENH +${enh}` : ""}</span><br/>
      <button class="btn mini" data-enhance="${e.id}" ${e.n < 2 || maxed ? "disabled" : ""}>${maxed ? "Max" : "Enhance"}</button>
    </div>`;
  }
  html += `</div></div>
    <div class="section"><h2>About</h2>
      <p class="muted">Piration v3 · offline-only · progress saved on device. Inspired by open-sourced Pirate Nation materials (CC0/MIT). Not affiliated with Proof of Play.</p>
    </div>
    <div class="section"><h2>Debug</h2>
      <p class="muted">Playtest tools — wipe, grant, and travel.</p>
      <div class="row">
        <button class="btn mini ghost" id="debugXp">+5000 XP</button>
        <button class="btn mini ghost" id="debugRes">+50 resources</button>
        <button class="btn mini ghost" id="debugCaps">Unlock captains</button>
        <button class="btn mini ghost" id="debugJumpHub">Sail home</button>
        <button class="btn mini ghost" id="debugJumpAbyss">Sail to Abyss</button>
        <button class="btn mini ghost" id="debugJumpGilded">Sail to Gilded</button>
      </div>
    </div>
    <div class="section"><h2>Ledger</h2>
    <p class="muted">Voyages ${state.stats.voyages} · Fights ${state.stats.fights} · W/L ${state.stats.wins}/${state.stats.losses} · Kills ${state.stats.kills} (elites ${state.stats.eliteKills}, bosses ${state.stats.bossKills})</p>
    <p class="muted">Endless runs ${state.stats.endlessRuns} · best wave ${state.stats.endlessBestWave} · best score ${state.stats.endlessBestScore}</p>
    <p class="muted">XP earned ${state.stats.xpGained} · resources collected ${state.stats.resourcesCollected} · cards found ${state.stats.cardsFound} · Marks earned ${state.stats.marksEarned}</p>
    <div class="row"><button class="btn ghost" id="exportBtn">Export save</button>
      <button class="btn ghost" id="importBtn">Import save</button>
      <button class="btn danger" id="resetBtn">Reset</button></div>
  </div>`;
  content().innerHTML = html;
  bindHintClose();
  content().querySelectorAll("[data-deck-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const deck = uiDeck || state.activeDeck || core.autoDeck(state, CARDS, CARDS.game);
      if (deck.includes(b.dataset.deckAdd)) return toast("Already in deck");
      if (deck.length >= 8) return toast("Deck is full (8 cards)");
      uiDeck = deck.concat(b.dataset.deckAdd);
      sfx("card");
      render();
    })
  );
  content().querySelectorAll("[data-deck-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      const deck = uiDeck || state.activeDeck || core.autoDeck(state, CARDS, CARDS.game);
      uiDeck = deck.filter((x) => x !== b.dataset.deckRm);
      sfx("tap");
      render();
    })
  );
  bind("#deckAuto", () => {
    uiDeck = core.autoDeck(state, CARDS, CARDS.game);
    sfx("tap");
    render();
  });
  bind("#deckClear", () => {
    uiDeck = [];
    render();
  });
  bind("#deckEquip", () => {
    const v = core.validateDeck(uiDeck || [], state, CARDS, CARDS.game);
    if (!v.ok) return toast(v.reason);
    state.activeDeck = uiDeck.slice();
    save();
    sfx("coin");
    toast("Deck equipped");
    render();
  });
  bind("#presetSave", () => {
    const v = core.validateDeck(uiDeck || [], state, CARDS, CARDS.game);
    if (!v.ok) return toast(v.reason);
    const idx = +($("#presetPick")?.value || 0);
    state.deckPresets[idx].ids = uiDeck.slice();
    save();
    sfx("coin");
    toast("Saved to " + state.deckPresets[idx].name);
    render();
  });
  content().querySelectorAll("[data-preset-load]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = state.deckPresets[+b.dataset.presetLoad];
      uiDeck = p.ids ? p.ids.slice() : core.autoDeck(state, CARDS, CARDS.game);
      sfx("tap");
      render();
    })
  );
  content().querySelectorAll("[data-enhance]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.enhanceCard(state, CARDS, CARDS.game, b.dataset.enhance);
      if (!r.ok) return toast(r.reason);
      sfx("card");
      toast(r.card.name + " enhanced to +" + r.level);
      after();
    })
  );
  bind("#exportBtn", () => {
    const txt = core.serialize(state);
    try {
      navigator.clipboard?.writeText(txt);
      sfx("coin");
      toast("Save copied to clipboard");
    } catch {
      prompt("Copy your save:", txt);
    }
  });
  bind("#importBtn", () => {
    openModal({
      title: "Import save",
      body: `<p class="muted">Paste a Piration save below. This replaces your current progress.</p>
        <textarea id="importText" rows="4" placeholder="Paste save here…" style="width:100%;background:#0f1c30;color:var(--text);border:1px solid #3a557c;border-radius:8px;padding:8px;font-family:monospace;font-size:0.75rem;"></textarea>`,
      actions: [
        { label: "Cancel", style: "ghost", fn: () => {} },
        {
          label: "Import",
          fn: () => {
            const raw = $("#importText")?.value;
            if (!raw) return toast("Nothing to import");
            const s = core.deserialize(raw, CARDS, CARDS.game);
            state = s;
            sfx("coin");
            toast("Save imported");
            after();
          },
        },
      ],
    });
  });
  bind("#resetBtn", () => {
    confirmModal({
      title: "Reset save?",
      body: `<p class="muted">This wipes all progress on this device and starts a fresh captain. This cannot be undone.</p>`,
      confirmLabel: "Reset",
      danger: true,
      onConfirm: () => {
        state = core.newGame(CARDS, CARDS.game);
        sfx("lose");
        toast("Fresh captain on the dock");
        after();
      },
    });
  });
  bind("#debugXp", () => {
    const r = core.addXp(state, CARDS.game, 5000);
    sfx("level");
    toast("+5000 XP" + (r.levels ? ` · ${r.levels} levels!` : ""));
    after();
  });
  bind("#debugRes", () => {
    for (const k of ["Wood", "Cotton", "Iron", "GoldNugget", "CannonPart", "MapFragment", "Rum"]) {
      state.inventory[k] = (state.inventory[k] || 0) + 50;
    }
    sfx("coin");
    toast("+50 of every resource");
    after();
  });
  bind("#debugCaps", () => {
    for (const cap of CARDS.game.captains) {
      if (!state.unlockedCaptains.includes(cap.id)) {
        state.unlockedCaptains.push(cap.id);
        core.unlockCaptain(state, CARDS, CARDS.game, cap.id);
      }
    }
    sfx("unlock");
    toast("All captains unlocked");
    after();
  });
  bind("#debugJumpHub", () => {
    world?.jumpTo("hub");
    closeGamePanel();
  });
  bind("#debugJumpAbyss", () => {
    world?.jumpTo("abyss");
    closeGamePanel();
  });
  bind("#debugJumpGilded", () => {
    world?.jumpTo("gilded");
    closeGamePanel();
  });
}

// ---------- help ----------

function renderHelp() {
  let html = `<div class="section"><h2>How to play</h2>
    <ol class="help">
      <li><strong>Voyage</strong> — pick a zone and sail. Each voyage is 3 random encounters plus an optional boss. Fight, bribe, or flee.</li>
      <li><strong>Loot</strong> — monsters drop resources, Marks, Gold, and cards. Spend them at the Shipyard.</li>
      <li><strong>Shipyard</strong> — craft ships (more hull/AP/berths), repair after defeats, craft parts, recruit crew.</li>
      <li><strong>Captains</strong> — reach level 10, then complete monster/resource missions to unlock captains with unique card pools and abilities.</li>
      <li><strong>Endless</strong> — survive waves for score, XP, and unlock missions.</li>
      <li><strong>Maxing out</strong> — level 20, the Galleon, all eight captains, and enhanced cards take about 20 hours.</li>
    </ol>
    <button class="btn" id="helpOk">Aye aye!</button></div>`;
  content().innerHTML = html;
  bind("#helpOk", () => {
    state.sawHelp = true;
    sfx("tap");
    save();
    render();
  });
}

// ---------- render ----------

function render() {
  document.body.classList.toggle("in-battle", !!state.combat);
  refreshStats();
  if (!state.sawHelp) return renderHelp();
  updateMusic();
  if (tab === "voyage") renderVoyage();
  else if (tab === "endless") renderEndless();
  else if (tab === "shipyard") renderShipyard();
  else if (tab === "captains") renderCaptains();
  else renderCollection();
}

function bindTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    tab = btn.dataset.tab;
    sfx("tap");
    $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
  bind("#helpBtn", () => {
    state.sawHelp = false;
    render();
  });
  bind("#soundBtn", () => {
    state.soundOn = !state.soundOn;
    save();
    refreshStats();
    if (state.soundOn) {
      sfx("coin");
      startAmbience();
    } else {
      stopAmbience();
    }
  });
  bind("#modal", (e) => {
    if (e.target?.id === "modal") closeModal();
  });
  bind("#menuBtn", () => openGamePanel("menu"));
  bind("#closePanelBtn", () => closeGamePanel());
  bind("#buildBtn", () => {
    world?.setBuildMode(!world.buildMode);
    sfx("tap");
  });
  bind("#buildRotate", () => {
    world?.rotateBuild();
    sfx("tap");
  });
  bind("#buildUndo", () => world?.undoBuild());
  bind("#buildClose", () => world?.setBuildMode(false));
  document.querySelectorAll("#buildBar [data-prop]").forEach((b) =>
    b.addEventListener("click", () => {
      world?.setBuildProp(b.dataset.prop);
      sfx("tap");
    })
  );
}

function setupBackButton() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;
  App.addListener("backButton", () => {
    if (modalActive) return closeModal();
    if (panelOpen) return closeGamePanel();
    if (state.combat) {
      confirmModal({
        title: "Retreat?",
        body: `<p class="muted">Leave this battle? The voyage ends and your hull takes damage.</p>`,
        confirmLabel: "Retreat",
        danger: true,
        onConfirm: () => {
          core.retreatFromCombat(state, CARDS, CARDS.game);
          uiPending = null;
          save();
          render();
        },
      });
    } else if (tab !== "voyage") {
      tab = "voyage";
      render();
    } else if (state.voyage) {
      confirmModal({
        title: "Return to port?",
        body: `<p class="muted">Abandon the current voyage and sail home?</p>`,
        confirmLabel: "Return",
        onConfirm: () => {
          core.returnToPort(state);
          save();
          render();
        },
      });
    } else {
      App.exitApp?.();
    }
  });
}

// ---------- 3D world integration ----------

function openGamePanel(which) {
  panelOpen = true;
  const app = $("#app");
  app.style.display = "flex";
  if (which && which !== "menu") tab = which;
  render();
}

function closeGamePanel() {
  panelOpen = false;
  $("#app").style.display = "none";
  render();
}

function updateWorldHUD(h) {
  const modeLabel = { sail: "Sailing", walk: "Walking", swim: "Swimming" }[h.mode] || "Sailing";
  const modeEl = $("#hudMode");
  if (modeEl) modeEl.textContent = modeLabel;
  const zoneEl = $("#hudZone");
  if (zoneEl) zoneEl.textContent = h.zone ? "Near " + h.zone : "";
  const speedEl = $("#hudSpeed");
  if (speedEl) speedEl.textContent = h.mode === "sail" && h.speed ? h.speed + " kn" : "";
  core.regenEnergy(state, CARDS.game);
  const energyEl = $("#hudEnergy");
  if (energyEl) {
    energyEl.textContent = CARDS.game.balance.energy.unlimited
      ? "⚡ ∞"
      : "⚡ " + state.energy + "/" + state.energyMax;
  }
  const marksEl = $("#hudMarks");
  if (marksEl) marksEl.textContent = "⛁ " + state.inventory.Marks;
  const goldEl = $("#hudGold");
  if (goldEl) goldEl.textContent = "¤ " + state.inventory.Gold;
  const resEl = $("#hudRes");
  if (resEl) resEl.textContent = "🪵 " + state.inventory.Wood;
  const actionBtn = $("#worldAction");
  if (actionBtn) {
    actionBtn.textContent = h.action?.enabled ? h.action.label : "—";
    actionBtn.disabled = !h.action?.enabled;
  }
  const buildBtn = $("#buildBtn");
  if (buildBtn) {
    buildBtn.style.display = h.mode === "walk" && h.zone === "Parrot's Perch" ? "" : "none";
  }
  const buildBar = $("#buildBar");
  if (buildBar) {
    buildBar.style.display = h.buildMode ? "" : "none";
    buildBar.querySelectorAll("[data-prop]").forEach((b) => {
      b.classList.toggle("active", b.dataset.prop === h.buildProp);
    });
  }
}

function startWorldAmbush(mobId) {
  const flash = $("#ambushFlash");
  if (flash) {
    flash.style.display = "grid";
    setTimeout(() => {
      flash.style.display = "none";
    }, 1600);
  }
  const cost = CARDS.game.balance.energy.combatCost;
  const sp = core.spendEnergy(state, CARDS.game, cost);
  if (!sp.ok) return toast(sp.reason + " — the thing slips back beneath the waves.");
  if (state.combat || state.voyage) return toast("You're already engaged!");
  const zoneMap = { guppy_raider: "shallows", reef_horror: "reefs", abyssal_tender: "abyss" };
  const zoneId = zoneMap[mobId] || "opensea";
  state.voyage = {
    zoneId,
    encounters: [{ type: "monster", monsterId: mobId, zoneId, isElite: false, isBoss: false }],
    index: 0,
    bossRemaining: false,
    playerHp: core.playerMaxHp(state, CARDS.game),
    results: [],
    startedAt: Date.now(),
  };
  const r = core.startFight(state, CARDS, CARDS.game);
  if (!r.ok) {
    state.voyage = null;
    return toast(r.reason);
  }
  sfx("start");
  world?.setBattle(true, mobId);
  openGamePanel("voyage");
}

function initWorld() {
  const canvas = document.getElementById("worldCanvas");
  if (!canvas) return;
  world = new PirationWorld(canvas, {
    getShipId: () => state.shipId,
    getGatherCost: () => CARDS.game.balance.energy.gatherCost,
    getEnergy: () => {
      core.regenEnergy(state, CARDS.game);
      return state.energy;
    },
    spendEnergy: (n) => core.spendEnergy(state, CARDS.game, n),
    getBuildings: () => state.buildings,
    saveBuildings: (list) => {
      state.buildings = list;
      save();
    },
    grantResource: (k, v) => {
      state.inventory[k] = (state.inventory[k] || 0) + v;
      save();
    },
    toast: (m) => toast(m),
    sfx: (k) => sfx(k),
    openPanel: (which) => openGamePanel(which),
    onHUD: (h) => updateWorldHUD(h),
    startAmbush: (mobId) => startWorldAmbush(mobId),
  });
  world.init().catch((e) => console.error("world init failed", e));
}

async function boot() {
  const [cardsRes, gameRes, assetsRes] = await Promise.all([
    fetch("./data/cards.json"),
    fetch("./data/game.json"),
    fetch("./assets/manifest.json"),
  ]);
  const cardsData = await cardsRes.json();
  const game = await gameRes.json();
  ASSETS = await assetsRes.json();
  CARDS.list = cardsData.cards;
  CARDS.byId = Object.fromEntries(cardsData.cards.map((c) => [c.id, c]));
  CARDS.game = game;
  state = core.deserialize(localStorage.getItem(STORAGE_KEY), CARDS, game);
  if (typeof state.soundOn !== "boolean") state.soundOn = true;
  if (!state.hints) state.hints = {};
  bindTabs();
  setupBackButton();
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("keydown", unlockAudio, { once: true });
  render();
  if (!state.sawHelp) openGamePanel();
  initWorld();
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  window.Capacitor?.Plugins?.App?.addListener?.("pause", save);
  setInterval(() => {
    // keep header current without stealing focus from combat
    refreshStats();
  }, 2000);
  setInterval(() => {
    if (ambience?.windGain && world?.ship?.userData?.speed != null && audioCtx) {
      const s = world.ship.userData.speed || 0;
      ambience.windGain.gain.setTargetAtTime(0.02 + Math.min(0.14, s * 0.01), audioCtx.currentTime, 0.3);
    }
  }, 300);
}

boot().catch((err) => {
  console.error(err);
  $("#stats").textContent = "Couldn't start the game.";
  const c = document.getElementById("content");
  if (c) {
    c.innerHTML = `<div class="section"><h2>Needs a local server</h2>
      <p class="muted">The game loads its data over http. Double-click <strong>PLAY.bat</strong> in the project root, or run <code>cd android && npm run serve</code>.</p></div>`;
  }
});
