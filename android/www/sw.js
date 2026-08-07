const CACHE = "piration-offline-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/core.js",
  "./js/ui.js",
  "./js/world3d.js",
  "./vendor/three.module.min.js",
  "./vendor/meshopt_decoder.module.js",
  "./vendor/jsm/loaders/GLTFLoader.js",
  "./vendor/jsm/utils/BufferGeometryUtils.js",
  "./data/cards.json",
  "./data/game.json",
  "./assets/manifest.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const isNav = req.mode === "navigate";
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => (isNav ? caches.match("./index.html") : Response.error()));
    })
  );
});
