// Service worker: lets the game be installed and played offline.
//
// Online, every request goes to the network first (so a new version, or a file being
// edited, is never hidden behind an old copy) and the answer is kept. Offline, the kept
// copy is used. On install, every file the game needs is fetched once, so all of it works
// offline from the first visit, not only the parts already seen.
//
// SHELL must list every file in src/ (a test checks it); bump VERSION when that changes.

const VERSION = 10;
const CACHE = `bridge-builder-v${VERSION}`;

const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "js/audio.mjs",
  "js/badges.mjs",
  "js/challenges.mjs",
  "js/confetti.mjs",
  "js/daily.mjs",
  "js/drawbridge.mjs",
  "js/effects.mjs",
  "js/ending.mjs",
  "js/engine/joint.mjs",
  "js/engine/link.mjs",
  "js/eval-ctx.mjs",
  "js/game-config.mjs",
  "js/game-core.mjs",
  "js/game-editing.mjs",
  "js/game-input.mjs",
  "js/game-levels.mjs",
  "js/game-types.mjs",
  "js/game.js",
  "js/grid.mjs",
  "js/guide.mjs",
  "js/guide-ui.mjs",
  "js/hints.mjs",
  "js/i18n.mjs",
  "js/level-preview.mjs",
  "js/level.mjs",
  "js/looks.mjs",
  "js/locales/en.mjs",
  "js/locales/ru.mjs",
  "js/locales/uk.mjs",
  "js/main.js",
  "js/materials/cable.mjs",
  "js/materials/index.mjs",
  "js/materials/material.mjs",
  "js/materials/material.types.mjs",
  "js/materials/road.mjs",
  "js/materials/steel.mjs",
  "js/materials/wood.mjs",
  "js/math.js",
  "js/real-bridges.mjs",
  "js/render-ctx.mjs",
  "js/sandbox.mjs",
  "js/scene.js",
  "js/scenery.mjs",
  "js/share.mjs",
  "js/solutions.mjs",
  "js/speech.mjs",
  "js/storage.mjs",
  "js/themes.mjs",
  "js/vehicle-types.mjs",
  "js/vehicle.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // no-cache: fetch fresh copies, not ones an HTTP cache may hold
    await cache.addAll(SHELL.map(path => new Request(path, { cache: "no-cache" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("bridge-builder-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (err) {
      // offline: the kept copy, ignoring ?query (the page is opened with ?r=… and the like)
      const kept = await cache.match(request, { ignoreSearch: true })
        ?? (request.mode === "navigate" ? await cache.match("index.html") : undefined);
      if (kept) return kept;
      throw err;
    }
  })());
});
