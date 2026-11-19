import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";

const SRC = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, SRC));

/** Every file in src/, as paths relative to it. */
function filesIn(dir = SRC, prefix = "") {
  return readdirSync(dir).flatMap(name => {
    const url = new URL(name, dir);
    return statSync(url).isDirectory() ? filesIn(new URL(`${name}/`, dir), `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

/**
 * Runs sw.js against fake service-worker globals. `network` answers fetches (throw to be
 * offline). Returns its event handlers and the fake caches.
 */
function loadWorker(network) {
  /** @type {Map<string, Map<string, any>>} */
  const stores = new Map([["bridge-builder-v0", new Map()], ["someone-else", new Map()]]);
  const keyOf = (req, ignoreSearch = false) => {
    const url = new URL(typeof req === "string" ? req : req.url, "https://example.test/game/");
    return ignoreSearch ? url.origin + url.pathname : url.href;
  };
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(reqs) { for (const r of reqs) store.set(keyOf(r), { body: `fresh ${keyOf(r)}` }); },
      async put(req, res) { store.set(keyOf(req), res); },
      async match(req, { ignoreSearch = false } = {}) {
        const want = keyOf(req, ignoreSearch);
        for (const [k, v] of store) if ((ignoreSearch ? keyOf(k, true) : k) === want) return v;
        return undefined;
      },
    };
  };
  const handlers = {};
  const self = {
    location: new URL("https://example.test/game/sw.js"),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => { },
    clients: { claim: async () => { } },
  };
  class Request {
    constructor(url, init = {}) { this.url = new URL(url, "https://example.test/game/").href; Object.assign(this, init); }
  }
  runInNewContext(read("sw.js").toString(), {
    self, Request, URL,
    caches: { open: async (name) => cacheFor(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: async (req) => network(req),
  });
  /** Dispatches an event and waits for what the handler waits on or responds with. */
  const fire = async (type, event = {}) => {
    let promise;
    handlers[type]({ ...event, waitUntil: (p) => { promise = p; }, respondWith: (p) => { promise = p; } });
    return promise;
  };
  return { fire, stores, handlers };
}

const request = (path, mode = "cors") => ({ url: new URL(path, "https://example.test/game/").href, method: "GET", mode });

describe("installable", () => {
  test("the manifest names the game and its icons, which exist at their sizes", () => {
    const manifest = JSON.parse(read("manifest.webmanifest").toString());
    assert.equal(manifest.name, "Bridge Builder");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "./", "relative, so it works under any path (GitHub Pages)");
    const png = (icon) => {
      const bytes = read(icon.src);
      assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47], `${icon.src} is a PNG`);
      return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
    };
    for (const icon of manifest.icons) {
      if (icon.type === "image/png") assert.equal(png(icon), icon.sizes, icon.src);
      else assert.match(read(icon.src).toString(), /<svg/);
    }
    assert.ok(manifest.icons.some(i => i.sizes === "192x192") && manifest.icons.some(i => i.sizes === "512x512"));
    assert.ok(manifest.icons.some(i => i.purpose === "maskable"));
  });

  test("the page links the manifest and the icons", () => {
    const html = read("index.html").toString();
    for (const href of ["manifest.webmanifest", "icons/icon.svg", "icons/apple-touch-icon.png"]) {
      assert.ok(html.includes(`href="${href}"`), href);
    }
    assert.match(html, /<meta name="theme-color"/);
  });
});

describe("offline", () => {
  test("the worker keeps every file the game has", () => {
    const sw = read("sw.js").toString();
    const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const files = filesIn().filter(f => f !== "sw.js").sort();
    assert.deepEqual(shell.filter(f => f !== "./").sort(), files, "SHELL lists every file in src/ (and only those)");
    assert.ok(shell.includes("./"), "and the page's own address");
  });

  test("on install it fetches everything once", async () => {
    const { fire, stores } = loadWorker(() => { throw new Error("offline"); });
    await fire("install");
    const cache = stores.get("bridge-builder-v8");
    assert.ok(cache.has("https://example.test/game/js/main.js"));
    assert.ok(cache.has("https://example.test/game/"));
  });

  test("online: the network answers, and the answer is kept", async () => {
    const { fire, stores } = loadWorker((req) => ({ ok: true, body: `net ${req.url}`, clone() { return this; } }));
    const res = await fire("fetch", { request: request("js/level.mjs") });
    assert.equal(res.body, "net https://example.test/game/js/level.mjs");
    assert.equal(stores.get("bridge-builder-v8").get("https://example.test/game/js/level.mjs").body, res.body);
  });

  test("offline: the kept copy, whatever the ?query, and the page for any address in it", async () => {
    let online = true;
    const { fire } = loadWorker((req) => {
      if (!online) throw new TypeError("Failed to fetch");
      return { ok: true, body: `net ${req.url}`, clone() { return this; } };
    });
    await fire("install");
    online = false;
    const js = await fire("fetch", { request: request("js/scene.js") });
    assert.equal(js.body, "fresh https://example.test/game/js/scene.js");
    const page = await fire("fetch", { request: request("./?r=7", "navigate") });
    assert.match(page.body, /game\/$/);
    const other = await fire("fetch", { request: request("somewhere/else", "navigate") });
    assert.equal(other.body, "fresh https://example.test/game/index.html");
    await assert.rejects(fire("fetch", { request: request("not-kept.json") }), /Failed to fetch/);
  });

  test("other sites and anything but GET are left to the browser", () => {
    const { handlers } = loadWorker(() => { throw new Error("should not fetch"); });
    let responded = false;
    const event = (r) => ({ request: r, respondWith: () => { responded = true; } });
    handlers.fetch(event({ url: "https://elsewhere.test/x.js", method: "GET", mode: "cors" }));
    handlers.fetch(event({ ...request("js/main.js"), method: "POST" }));
    assert.equal(responded, false);
  });

  test("a new version clears the old cache, and leaves other caches alone", async () => {
    const { fire, stores } = loadWorker(() => { throw new Error("offline"); });
    await fire("activate");
    assert.equal(stores.has("bridge-builder-v0"), false);
    assert.equal(stores.has("someone-else"), true);
  });
});
