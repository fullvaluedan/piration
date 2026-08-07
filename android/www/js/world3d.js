// Piration 3D world — 16:9 open-sea adventure rendered with the real
// CC0 Pirate Nation voxel models (glTF/glb), procedural islands, sailing,
// walking, swimming, gathering, and open-sea ambushes.

import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/meshopt_decoder.module.js";
import { EffectComposer } from "../vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "../vendor/jsm/postprocessing/ShaderPass.js";

const WATER_Y = 0;
const WORLD_R = 520;

const ISLANDS = [
  { id: "hub", name: "Parrot's Perch", pos: [0, 0], r: 60, seed: 101, arch: "standard" },
  { id: "shallows", name: "Sunny Shallows", pos: [155, 0], r: 44, seed: 202, arch: "standard" },
  { id: "trade", name: "Trade Routes", pos: [-150, 135], r: 50, seed: 303, arch: "mesa" },
  { id: "opensea", name: "Open Sea", pos: [205, -165], r: 54, seed: 404, arch: "mountain" },
  { id: "reefs", name: "Sunken Reefs", pos: [-255, -135], r: 56, seed: 505, arch: "atoll" },
  { id: "triangle", name: "Devil's Triangle", pos: [-45, -265], r: 60, seed: 606, arch: "mountain" },
  { id: "abyss", name: "The Abyss", pos: [335, 95], r: 66, seed: 707, arch: "mesa" },
  { id: "skullbone", name: "Skullbone Cove", pos: [95, 250], r: 50, seed: 808, arch: "mesa" },
  { id: "gilded", name: "Gilded Straits", pos: [-330, 65], r: 62, seed: 909, arch: "atoll" },
];

const MODELS = {
  player: "player",
  ship_skiff: "ship_skiff",
  ship_sloop: "ship_sloop",
  ship_frigate: "ship_frigate",
  ship_galleon: "ship_galleon",
  mob_anglerfish: "mob_anglerfish",
  mob_deepone: "mob_deepone",
  mob_charybdis: "mob_charybdis",
  prop_shipwright: "prop_shipwright",
  prop_tree: "prop_tree",
  prop_chest: "prop_chest",
  prop_cotton: "prop_cotton",
  prop_iron: "prop_iron",
  prop_grasshuts: "prop_grasshuts",
  prop_village: "prop_village",
  prop_crate_red: "prop_crate_red",
  prop_crate_yellow: "prop_crate_yellow",
  prop_ruins: "prop_ruins",
  prop_shipwreck: "prop_shipwreck",
  prop_stonehenge: "prop_stonehenge",
  prop_halfhull: "prop_halfhull",
};

