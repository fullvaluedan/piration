import * as core from "./core.js";

const STORAGE_KEY = "piration_v3";

let CARDS = { list: [], byId: {}, game: null };
let state = null;
let tab = "voyage";
let toastTimer = null;
let uiPending = null; // transient result screens (not persisted)

const $ = (sel) => document.querySelector(sel);
const content = () => $("#content");

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
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

function xpPct() {
  const c = state.character;
  if (c.level >= core.MAX_LEVEL) return 100;
  return Math.min(100, Math.round((c.xp / Math.max(1, c.xpToNext)) * 100));
}

function bind(sel, fn) {
  const el = $(sel);
  el?.addEventListener("click", fn);
}

// ---------- header ----------

function refreshStats() {
  const cap = core.currentCaptain(state, CARDS.game);
  const ship = core.shipStatus(state, CARDS.game);
  const uniq = new Set(state.collection || []).size;
  const inv = state.inventory;
  $("#stats").innerHTML = `
    <div class="statline">
      <span>${esc(cap?.icon || "☠")} ${esc(cap?.name || "-")} · Lv${state.character.level}</span>
      <span>${xpPct()}% XP</span>
    </div>
    <div class="statline muted">
      <span>Marks ${inv.Marks} · Gold ${inv.Gold}</span>
      <span>${esc(ship.ship.name)} ${ship.pct}%</span>
      <span>${uniq} cards</span>
    </div>`;
}

// ---------- voyage ----------

