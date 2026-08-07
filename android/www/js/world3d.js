// Piration 3D world — 16:9 open-sea adventure rendered with the real
// CC0 Pirate Nation voxel models (glTF/glb), procedural islands, sailing,
// walking, swimming, gathering, and open-sea ambushes.

import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/meshopt_decoder.module.js";

const WATER_Y = 0;
const WORLD_R = 430;

const ISLANDS = [
  { id: "hub", name: "Parrot's Perch", pos: [0, 0], r: 60, seed: 101 },
  { id: "shallows", name: "Sunny Shallows", pos: [155, 0], r: 44, seed: 202 },
  { id: "trade", name: "Trade Routes", pos: [-150, 135], r: 50, seed: 303 },
  { id: "opensea", name: "Open Sea", pos: [205, -165], r: 54, seed: 404 },
  { id: "reefs", name: "Sunken Reefs", pos: [-255, -135], r: 56, seed: 505 },
  { id: "triangle", name: "Devil's Triangle", pos: [-45, -265], r: 60, seed: 606 },
  { id: "abyss", name: "The Abyss", pos: [335, 95], r: 66, seed: 707 },
  { id: "skullbone", name: "Skullbone Cove", pos: [95, 250], r: 50, seed: 808 },
  { id: "gilded", name: "Gilded Straits", pos: [-330, 65], r: 62, seed: 909 },
];

const MODELS = {
  player: "player",
  ship_skiff: "ship_skiff",
  ship_sloop: "ship_sloop",
  ship_frigate: "ship_brig",
  ship_galleon: "ship_galleon",
  mob_anglerfish: "mob_anglerfish",
  mob_deepone: "mob_deepone",
  mob_charybdis: "mob_charybdis",
  prop_shipwright: "prop_shipwright",
  prop_tree: "prop_tree",
  prop_chest: "prop_chest",
  prop_cotton: "prop_cotton",
  prop_iron: "prop_iron",
};

