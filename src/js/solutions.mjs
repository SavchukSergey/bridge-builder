// Reference bridges for each level: the hint outline shows them to a player who is stuck,
// and the tests use them to prove every level can be won within its budget (they were also
// used to calibrate the budgets).

import { SAVE_FORMAT_VERSION } from "./scene.js";

/** @typedef {import("./level.mjs").Level} Level */
/** @typedef {import("./scene.js").SavedStructure} SavedStructure */
/** @typedef {import("./scene.js").SavedJoint} SavedJoint */
/**
 * Materials of a truss's parts, by material id.
 * @typedef {{ step?: number, h?: number, diagonal?: string, vertical?: string, deck?: string, chord?: string }} TrussOptions
 */

/** Small helper for assembling saved structures from a level's anchors. */
export class Builder {
  /** @param {Level} level */
  constructor(level) {
    /** @type {SavedJoint[]} */
    this.joints = level.anchors.map(({ x, y }) => ({ x, y, fixed: true }));
    /** @type {SavedStructure["links"]} */
    this.links = [];
  }

  /**
   * Index of the joint at (x, y), adding it if needed.
   * @param {number} x
   * @param {number} y
   */
  joint(x, y) {
    const i = this.joints.findIndex(j => Math.abs(j.x - x) < 1e-9 && Math.abs(j.y - y) < 1e-9);
    if (i >= 0) return i;
    this.joints.push({ x, y });
    return this.joints.length - 1;
  }

  /**
   * @param {number} a - joint index
   * @param {number} b - joint index
   * @param {string} material - material id
   */
  link(a, b, material) {
    this.links.push({ a, b, material });
  }

  /**
   * A chain of links through the given joint indices.
   * @param {number[]} indices
   * @param {string} material
   */
  chain(indices, material) {
    indices.slice(1).forEach((b, i) => this.link(indices[i], b, material));
  }

  /** @returns {SavedStructure} */
  build() {
    return { version: SAVE_FORMAT_VERSION, joints: this.joints, links: this.links };
  }
}

/**
 * Road from (x0, y0) to (x1, y1) with joints every `step` m, plus a truss of height h above
 * it: top chord and verticals in steel, diagonals (in tension, Pratt layout) in `diagonal`.
 * Returns the deck/top joint indices.
 * @param {Builder} b
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {TrussOptions} [options]
 * @returns {{ deck: number[], top: (number | undefined)[] }}
 */
export function trussDeck(b, x0, y0, x1, y1, { step = 10, h = 6, diagonal = "steel", vertical = "steel", deck: deckMaterial = "road", chord = "steel" } = {}) {
  const n = Math.round((x1 - x0) / step);
  const yAt = (/** @type {number} */ x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + i * step);
  const deck = xs.map(x => b.joint(x, yAt(x)));
  b.chain(deck, deckMaterial);
  const top = xs.map((x, i) => (i === 0 || i === n) ? undefined : b.joint(x, yAt(x) + h));
  // end posts, top chord, verticals
  const topAt = (/** @type {number} */ i) => /** @type {number} */ (top[i]);
  b.link(deck[0], topAt(1), chord);
  b.link(deck[n], topAt(n - 1), chord);
  b.chain(/** @type {number[]} */ (top.slice(1, n)), chord);
  for (let i = 1; i < n; i++) b.link(deck[i], topAt(i), vertical);
  // Pratt diagonals slope down towards mid-span
  for (let i = 1; i < n - 1; i++) {
    if (i < n / 2) b.link(topAt(i), deck[i + 1], diagonal);
    else b.link(topAt(i + 1), deck[i], diagonal);
  }
  return { deck, top };
}

/**
 * Suspension bridge between anchors at ±half (deck y = 10), towers to `top`, cable sag `sag`.
 * @param {Level} level
 * @param {number} half
 * @param {number} top
 * @param {number} sag
 * @param {{ backstay?: string, tower?: string, hanger?: string, deck?: string, main?: string }} [options]
 * @returns {SavedStructure}
 */