function renderZones() {
  const lvl = state.character.level;
  let html = `<div class="section"><h2>Set Sail</h2>
    <p class="muted">Every voyage is a run of random encounters — monsters, elites, and caches. Monsters drop loot and cards. No energy: risk and hull repair keep you honest.</p>`;
  for (const z of CARDS.game.zones) {
    const locked = lvl < z.minLevel;
    const danger = z.minLevel <= 6 ? "safe" : z.minLevel <= 12 ? "mid" : "hard";
    html += `<div class="row zone ${locked ? "locked" : ""}">
      <p>
        <strong>${esc(z.name)}</strong> <span class="pill danger-${danger}">${locked ? `Lv ${z.minLevel}` : "Open"}</span><br/>
        <span class="muted">${esc(z.desc)}</span>
      </p>
      <button class="btn" data-zone="${z.id}" ${locked ? "disabled" : ""}>${locked ? "Locked" : "Sail"}</button>
    </div>`;
  }
  html += `</div>
  <div class="section"><h2>The Loop</h2>
    <p class="muted">Sail → fight random monsters → loot resources and cards → return to port → craft ships, recruit crew, enhance cards → unlock captains via missions → chase the Endless high score.</p>
  </div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-zone]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.startVoyage(state, CARDS.game, b.dataset.zone);
      if (!r.ok) return toast(r.reason);
      toast("Set sail!");
      after();
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
    toast(`Cache +${r.marks} Marks · ${fmtLoot(r.loot)} · +${r.xp} XP`);
    after();
  });
  bind("#fightBtn", () => {
    const r = core.startFight(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
    after();
  });
  bind("#bribeBtn", () => {
    const r = core.bribeEncounter(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    toast("Bribed your way past. +6 XP");
    after();
  });
  bind("#fleeBtn", () => {
    core.fleeEncounter(state, CARDS.game);
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
  let html = `<div class="section"><h2>Victory</h2>
    <p class="muted">+${result.xp} XP · +${result.marks} Marks · +${result.gold} Gold${loot ? " · " + loot : ""}${card}${lv}</p>`;
  if (result.kind === "voyage_continue") {
    html += `<div class="row"><button class="btn" id="continueBtn">Continue voyage</button>
      <button class="btn ghost" id="dockBtn">Return to port</button></div>`;
  } else if (result.kind === "voyage_end") {
    html += `<button class="btn" id="dockBtn">Return to port</button>`;
  } else if (result.kind === "voyage_defeat") {
    html = `<div class="section"><h2 class="defeat">Defeated</h2>
      <p class="muted">Your ship took hull damage. Repair it at the Shipyard. (+${result.xp} XP)</p>
      <button class="btn" id="dockBtn">Return to port</button></div>`;
  }
  html += `</div>`;
  content().innerHTML = html;
  bind("#continueBtn", () => {
    core.continueVoyage(state, CARDS.game);
    uiPending = null;
    after();
  });
  bind("#dockBtn", () => {
    core.returnToPort(state);
    uiPending = null;
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
    after();
  });
  bind("#skipBoss", () => {
    core.skipBoss(state, CARDS.game);
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
  if (state.captainId === "cetus") dmg = Math.round(dmg * 0.9);
  if (e.charged) dmg = Math.round(dmg * 1.6);
  return `Attack (~${dmg})`;
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
  let html = `<div class="section battle">
    <h2>${esc(c.enemy.name)}</h2>
    <div class="muted">${c.mode === "endless" ? `Wave ${c.endless?.wave || ""}` : ""} · ${esc(c.encounter.isElite ? "Elite" : c.encounter.isBoss ? "Boss" : "Monster")}</div>
    <div class="hpbar enemy"><i style="width:${ehp}%"></i></div>
    <div class="intent">${esc(enemyIntentText(c))}</div>
    <div class="row"><span>You: ${c.playerHp}/${c.playerMaxHp} HP · ${c.playerShield} SH</span>
      <span>AP ${c.ap}/${c.maxAp} · Turn ${c.turn}</span></div>
    <div class="hpbar"><i style="width:${php}%"></i></div>`;

  if (c.over) {
    html += `<p class="${c.won ? "victory" : "defeat"}">${c.won ? "VICTORY" : "DEFEAT"}</p>
      <button class="btn" id="collectBtn">${c.won ? "Collect loot" : "Continue"}</button>`;
  } else {
    html += `<div class="hand">`;
    c.hand.forEach((id, i) => {
      const base = CARDS.byId[id];
      const dis = !base || c.ap < base.ap;
      html += `<button class="card ${rarityClass(id)} ${dis ? "disabled" : ""}" data-hand="${i}" ${dis ? "disabled" : ""}>
        <strong>${esc(base?.name || id)}</strong>
        <span class="cardline">${cardLine(id)}</span>
      </button>`;
    });
    html += `</div>
      <div class="row"><button class="btn danger" id="endTurn">End turn</button></div>`;
  }
  html += `</div>
    <div class="section"><h2>Log</h2><div class="log">${esc((c.log || []).slice(-8).join("\n"))}</div></div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-hand]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.playCard(state, CARDS, CARDS.game, +b.dataset.hand);
      if (!r.ok) toast(r.reason);
      save();
      render();
    })
  );
  bind("#endTurn", () => {
    core.endTurn(state, CARDS, CARDS.game);
    save();
    render();
  });
  bind("#collectBtn", () => {
    uiPending = core.collectCombatResult(state, CARDS, CARDS.game);
    if (uiPending.kind === "endless_next") {
      core.endlessNextEnemy(state, CARDS, CARDS.game);
      uiPending = null;
    }
    save();
    render();
  });
}

// ---------- endless ----------