const MOB_MODELS = ["mob_anglerfish", "mob_deepone", "mob_charybdis"];
const MOB_IDS = ["guppy_raider", "reef_horror", "abyssal_tender"];
const MOB_MODEL_BY_ID = {
  guppy_raider: "mob_anglerfish",
  reef_horror: "mob_deepone",
  abyssal_tender: "mob_charybdis",
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    sat: { value: 1.14 },
    con: { value: 1.07 },
    vig: { value: 0.22 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform float vig;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec3 graded = mix(vec3(l), c.rgb, sat);
      graded = (graded - 0.5) * con + 0.5;
      vec2 d = vUv - 0.5;
      float vign = 1.0 - vig * dot(d, d) * 2.2;
      gl_FragColor = vec4(graded * vign, c.a);
    }`,
};

// ---------- helpers ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = seed * 374761393 + x * 668265263 + y * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed) {
  let v = 0;
  let amp = 0.55;
  let f = 1;
  for (let i = 0; i < 3; i++) {
    v += amp * valueNoise(x * f, y * f, seed + i * 101);
    amp *= 0.5;
    f *= 2.1;
  }
  return v;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------- world ----------

export class PirationWorld {
  constructor(canvas, api) {
    this.canvas = canvas;
    this.api = api;
    this.mode = "sail"; // sail | walk | swim
    this.time = 0;
    this.clock = new THREE.Clock();
    this.models = {};
    this.islands = [];
    this.nodes = [];
    this.aiShips = [];
    this.ambush = null;
    this.ambushTimer = 14;
    this.keys = {};
    this.stick = { x: 0, y: 0, active: false };
    this.action = { label: "", enabled: false, kind: null };
    this.dockedIsland = ISLANDS[0];
    this.cameraTarget = new THREE.Vector3();
    this.camMode = "sail";
    this.cameraYaw = 0;
    this.disposed = false;
    this.terrainHeights = new Map(); // islandId -> fn(x,z)
    this.nearIsland = null;
    this.buildMode = false;
    this.buildProp = "tree";
    this.buildRot = 0;
    this.buildGhost = null;
    this.buildings = (this.api.getBuildings?.() || []).slice();
    this.buildingMeshes = [];
    this.nodeInstances = {};
    this.battle = null;
    this.projectiles = [];
    this.fxSprites = [];
    this.fxCount = 0;
    this.shake = { t: 0, dur: 0, amp: 0 };
    this.hitStop = 0;
    this.fxTex = makeRadialTexture("#ffffff", "#ffffff00");
    this.ringTex = makeRingTexture();
  }

  async init() {
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfeaff, 260, 1100);
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 2200);
    this.camera.position.set(0, 10, 40);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.75, 0.86);
    this.composer.addPass(this.bloomPass);
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    this.scene.add(new THREE.HemisphereLight(0xcfeaff, 0x3f8f4f, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2cc, 1.5);
    this.sunDir = new THREE.Vector3(0.55, 0.62, 0.36).normalize();
    sun.position.copy(this.sunDir).multiplyScalar(420);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 700;
    const sc = 70;
    sun.shadow.camera.left = -sc;
    sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc;
    sun.shadow.camera.bottom = -sc;
    sun.shadow.bias = -0.0005;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.buildSky();
    this.buildFxTextures();
    this.buildSea();
    await this.loadModels();
    this.buildIslands();
    this.rebuildBuildings();
    this.buildPlayerAndShip();
    this.buildAIShips();
    this.buildShadows();
    this.buildGulls();
    this.buildStorm();
    this.buildBuoys();
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.__pirWorld = this; // dev/perf hook
    this.loop();
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x1f7fe8) },
          mid: { value: new THREE.Color(0x63b8ff) },
          bot: { value: new THREE.Color(0xbfe8ff) },
          sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.36).normalize() },
          sunColor: { value: new THREE.Color(0xfff2c8) },
          time: { value: 0 },
        },
        vertexShader: `
          varying vec3 vDir;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vDir = normalize(wp.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          varying vec3 vDir;
          uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
          uniform vec3 sunDir; uniform vec3 sunColor; uniform float time;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p); vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
          }
          float fbm(vec2 p){
            float v = 0.0; float a = 0.55;
            for (int i=0;i<3;i++){ v += a*noise(p); p = p*2.15 + vec2(7.3, 3.1); a *= 0.5; }
            return v;
          }
          void main(){
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 sky = mix(bot, mid, smoothstep(0.0, 0.22, h));
            sky = mix(sky, top, smoothstep(0.22, 0.62, h));
            // sun glow
            float sd = max(dot(d, sunDir), 0.0);
            sky += sunColor * (pow(sd, 6.0) * 0.16 + pow(sd, 90.0) * 0.9);
          // clouds in the upper sky
          float c = fbm(vec2(d.x, d.z) * 2.6 + vec2(time*0.012, 0.0));
          float cloudMask = smoothstep(0.0, 0.5, h) * (1.0 - smoothstep(0.62, 0.95, h));
          float clouds = smoothstep(0.55, 0.75, c) * cloudMask;
          sky = mix(sky, vec3(1.0, 0.98, 0.94), clouds * 0.82);
          // high wispy layer
          float c2 = fbm(vec2(d.x, d.z) * 5.2 + vec2(time*0.02, 0.0));
          float wispy = smoothstep(0.5, 0.78, c2) * smoothstep(0.35, 0.9, h) * (1.0 - smoothstep(0.82, 0.98, h));
          sky = mix(sky, vec3(1.0, 0.99, 0.97), wispy * 0.5);
            // haze near horizon
            sky = mix(sky, vec3(0.86, 0.93, 0.98), pow(1.0 - h, 3.0) * 0.35);
            gl_FragColor = vec4(sky, 1.0);
          }`,
      }),
    );
    this.sky = sky;
    this.scene.add(sky);
    this.clouds = [];
  }

  buildFxTextures() {
    this.splashTex = makeRadialTexture("#bff7ff", "#bff7ff00");
    this.sparkTex = makeRadialTexture("#ffe28a", "#ffe28a00");
    this.smokeTex = makeRadialTexture("#9aa4b2", "#9aa4b200");
  }

  // ---------- combat-in-world ----------

  setBattle(active, mobId) {
    if (active && this.battle) return;
    if (!active) {
      if (this.battle) {
        this.scene.remove(this.battle.mesh);
        if (this.battle.playerBar) this.ship.remove(this.battle.playerBar);
        if (this.battleShadow) this.scene.remove(this.battleShadow);
        this.battle = null;
        this.battleShadow = null;
      }
      return;
    }
    const key = MOB_MODEL_BY_ID[mobId] || "mob_anglerfish";
    const model = this.models[key];
    if (!model) return;
    const mesh = model.clone(true);
    mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const fwd = new THREE.Vector3(-Math.sin(this.ship.rotation.y), 0, -Math.cos(this.ship.rotation.y));
    const pos = this.ship.position.clone().addScaledVector(fwd, 15);
    pos.y = 0.2;
    mesh.position.copy(pos);
    mesh.scale.multiplyScalar(1.25);
    mesh.rotation.y = Math.atan2(this.ship.position.x - pos.x, this.ship.position.z - pos.z);
    this.scene.add(mesh);
    const shadow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.7 }),
    );
    shadow.scale.set(6, 2.4, 1);
    shadow.position.set(pos.x, 0.1, pos.z);
    this.scene.add(shadow);
    this.battle = { mesh, basePos: pos.clone(), t: 0, shake: { t: 0, dur: 0, amp: 0 } };
    this.battleShadow = shadow;
    const barMat = (pct, color) =>
      new THREE.SpriteMaterial({ map: makeBarTexture(pct, color), transparent: true, depthWrite: false });
    const enemyBar = new THREE.Sprite(barMat(1, "#ff5a5a"));
    enemyBar.scale.set(3.4, 0.55, 1);
    enemyBar.position.set(0, 4.6, 0);
    this.battle.mesh.add(enemyBar);
    this.battle.enemyBar = enemyBar;
    const playerBar = new THREE.Sprite(barMat(1, "#4fbf78"));
    playerBar.scale.set(3.4, 0.55, 1);
    playerBar.position.set(0, 3.2, 0);
    this.ship.add(playerBar);
    this.battle.playerBar = playerBar;
  }

  setBattleHp(playerPct, enemyPct) {
    if (!this.battle) return;
    const b = this.battle;
    if (Math.abs((b.ePct ?? 1) - enemyPct) > 0.02) {
      b.ePct = enemyPct;
      if (b.enemyBar) b.enemyBar.material.map = makeBarTexture(enemyPct, "#ff5a5a");
    }
    if (Math.abs((b.pPct ?? 1) - playerPct) > 0.02) {
      b.pPct = playerPct;
      if (b.playerBar) b.playerBar.material.map = makeBarTexture(playerPct, "#4fbf78");
    }
  }

  fxCard(kind, payload) {
    if (!this.battle) return;
    if (kind === "attack" || kind === "enemyAttack") {
      const from = kind === "attack" ? this.ship.position : this.battle.mesh.position;
      const to = kind === "attack" ? this.battle.mesh.position : this.ship.position;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x2a2a2a }),
      );
      mesh.position.copy(from);
      mesh.position.y += 1.2;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.splashTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(1.1, 1.1, 1);
      mesh.add(glow);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        from: mesh.position.clone(),
        to: new THREE.Vector3(to.x, 0.6, to.z),
        t: 0,
        dur: 0.38,
        kind,
        dmg: payload?.dmg || 0,
      });
      this.spawnFxSprite(this.splashTex, from.clone().setY(from.y + 1.0), 1.6, 0.22, true);
    } else if (kind === "shield") {
      this.spawnFxSprite(this.ringTex, this.ship.position.clone().setY(1.2), 2.2, 0.5);
    } else if (kind === "enemyShield") {
      this.spawnFxSprite(this.ringTex, this.battle.mesh.position.clone().setY(2.0), 3.0, 0.55);
    } else if (kind === "enemyTelegraph") {
      const r = makeRingTexture("rgba(255, 110, 90, 0.95)");
      this.spawnFxSprite(r, this.battle.mesh.position.clone().setY(2.0), 3.2, 0.7);
    } else if (kind === "heal") {
      this.spawnFxSprite(this.sparkTex, this.ship.position.clone().setY(1.6), 1.6, 0.5);
    }
  }

  fxEnd(won) {
    if (!this.battle) return;
    if (won) {
      this.battle.sink = 1;
      this.spawnFxSprite(this.splashTex, this.battle.mesh.position.clone().setY(0.5), 3.2, 0.8);
      this.spawnFxSprite(this.sparkTex, this.battle.mesh.position.clone().setY(2), 2.4, 0.7);
      // confetti burst
      const rng = Math.random;
      for (let i = 0; i < 10; i++) {
        this.spawnFxSprite(
          this.sparkTex,
          this.battle.mesh.position.clone().setY(1.5 + rng() * 2),
          0.7 + rng() * 0.6,
          0.9,
          true,
          new THREE.Vector3((rng() - 0.5) * 6, 3 + rng() * 4, (rng() - 0.5) * 6),
        );
      }
    } else {
      this.spawnFxSprite(this.smokeTex, this.ship.position.clone().setY(1.8), 3.4, 0.9);
      this.triggerShake(0.5, 0.25);
    }
  }

  spawnFxSprite(tex, pos, size, life, additive = false, vel = null) {
    this.fxCount += 1;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(size, size, 1);
    this.scene.add(s);
    this.fxSprites.push({
      sprite: s,
      life,
      t: 0,
      max: life,
      vel: vel ? vel.clone() : new THREE.Vector3(),
      gravity: 0,
    });
    return this.fxSprites[this.fxSprites.length - 1];
  }

  triggerShake(amp, dur) {
    this.shake = { t: 0, dur, amp };
  }

  triggerCameraShake(amp, dur) {
    this.camShake = { t: 0, dur, amp };
  }

  triggerEnemyShake(amp, dur) {
    if (this.battle) this.battle.shake = { t: 0, dur, amp };
  }

  spawnDamageNumber(dmg, pos, playerHit) {
    const tex = makeTextSprite(`-${dmg}`, playerHit ? "#ff6b6b" : "#ffd166");
    const f = this.spawnFxSprite(tex, pos, 1.6, 0.9, false, new THREE.Vector3(0, 2.2, 0));
    f.gravity = 0.5;
  }

  updateFx(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 1.6;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        this.spawnFxSprite(this.splashTex, p.to, 2.6, 0.5, true);
        for (let d = 0; d < 6; d++) {
          this.spawnFxSprite(
            this.splashTex,
            p.to.clone(),
            0.8 + Math.random() * 0.5,
            0.55,
            true,
            new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5),
          );
        }
        if (p.kind === "attack") {
          this.hitStop = 0.12;
          this.triggerEnemyShake(0.3, 0.4);
          if (p.dmg) this.spawnDamageNumber(p.dmg, p.to.clone().setY(2.6), false);
        } else {
          this.hitStop = 0.06;
          this.triggerShake(0.24, 0.4);
          this.triggerCameraShake(0.14, 0.3);
          if (p.dmg) this.spawnDamageNumber(p.dmg, p.to.clone().setY(2.2), true);
        }
      }
    }
    for (let i = this.fxSprites.length - 1; i >= 0; i--) {
      const f = this.fxSprites[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.max);
      f.sprite.position.addScaledVector(f.vel, dt);
      if (f.gravity) f.vel.y -= f.gravity * dt;
      f.sprite.material.opacity = 1 - k;
      f.sprite.scale.setScalar(f.sprite.scale.x + dt * 2.2);
      if (k >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.fxSprites.splice(i, 1);
      }
    }
    if (this.shake.dur > 0) {
      this.shake.t += dt;
      if (this.shake.t >= this.shake.dur) this.shake.dur = 0;
    }
    if (this.battle) {
      this.battle.t += dt;
      const s = this.battle.shake;
      if (s.dur > 0) {
        s.t += dt;
        if (s.t >= s.dur) s.dur = 0;
      }
    }
  }

  buildSea() {
    const geo = new THREE.PlaneGeometry(2200, 2200, 260, 260);
    geo.rotateX(-Math.PI / 2);
    const islandUniforms = ISLANDS.slice(0, 8).map((i) => new THREE.Vector4(i.pos[0], i.pos[1], i.r, 0));
    while (islandUniforms.length < 8) islandUniforms.push(new THREE.Vector4(0, 0, 0, 0));
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpen: { value: new THREE.Color(0x0a4f86) },
        uLagoon: { value: new THREE.Color(0x2ed0bf) },
        uShallow: { value: new THREE.Color(0x35d9c8) },
        uSky: { value: new THREE.Color(0xa8d8ff) },
        uSun: { value: new THREE.Vector3(0.55, 0.62, 0.36).normalize() },
        uIslands: { value: islandUniforms },
        uShadowMap: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uShadowBias: { value: 0.004 },
      },
      vertexShader: `
        uniform float uTime; uniform vec4 uIslands[8];
        varying vec3 vWorld; varying vec3 vNormal; varying float vFoam; varying float vShore;
        float wave(vec2 p, float t){
          return 0.42*sin(dot(vec2(0.9,0.4), p)*0.055 + t*1.3)
               + 0.30*sin(dot(vec2(-0.6,0.8), p)*0.075 + t*1.7)
               + 0.22*sin(dot(vec2(0.35,-0.95), p)*0.11 + t*2.1)
               + 0.16*sin(dot(vec2(1.0,0.2), p)*0.16 + t*2.6);
        }
        void main(){
          vec3 p = position;
          float t = uTime;
          float w = wave(p.xz, t);
          p.y += w*0.7;
          // analytic normal from wave gradient
          float dx = (0.42*0.055*0.9*cos(dot(vec2(0.9,0.4), p.xz)*0.055 + t*1.3)
                    + 0.30*0.075*(-0.6)*cos(dot(vec2(-0.6,0.8), p.xz)*0.075 + t*1.7)
                    + 0.22*0.11*0.35*cos(dot(vec2(0.35,-0.95), p.xz)*0.11 + t*2.1)
                    + 0.16*0.16*1.0*cos(dot(vec2(1.0,0.2), p.xz)*0.16 + t*2.6));
          float dz = (0.42*0.055*0.4*cos(dot(vec2(0.9,0.4), p.xz)*0.055 + t*1.3)
                    + 0.30*0.075*0.8*cos(dot(vec2(-0.6,0.8), p.xz)*0.075 + t*1.7)
                    + 0.22*0.11*(-0.95)*cos(dot(vec2(0.35,-0.95), p.xz)*0.11 + t*2.1)
                    + 0.16*0.16*0.2*cos(dot(vec2(1.0,0.2), p.xz)*0.16 + t*2.6));
          vec3 n = normalize(vec3(-dx, 1.0, -dz));
          vNormal = normalize(mat3(modelMatrix) * n);
          vec4 wp = modelMatrix * vec4(p,1.0);
          vWorld = wp.xyz;
          float shore = 1.0;
          shore = min(shore, distance(wp.xz, uIslands[0].xz));
          shore = min(shore, distance(wp.xz, uIslands[1].xz));
          shore = min(shore, distance(wp.xz, uIslands[2].xz));
          shore = min(shore, distance(wp.xz, uIslands[3].xz));
          shore = min(shore, distance(wp.xz, uIslands[4].xz));
          shore = min(shore, distance(wp.xz, uIslands[5].xz));
          shore = min(shore, distance(wp.xz, uIslands[6].xz));
          shore = min(shore, distance(wp.xz, uIslands[7].xz));
          float rMin = 100000.0;
          rMin = min(rMin, uIslands[0].z); rMin = min(rMin, uIslands[1].z);
          rMin = min(rMin, uIslands[2].z); rMin = min(rMin, uIslands[3].z);
          rMin = min(rMin, uIslands[4].z); rMin = min(rMin, uIslands[5].z);
          rMin = min(rMin, uIslands[6].z); rMin = min(rMin, uIslands[7].z);
          vFoam = smoothstep(rMin + 8.5, rMin + 2.0, shore) * smoothstep(0.35, 1.4, w + 0.9);
          vShore = shore;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uOpen; uniform vec3 uLagoon; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun; uniform float uTime;
        uniform sampler2D uShadowMap; uniform mat4 uShadowMatrix; uniform float uShadowBias;
        varying vec3 vWorld; varying vec3 vNormal; varying float vFoam; varying float vShore;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 n = normalize(vNormal);
          vec3 view = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
          // lagoon near islands -> deep open sea
          float depthF = smoothstep(16.0, 280.0, vShore);
          vec3 base = mix(uLagoon, uOpen, depthF);
          base = mix(base, uShallow, clamp(vWorld.y * 0.14 + 0.2, 0.0, 1.0) * (1.0 - depthF * 0.6));
          vec3 c = mix(base, uSky, fres * 0.55);
          // caustic shimmer
          float caustic = step(0.68, hash(floor(vWorld.xz * 2.4 + vec2(uTime * 0.22, -uTime * 0.14))));
          c += vec3(0.12, 0.32, 0.3) * caustic * 0.16 * (1.0 - depthF * 0.6);
          // sun glitter path
          float spec = pow(max(dot(reflect(-view, n), uSun), 0.0), 60.0);
          float sparkle = step(0.985, hash(floor(vWorld.xz * 3.0) + floor(uTime * 6.0)));
          c += vec3(1.0, 0.96, 0.82) * (spec * 1.1 + sparkle * 0.18);
          // foam
          float waveFoam = smoothstep(0.62, 0.86, hash(floor(vWorld.xz * 1.4)));
          float foam = clamp(vFoam + waveFoam * 0.12, 0.0, 1.0);
          c = mix(c, vec3(0.92, 0.98, 1.0), foam);
          // ship / mob shadows on the water
          vec4 sp = uShadowMatrix * vec4(vWorld, 1.0);
          vec3 sdc = sp.xyz / sp.w * 0.5 + 0.5;
          if (sdc.z > 0.0 && sdc.z < 1.0) {
            float depth = texture2D(uShadowMap, sdc.xy).r;
            float lit = sdc.z - uShadowBias <= depth ? 1.0 : 0.25;
            c *= mix(1.0, 0.6, 1.0 - lit);
          }
          // fog toward horizon
          float fogF = smoothstep(260.0, 900.0, length(cameraPosition.xz - vWorld.xz));
          c = mix(c, vec3(0.86, 0.93, 0.98), fogF * 0.75);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.position.y = WATER_Y;
    this.scene.add(this.sea);
  }

  async loadModels() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const base = "assets/models/";
    const targets = {
      player: 1.75,
      ship_skiff: 7,
      ship_sloop: 8,
      ship_frigate: 9,
      ship_galleon: 10,
      mob_anglerfish: 3.2,
      mob_deepone: 4.2,
      mob_charybdis: 7,
      prop_shipwright: 8,
      prop_tree: 6,
      prop_chest: 1.4,
      prop_cotton: 1.1,
      prop_iron: 1.1,
      prop_grasshuts: 6,
      prop_village: 8,
      prop_crate_red: 1.1,
      prop_crate_yellow: 1.1,
      prop_ruins: 6,
      prop_shipwreck: 8,
      prop_stonehenge: 5.5,
      prop_halfhull: 7,
    };
    for (const [key, target] of Object.entries(targets)) {
      const loadOne = () => loader.loadAsync(base + MODELS[key] + ".glb");
      let gltf = null;
      for (let attempt = 0; attempt < 3 && !gltf; attempt++) {
        try {
          gltf = await loadOne();
        } catch (e) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (!gltf) {
        console.error("model failed to load:", key);
        return;
      }
      const scene = gltf.scene;
      normalizeModel(scene, target);
      this.models[key] = scene;
    }
  }

  buildIslands() {
    for (const def of ISLANDS) {
      const island = this.buildIsland(def);
      this.islands.push(island);
      this.placeNodes(def, island);
    }
  }

  buildIsland(def) {
    const [cx, cz] = def.pos;
    const r = def.r;
    const seed = def.seed;
    const N = 36;
    const cell = (r * 2) / N;
    const heights = new Float32Array((N + 1) * (N + 1));
    const island = new THREE.Group();
    island.position.set(cx, 0, cz);
    this.terrainHeights.set(def.id, (x, z) => {
      const lx = x - cx;
      const lz = z - cz;
      const d = Math.sqrt(lx * lx + lz * lz) / r;
      if (d > 1) return -2;
      const n = fbm((lx / r) * 1.6 + 5, (lz / r) * 1.6 + 5, seed);
      const fall = 1 - smooth(d);
      let h = Math.pow(clamp(n * 1.4 - 0.15, 0, 1), 1.35) * r * 0.55 * fall;
      const arch = def.arch || "standard";
      if (arch === "mountain") {
        h += r * 0.34 * Math.pow(1 - d, 1.15);
        h *= 1.12;
      } else if (arch === "atoll") {
        h *= 0.3 + 1.3 * smoothstep(0.32, 0.8, d);
        if (d < 0.4) h *= 0.35 + 0.65 * smoothstep(0, 0.4, d);
      } else if (arch === "mesa") {
        const cap = r * 0.46;
        if (h > cap * 0.5) h = cap * 0.5 + (h - cap * 0.5) * 0.08;
        h *= 1.08;
      }
      return Math.round(h * 2.4) / 2.4;
    });
    const hAt = (x, z) => this.terrainHeights.get(def.id)(x, z);
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = -r + i * cell;
        const z = -r + j * cell;
        const h = hAt(x, z);
        heights[i * (N + 1) + j] = h;
      }
    }
    const colors = [];
    const positions = [];
    const indices = [];
    const colAt = (i, j) => {
      const h = heights[i * (N + 1) + j];
      const hn = heights[Math.max(0, i - 1) * (N + 1) + j];
      const hs = heights[Math.min(N, i + 1) * (N + 1) + j];
      const hw = heights[i * (N + 1) + Math.max(0, j - 1)];
      const he = heights[i * (N + 1) + Math.min(N, j + 1)];
      const slope = Math.max(Math.abs(h - hn), Math.abs(h - hs), Math.abs(h - hw), Math.abs(h - he)) / cell;
      const minN = Math.min(hn, hs, hw, he);
      const ao = Math.max(0, Math.min(1, (h - minN) * 1.6 + 0.45));
      const shade = 0.76 + 0.24 * ao;
      let c;
      if (h < 0.45) c = [0.93, 0.84, 0.62];
      else if (slope > 0.72) c = [0.48, 0.5, 0.55];
      else if (h < 2.7) c = [0.32, 0.74, 0.34];
      else if (h < 5.2) c = [0.45, 0.62, 0.36];
      else c = [0.55, 0.56, 0.6];
      if (h < 0.7) c = [c[0] * 0.92, c[1] * 0.9, c[2] * 0.82]; // damp sand
      const jitter = 0.9 + 0.2 * hash2(i, j, seed * 7);
      return [c[0] * shade * jitter, c[1] * shade * jitter, c[2] * shade * jitter];
    };
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = -r + i * cell;
        const z = -r + j * cell;
        positions.push(x, heights[i * (N + 1) + j], z);
        const c = colAt(i, j);
        colors.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a = i * (N + 1) + j;
        const b = a + 1;
        const c = a + N + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    island.add(mesh);
    this.scene.add(island);
    island.userData.def = def;
    return island;
  }

  placeNodes(def, island) {
    const rng = mulberry32(def.seed + 42);
    const hAt = (x, z) => this.terrainHeights.get(def.id)(x, z);
    const tryPlace = (fn, tries = 40) => {
      for (let i = 0; i < tries; i++) {
        const a = rng() * Math.PI * 2;
        const d = (0.18 + rng() * 0.68) * def.r;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const h = hAt(x, z);
        if (h > 0.5 && h < 4.5) return fn(x, z, h);
      }
      return false;
    };
    const rec = {
      wood: { items: [], mesh: null },
      cotton: { items: [], mesh: null },
      iron: { items: [], mesh: null },
      gold: { items: [], mesh: null },
    };
    this.nodeInstances[def.id] = rec;
    const place = (kind, count) => {
      for (let i = 0; i < count; i++) {
        tryPlace((x, z, h) => {
          rec[kind].items.push({
            x: def.pos[0] + x,
            z: def.pos[1] + z,
            h,
            rot: rng() * Math.PI * 2,
            alive: true,
            respawnAt: 0,
          });
        });
      }
    };
    const treeCount = def.id === "hub" ? 4 : 8 + Math.floor(rng() * 4);
    const cottonCount = def.id === "hub" ? 2 : 4 + Math.floor(rng() * 2);
    const ironCount = def.id === "hub" ? 2 : 3 + Math.floor(rng() * 2);
    const goldCount = def.id === "hub" ? 2 : 2 + Math.floor(rng() * 2);
    const rockCount = def.id === "hub" ? 3 : 6 + Math.floor(rng() * 3);
    place("wood", treeCount);
    place("cotton", cottonCount);
    place("iron", ironCount);
    place("gold", goldCount);

    const dummy = new THREE.Object3D();
    const treeGeo = makeMergedBoxes(TREE_BOXES);
    const goldGeo = makeMergedBoxes(GOLD_BOXES);
    const rockGeo = makeMergedBoxes(ROCK_BOXES);
    const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const makeInst = (kind, geo, mat) => {
      const items = rec[kind].items;
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < items.length; i++) {
        dummy.position.set(items[i].x, items[i].h, items[i].z);
        dummy.rotation.set(0, items[i].rot, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      rec[kind].mesh = mesh;
    };
    makeInst("wood", treeGeo, vcMat);
    const cottonMesh = this.models.prop_cotton?.children?.[0];
    makeInst("cotton", cottonMesh?.geometry || goldGeo, cottonMesh?.material || vcMat);
    const ironMesh = this.models.prop_iron?.children?.[0];
    makeInst("iron", ironMesh?.geometry || goldGeo, ironMesh?.material || vcMat);
    makeInst("gold", goldGeo, vcMat);

    // shoreline rocks (static instanced cluster)
    const rockItems = [];
    for (let i = 0; i < rockCount; i++) {
      tryPlace((x, z, h) => {
        rockItems.push({
          x: def.pos[0] + x,
          z: def.pos[1] + z,
          h,
          rot: rng() * Math.PI * 2,
          s: 0.8 + rng() * 0.9,
        });
      });
    }
    if (rockItems.length) {
      const rocks = new THREE.InstancedMesh(rockGeo, vcMat, rockItems.length);
      for (let i = 0; i < rockItems.length; i++) {
        dummy.position.set(rockItems[i].x, rockItems[i].h + 0.05, rockItems[i].z);
        dummy.rotation.set(0, rockItems[i].rot, 0);
        dummy.scale.setScalar(rockItems[i].s);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      this.scene.add(rocks);
    }

    // beach palms (decorative instanced layer)
    const palmItems = [];
    const palmCount = def.id === "hub" ? 3 : 4 + Math.floor(rng() * 3);
    for (let i = 0; i < palmCount; i++) {
      tryPlace((x, z, h) => {
        if (h < 1.5) {
          palmItems.push({
            x: def.pos[0] + x,
            z: def.pos[1] + z,
            h,
            rot: rng() * Math.PI * 2,
            s: 0.9 + rng() * 0.5,
          });
        }
      }, 80);
    }
    if (palmItems.length) {
      const palmGeo = makeMergedBoxes(PALM_BOXES);
      const palms = new THREE.InstancedMesh(palmGeo, vcMat, palmItems.length);
      for (let i = 0; i < palmItems.length; i++) {
        dummy.position.set(palmItems[i].x, palmItems[i].h + 0.05, palmItems[i].z);
        dummy.rotation.set(0, palmItems[i].rot, 0);
        dummy.scale.setScalar(palmItems[i].s);
        dummy.updateMatrix();
        palms.setMatrixAt(i, dummy.matrix);
      }
      palms.instanceMatrix.needsUpdate = true;
      palms.castShadow = true;
      this.scene.add(palms);
    }

    // crafted landmarks per island
    const LAND = {
      hub: ["prop_village", 1],
      shallows: ["prop_grasshuts", 1],
      trade: ["prop_crate_red", 2],
      opensea: ["prop_ruins", 1],
      reefs: ["prop_shipwreck", 1],
      triangle: ["prop_stonehenge", 1],
      abyss: ["prop_halfhull", 1],
      skullbone: ["prop_crate_yellow", 2],
      gilded: ["prop_crate_yellow", 2],
    };
    const lm = LAND[def.id];
    if (lm && this.models[lm[0]]) {
      let placed = 0;
      for (let i = 0; i < lm[1] * 6 && placed < lm[1]; i++) {
        tryPlace((x, z, h) => {
          if (h > 0.55 && h < 5) {
            const m = this.models[lm[0]].clone(true);
            m.traverse((o) => {
              if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
              }
            });
            m.position.set(def.pos[0] + x, h, def.pos[1] + z);
            m.rotation.y = rng() * Math.PI * 2;
            placed += 1;
            this.scene.add(m);
          }
        });
      }
    }

    // hub buildings + merged dock planks
    if (def.id === "hub") {
      const sw = this.models.prop_shipwright.clone(true);
      sw.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      sw.position.set(16, hAt(16, 12), 12);
      sw.rotation.y = 0.6;
      island.add(sw);
      const planks = [];
      for (let i = 0; i < 5; i++) {
        planks.push({ s: [2.2, 0.18, 7], p: [0, 0.12, def.r - 4 - i * 6], c: [0.72, 0.55, 0.35] });
      }
      const plankGeo = makeMergedBoxes(planks);
      island.add(new THREE.Mesh(plankGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    }
  }

  buildPlayerAndShip() {
    const shipId = this.api.getShipId();
    this.ship = new THREE.Group();
    const model = this.models["ship_" + shipId] || this.models.ship_skiff || Object.values(this.models).find((v) => v);
    this.shipModel = model?.clone(true) || null;
    if (!this.shipModel) console.error("no ship model available");
    else {
    this.shipModel.position.y = -0.4;
    this.shipModel.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.ship.add(this.shipModel);
    }
    this.ship.position.set(0, 0, ISLANDS[0].r + 2);
    this.ship.rotation.y = 0;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.0),
      new THREE.MeshLambertMaterial({ color: 0xe6aa3c, side: THREE.DoubleSide }),
    );
    flag.position.set(0, 5.6, 0);
    flag.rotation.y = 0.5;
    this.ship.add(flag);
    this.shipFlag = flag;
    this.scene.add(this.ship);

    this.player = new THREE.Group();
    const pm = this.models.player.clone(true);
    pm.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    pm.position.y = 0.9;
    pm.rotation.y = Math.PI;
    this.player.add(pm);
    this.player.position.set(10, this.terrainAt(10, 6), 6);
    this.player.visible = false;
    this.scene.add(this.player);
    this.mode = "sail";
  }

  setShip(id) {
    const model = this.models["ship_" + id] || this.models.ship_skiff;
    if (!model) return;
    if (this.shipModel) this.ship.remove(this.shipModel);
    this.shipModel = model.clone(true);
    this.shipModel.position.y = -0.4;
    this.ship.add(this.shipModel);
  }

  buildAIShips() {
    const names = ["ship_skiff", "ship_sloop", "ship_galleon"];
    const rng = mulberry32(909);
    for (let i = 0; i < 3; i++) {
      const tex = new THREE.TextureLoader().load(
        "assets/ships/" + names[i].replace("ship_", "") + ".webp",
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      sp.scale.set(9, 5, 1);
      const a = rng() * Math.PI * 2;
      sp.position.set(Math.cos(a) * 260, 0.4, Math.sin(a) * 260);
      sp.userData = { target: ISLANDS[1 + i % 6], speed: 5 + rng() * 3, t: rng() * 10 };
      this.scene.add(sp);
      this.aiShips.push(sp);
    }
  }

  buildShadows() {
    this.blobTex = makeBlobTexture();
    const mk = (scale) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.85 }),
      );
      s.scale.set(scale, scale * 0.4, 1);
      s.position.y = 0.09;
      this.scene.add(s);
      return s;
    };
    this.shipShadow = mk(7);
    this.playerShadow = mk(2.2);
  }

  buildGulls() {
    const tex = makeBirdTexture();
    this.gulls = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
      );
      s.userData = {
        angle: (i / 5) * Math.PI * 2,
        radius: 18 + i * 5,
        height: 9 + (i % 3) * 3,
        speed: 0.12 + i * 0.03,
        phase: i * 1.7,
      };
      this.scene.add(s);
      this.gulls.push(s);
    }
  }

  buildStorm() {
    const cloudTex = makeStormCloudTexture();
    const flashTex = makeRadialTexture("#ffffff", "#ffffff00");
    this.storm = { clouds: [], flash: null, t: 2 + Math.random() * 3 };
    const a = 2.35;
    const cx = Math.cos(a) * 660;
    const cz = Math.sin(a) * 660;
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.72 }),
      );
      const ox = (Math.random() - 0.5) * 190;
      const oz = (Math.random() - 0.5) * 190;
      s.position.set(cx + ox, 105 + Math.random() * 90, cz + oz);
      const sc = 140 + Math.random() * 100;
      s.scale.set(sc, sc * 0.55, 1);
      s.userData = { speed: 0.8 + Math.random() };
      this.scene.add(s);
      this.storm.clouds.push(s);
    }
    const fl = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    );
    fl.position.set(cx, 175, cz);
    fl.scale.set(300, 300, 1);
    this.scene.add(fl);
    this.storm.flash = fl;
  }

  updateStorm(dt) {
    if (!this.storm) return;
    const st = this.storm;
    for (const s of st.clouds) {
      s.position.x += s.userData.speed * dt * 0.6;
    }
    st.t -= dt;
    if (st.t <= 0) {
      st.t = 3 + Math.random() * 5;
      st.flashT = 0.16;
    }
    if (st.flashT > 0) {
      st.flashT -= dt;
      const k = Math.max(0, st.flashT / 0.16);
      st.flash.material.opacity = k;
      st.flash.scale.setScalar(300 + (1 - k) * 220);
    } else if (st.flash.material.opacity > 0) {
      st.flash.material.opacity = 0;
    }
  }

  buildBuoys() {
    const buoyGeo = makeMergedBoxes(BUOY_BOXES);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const spots = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spots.push([Math.cos(a) * 78, Math.sin(a) * 78]);
    }
    spots.push([85, -85], [-60, 205], [150, 125], [-210, -70]);
    this.buoys = [];
    for (const [x, z] of spots) {
      const b = new THREE.Mesh(buoyGeo, mat);
      b.position.set(x, 0.9, z);
      b.castShadow = true;
      this.scene.add(b);
      this.buoys.push(b);
    }
  }

  updateBuoys(dt) {
    for (let i = 0; i < this.buoys.length; i++) {
      const b = this.buoys[i];
      b.position.y = this.waveHeightAt(b.position.x, b.position.z) * 0.9 + 0.9;
      b.rotation.z = Math.sin(this.time * 2.1 + i * 1.3) * 0.07;
    }
  }

  updateGulls(dt) {
    const t = this.time;
    for (const g of this.gulls) {
      const u = g.userData;
      u.angle += u.speed * dt;
      g.position.set(
        this.ship.position.x + Math.cos(u.angle) * u.radius,
        this.ship.position.y + u.height + Math.sin(t * 0.7 + u.phase) * 0.6,
        this.ship.position.z + Math.sin(u.angle) * u.radius,
      );
      const flap = 0.72 + 0.28 * Math.abs(Math.sin(t * 6 + u.phase));
      g.scale.set(1.8, 1.1 * flap, 1);
    }
  }

  bindInput() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "KeyE" || e.code === "Space") this.doAction();
    });
    window.addEventListener("keyup", (e) => (this.keys[e.code] = false));
    const stick = document.getElementById("joy");
    const knob = document.getElementById("joyKnob");
    if (stick && knob) {
      const set = (e) => {
        const r = stick.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (r.width / 2));
        const a = Math.atan2(dy, dx);
        this.stick.x = Math.cos(a) * d;
        this.stick.y = Math.sin(a) * d;
        knob.style.transform = `translate(${Math.cos(a) * d * (r.width / 2 - 18)}px, ${Math.sin(a) * d * (r.height / 2 - 18)}px)`;
        this.stick.active = true;
      };
      const clear = () => {
        this.stick.x = 0;
        this.stick.y = 0;
        this.stick.active = false;
        knob.style.transform = "translate(0,0)";
      };
      stick.addEventListener("pointerdown", (e) => {
        stick.setPointerCapture(e.pointerId);
        set(e);
      });
      stick.addEventListener("pointermove", (e) => this.stick.active && set(e));
      stick.addEventListener("pointerup", clear);
      stick.addEventListener("pointercancel", clear);
    }
    const actionBtn = document.getElementById("worldAction");
    actionBtn?.addEventListener("click", () => this.doAction());
  }

  // ---------- island builder ----------

  propMesh(prop) {
    const rng = Math.random;
    if (prop === "tree") return makeVoxelTree(rng);
    if (prop === "chest") return this.models.prop_chest.clone(true);
    if (prop === "cotton") return this.models.prop_cotton.clone(true);
    if (prop === "iron") return this.models.prop_iron.clone(true);
    if (prop === "gold") return makeGoldStack(rng);
    if (prop === "crate") {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), new THREE.MeshLambertMaterial({ color: 0x9a6b3f })));
      return g;
    }
    return new THREE.Group();
  }

  setBuildMode(on) {
    this.buildMode = on;
    if (on) this.spawnGhost();
    else this.removeGhost();
  }

  setBuildProp(p) {
    this.buildProp = p;
    this.buildRot = 0;
    if (this.buildMode) this.spawnGhost();
  }

  rotateBuild() {
    this.buildRot = (this.buildRot + 90) % 360;
    if (this.buildGhost) this.buildGhost.rotation.y = THREE.MathUtils.degToRad(this.buildRot);
  }

  spawnGhost() {
    this.removeGhost();
    const g = this.propMesh(this.buildProp);
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
      }
    });
    this.buildGhost = g;
    this.scene.add(g);
  }

  removeGhost() {
    if (this.buildGhost) {
      this.scene.remove(this.buildGhost);
      this.buildGhost = null;
    }
  }

  updateGhost() {
    if (!this.buildGhost) return false;
    const fwd = new THREE.Vector3().subVectors(this.player.position, this.camera.position);
    fwd.y = 0;
    fwd.normalize();
    const pos = this.player.position.clone().addScaledVector(fwd, 6);
    const gx = Math.round(pos.x / 4) * 4;
    const gz = Math.round(pos.z / 4) * 4;
    const h = this.terrainAt(gx, gz);
    const hub = ISLANDS[0];
    const onHub = Math.hypot(gx - hub.pos[0], gz - hub.pos[1]) < hub.r - 5;
    const overlap = this.buildings.some((b) => Math.hypot(b.x - gx, b.z - gz) < 3);
    const valid = onHub && h > 0.15 && !overlap;
    this.buildGhost.position.set(gx, h, gz);
    const col = valid ? 0x3ddc5a : 0xff5a5a;
    this.buildGhost.traverse((o) => {
      if (o.isMesh) o.material.color.setHex(col);
    });
    return valid;
  }

  placeBuild() {
    if (!this.buildGhost) return;
    const valid = this.updateGhost();
    if (!valid) {
      this.api.toast("Can't build there — land only, no overlaps");
      return;
    }
    const b = {
      prop: this.buildProp,
      x: this.buildGhost.position.x,
      z: this.buildGhost.position.z,
      rot: this.buildRot,
    };
    this.buildings.push(b);
    this.api.saveBuildings(this.buildings);
    this.rebuildBuildings();
    this.api.toast("Placed " + b.prop);
    this.api.sfx("craft");
  }

  undoBuild() {
    if (!this.buildings.length) {
      this.api.toast("Nothing to undo");
      return;
    }
    this.buildings.pop();
    this.api.saveBuildings(this.buildings);
    this.rebuildBuildings();
    this.api.toast("Undid placement");
  }

  rebuildBuildings() {
    for (const m of this.buildingMeshes) this.scene.remove(m);
    this.buildingMeshes = [];
    for (const b of this.buildings) {
      const mesh = this.propMesh(b.prop);
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      const h = this.terrainAt(b.x, b.z);
      mesh.position.set(b.x, Math.max(0.1, h), b.z);
      mesh.rotation.y = THREE.MathUtils.degToRad(b.rot || 0);
      this.scene.add(mesh);
      this.buildingMeshes.push(mesh);
    }
  }

  terrainAt(x, z) {
    let best = -10;
    for (const def of ISLANDS) {
      const fn = this.terrainHeights.get(def.id);
      if (!fn) continue;
      const d = Math.hypot(x - def.pos[0], z - def.pos[1]);
      if (d < def.r + 6) {
        const h = fn(x, z);
        if (h > best) best = h;
      }
    }
    return best;
  }

  islandAt(x, z, pad = 0) {
    for (const def of ISLANDS) {
      if (Math.hypot(x - def.pos[0], z - def.pos[1]) < def.r + pad) return def;
    }
    return null;
  }

  doAction() {
    const a = this.action;
    if (!a.enabled) return;
    if (this.buildMode) this.placeBuild();
    else if (a.kind === "gather") this.gather(a.node);
    else if (a.kind === "disembark") this.disembark();
    else if (a.kind === "board") this.board();
    else if (a.kind === "shipyard") this.api.openPanel("shipyard");
    else if (a.kind === "menu") this.api.openPanel("menu");
  }

  gather(node) {
    const cost = this.api.getGatherCost?.() ?? 2;
    const r = this.api.spendEnergy(cost);
    if (!r.ok) {
      this.api.toast(r.reason);
      return;
    }
    const gains = { wood: "Wood", cotton: "Cotton", iron: "Iron", gold: "GoldNugget" };
    const amt = 1 + Math.floor(Math.random() * 3);
    this.api.grantResource(gains[node.kind], amt);
    node.alive = false;
    node.respawnAt = this.time + 40 + Math.random() * 40;
    this.api.toast(`Gathered ${amt} ${gains[node.kind]}!`);
    this.api.sfx("coin");
  }

  disembark() {
    const def = this.nearIsland;
    if (!def) return;
    const to = new THREE.Vector3(def.pos[0], 0, def.pos[1]);
    const from = this.ship.position.clone();
    from.y = 0;
    const dir = from.sub(to).normalize();
    const beach = new THREE.Vector3(def.pos[0] + dir.x * (def.r - 6), 0, def.pos[1] + dir.z * (def.r - 6));
    this.player.position.set(beach.x, this.terrainAt(beach.x, beach.z) + 1.1, beach.z);
    this.player.visible = true;
    this.ship.visible = true;
    this.mode = "walk";
    this.api.sfx("splash");
    this.api.toast("Ashore!");
  }

  board() {
    this.setBuildMode(false);
    this.player.visible = false;
    this.mode = "sail";
    this.api.sfx("sail");
    this.api.toast("All aboard!");
  }

  update(dt) {
    this.time += dt;
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      this.sky.material.uniforms.time.value = this.time;
    }
    if (this.sun) {
      this.sun.position.copy(this.ship.position).addScaledVector(this.sunDir, 420);
      this.sun.target.position.copy(this.ship.position);
      this.sun.target.updateMatrixWorld();
    }
    if (this.sea?.material?.uniforms?.uShadowMatrix) {
      this.sea.material.uniforms.uShadowMap.value = this.sun.shadow.map;
      this.sea.material.uniforms.uShadowMatrix.value.copy(this.sun.shadow.matrix);
    }
    const input = this.readInput();
    this.updateFx(dt);
    if (this.battle) this.updateBattle(dt);
    else {
      if (this.shipModel) {
        this.shipModel.position.x = 0;
        this.shipModel.position.z = 0;
      }
      if (this.mode === "sail") this.updateSail(dt, input);
      else this.updateOnFoot(dt, input);
    }
    this.updateCamera(dt);
    this.updateSea(dt);
    this.updateClouds(dt);
    this.updateGulls(dt);
    this.updateStorm(dt);
    this.updateBuoys(dt);
    this.updateAIShips(dt);
    this.updateNodes();
    this.updateAmbush(dt);
    this.updateAction();
    this.updateHUD();
  }

  updateBattle(dt) {
    const e = this.battle;
    if (this.shipShadow) this.shipShadow.position.set(this.ship.position.x, 0.1, this.ship.position.z);
    if (this.battleShadow) this.battleShadow.position.set(e.mesh.position.x, 0.1, e.mesh.position.z);
    if (e.sink > 0) {
      e.sink -= dt * 1.25;
      e.mesh.scale.setScalar(0.001 + 1.2 * Math.max(0, e.sink - 0.2));
      e.mesh.position.y = e.basePos.y - (1 - e.sink) * 2.6;
      if (e.sink <= 0) e.mesh.visible = false;
      this.ship.position.y = Math.sin(this.time * 2.1) * 0.16;
      return;
    }
    e.mesh.position.copy(e.basePos);
    e.mesh.position.y = e.basePos.y + this.waveHeightAt(e.mesh.position.x, e.mesh.position.z) * 0.9;
    const es = e.shake;
    if (es.dur > 0) {
      const f = 1 - es.t / es.dur;
      e.mesh.position.x += (Math.random() - 0.5) * es.amp * f;
      e.mesh.position.z += (Math.random() - 0.5) * es.amp * f;
    }
    this.ship.position.y = Math.sin(this.time * 2.1) * 0.16;
    const ss = this.shake;
    if (this.shipModel) {
      if (ss.dur > 0) {
        const f = 1 - ss.t / ss.dur;
        this.shipModel.position.x = (Math.random() - 0.5) * ss.amp * f;
        this.shipModel.position.z = (Math.random() - 0.5) * ss.amp * f;
      } else {
        this.shipModel.position.x = 0;
        this.shipModel.position.z = 0;
      }
    }
  }

  readInput() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (this.stick.active) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const d = Math.hypot(x, y);
    if (d > 1) {
      x /= d;
      y /= d;
    }
    return { x, y, mag: Math.hypot(x, y) };
  }

  waveHeightAt(x, z) {
    const t = this.time;
    const w =
      0.42 * Math.sin((0.9 * x + 0.4 * z) * 0.055 + t * 1.3) +
      0.3 * Math.sin((-0.6 * x + 0.8 * z) * 0.075 + t * 1.7) +
      0.22 * Math.sin((0.35 * x - 0.95 * z) * 0.11 + t * 2.1) +
      0.16 * Math.sin((1.0 * x + 0.2 * z) * 0.16 + t * 2.6);
    return w * 0.7;
  }

  updateSail(dt, input) {
    const ship = this.ship;
    const maxSpeed = 16;
    if (input.mag > 0.05) {
      const targetYaw = Math.atan2(input.x, -input.y);
      let dy = targetYaw - ship.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      ship.rotation.y += dy * Math.min(1, dt * 2.2);
      const fwd = new THREE.Vector3(-Math.sin(ship.rotation.y), 0, -Math.cos(ship.rotation.y));
      ship.position.addScaledVector(fwd, maxSpeed * input.mag * dt);
      ship.userData.speed = maxSpeed * input.mag;
    } else {
      ship.userData.speed = 0;
    }
    // ride the waves
    ship.position.y = this.waveHeightAt(ship.position.x, ship.position.z);
    const e = 3;
    const hx = this.waveHeightAt(ship.position.x + e, ship.position.z) - this.waveHeightAt(ship.position.x - e, ship.position.z);
    const hz = this.waveHeightAt(ship.position.x, ship.position.z + e) - this.waveHeightAt(ship.position.x, ship.position.z - e);
    const targetPitch = Math.atan2(hz, 2 * e) * 0.75;
    const targetRoll = -Math.atan2(hx, 2 * e) * 0.75;
    ship.rotation.x += (targetPitch - ship.rotation.x) * Math.min(1, dt * 3);
    ship.rotation.z += (targetRoll - ship.rotation.z) * Math.min(1, dt * 3);
    if (this.shipFlag) {
      this.shipFlag.rotation.z = Math.sin(this.time * 5.2) * 0.16 + (ship.userData.speed > 2 ? 0.12 : 0);
      this.shipFlag.position.y = 5.6 + Math.sin(this.time * 3.1) * 0.12;
    }
    // shadow + wake
    if (this.shipShadow) {
      this.shipShadow.position.set(ship.position.x, 0.1, ship.position.z);
      this.shipShadow.scale.set(7 + (ship.userData.speed || 0) * 0.1, (7 + (ship.userData.speed || 0) * 0.1) * 0.4, 1);
    }
    if (ship.userData.speed > 5) {
      this.wakeTimer = (this.wakeTimer || 0) + dt;
      if (this.wakeTimer > 0.09) {
        this.wakeTimer = 0;
        const fwd = new THREE.Vector3(-Math.sin(ship.rotation.y), 0, -Math.cos(ship.rotation.y));
        const stern = ship.position.clone().addScaledVector(fwd, -5.5);
        this.spawnFxSprite(
          this.splashTex,
          new THREE.Vector3(stern.x + (Math.random() - 0.5) * 1.6, 0.25, stern.z + (Math.random() - 0.5) * 1.6),
          0.9 + Math.random() * 0.8,
          0.7,
          true,
          new THREE.Vector3(-fwd.x * 1.5, 0, -fwd.z * 1.5),
        );
      }
    }
    // world bounds + island collision
    const d = Math.hypot(ship.position.x, ship.position.z);
    if (d > WORLD_R) {
      ship.position.x *= WORLD_R / d;
      ship.position.z *= WORLD_R / d;
    }
    for (const def of ISLANDS) {
      const dist = Math.hypot(ship.position.x - def.pos[0], ship.position.z - def.pos[1]);
      if (dist < def.r + 4) {
        const push = new THREE.Vector3(ship.position.x - def.pos[0], 0, ship.position.z - def.pos[1]).normalize();
        ship.position.x = def.pos[0] + push.x * (def.r + 4);
        ship.position.z = def.pos[1] + push.z * (def.r + 4);
      }
    }
    this.nearIsland = this.islandAt(ship.position.x, ship.position.z, 10);
  }

  updateOnFoot(dt, input) {
    const p = this.player;
    if (this.playerShadow) {
      this.playerShadow.position.set(p.position.x, 0.1, p.position.z);
    }
    const onIsland = this.islandAt(p.position.x, p.position.z, -1);
    if (this.mode === "walk" && onIsland) {
      const speed = (this.keys.ShiftLeft || this.keys.ShiftRight ? 8 : 5.5);
      const fwd = new THREE.Vector3().subVectors(p.position, this.camera.position);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const move = new THREE.Vector3();
      move.addScaledVector(fwd, -input.y);
      move.addScaledVector(right, input.x);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        p.position.add(move);
        const targetYaw = Math.atan2(move.x, move.z);
        let dy = targetYaw - p.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        p.rotation.y += dy * Math.min(1, dt * 8);
      }
      const h = this.terrainAt(p.position.x, p.position.z);
      if (h > -0.2) {
        p.position.y = lerp(p.position.y, h + 1.1, Math.min(1, dt * 8));
      } else {
        this.mode = "swim";
      }
    } else {
      // swimming
      const speed = 4;
      const fwd = new THREE.Vector3().subVectors(p.position, this.camera.position);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const move = new THREE.Vector3();
      move.addScaledVector(fwd, -input.y);
      move.addScaledVector(right, input.x);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        p.position.add(move);
        p.rotation.y = Math.atan2(move.x, move.z);
      }
      p.position.y = 0.5 + Math.sin(this.time * 3.4) * 0.18;
      const h = this.terrainAt(p.position.x, p.position.z);
      if (h > 0.1) this.mode = "walk";
    }
  }

  updateCamera(dt) {
    if (this.battle) {
      const mid = new THREE.Vector3()
        .addVectors(this.ship.position, this.battle.mesh.position)
        .multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(this.battle.mesh.position, this.ship.position).normalize();
      const desired = mid.clone().addScaledVector(dir, -13);
      desired.y = 5.5 + Math.sin(this.time * 1.1) * 0.35;
      this.camera.position.lerp(desired, Math.min(1, dt * 2.8));
      this.camera.lookAt(mid.x, 1.4, mid.z);
      return;
    }
    const target = this.mode === "sail" ? this.ship : this.player;
    const targetFov = this.mode === "sail" ? 62 + Math.min(7, (this.ship.userData.speed || 0) * 0.14) : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
      this.camera.updateProjectionMatrix();
    }
    const dist = this.mode === "sail" ? 15 : this.mode === "walk" ? 5.6 : 5.2;
    const height = this.mode === "sail" ? 8 : this.mode === "walk" ? 3.1 : 2.6;
    const yaw = this.mode === "sail" ? this.ship.rotation.y : (this.player.rotation.y + Math.PI / 2);
    this.cameraYaw = this.mode === "sail" ? yaw : this.cameraYaw;
    const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const desired = new THREE.Vector3().copy(target.position).addScaledVector(back, dist);
    desired.y = target.position.y + height;
    const t = Math.min(1, dt * 3.2);
    this.camera.position.lerp(desired, t);
    const look = new THREE.Vector3().copy(target.position);
    if (this.mode === "sail") {
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      look.addScaledVector(fwd, 7);
    }
    look.y += this.mode === "sail" ? 1.5 : 1.1;
    if (this.camShake && this.camShake.dur > 0) {
      this.camShake.t += dt;
      const f = 1 - this.camShake.t / this.camShake.dur;
      if (this.camShake.t >= this.camShake.dur) this.camShake.dur = 0;
      else {
        this.camera.position.x += (Math.random() - 0.5) * this.camShake.amp * f;
        this.camera.position.y += (Math.random() - 0.5) * this.camShake.amp * f;
      }
    }
    this.camera.lookAt(look);
  }

  updateSea(dt) {
    this.sea.material.uniforms.uTime.value = this.time;
  }

  updateClouds(dt) {
    if (!this.clouds.length) return;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1300) c.position.x = -1300;
    }
  }

  updateAIShips(dt) {
    for (const s of this.aiShips) {
      const t = s.userData.target;
      const tx = t.pos[0];
      const tz = t.pos[1];
      const dx = tx - s.position.x;
      const dz = tz - s.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 8) {
        s.userData.target = ISLANDS[Math.floor(Math.random() * ISLANDS.length)];
      } else {
        const targetYaw = Math.atan2(dx, dz);
        let dy = targetYaw - s.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.rotation.y += dy * Math.min(1, dt);
        s.position.x += (dx / d) * s.userData.speed * dt;
        s.position.z += (dz / d) * s.userData.speed * dt;
        s.userData.t += dt;
        s.position.y = this.waveHeightAt(s.position.x, s.position.z) + 0.4;
      }
    }
  }

  updateNodes() {
    const dummy = new THREE.Object3D();
    for (const rec of Object.values(this.nodeInstances)) {
      for (const kind of ["wood", "cotton", "iron", "gold"]) {
        const { items, mesh } = rec[kind];
        if (!mesh) continue;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it.alive && it.respawnAt && this.time >= it.respawnAt) it.alive = true;
          const bob = kind === "gold" && it.alive ? Math.sin(this.time * 2.4 + it.rot) * 0.08 : 0;
          dummy.position.set(it.x, it.alive ? it.h + bob : it.h - 5, it.z);
          dummy.rotation.set(0, it.rot + this.time * 0.04, 0);
          dummy.scale.setScalar(it.alive ? 1 : 0.0001);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  updateAmbush(dt) {
    if (this.mode !== "sail") {
    this.ambushTimer = 10;
      return;
    }
    const island = this.islandAt(this.ship.position.x, this.ship.position.z, 34);
    if (island) {
      this.ambushTimer = 10;
      return;
    }
    this.ambushTimer -= dt;
    if (this.ambush && !this.ambush.removed) {
      const d = this.ship.position.distanceTo(this.ambush.mesh.position);
      if (d > 40) this.removeAmbush();
      else {
        const dir = new THREE.Vector3().subVectors(this.ship.position, this.ambush.mesh.position).normalize();
        this.ambush.mesh.position.addScaledVector(dir, 2.4 * dt);
        if (this.ambushShadow) this.ambushShadow.position.set(this.ambush.mesh.position.x, 0.1, this.ambush.mesh.position.z);
        if (d < 7) {
          const mobId = this.ambush.mobId;
          this.removeAmbush();
          this.api.startAmbush(mobId);
        }
      }
    } else if (this.ambushTimer <= 0) {
      this.ambushTimer = 14 + Math.random() * 10;
      this.spawnAmbush();
    }
  }

  spawnAmbush() {
    const idx = Math.floor(Math.random() * MOB_IDS.length);
    const mobId = MOB_IDS[idx];
    const key = MOB_MODELS[idx];
    const mesh = this.models[key].clone(true);
    mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const fwd = new THREE.Vector3(-Math.sin(this.ship.rotation.y), 0, -Math.cos(this.ship.rotation.y));
    const pos = this.ship.position.clone().addScaledVector(fwd, 26);
    pos.y = 0.4;
    mesh.position.copy(pos);
    mesh.scale.multiplyScalar(1.15);
    this.scene.add(mesh);
    const shadow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.7 }),
    );
    shadow.scale.set(5, 2, 1);
    shadow.position.set(pos.x, 0.1, pos.z);
    this.scene.add(shadow);
    this.ambush = { mesh, mobId, removed: false, t: 0 };
    this.ambushShadow = shadow;
    this.api.toast("⚠ Something stirs in the deep…");
    this.api.sfx("whoosh");
  }

  removeAmbush() {
    if (this.ambush && !this.ambush.removed) {
      this.scene.remove(this.ambush.mesh);
      if (this.ambushShadow) this.scene.remove(this.ambushShadow);
      this.ambush.removed = true;
      this.ambushShadow = null;
    }
    this.ambush = null;
  }

  updateAction() {
    let label = "";
    let enabled = false;
    let kind = null;
    let node = null;
    if (this.buildMode) {
      label = "Place";
      enabled = true;
      this.updateGhost();
    } else if (this.mode === "sail") {
      const island = this.nearIsland;
      if (island) {
        label = "Disembark";
        kind = "disembark";
        enabled = true;
      }
    } else {
      const distShip = this.ship.position.distanceTo(this.player.position);
      if (distShip < 7) {
        label = "Board ship";
        kind = "board";
        enabled = true;
      } else {
        const n = this.nearestNode();
        if (n) {
          const names = { wood: "Gather wood", cotton: "Pick cotton", iron: "Mine iron", gold: "Dig treasure" };
          label = names[n.kind] + ` (${this.api.getGatherCost?.() ?? 2}⚡)`;
          kind = "gather";
          node = n;
          enabled = this.api.getEnergy() >= 2;
        } else if (this.islandAt(this.player.position.x, this.player.position.z)?.id === "hub") {
          const dSw = Math.hypot(this.player.position.x - 16, this.player.position.z - 12);
          if (dSw < 7) {
            label = "Open Shipyard";
            kind = "shipyard";
            enabled = true;
          }
        }
      }
    }
    this.action = { label, enabled, kind, node };
  }

  nearestNode() {
    let best = null;
    let bestD = 3.4;
    const p = this.player.position;
    for (const rec of Object.values(this.nodeInstances)) {
      for (const kind of ["wood", "cotton", "iron", "gold"]) {
        for (const it of rec[kind].items) {
          if (!it.alive) continue;
          const d = Math.hypot(p.x - it.x, p.z - it.z);
          if (d < bestD) {
            bestD = d;
            best = { ...it, kind };
          }
        }
      }
    }
    return best;
  }

  updateHUD() {
    const nearIslandName = this.nearIsland?.name || "";
    this.api.onHUD({
      mode: this.mode,
      action: this.action,
      zone: nearIslandName,
      speed: this.mode === "sail" ? Math.round((this.ship.userData.speed || 0) * 4) : 0,
      buildMode: this.buildMode,
      buildProp: this.buildProp,
    });
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
  }

  jumpTo(id) {
    const def = ISLANDS.find((i) => i.id === id);
    if (!def) return;
    this.ship.position.set(def.pos[0], 0, def.pos[1] + def.r + 6);
    this.ship.rotation.y = Math.PI;
    this.nearIsland = def;
    this.camera.position.set(def.pos[0] - 26, 14, def.pos[1] + def.r + 34);
    this.api.toast("Fair winds — " + def.name + "!");
  }

  loop() {
    if (this.disposed) return;
    requestAnimationFrame(() => this.loop());
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const dt = this.hitStop > 0 ? rawDt * 0.3 : rawDt;
    if (this.hitStop > 0) this.hitStop -= rawDt;
    this.update(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.renderer?.dispose();
  }
}

