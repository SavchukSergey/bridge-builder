import { SAVE_FORMAT_VERSION, Scene } from "./scene.js";
import { Vehicle } from "./vehicle.mjs";
import { renderAbutment, renderFlag, renderGround, renderTrees, renderValley, renderWater, renderWaterFront } from "./scenery.mjs";

/**
 * @typedef {Object} TerrainBlock - solid ground with a flat top, extending far downwards
 * @property {number} x0
 * @property {number} x1
 * @property {number} y - height of the top
 */

/**
 * @typedef {Object} LevelOpts
 * @property {string} id - stable key for saves and progress
 * @property {string} name
 * @property {string} description
 * @property {TerrainBlock[]} terrain
 * @property {{ x: number, y: number }[]} anchors - fixed joints the player builds from
 * @property {number} startX - where the first truck starts
 * @property {number} finishX - a truck has crossed once it reaches this x
 * @property {number} vehicleMass - kg, per truck
 * @property {number} [vehicleCount] - trucks in the convoy
 * @property {number} [vehicleSpacing] - m between the fronts of consecutive trucks
 * @property {number} budget - maximum structure cost: crossing within it earns one star
 * @property {{ two: number, three: number }} stars - cost at or under which a win earns two
 *   and three stars
 * @property {{ x0: number, x1: number, y: number }} view - area to fit on screen
 * @property {number} [water] - height of the river surface in the gap, if there is one
 * @property {() => import("./scene.js").SavedStructure} [example] - starting structure
 *   instead of bare anchors
 */

/**
 * A level: terrain with a gap, anchors to build from, a convoy of trucks that must drive
 * from the start to the flag, and a budget for the structure.
 */
export class Level {
  /** Position in {@link levels}, from 1. */
  number = 0;

  /**
   * @param {LevelOpts} opts
   */
  constructor(opts) {
    this.id = opts.id;
    this.name = opts.name;
    this.description = opts.description;
    this.terrain = opts.terrain;
    this.anchors = opts.anchors;
    this.startX = opts.startX;
    this.finishX = opts.finishX;
    this.vehicleMass = opts.vehicleMass;
    this.vehicleCount = opts.vehicleCount ?? 1;
    this.vehicleSpacing = opts.vehicleSpacing ?? 10;
    this.budget = opts.budget;
    this.stars = opts.stars;
    this.view = opts.view;
    this.example = opts.example;
    this.water = opts.water;
  }

  /**
   * Height of the ground at x, or undefined over a gap.
   * @param {number} x
   * @returns {number | undefined}
   */
  groundAt(x) {
    let top = undefined;
    for (const block of this.terrain) {
      if (x >= block.x0 && x <= block.x1 && (top === undefined || block.y > top)) top = block.y;
    }
    return top;
  }

  /**
   * Stars a bridge of this cost earns if every truck crosses: 0 over budget, else 1 to 3.
   * @param {number} cost
   */
  starsFor(cost) {
    if (cost > this.budget) return 0;
    if (cost <= this.stars.three) return 3;
    if (cost <= this.stars.two) return 2;
    return 1;
  }