function renderEndlessMenu() {
  const best = state.stats.endlessBestWave || 0;
  let html = `<div class="section"><h2>Endless Mode</h2>
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
      html += `${i + 1}. ${e.score} pts — wave ${e.wave}, ${e.kills} kills (${esc(cap?.name || e.captain)}) ${new Date(e.date).toLocaleDateString()}\n`;
    });
    html += `</div>`;
  }
  html += `</div>
  <div class="section"><h2>Unlock missions</h2><p class="muted">Endless is also a mission path: kill ${CARDS.game.captains.find((c) => c.id === "bones").unlock.endlessKills} enemies to unlock Salty Bones, reach wave ${CARDS.game.captains.find((c) => c.id === "oz").unlock.endlessWave} for Mapmaker Oz…</p></div>`;
  content().innerHTML = html;
  bind("#startEndless", () => {
    const r = core.startEndless(state, CARDS, CARDS.game);
    if (!r.ok) return toast(r.reason);
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
    after();
  });
  bind("#repairBtn", () => {
    const r = core.endlessRepair(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    toast("Repaired +20 HP");
    after();
  });
  bind("#retireBtn", () => {
    uiPending = core.retireEndless(state, CARDS, CARDS.game, true);
    save();
    render();
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

  let html = `<div class="section"><h2>Cargo</h2>
    <p class="muted">${parts.length ? parts.join(" · ") : "Empty hold"}</p></div>
    <div class="section"><h2>Hull — ${esc(shipStatus.ship.name)}</h2>
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
    const afford = core.canPay(state.inventory, s.cost) === null;
    html += `<div class="row">
      <p><strong>${esc(s.name)}</strong> <span class="pill">Lv ${s.level}</span><br/>
      <span class="muted">hull ${s.hull} · AP ${s.cannons} · berths ${s.slots}</span><br/>
      <span class="muted">${fmtCost(s.cost)}</span></p>
      <button class="btn" data-ship="${s.id}" ${!isNext || !levelOk || !afford ? "disabled" : ""}>Craft</button>
    </div>`;
  }
  html += `</div>
    <div class="section"><h2>Workshop</h2>`;
  for (const r of CARDS.game.recipes) {
    const afford = core.canPay(state.inventory, r.cost) === null;
    html += `<div class="row">
      <p><strong>${esc(r.name)}</strong> — ${esc(r.desc)}<br/><span class="muted">${fmtCost(r.cost)} → ${fmtCost(r.gives)}</span></p>
      <button class="btn" data-recipe="${r.id}" ${afford ? "" : "disabled"}>Craft</button>
    </div>`;
  }
  html += `</div>
    <div class="section"><h2>Crew quarters</h2>
    <p class="muted">${state.crew.length}/${ship.slots} crew · each gives +2% damage and +4 HP (cap +10%)</p>
    <button class="btn" id="recruitBtn" ${state.crew.length >= ship.slots ? "disabled" : ""}>Recruit (${fmtCost(CARDS.game.recruitCost)})</button>
    </div>`;
  content().innerHTML = html;
  bind("#repairBtn", () => {
    const r = core.repairShip(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    toast("Ship repaired");
    after();
  });
  content().querySelectorAll("[data-ship]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.craftShip(state, CARDS.game, b.dataset.ship);
      if (!r.ok) return toast(r.reason);
      toast("Launched the " + r.ship.name + "!");
      after();
    })
  );
  content().querySelectorAll("[data-recipe]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.craftRecipe(state, CARDS.game, b.dataset.recipe);
      if (!r.ok) return toast(r.reason);
      toast("Crafted " + r.r.name);
      after();
    })
  );
  bind("#recruitBtn", () => {
    const r = core.recruitCrew(state, CARDS.game);
    if (!r.ok) return toast(r.reason);
    toast(r.name + " joined the crew!");
    after();
  });
}

// ---------- captains ----------

