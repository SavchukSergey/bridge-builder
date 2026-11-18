// Reference bridges for each level. Tests use them to prove every level can be won within
// its budget; they were also used to calibrate the budgets.

import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

/** Small helper for assembling saved structures from a level's anchors. */
export class Builder {
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
export function trussDeck(b, x0, y0, x1, y1, { step = 10, h = 6, diagonal = "steel", vertical = "steel" } = {}) {
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
export function suspension(level, half, top, sag, { backstay = "cable", tower = "steel", hanger = "cable" } = {}) {
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
export function bareDeck(level, x0, y0, x1, y1) {
  const b = new Builder(level);
  const n = Math.round((x1 - x0) / 10);
  b.chain(Array.from({ length: n + 1 }, (_, i) => b.joint(x0 + i * 10, y0 + (y1 - y0) * i / n)), "road");
  return b.build();
}

/** A truss with cable diagonals and light verticals: the usual lean layout. */
const LEAN = { diagonal: "cable", vertical: "steel-light" };

/** A truss as a whole structure. */
function truss(level, x0, y0, x1, y1, opts) {
  const b = new Builder(level);
  trussDeck(b, x0, y0, x1, y1, opts);
  return b.build();
}

/** Road from -half to +half (y = 10) with a light strut from each ledge anchor to deck joint x. */
function ledgeStruts(level, ledges, struts, material = "steel-light") {
  const b = new Builder(level);
  const deck = [];
  for (let x = -25; x <= 25; x += 10) deck.push(b.joint(x, 10));
  b.chain(deck, "road");
  for (const [lx, ly] of ledges) for (const x of struts) if (Math.sign(x) === Math.sign(lx)) b.link(b.joint(lx, ly), b.joint(x, 10), material);
  return b.build();
}

/**
 * A deck arch for the Deep gorge: a parabolic ring from the ledge anchors (±34, -6) up to
 * the deck at mid-span, with posts up to each deck joint and X-bracing in every panel (a
 * pin-jointed arch without bracing is a mechanism and folds up).
 */
function bracedArch(level, { ring = "steel-light", post = "steel-light", brace = "steel-light" } = {}) {
  const b = new Builder(level);
  const xs = [];
  for (let x = -40; x <= 40; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, "road");
  const archY = (x) => Math.round((-6 + 16 * (1 - (x / 34) ** 2)) * 2) / 2;
  const under = new Map([-30, -20, -10, 10, 20, 30].map(x => [x, b.joint(x, archY(x))]));
  const at = (x) => deck[xs.indexOf(x)];
  b.chain([b.joint(-34, -6), under.get(-30), under.get(-20), under.get(-10), at(0),
    under.get(10), under.get(20), under.get(30), b.joint(34, -6)], ring);
  for (const [x, j] of under) {
    b.link(j, at(x), post);
    b.link(j, at(x - 10), brace);
    b.link(j, at(x + 10), brace);
  }
  return b.build();
}

/** Spans between consecutive deck points, each a lean truss of height h. Returns the deck joints at the ends of the spans. */
function trussSpans(b, points, h, opts = LEAN) {
  return points.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = points[i];
    return trussDeck(b, x0, y0, x1, y1, { h, ...opts }).deck;
  });
}

/** An A-frame from two rock anchors up to a deck joint. */
function aFrame(b, rockX0, rockX1, rockY, deckJoint) {
  b.link(b.joint(rockX0, rockY), deckJoint, "steel");
  b.link(b.joint(rockX1, rockY), deckJoint, "steel");
}

/**
 * The cheapest designs found, with members right-sized from their peak loads in simulation
 * (lightly loaded towers, hangers and verticals use the light/thin sizes).
 */
export const solutions = {
  // $6,000: two links of road are enough for a car and an 18 t bus
  brook: (level) => bareDeck(level, -10, 10, 10, 10),
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
  // ~$17,500: one light strut from each ledge to the deck joint nearest mid-span
  ledges: (level) => ledgeStruts(level, [[-20, 0], [20, 0]], [-5, 5]),
  // ~$22,300: a shallow truss; light diagonals, since cables stretch too much under 200 t
  heavy: (level) => truss(level, -20, 10, 20, 10, { h: 3, diagonal: "steel-light", vertical: "steel-light" }),
  // ~$34,200
  downhill: (level) => truss(level, -30, 18, 30, 8, { h: 3, ...LEAN }),
  // ~$23,600: the creek's design, stretched to 60 m
  rush: (level) => suspension(level, 30, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
  // ~$46,400: deeper sag than the creek's, so the deck isn't stretched as hard
  "long-span": (level) => suspension(level, 50, 26, 10, { hanger: "cable-thin" }),
  // ~$114,500: three 60 m spans, piers on both rocks
  viaduct: (level) => {
    const b = new Builder(level);
    const [left, mid] = trussSpans(b, [[-90, 10], [-30, 10], [30, 10], [90, 10]], 4);
    aFrame(b, -34, -26, -4, left.at(-1));
    aFrame(b, 26, 34, -4, mid.at(-1));
    return b.build();
  },
  // ~$40,700: thin cables are enough for the posts, as the light X-bracing carries the
  // deck's load down to the ring
  gorge: (level) => bracedArch(level, { post: "cable-thin" }),
  // ~$105,200: two 80 m spans meeting over the rock
  grand: (level) => {
    const b = new Builder(level);
    const [left] = trussSpans(b, [[-80, 10], [0, 13], [80, 16]], 7);
    aFrame(b, -4, 4, -6, left.at(-1));
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
  ledges: {
    "bare deck": (level) => bareDeck(level, -25, 10, 25, 10),
    "two struts per side": (level) => ledgeStruts(level, [[-20, 0], [20, 0]], [-15, -5, 5, 15]),
    "light suspension": (level) => suspension(level, 25, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
  },
  heavy: {
    "creek's light suspension": (level) => suspension(level, 20, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
    "truss h6 cable diag": (level) => truss(level, -20, 10, 20, 10, { h: 6, ...LEAN }),
  },
  downhill: {
    "bare ramp": (level) => bareDeck(level, -30, 18, 30, 8),
    "truss h4 lean": (level) => truss(level, -30, 18, 30, 8, { h: 4, ...LEAN }),
  },
  rush: {
    "bare deck": (level) => bareDeck(level, -30, 10, 30, 10),
    "truss h4 lean": (level) => truss(level, -30, 10, 30, 10, { h: 4, ...LEAN }),
  },
  "long-span": {
    "bare deck": (level) => bareDeck(level, -50, 10, 50, 10),
    "suspension 22/6": (level) => suspension(level, 50, 22, 6, { hanger: "cable-thin" }),
  },
  viaduct: {
    "bare deck": (level) => bareDeck(level, -90, 10, 90, 10),
  },
  gorge: {
    "bare deck": (level) => bareDeck(level, -40, 10, 40, 10),
    "truss h8 lean": (level) => truss(level, -40, 10, 40, 10, { h: 8, ...LEAN }),
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