// ---------- model helpers ----------

function normalizeModel(obj, target) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  const s = target / max;
  obj.scale.setScalar(s);
  box.setFromObject(obj);
  obj.position.y -= box.min.y;
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.z -= (box.min.z + box.max.z) / 2;
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

function makeRadialTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTextSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(10,20,34,0.9)";
  ctx.strokeText(text, 128, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBlobTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, "rgba(4,12,20,0.55)");
  g.addColorStop(1, "rgba(4,12,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeBirdTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(25,35,50,0.8)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(14, 58);
  ctx.quadraticCurveTo(64, 26, 114, 48);
  ctx.moveTo(14, 58);
  ctx.quadraticCurveTo(64, 42, 114, 48);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStormCloudTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 48, 8, 64, 48, 60);
  g.addColorStop(0, "rgba(38, 48, 66, 0.9)");
  g.addColorStop(0.55, "rgba(52, 62, 82, 0.62)");
  g.addColorStop(1, "rgba(60, 72, 92, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture(color = "rgba(180, 235, 255, 0.9)") {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color.replace("0.9", "0.35");
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBarTexture(pct, color) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 18;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(8, 14, 24, 0.85)";
  ctx.fillRect(0, 0, 128, 18);
  ctx.fillStyle = color;
  ctx.fillRect(2, 3, Math.max(2, 124 * Math.max(0, Math.min(1, pct))), 12);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256;
    const y = 45 + Math.random() * 55;
    const r = 18 + Math.random() * 34;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeVoxelTree(rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x35b34a });
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), trunkMat);
  trunk.position.y = 0.8;
  g.add(trunk);
  const s = 1.7 + rng() * 0.8;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), leafMat);
  leaf.position.y = 2.2 + s / 2;
  leaf.rotation.y = rng();
  g.add(leaf);
  const top = new THREE.Mesh(new THREE.BoxGeometry(s * 0.72, s * 0.72, s * 0.72), leafMat);
  top.position.y = 3.4 + s;
  g.add(top);
  return g;
}

