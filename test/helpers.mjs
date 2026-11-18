// Minimal browser stand-ins so the game modules can run under `node --test`.

class FakeStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

/** 2D affine matrix [a c e; b d f], enough of DOMMatrix for the canvas transform. */
class Affine {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { Object.assign(this, { a, b, c, d, e, f }); }
  transformPoint(p) {
    return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: p.z ?? 0, w: 1 };
  }
  inverse() {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    return new Affine(d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det);
  }
}
globalThis.DOMMatrix ??= Affine;
globalThis.window ??= { addEventListener() { }, removeEventListener() { } };

/** Material the fake material radio group reports as checked. */
export const ui = { material: "steel" };
globalThis.document ??= { querySelector: () => ({ value: ui.material }) };

// Node 22+ ships an experimental global localStorage; always replace it with an in-memory one.
Object.defineProperty(globalThis, "localStorage", { value: new FakeStorage(), configurable: true, writable: true });

const { Game } = await import("../src/js/game.js");

/**
 * Fresh game on an 800x600 canvas with empty storage and steel selected, on the given level
 * (default: the Canyon, which starts from the demo bridge) and with the default view
 * (zoom 8, centred on the origin) that coordinates in tests assume.
 */
export function createGame(levelId = "canyon") {
  localStorage.clear();
  ui.material = "steel";
  const canvas = {
    width: 800,
    height: 600,
    addEventListener() { },
    removeEventListener() { },
    getBoundingClientRect: () => ({ x: 0, y: 0 }),
    getContext() {
      let m = new Affine();
      return {
        setTransform(a, b, c, d, e, f) { m = new Affine(a, b, c, d, e, f); },
        getTransform: () => m,
        clearRect() { },
      };
    },
  };
  const game = new Game(/** @type {any} */(canvas));
  game.selectLevel(levelId);
  game.ctx.width = canvas.width;
  game.ctx.height = canvas.height;
  game.ctx.zoom = 8;
  game.ctx.shift = { x: 0, y: 0, z: 0 };
  game.ctx.clear(); // applies the view transform, as the first rendered frame would
  return game;
}

/**
 * A pointer event positioned at world coordinates (x, y) for the game's current view.
 * @param {import("../src/js/game.js").Game} game
 */
export function at(game, x, y, extra = {}) {
  const { zoom, shift, width, height } = game.ctx;
  return {
    clientX: (x - shift.x) * zoom + width / 2,
    clientY: height / 2 - (y - shift.y) * zoom,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    preventDefault() { },
    ...extra,
  };
}

/** Clicks joint/point A, then point B, as a user building a link would. */
export function buildLink(game, ax, ay, bx, by, extra = {}) {
  game.__handleClick(at(game, ax, ay, extra));
  game.__handleMouseMove(at(game, bx, by, extra));
  game.__handleClick(at(game, bx, by, extra));
}

export function rightClick(game, x, y) {
  game.__handleContextMenu(at(game, x, y));
}

export function key(game, k, mods = {}) {
  game.__handleKeyDown({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: null, preventDefault() { }, ...mods });
}

/** Runs the simulation for the given number of 60 fps frames. */
export function runFrames(game, frames) {
  game.setSimulationRunning(true);
  for (let i = 0; i < frames; i++) game.tick();
}

export const positionsOf = (scene) => scene.joints.map(j => ({ x: j.position.x, y: j.position.y }));
