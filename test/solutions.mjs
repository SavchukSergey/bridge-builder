// Reference bridges for each level. Tests use them to prove every level can be won within
// its budget; they were also used to calibrate the budgets.

import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

/** Small helper for assembling saved structures from a level's anchors. */
class Builder {
  /** @param {import("../src/js/level.mjs").Level} level */
  constructor(level) {
    this.joints = level.anchors.map(({ x, y }) => ({ x, y, fixed: true }));
    this.links = [];
  }

  /** Index of the joint at (x, y), adding it if needed. */
  joint(x, y) {
    const i = this.joints.findIndex(j => Math.abs(j.x - x) < 1e-9 && Math.abs(j.y - y) < 1e-9);
    if (i >= 0) return i;
    this.joints.push({ x, y });
    return this.joints.length - 1;
  }

  link(a, b, material) {
    this.links.push({ a, b, material });
  }

  /** A chain of links through the given joint indices. */
  chain(indices, material) {
    indices.slice(1).forEach((b, i) => this.link(indices[i], b, material));
  }

  build() {
    return { version: SAVE_FORMAT_VERSION, joints: this.joints, links: this.links };
  }
}

/**
 * Road from (x0, y0) to (x1, y1) with joints every `step` m, plus a truss of height h above
 * it: top chord and verticals in steel, diagonals (in tension, Pratt layout) in `diagonal`.
 * Returns the builder and the deck/top joint indices.
 */
function trussDeck(b, x0, y0, x1, y1, { step = 10, h = 6, diagonal = "steel", vertical = "steel" } = {}) {
  const n = Math.round((x1 - x0) / step);
  const yAt = (x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + i * step);
  const deck = xs.map(x => b.joint(x, yAt(x)));
  b.chain(deck, "road");
  const top = xs.map((x, i) => (i === 0 || i === n) ? undefined : b.joint(x, yAt(x) + h));
  // end posts, top chord, verticals
  b.link(deck[0], top[1], "steel");
  b.link(deck[n], top[n - 1], "steel");
  b.chain(top.slice(1, n), "steel");
  for (let i = 1; i < n; i++) b.link(deck[i], top[i], vertical);
  // Pratt diagonals slope down towards mid-span
  for (let i = 1; i < n - 1; i++) {
    if (i < n / 2) b.link(top[i], deck[i + 1], diagonal);
    else b.link(top[i + 1], deck[i], diagonal);
  }
  return { deck, top };
}

/** Suspension bridge between anchors at ±half (deck y = 10), towers to `top`, cable sag `sag`. */
function suspension(level, half, top, sag, { backstay = "cable", tower = "steel", hanger = "cable" } = {}) {
  const b = new Builder(level);
  const xs = [];
  for (let x = -half; x <= half; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, "road");
  const towerL = b.joint(-half, top), towerR = b.joint(half, top);
  b.link(deck[0], towerL, tower);
  b.link(deck.at(-1), towerR, tower);
  b.link(towerL, b.joint(-half - 10, 10), backstay);
  b.link(towerR, b.joint(half + 10, 10), backstay);
  const rope = [towerL];
  for (let i = 1; i < xs.length - 1; i++) {
    const x = xs[i];
    const r = b.joint(x, top - sag * (1 - (x / half) ** 2));
    rope.push(r);
    b.link(r, deck[i], hanger);
  }
  rope.push(towerR);
  b.chain(rope, "cable");
  return b.build();
}

/** Just a road from (x0, y0) to (x1, y1), joints every 10 m: should never be enough. */
function bareDeck(level, x0, y0, x1, y1) {
  const b = new Builder(level);
  const n = Math.round((x1 - x0) / 10);
  b.chain(Array.from({ length: n + 1 }, (_, i) => b.joint(x0 + i * 10, y0 + (y1 - y0) * i / n)), "road");
  return b.build();
}

/**
 * The cheapest designs found, with members right-sized from their peak loads in simulation
 * (lightly loaded towers, hangers and verticals use the light/thin sizes).
 */
export const solutions = {
  // ~$16,400
  creek: (level) => suspension(level, 20, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
  // ~$35,300
  canyon: (level) => suspension(level, 40, 20, 6, { hanger: "cable-thin" }),
  // ~$34,600
  step: (level) => {
    const b = new Builder(level);
    trussDeck(b, -30, 10, 30, 18, { h: 4, diagonal: "cable", vertical: "steel-light" });
    return b.build();
  },
  // ~$75,200: two trussed spans meeting over an A-frame pier on the rock
  pier: (level) => {
    const b = new Builder(level);
    const left = trussDeck(b, -60, 10, 0, 10, { h: 4, diagonal: "cable", vertical: "steel-light" });
    trussDeck(b, 0, 10, 60, 10, { h: 4, diagonal: "cable", vertical: "steel-light" });
    const mid = left.deck.at(-1);
    b.link(b.joint(-4, -6), mid, "steel");
    b.link(b.joint(4, -6), mid, "steel");
    return b.build();
  },
};

/** Alternative designs, for calibrating budgets. */
export const alternatives = {
  creek: {
    "bare deck": (level) => bareDeck(level, -20, 10, 20, 10),
    "truss h6 steel": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 6 }); return b.build(); },
    "truss h6 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 6, diagonal: "cable" }); return b.build(); },
    "truss h4 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 4, diagonal: "cable" }); return b.build(); },
    "suspension top 16 sag 4": (level) => suspension(level, 20, 16, 4),
    "suspension top 14 sag 3": (level) => suspension(level, 20, 14, 3),
  },
  canyon: {
    "suspension top 20 sag 6": (level) => suspension(level, 40, 20, 6),
    "truss h8 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -40, 10, 40, 10, { h: 8, diagonal: "cable" }); return b.build(); },
  },
  step: {
    "bare ramp": (level) => bareDeck(level, -30, 10, 30, 18),
    "truss h6 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 6, diagonal: "cable" }); return b.build(); },
    "truss h4 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 4, diagonal: "cable" }); return b.build(); },
    "truss h8 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 8, diagonal: "cable" }); return b.build(); },
    "truss h6 steel": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 6 }); return b.build(); },
  },
  pier: {
    "two trusses h6 + A-frame": (level) => {
      const b = new Builder(level);
      const left = trussDeck(b, -60, 10, 0, 10, { h: 6, diagonal: "cable" });
      trussDeck(b, 0, 10, 60, 10, { h: 6, diagonal: "cable" });
      b.link(b.joint(-4, -6), left.deck.at(-1), "steel");
      b.link(b.joint(4, -6), left.deck.at(-1), "steel");
      return b.build();
    },
    "two trusses h4 + A-frame": (level) => {
      const b = new Builder(level);
      const left = trussDeck(b, -60, 10, 0, 10, { h: 4, diagonal: "cable" });
      trussDeck(b, 0, 10, 60, 10, { h: 4, diagonal: "cable" });
      b.link(b.joint(-4, -6), left.deck.at(-1), "steel");
      b.link(b.joint(4, -6), left.deck.at(-1), "steel");
      return b.build();
    },
    "one truss h8, no pier": (level) => { const b = new Builder(level); trussDeck(b, -60, 10, 60, 10, { h: 8, diagonal: "cable" }); return b.build(); },
    "bare deck + A-frame": (level) => {
      const b = new Builder(level);
      const deck = []; for (let x = -60; x <= 60; x += 10) deck.push(b.joint(x, 10));
      b.chain(deck, "road");
      b.link(b.joint(-4, -6), deck[6], "steel"); b.link(b.joint(4, -6), deck[6], "steel");
      return b.build();
    },
  },
};