const TREE_BOXES = [
  { s: [0.55, 1.7, 0.55], p: [0, 0.85, 0], c: [0.54, 0.35, 0.2] },
  { s: [2.0, 2.0, 2.0], p: [0, 3.0, 0], c: [0.2, 0.72, 0.28] },
  { s: [1.45, 1.45, 1.45], p: [0, 4.45, 0], c: [0.24, 0.66, 0.3] },
];

const GOLD_BOXES = [
  { s: [0.82, 0.36, 0.82], p: [0, 0.18, 0], c: [1.0, 0.84, 0.32] },
  { s: [0.62, 0.36, 0.62], p: [0.05, 0.62, -0.04], c: [1.0, 0.82, 0.28] },
  { s: [0.46, 0.34, 0.46], p: [-0.04, 1.0, 0.05], c: [0.98, 0.78, 0.26] },
];

const ROCK_BOXES = [
  { s: [1.7, 1.1, 1.4], p: [0, 0.55, 0], c: [0.42, 0.44, 0.5] },
  { s: [1.0, 0.7, 0.9], p: [0.7, 0.5, 0.4], c: [0.48, 0.5, 0.56] },
  { s: [0.8, 0.5, 0.8], p: [-0.6, 0.35, -0.5], c: [0.38, 0.4, 0.46] },
];