function renderCaptains() {
  let html = `<div class="section"><h2>Captain's Deck</h2>
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
  content().querySelectorAll("[data-unlock]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.unlockCaptain(state, CARDS, CARDS.game, b.dataset.unlock);
      if (!r.ok) return toast(r.reason);
      toast("Unlocked! Starter cards granted.");
      after();
    })
  );
  content().querySelectorAll("[data-switch]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.switchCaptain(state, CARDS.game, b.dataset.switch);
      if (!r.ok) return toast(r.reason);
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

  let html = `<div class="section"><h2>${esc(cap.icon)} ${esc(cap.name)} — crew & cards</h2>
    <p class="muted">Level ${state.character.level} · ${owned.length} owned from ${cap.pool.length}-card pool · combat deck ${deckSize} (best 30)</p>`;
  if (state.crew.length) {
    html += `<p class="muted">Crew: ${state.crew.map((c) => esc(c.name)).join(", ")}</p>`;
  } else {
    html += `<p class="muted">No crew yet — recruit at the Shipyard.</p>`;
  }
  html += `</div>
    <div class="section"><h2>Enhance cards</h2>
    <p class="muted">Spend ${fmtCost(CARDS.game.balance.enhanceCost)} + one duplicate to power up a card (+1 dmg or shield, +2 heal, max +${CARDS.game.balance.enhanceMax}).</p>
    <div class="hand">`;
  for (const e of entries.slice(0, 24)) {
    const base = CARDS.byId[e.id];
    const enh = state.enhancements?.[e.id] || 0;
    const maxed = enh >= CARDS.game.balance.enhanceMax;
    html += `<div class="card ${rarityClass(e.id)}">
      <strong>${esc(base.name)} ×${e.n}</strong>
      <span class="cardline">${cardLine(e.id)}</span>
      <span class="muted">${rarityLabel(e.id)} ${enh ? `· ENH +${enh}` : ""}</span><br/>
      <button class="btn mini" data-enhance="${e.id}" ${e.n < 2 || maxed ? "disabled" : ""}>${maxed ? "Max" : "Enhance"}</button>
    </div>`;
  }
  html += `</div></div>
    <div class="section"><h2>Ledger</h2>
    <p class="muted">Voyages ${state.stats.voyages} · Fights ${state.stats.fights} · W/L ${state.stats.wins}/${state.stats.losses} · Kills ${state.stats.kills} (elites ${state.stats.eliteKills}, bosses ${state.stats.bossKills})</p>
    <p class="muted">Endless runs ${state.stats.endlessRuns} · best wave ${state.stats.endlessBestWave} · best score ${state.stats.endlessBestScore}</p>
    <p class="muted">XP earned ${state.stats.xpGained} · resources collected ${state.stats.resourcesCollected} · cards found ${state.stats.cardsFound} · Marks earned ${state.stats.marksEarned}</p>
    <div class="row"><button class="btn ghost" id="exportBtn">Export save</button>
      <button class="btn ghost" id="importBtn">Import save</button>
      <button class="btn danger" id="resetBtn">Reset</button></div>
  </div>`;
  content().innerHTML = html;
  content().querySelectorAll("[data-enhance]").forEach((b) =>
    b.addEventListener("click", () => {
      const r = core.enhanceCard(state, CARDS, CARDS.game, b.dataset.enhance);
      if (!r.ok) return toast(r.reason);
      toast(r.card.name + " enhanced to +" + r.level);
      after();
    })
  );
  bind("#exportBtn", () => {
    const txt = core.serialize(state);
    try {
      navigator.clipboard?.writeText(txt);
      toast("Save copied to clipboard");
    } catch {
      prompt("Copy your save:", txt);
    }
  });
  bind("#importBtn", () => {
    const raw = prompt("Paste a Piration save:");
    if (!raw) return;
    const s = core.deserialize(raw, CARDS, CARDS.game);
    state = s;
    toast("Save imported");
    after();
  });
  bind("#resetBtn", () => {
    if (!confirm("Wipe local save and start over?")) return;
    state = core.newGame(CARDS, CARDS.game);
    toast("Fresh captain on the dock");
    after();
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
      <li><strong>Maxing out</strong> — level 30, the Dreadnought, all six captains, and enhanced cards take about 20 hours.</li>
    </ol>
    <button class="btn" id="helpOk">Aye aye!</button></div>`;
  content().innerHTML = html;
  bind("#helpOk", () => {
    state.sawHelp = true;
    save();
    render();
  });
}

// ---------- render ----------

function render() {
  refreshStats();
  if (!state.sawHelp) return renderHelp();
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
    $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
  bind("#helpBtn", () => {
    state.sawHelp = false;
    render();
  });
}

async function boot() {
  const [cardsRes, gameRes] = await Promise.all([
    fetch("./data/cards.json"),
    fetch("./data/game.json"),
  ]);
  const cardsData = await cardsRes.json();
  const game = await gameRes.json();
  CARDS.list = cardsData.cards;
  CARDS.byId = Object.fromEntries(cardsData.cards.map((c) => [c.id, c]));
  CARDS.game = game;
  state = core.deserialize(localStorage.getItem(STORAGE_KEY), CARDS, game);
  bindTabs();
  render();
  setInterval(() => {
    // keep header current without stealing focus from combat
    refreshStats();
  }, 2000);
}

boot().catch((err) => {
  console.error(err);
  $("#stats").textContent = "Failed to load game data";
});