export function suspension(level, half, top, sag, { backstay = "cable", tower = "steel", hanger = "cable", deck: deckMaterial = "road", main = "cable" } = {}) {
  const b = new Builder(level);
  /** @type {number[]} */
  const xs = [];
  for (let x = -half; x <= half; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, deckMaterial);
  const towerL = b.joint(-half, top), towerR = b.joint(half, top);
  b.link(deck[0], towerL, tower);
  b.link(/** @type {number} */ (deck.at(-1)), towerR, tower);
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
  b.chain(rope, main);
  return b.build();
}

/**
 * A row of triangles on a level road from -half to half (joints every 10 m): each apex h
 * above the middle of a stretch, joined to its neighbours.
 * @param {Level} level
 * @param {number} half
 * @param {number} h
 * @param {string} material
 * @returns {SavedStructure}
 */
export function triangles(level, half, h, material) {
  const b = new Builder(level);
  /** @type {number[]} */
  const xs = [];
  for (let x = -half; x <= half; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, "road");
  const apexes = xs.slice(1).map(x => b.joint(x - 5, 10 + h));
  apexes.forEach((apex, i) => {
    b.link(deck[i], apex, material);
    b.link(apex, deck[i + 1], material);
  });
  b.chain(apexes, material);
  return b.build();
}

/**
 * Posts at ±half up to `top` (with cable backstays to the outer anchors) and a fan of cables
 * from each post's top to the road joints on its half.
 * @param {Level} level
 * @param {number} half
 * @param {number} top
 * @param {string} stay - the fan's material
 * @returns {SavedStructure}
 */
export function fan(level, half, top, stay) {
  const b = new Builder(level);
  const left = b.joint(-half, top), right = b.joint(half, top);
  b.link(b.joint(-half, 10), left, "steel-light");
  b.link(b.joint(half, 10), right, "steel-light");
  b.link(left, b.joint(-half - 10, 10), "cable");
  b.link(right, b.joint(half + 10, 10), "cable");
  /** @type {number[]} */
  const xs = [];
  for (let x = -half; x <= half; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, "road");
  xs.forEach((x, i) => {
    if (x < 0 && x > -half) b.link(left, deck[i], stay);
    else if (x > 0 && x < half) b.link(right, deck[i], stay);
  });
  return b.build();
}

/**
 * Just a road from (x0, y0) to (x1, y1), joints every 10 m.
 * @param {Level} level
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {string} [deck]
 * @returns {SavedStructure}
 */
export function bareDeck(level, x0, y0, x1, y1, deck = "road") {
  const b = new Builder(level);
  const n = Math.round((x1 - x0) / 10);
  b.chain(Array.from({ length: n + 1 }, (_, i) => b.joint(x0 + i * 10, y0 + (y1 - y0) * i / n)), deck);
  return b.build();
}

/** A truss with cable diagonals and light verticals: the usual lean layout. */
export const LEAN = { diagonal: "cable", vertical: "steel-light" };

/**
 * A truss as a whole structure.
 * @param {Level} level
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {TrussOptions} [opts]
 * @returns {SavedStructure}
 */
export function truss(level, x0, y0, x1, y1, opts) {
  const b = new Builder(level);
  trussDeck(b, x0, y0, x1, y1, opts);
  return b.build();
}

/**
 * Road from -25 to 25 (y = 10) with a light strut from each ledge anchor to the deck joints
 * at `struts` on its side.
 * @param {Level} level
 * @param {[number, number][]} ledges
 * @param {number[]} struts
 * @param {string} [material]
 * @returns {SavedStructure}
 */
export function ledgeStruts(level, ledges, struts, material = "steel-light") {
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
 * @param {Level} level
 * @param {{ ring?: string, post?: string, brace?: string }} [options]
 * @returns {SavedStructure}
 */
export function bracedArch(level, { ring = "steel-light", post = "steel-light", brace = "steel-light" } = {}) {
  const b = new Builder(level);
  /** @type {number[]} */
  const xs = [];
  for (let x = -40; x <= 40; x += 10) xs.push(x);
  const deck = xs.map(x => b.joint(x, 10));
  b.chain(deck, "road");
  const archY = (/** @type {number} */ x) => Math.round((-6 + 16 * (1 - (x / 34) ** 2)) * 2) / 2;
  const under = new Map([-30, -20, -10, 10, 20, 30].map(x => [x, b.joint(x, archY(x))]));
  const at = (/** @type {number} */ x) => deck[xs.indexOf(x)];
  const ringAt = (/** @type {number} */ x) => /** @type {number} */ (under.get(x));
  b.chain([b.joint(-34, -6), ringAt(-30), ringAt(-20), ringAt(-10), at(0),
    ringAt(10), ringAt(20), ringAt(30), b.joint(34, -6)], ring);
  for (const [x, j] of under) {
    b.link(j, at(x), post);
    b.link(j, at(x - 10), brace);
    b.link(j, at(x + 10), brace);
  }
  return b.build();
}

/**
 * Spans between consecutive deck points, each a lean truss of height h. Returns each span's
 * deck joints.
 * @param {Builder} b
 * @param {[number, number][]} points
 * @param {number} h
 * @param {TrussOptions} [opts]
 * @returns {number[][]}
 */
export function trussSpans(b, points, h, opts = LEAN) {
  return points.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = points[i];
    return trussDeck(b, x0, y0, x1, y1, { h, ...opts }).deck;
  });
}