  /** Vertical line that mirror mode reflects across: the middle of the anchors. */
  get mirrorAxis() {
    const xs = this.anchors.map(a => a.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }

  /** Ground height where the trucks start. */
  get startY() {
    return /** @type {number} */ (this.groundAt(this.startX));
  }

  /**
   * The structure a fresh attempt starts from: the example if there is one, else the bare anchors.
   * @returns {import("./scene.js").SavedStructure}
   */
  initialStructure() {
    if (this.example) return this.example();
    return {
      version: SAVE_FORMAT_VERSION,
      joints: this.anchors.map(({ x, y }) => ({ x, y, fixed: true })),
      links: [],
    };
  }

  /**
   * The trucks for one load test, queued with the first at startX.
   * @returns {Vehicle[]}
   */
  createConvoy() {
    return Array.from({ length: this.vehicleCount }, (_, i) => new Vehicle(this, this.startX - i * this.vehicleSpacing, i));
  }

  /**
   * Scenery in front of the background: water, ground, trees, abutments and the flag.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
    const { water } = this;
    renderValley(ctx, Math.min(...this.terrain.filter(t => water === undefined || t.y >= water).map(t => t.y)) - 0.5);
    if (water !== undefined) renderWater(ctx, water);
    for (const block of this.terrain) renderGround(ctx, block, water !== undefined && block.y < water);
    const xs = this.anchors.map(a => a.x);
    renderTrees(ctx, this, { x0: Math.min(...xs) - 5, x1: Math.max(...xs) + 5 }, water);
    for (const { x, y } of this.anchors) {
      const ground = this.groundAt(x);
      if (ground !== undefined && Math.abs(ground - y) < 0.5) renderAbutment(ctx, x, y);
    }
    renderFlag(ctx, this.finishX, this.groundAt(this.finishX) ?? 0);
  }

  /**
   * The water surface in front of what is in the river; drawn after the structure and trucks.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  renderFront(ctx) {
    if (this.water !== undefined) renderWaterFront(ctx, this, this.water);
  }
}

const FAR = 10000;

/** Two cliffs either side of a gap from x0 to x1. */
const cliffs = (/** @type {number} */ x0, /** @type {number} */ x1, leftY = 10, rightY = 10) => [
  { x0: -FAR, x1: x0, y: leftY },
  { x0: x1, x1: FAR, y: rightY },
];

/** A 40 m creek and two 40 t trucks. A bare deck sags and snaps: it needs holding up. */
export const creekLevel = new Level({
  id: "creek",
  name: "Creek",
  description: "A 40 m gap and two 40 t trucks. A bare road deck won't hold: support it.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  vehicleMass: 40000,
  vehicleCount: 2,
  vehicleSpacing: 20,
  budget: 18000, // a small suspension bridge with light towers and thin hangers: ~$16,400
  stars: { two: 17200, three: 16600 },
  view: { x0: -45, x1: 45, y: 15 },
  water: 4,
});

/**
 * An 80 m canyon crossed by a jam of four 40 t trucks (the usual maximum for a heavy goods
 * vehicle). It starts from the demo suspension bridge, which carries them but costs more
 * than the budget: cheaper designs exist (~$35,300 with lower towers, cable backstays and
 * thin hangers), so the puzzle is to economise.
 */
export const canyonLevel = new Level({
  id: "canyon",
  name: "Canyon",
  description: "80 m and four 40 t trucks. The example bridge works, but costs too much.",
  terrain: cliffs(-40, 40),
  anchors: [{ x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 }],
  startX: -46,
  finishX: 48,
  vehicleMass: 40000,
  vehicleCount: 4,
  vehicleSpacing: 20,
  budget: 38000,
  stars: { two: 36800, three: 35600 },
  view: { x0: -65, x1: 65, y: 15 },
  water: -14,
  example: () => new Scene().serialize(), // the default scene is the demo bridge
});

/** The far side is 8 m higher: the road has to climb. */
export const stepLevel = new Level({
  id: "step",
  name: "Step up",
  description: "A 60 m gap with the far side 8 m higher. Three 40 t trucks.",
  terrain: cliffs(-30, 30, 10, 18),
  anchors: [{ x: -40, y: 10 }, { x: -30, y: 10 }, { x: 30, y: 18 }, { x: 40, y: 18 }],
  startX: -36,
  finishX: 38,
  vehicleMass: 40000,
  vehicleCount: 3,
  vehicleSpacing: 20,
  budget: 37500, // a Pratt truss over the ramp with light verticals: ~$34,600
  stars: { two: 36000, three: 34900 },
  view: { x0: -55, x1: 55, y: 18 },
  water: 3,
});

/** 120 m is a long way; a rock in the river can carry a pier. */
export const pierLevel = new Level({
  id: "pier",
  name: "River pier",
  description: "A 120 m river with a rock in the middle, 16 m below the road. Four 40 t trucks.",
  terrain: [...cliffs(-60, 60), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -70, y: 10 }, { x: -60, y: 10 }, { x: 60, y: 10 }, { x: 70, y: 10 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -66,
  finishX: 68,
  vehicleMass: 40000,
  vehicleCount: 4,
  vehicleSpacing: 20,
  budget: 81000, // two trussed spans on an A-frame pier, light verticals: ~$75,200
  stars: { two: 78000, three: 75800 },
  view: { x0: -85, x1: 85, y: 8 },
  water: -2,
});

/** The first level: a short gap that plain road can span. */
export const brookLevel = new Level({
  id: "brook",
  name: "Brook",
  description: "A 20 m brook and one 20 t truck. Lay a road across: click an anchor, then the other bank.",
  terrain: cliffs(-10, 10),
  anchors: [{ x: -20, y: 10 }, { x: -10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 10 }],
  startX: -16,
  finishX: 18,
  vehicleMass: 20000,
  budget: 6600, // plain road: $6,000
  stars: { two: 6300, three: 6000 },
  view: { x0: -30, x1: 30, y: 12 },
  water: 5,
});

/** Ledges 10 m below the road on both sides: struts from them shorten the span. */
export const ledgesLevel = new Level({
  id: "ledges",
  name: "Ledges",
  description: "A 50 m gorge with rock ledges 10 m below the road. Prop the deck up from them.",
  terrain: [...cliffs(-25, 25), { x0: -25, x1: -20, y: 0 }, { x0: 20, x1: 25, y: 0 }],
  anchors: [
    { x: -35, y: 10 }, { x: -25, y: 10 }, { x: 25, y: 10 }, { x: 35, y: 10 },
    { x: -20, y: 0 }, { x: 20, y: 0 },
  ],
  startX: -31,
  finishX: 33,
  vehicleMass: 40000,
  vehicleCount: 2,
  vehicleSpacing: 20,
  budget: 19500, // a light strut from each ledge: ~$17,500
  stars: { two: 18600, three: 17800 },
  view: { x0: -48, x1: 48, y: 8 },
  water: -6,
});

/** One very heavy truck: members sized for 40 t won't do. */
export const heavyLevel = new Level({
  id: "heavy",
  name: "Heavy load",
  description: "A 40 m dry gully and a single 100 t heavy haulage truck.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  vehicleMass: 100000,
  budget: 24500, // a 3 m truss with light diagonals and verticals: ~$22,300
  stars: { two: 23400, three: 22600 },
  view: { x0: -45, x1: 45, y: 15 },
});

/** The far side is lower, and a long convoy is queued up. */
export const downhillLevel = new Level({
  id: "downhill",
  name: "Downhill",
  description: "A 60 m gap down to a far side 10 m lower. Five 40 t trucks.",
  terrain: cliffs(-30, 30, 18, 8),
  anchors: [{ x: -40, y: 18 }, { x: -30, y: 18 }, { x: 30, y: 8 }, { x: 40, y: 8 }],
  startX: -36,
  finishX: 38,
  vehicleMass: 40000,
  vehicleCount: 5,
  vehicleSpacing: 20,
  budget: 39000, // a truss with cable diagonals: ~$34,700 (4 m) to $36,000 (6 m)
  stars: { two: 37700, three: 36500 },
  view: { x0: -55, x1: 55, y: 16 },
  water: 2,
});

/** 100 m with nothing in between: hang it from towers. */
export const longSpanLevel = new Level({
  id: "long-span",
  name: "Long span",
  description: "100 m across a deep valley, nothing to stand on in between. Two 40 t trucks.",
  terrain: cliffs(-50, 50),
  anchors: [{ x: -60, y: 10 }, { x: -50, y: 10 }, { x: 50, y: 10 }, { x: 60, y: 10 }],
  startX: -56,
  finishX: 58,
  vehicleMass: 40000,
  vehicleCount: 2,
  vehicleSpacing: 20,
  budget: 51500, // a suspension bridge, towers 16 m, sag 10 m: ~$46,400
  stars: { two: 48500, three: 47000 },
  view: { x0: -75, x1: 75, y: 15 },
  water: -18,
});

/** A wide river with two rocks: three spans. */
export const viaductLevel = new Level({
  id: "viaduct",
  name: "Viaduct",
  description: "A 180 m river with two rocks 14 m below the road. Five 40 t trucks.",
  terrain: [...cliffs(-90, 90), { x0: -34, x1: -26, y: -4 }, { x0: 26, x1: 34, y: -4 }],
  anchors: [
    { x: -100, y: 10 }, { x: -90, y: 10 }, { x: 90, y: 10 }, { x: 100, y: 10 },
    { x: -34, y: -4 }, { x: -26, y: -4 }, { x: 26, y: -4 }, { x: 34, y: -4 },
  ],
  startX: -96,
  finishX: 98,
  vehicleMass: 40000,
  vehicleCount: 5,
  vehicleSpacing: 20,
  budget: 126000, // three trussed spans on A-frame piers: ~$114,500
  stars: { two: 120000, three: 116000 },
  view: { x0: -115, x1: 115, y: 6 },
  water: 0,
});

/** Low ledges deep in the gorge: room for an arch under the road. */
export const gorgeLevel = new Level({
  id: "gorge",
  name: "Deep gorge",
  description: "An 80 m gorge with ledges 16 m down. Arch over it from the ledges. Four 40 t trucks.",
  terrain: [...cliffs(-40, 40), { x0: -40, x1: -34, y: -6 }, { x0: 34, x1: 40, y: -6 }],
  anchors: [
    { x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 },
    { x: -34, y: -6 }, { x: 34, y: -6 },
  ],
  startX: -46,
  finishX: 48,
  vehicleMass: 40000,
  vehicleCount: 4,
  vehicleSpacing: 20,
  budget: 47000, // a braced light-steel arch: ~$42,200; trusses cost $49,000+
  stars: { two: 44000, three: 42800 },
  view: { x0: -65, x1: 65, y: 4 },
  water: -20,
});

/** The finale: long, uphill, one rock in the river and a long convoy. */
export const grandLevel = new Level({
  id: "grand",
  name: "Grand crossing",
  description: "160 m, climbing 6 m, with a rock mid-river. Six 40 t trucks.",
  terrain: [...cliffs(-80, 80, 10, 16), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -90, y: 10 }, { x: -80, y: 10 }, { x: 80, y: 16 }, { x: 90, y: 16 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -86,
  finishX: 88,
  vehicleMass: 40000,
  vehicleCount: 6,
  vehicleSpacing: 20,
  budget: 118000, // two 8 m trusses on an A-frame pier: ~$107,100
  stars: { two: 112000, three: 108500 },
  view: { x0: -105, x1: 105, y: 8 },
  water: -2,
});

/** All levels, in play order. */
export const levels = [
  brookLevel, creekLevel, ledgesLevel, canyonLevel, stepLevel, heavyLevel,
  downhillLevel, pierLevel, longSpanLevel, viaductLevel, gorgeLevel, grandLevel,
];
levels.forEach((level, i) => { level.number = i + 1; });

/**
 * @param {string | null | undefined} id
 * @returns {Level | undefined}
 */
export function findLevel(id) {
  return levels.find(level => level.id === id);
}