const MOB_MODELS = ["mob_anglerfish", "mob_deepone", "mob_charybdis"];
const MOB_IDS = ["guppy_raider", "reef_horror", "abyssal_tender"];

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

    this.scene.add(new THREE.HemisphereLight(0xcfeaff, 0x3f8f4f, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2cc, 1.5);
    sun.position.set(220, 320, 120);
    this.scene.add(sun);

    this.buildSky();
    this.buildSea();
    await this.loadModels();
    this.buildIslands();
    this.rebuildBuildings();
    this.buildPlayerAndShip();
    this.buildAIShips();
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.loop();
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x2e9bff) },
          mid: { value: new THREE.Color(0x8fd2ff) },
          bot: { value: new THREE.Color(0xeefaff) },
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
          void main(){
            float h = normalize(vPos).y;
            vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.55, h)) : mix(bot, mid, smoothstep(-0.15, 0.08, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(sky);

    // sun disc
    const sunTex = makeRadialTexture("#fff6d8", "#fff6d800");
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false }));
    sunSprite.scale.set(220, 220, 1);
    sunSprite.position.set(620, 560, -420);
    this.scene.add(sunSprite);

    // clouds
    const cloudTex = makeCloudTexture();
    this.clouds = [];
    const rng = mulberry32(77);
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.62 + rng() * 0.28, depthWrite: false }),
      );
      const a = rng() * Math.PI * 2;
      const rad = 500 + rng() * 600;
      sp.position.set(Math.cos(a) * rad, 150 + rng() * 180, Math.sin(a) * rad);
      const s = 90 + rng() * 130;
      sp.scale.set(s, s * 0.5, 1);
      sp.userData.speed = 2 + rng() * 4;
      this.scene.add(sp);
      this.clouds.push(sp);
    }
  }

  buildSea() {
    const geo = new THREE.PlaneGeometry(1600, 1600, 220, 220);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0f7fa8) },
        uShallow: { value: new THREE.Color(0x2fd0c0) },
        uSun: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
      },
      vertexShader: `
        uniform float uTime; varying vec3 vWorld; varying float vH;
        void main(){
          vec3 p = position;
          float t = uTime;
          float w = sin(p.x*0.045 + t*1.4)*0.5 + cos(p.z*0.055 + t*1.1)*0.5
                  + sin((p.x+p.z)*0.02 + t*0.7)*0.6;
          p.y += w*0.7;
          vH = w;
          vec4 wp = modelMatrix * vec4(p,1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSun;
        varying vec3 vWorld; varying float vH;
        void main(){
          vec3 base = mix(uDeep, uShallow, smoothstep(-0.8, 0.9, vH));
          vec3 dir = normalize(vWorld - cameraPosition);
          float spec = pow(max(dot(reflect(dir, vec3(0.,1.,0.)), uSun), 0.0), 28.0);
          float sparkle = step(0.96, fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453));
          vec3 c = base + vec3(1.0, 0.98, 0.85) * (spec * 0.55 + sparkle * 0.10);
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
      const h = Math.pow(clamp(n * 1.4 - 0.15, 0, 1), 1.35) * r * 0.55 * fall;
      return Math.round(h * 2.4) / 2.4;
    });
    const hAt = (x, z) => this.terrainHeights.get(def.id)(x, z);
    const colors = [];
    const positions = [];
    const indices = [];
    const col = (h) => {
      if (h < 0.35) return [0.91, 0.82, 0.6];
      if (h < 2.2) return [0.28, 0.72, 0.35];
      if (h < 5) return [0.42, 0.55, 0.42];
      return [0.55, 0.58, 0.62];
    };
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = -r + i * cell;
        const z = -r + j * cell;
        const h = hAt(x, z);
        heights[i * (N + 1) + j] = h;
        positions.push(x, h, z);
        const c = col(h);
        const shade = 0.82 + 0.18 * hash2(i, j, seed * 7);
        colors.push(c[0] * shade, c[1] * shade, c[2] * shade);
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
    const addNode = (kind, lx, lz, h, mesh, scale) => {
      const node = new THREE.Group();
      const m = mesh.clone(true);
      m.scale.setScalar(scale);
      node.add(m);
      node.position.set(def.pos[0] + lx, h, def.pos[1] + lz);
      node.userData = { kind, respawnAt: 0, baseY: h };
      this.scene.add(node);
      this.nodes.push(node);
    };
    const treeCount = def.id === "hub" ? 4 : 10 + Math.floor(rng() * 6);
    const cottonCount = def.id === "hub" ? 2 : 5 + Math.floor(rng() * 3);
    const ironCount = def.id === "hub" ? 2 : 4 + Math.floor(rng() * 2);
    const goldCount = def.id === "hub" ? 2 : 2 + Math.floor(rng() * 2);
    for (let i = 0; i < treeCount; i++) {
      tryPlace((x, z, h) => addNode("wood", x, z, h, makeVoxelTree(rng), 1));
    }
    for (let i = 0; i < cottonCount; i++) {
      tryPlace((x, z, h) => addNode("cotton", x, z, h, this.models.prop_cotton, 1));
    }
    for (let i = 0; i < ironCount; i++) {
      tryPlace((x, z, h) => addNode("iron", x, z, h, this.models.prop_iron, 1));
    }
    for (let i = 0; i < goldCount; i++) {
      tryPlace((x, z, h) => addNode("gold", x, z, h, makeGoldStack(rng), 1));
    }
    // hub buildings
    if (def.id === "hub") {
      const sw = this.models.prop_shipwright.clone(true);
      sw.position.set(16, hAt(16, 12), 12);
      sw.rotation.y = 0.6;
      island.add(sw);
      const chest = this.models.prop_chest.clone(true);
      chest.scale.setScalar(1.2);
      chest.position.set(-12, hAt(-12, 8), 8);
      island.add(chest);
      const tree = this.models.prop_tree.clone(true);
      tree.position.set(-20, hAt(-20, -14), -14);
      tree.rotation.y = 1.2;
      island.add(tree);
      // dock planks
      const plankMat = new THREE.MeshLambertMaterial({ color: 0xb98d5a });
      for (let i = 0; i < 5; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 7), plankMat);
        plank.position.set(0, 0.12, def.r - 4 - i * 6);
        island.add(plank);
      }
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
    this.ship.add(this.shipModel);
    }
    this.ship.position.set(0, 0, ISLANDS[0].r + 2);
    this.ship.rotation.y = 0;
    this.scene.add(this.ship);

    this.player = new THREE.Group();
    const pm = this.models.player.clone(true);
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
      const g = new THREE.Group();
      const m = this.models[names[i]].clone(true);
      m.scale.setScalar(0.75);
      m.position.y = -0.35;
      g.add(m);
      const a = rng() * Math.PI * 2;
      g.position.set(Math.cos(a) * 260, 0, Math.sin(a) * 260);
      g.userData = { target: ISLANDS[1 + i % 6], speed: 5 + rng() * 3, t: rng() * 10 };
      this.scene.add(g);
      this.aiShips.push(g);
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
    this.api.grantResource(gains[node.userData.kind], amt);
    node.visible = false;
    node.userData.respawnAt = this.time + 40 + Math.random() * 40;
    this.api.toast(`Gathered ${amt} ${gains[node.userData.kind]}!`);
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
    const input = this.readInput();
    if (this.mode === "sail") this.updateSail(dt, input);
    else this.updateOnFoot(dt, input);
    this.updateCamera(dt);
    this.updateSea(dt);
    this.updateClouds(dt);
    this.updateAIShips(dt);
    this.updateNodes();
    this.updateAmbush(dt);
    this.updateAction();
    this.updateHUD();
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
    // bob
    ship.position.y = Math.sin(this.time * 2.1) * 0.16 * (ship.userData.speed ? 1 : 0.4);
    ship.rotation.z = Math.sin(this.time * 1.7) * 0.02;
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
    const target = this.mode === "sail" ? this.ship : this.player;
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
    look.y += this.mode === "sail" ? 1.5 : 1.1;
    this.camera.lookAt(look);
  }

  updateSea(dt) {
    this.sea.material.uniforms.uTime.value = this.time;
  }

  updateClouds(dt) {
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
        s.position.y = Math.sin(s.userData.t * 1.8) * 0.14;
      }
    }
  }

  updateNodes() {
    for (const n of this.nodes) {
      if (!n.visible && n.userData.respawnAt && this.time >= n.userData.respawnAt) {
        n.visible = true;
        n.userData.respawnAt = 0;
      }
      if (n.visible) {
        n.rotation.y += 0.006;
        if (n.userData.kind === "gold") n.position.y = n.userData.baseY + Math.sin(this.time * 2.4) * 0.08;
        else n.position.y = n.userData.baseY;
      }
    }
  }

  updateAmbush(dt) {
    if (this.mode !== "sail") {
      this.ambushTimer = 12;
      return;
    }
    const island = this.islandAt(this.ship.position.x, this.ship.position.z, 46);
    if (island) {
      this.ambushTimer = 12;
      return;
    }
    this.ambushTimer -= dt;
    if (this.ambush && !this.ambush.removed) {
      const d = this.ship.position.distanceTo(this.ambush.mesh.position);
      if (d > 40) this.removeAmbush();
      else {
        const dir = new THREE.Vector3().subVectors(this.ship.position, this.ambush.mesh.position).normalize();
        this.ambush.mesh.position.addScaledVector(dir, 2.4 * dt);
        if (d < 7) {
          const mobId = this.ambush.mobId;
          this.removeAmbush();
          this.api.startAmbush(mobId);
        }
      }
    } else if (this.ambushTimer <= 0) {
      this.ambushTimer = 16 + Math.random() * 14;
      this.spawnAmbush();
    }
  }

  spawnAmbush() {
    const idx = Math.floor(Math.random() * MOB_IDS.length);
    const mobId = MOB_IDS[idx];
    const key = MOB_MODELS[idx];
    const mesh = this.models[key].clone(true);
    const fwd = new THREE.Vector3(-Math.sin(this.ship.rotation.y), 0, -Math.cos(this.ship.rotation.y));
    const pos = this.ship.position.clone().addScaledVector(fwd, 26);
    pos.y = 0.4;
    mesh.position.copy(pos);
    mesh.scale.multiplyScalar(1.15);
    this.scene.add(mesh);
    this.ambush = { mesh, mobId, removed: false, t: 0 };
    this.api.toast("⚠ Something stirs in the deep…");
    this.api.sfx("whoosh");
  }

  removeAmbush() {
    if (this.ambush && !this.ambush.removed) {
      this.scene.remove(this.ambush.mesh);
      this.ambush.removed = true;
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
          label = names[n.userData.kind] + ` (${this.api.getGatherCost?.() ?? 2}⚡)`;
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
    for (const n of this.nodes) {
      if (!n.visible) continue;
      const d = this.player.position.distanceTo(n.position);
      if (d < bestD) {
        bestD = d;
        best = n;
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
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
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