/**
 * An A-frame from two rock anchors up to a deck joint.
 * @param {Builder} b
 * @param {number} rockX0
 * @param {number} rockX1
 * @param {number} rockY
 * @param {number} deckJoint
 */
export function aFrame(b, rockX0, rockX1, rockY, deckJoint) {
  b.link(b.joint(rockX0, rockY), deckJoint, "steel");
  b.link(b.joint(rockX1, rockY), deckJoint, "steel");
}

/**
 * The cheapest designs found, with members right-sized from their peak loads in simulation
 * (lightly loaded towers, hangers and verticals use the light/thin sizes).
 * @type {Record<string, (level: Level) => SavedStructure>}
 */
export const solutions = {
  // $6,000: two links of road are enough for a car and an 18 t bus
  brook: (level) => bareDeck(level, -10, 10, 10, 10),
  // ~$13,700: light steel triangles, 6 m tall (4 m ones break under the 200 t hauler)
  triangles: (level) => triangles(level, 15, 6, "steel-light"),
  // ~$20,000: thin cables fanning down from the posts the level starts with
  hang: (level) => fan(level, 25, 20, "cable-thin"),
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
    const mid = /** @type {number} */ (left.deck.at(-1));
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
    aFrame(b, -34, -26, -4, /** @type {number} */ (left.at(-1)));
    aFrame(b, 26, 34, -4, /** @type {number} */ (mid.at(-1)));
    return b.build();
  },
  // ~$40,700: thin cables are enough for the posts, as the light X-bracing carries the
  // deck's load down to the ring
  gorge: (level) => bracedArch(level, { post: "cable-thin" }),
  // ~$20,400: the creek's light suspension bridge, in rail
  "branch-line": (level) => suspension(level, 20, 14, 3, { tower: "steel-light", hanger: "cable-thin", deck: "rail" }),
  // ~$56,500: a 6 m truss; light diagonals, as cables stretch too much under 380 t
  freight: (level) => truss(level, -40, 10, 40, 10, { h: 6, diagonal: "steel-light", vertical: "steel-light", deck: "rail" }),
  // ~$88,000: two 60 m trusses meeting over an A-frame pier on the rock
  // ~$11,000: a road hinged at the near bank, hung from a winch on a 14 m tower held by a cable
  drawbridge: (level) => {
    const b = new Builder(level);
    const hinge = b.joint(-10, 10), top = b.joint(-10, 24), tip = b.joint(10, 10);
    b.link(hinge, top, "steel-light");
    b.link(b.joint(-20, 10), top, "cable-thin");
    b.link(hinge, tip, "road");
    b.link(top, tip, "winch");
    return b.build();
  },
  mountain: (level) => {
    const b = new Builder(level);
    const opts = { h: 4, diagonal: "steel-light", vertical: "steel-light", deck: "rail" };
    const left = trussDeck(b, -60, 10, 0, 10, opts);
    trussDeck(b, 0, 10, 60, 10, opts);
    aFrame(b, -4, 4, -6, /** @type {number} */ (left.deck.at(-1)));
    return b.build();
  },
  // ~$105,200: two 80 m spans meeting over the rock
  grand: (level) => {
    const b = new Builder(level);
    const [left] = trussSpans(b, [[-80, 10], [0, 13], [80, 16]], 7);
    aFrame(b, -4, 4, -6, /** @type {number} */ (left.at(-1)));
    return b.build();
  },
};