const PALM_BOXES = [
  { s: [0.34, 1.6, 0.34], p: [0, 0.8, 0], c: [0.55, 0.42, 0.3], r: [0.08, 0, 0.05] },
  { s: [0.3, 1.5, 0.3], p: [0.22, 2.15, 0.08], c: [0.52, 0.4, 0.28], r: [0.2, 0, 0.09] },
  { s: [0.26, 1.3, 0.26], p: [0.48, 3.4, 0.18], c: [0.5, 0.38, 0.26], r: [0.32, 0, 0.12] },
  { s: [2.5, 0.22, 1.0], p: [0.8, 4.0, 0.2], c: [0.2, 0.6, 0.3], r: [-0.5, 0, 0.15] },
  { s: [2.4, 0.22, 1.0], p: [-0.6, 4.0, 0.3], c: [0.22, 0.58, 0.3], r: [0.45, 0, -0.1] },
  { s: [2.3, 0.22, 1.0], p: [0.2, 4.1, 1.0], c: [0.24, 0.56, 0.3], r: [0.1, 0.5, 0.2] },
  { s: [2.3, 0.22, 1.0], p: [0.1, 4.0, -0.8], c: [0.22, 0.6, 0.3], r: [0.1, -0.5, -0.2] },
];

const BUOY_BOXES = [
  { s: [0.18, 1.7, 0.18], p: [0, 0.85, 0], c: [0.28, 0.3, 0.38] },
  { s: [0.75, 0.34, 0.75], p: [0, 1.85, 0], c: [1.0, 0.76, 0.25] },
  { s: [0.16, 0.55, 0.16], p: [0, 2.2, 0], c: [0.22, 0.24, 0.3] },
];

function makeMergedBoxes(parts) {
  const pos = [];
  const col = [];
  const idx = [];
  let base = 0;
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.s[0], p.s[1], p.s[2]);
    g.translate(p.p[0], p.p[1], p.p[2]);
    if (p.r) {
      g.rotateX(p.r[0]);
      g.rotateY(p.r[1] || 0);
      g.rotateZ(p.r[2] || 0);
    }
    const gp = g.attributes.position.array;
    for (let i = 0; i < gp.length / 3; i++) {
      pos.push(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]);
      col.push(p.c[0], p.c[1], p.c[2]);
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(base + gi[i]);
    base += gp.length / 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function makeGoldStack(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.75, roughness: 0.25, emissive: 0x553d00 });
  for (let i = 0; i < 3; i++) {
    const size = 0.8 - i * 0.18;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.45, size), mat);
    m.position.set((rng() - 0.5) * 0.7, i * 0.4, (rng() - 0.5) * 0.7);
    m.rotation.y = rng();
    g.add(m);
  }
  return g;
}
