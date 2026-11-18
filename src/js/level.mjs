import { SAVE_FORMAT_VERSION, Scene } from "./scene.js";
import { Vehicle } from "./vehicle.mjs";
import { VEHICLE_TYPES } from "./vehicle-types.mjs";
import { THEMES } from "./themes.mjs";
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
 * @property {number} startX - where the first vehicle starts: the centre of a 12 m truck
 *   (so the first vehicle's front is 6 m ahead of it, whatever its length)
 * @property {number} finishX - a 12 m truck has crossed once its centre reaches this x; any
 *   vehicle, once its rear is where that truck's rear is then
 * @property {import("./vehicle-types.mjs").VehicleTypeId[]} convoy - the vehicles, in order
 * @property {number} [vehicleGap] - m between one vehicle's rear and the next one's front
 * @property {number} budget - maximum structure cost: crossing within it earns one star
 * @property {{ two: number, three: number }} stars - cost at or under which a win earns two
 *   and three stars
 * @property {{ x0: number, x1: number, y: number }} view - area to fit on screen
 * @property {number} [water] - height of the river surface in the gap, if there is one
 * @property {import("./themes.mjs").ThemeId} [theme] - scenery look; summer by default
 * @property {() => import("./scene.js").SavedStructure} [example] - starting structure
 *   instead of bare anchors
 */

/**
 * A level: terrain with a gap, anchors to build from, a convoy of trucks that must drive
 * from the start to the flag, and a budget for the structure.
 */
/** The first vehicle's front starts this far ahead of the level's startX. */
const FIRST_FRONT_AHEAD = 6;

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
    this.convoy = opts.convoy;
    this.vehicleGap = opts.vehicleGap ?? 8;
    this.budget = opts.budget;
    this.stars = opts.stars;
    this.view = opts.view;
    this.example = opts.example;
    this.water = opts.water;
    this.theme = THEMES[opts.theme ?? "summer"];
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

  get vehicleCount() {
    return this.convoy.length;
  }

  /** What to call the convoy's vehicles: their kind if all alike ("truck"), else "vehicle". */
  get vehicleNoun() {
    const kinds = new Set(this.convoy);
    if (kinds.size !== 1) return { one: "vehicle", many: "vehicles" };
    const type = VEHICLE_TYPES[this.convoy[0]];
    return { one: type.label, many: type.plural };
  }

  /**
   * The vehicles for one load test, queued nose to tail behind the start. They all drive
   * at the slowest one's speed, so nobody runs into the vehicle ahead.
   * @returns {Vehicle[]}
   */
  createConvoy() {
    const types = this.convoy.map(id => VEHICLE_TYPES[id]);
    const speed = Math.min(...types.map(t => t.speed));
    let front = this.startX + FIRST_FRONT_AHEAD;
    return types.map((type, i) => {
      const vehicle = new Vehicle(this, front - type.length / 2, i, type);
      vehicle.speed = speed;
      front -= type.length + this.vehicleGap;
      return vehicle;
    });
  }

  /**
   * The convoy in words: "2 × 40 t trucks" for one kind of vehicle, else a count of each
   * kind in order, e.g. "1 car · 1 bus".
   */
  get convoySummary() {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const id of this.convoy) counts.set(id, (counts.get(id) ?? 0) + 1);
    const name = (/** @type {import("./vehicle-types.mjs").VehicleType} */ t, /** @type {number} */ n) => n === 1 ? t.label : t.plural;
    if (counts.size === 1) {
      const [[id, n]] = counts;
      const type = VEHICLE_TYPES[/** @type {import("./vehicle-types.mjs").VehicleTypeId} */ (id)];
      return `${n} × ${type.mass / 1000} t ${name(type, n)}`;
    }
    return [...counts].map(([id, n]) => `${n} ${name(VEHICLE_TYPES[/** @type {import("./vehicle-types.mjs").VehicleTypeId} */ (id)], n)}`).join(" · ");
  }

  /**
   * Scenery in front of the background: water, ground, trees, abutments and the flag.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
    const { water } = this;
    const { theme } = this;
    renderValley(ctx, Math.min(...this.terrain.filter(t => water === undefined || t.y >= water).map(t => t.y)) - 0.5, theme);
    if (water !== undefined) renderWater(ctx, water, theme);
    for (const block of this.terrain) renderGround(ctx, block, water !== undefined && block.y < water, theme);
    const xs = this.anchors.map(a => a.x);
    renderTrees(ctx, this, { x0: Math.min(...xs) - 5, x1: Math.max(...xs) + 5 }, water, theme);
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
    if (this.water !== undefined) renderWaterFront(ctx, this, this.water, this.theme);
  }
}

const FAR = 10000;

/** @param {number} n */
const trucks = (n) => /** @type {import("./vehicle-types.mjs").VehicleTypeId[]} */ (Array(n).fill("truck"));

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
  convoy: trucks(2),
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
  theme: "desert",
  name: "Canyon",
  description: "80 m and four 40 t trucks. The example bridge works, but costs too much.",
  terrain: cliffs(-40, 40),
  anchors: [{ x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 }],
  startX: -46,
  finishX: 48,
  convoy: trucks(4),
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
  convoy: trucks(3),
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
  convoy: trucks(4),
  budget: 81000, // two trussed spans on an A-frame pier, light verticals: ~$75,200
  stars: { two: 78000, three: 75800 },
  view: { x0: -85, x1: 85, y: 8 },
  water: -2,
});

/** The first level: a short gap that plain road can span. */
export const brookLevel = new Level({
  id: "brook",
  name: "Brook",
  description: "A 20 m brook, a car and a bus. Lay a road across: click an anchor, then the other bank.",
  terrain: cliffs(-10, 10),
  anchors: [{ x: -20, y: 10 }, { x: -10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 10 }],
  startX: -16,
  finishX: 18,
  convoy: ["car", "bus"],
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
  convoy: trucks(2),
  budget: 19500, // a light strut from each ledge: ~$17,500
  stars: { two: 18600, three: 17800 },
  view: { x0: -48, x1: 48, y: 8 },
  water: -6,
});

/** One very heavy truck: members sized for 40 t won't do. */
export const heavyLevel = new Level({
  id: "heavy",
  theme: "desert",
  name: "Heavy load",
  description: "A 40 m dry gully and one 200 t heavy hauler carrying a transformer.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  convoy: ["hauler"],
  budget: 24500, // a 3 m truss with light diagonals and verticals: ~$22,300; cables stretch too much
  stars: { two: 23400, three: 22600 },
  view: { x0: -45, x1: 45, y: 15 },
});

/** The far side is lower, and a long convoy is queued up. */
export const downhillLevel = new Level({
  id: "downhill",
  theme: "snow",
  name: "Downhill",
  description: "A 60 m gap down to a far side 10 m lower. Five 40 t trucks.",
  terrain: cliffs(-30, 30, 18, 8),
  anchors: [{ x: -40, y: 18 }, { x: -30, y: 18 }, { x: 30, y: 8 }, { x: 40, y: 8 }],
  startX: -36,
  finishX: 38,
  convoy: trucks(5),
  budget: 38000, // a 3 m truss with cable diagonals: ~$34,200
  stars: { two: 36000, three: 34700 },
  view: { x0: -55, x1: 55, y: 16 },
  water: 2,
});

/** Mixed traffic packed close together: the whole span is loaded at once. */
export const rushLevel = new Level({
  id: "rush",
  theme: "night",
  name: "Rush hour",
  description: "A 60 m river and nine vehicles nose to tail: cars, buses and trucks.",
  terrain: cliffs(-30, 30),
  anchors: [{ x: -40, y: 10 }, { x: -30, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 10 }],
  startX: -36,
  finishX: 38,
  convoy: ["car", "truck", "bus", "car", "truck", "car", "bus", "truck", "car"],
  vehicleGap: 4,
  budget: 26000, // a light suspension bridge like the creek's: ~$23,600; trusses cost $33,700+
  stars: { two: 24900, three: 24000 },
  view: { x0: -55, x1: 55, y: 15 },
  water: 3,
});

/** 100 m with nothing in between: hang it from towers. */
export const longSpanLevel = new Level({
  id: "long-span",
  theme: "snow",
  name: "Long span",
  description: "100 m across a deep valley, nothing to stand on in between. Two 40 t trucks.",
  terrain: cliffs(-50, 50),
  anchors: [{ x: -60, y: 10 }, { x: -50, y: 10 }, { x: 50, y: 10 }, { x: 60, y: 10 }],
  startX: -56,
  finishX: 58,
  convoy: trucks(2),
  budget: 51500, // a suspension bridge, towers 16 m, sag 10 m: ~$46,400
  stars: { two: 48500, three: 46500 },
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
  convoy: trucks(5),
  budget: 126000, // three trussed spans on A-frame piers: ~$114,500
  stars: { two: 120000, three: 116000 },
  view: { x0: -115, x1: 115, y: 6 },
  water: 0,
});

/** Low ledges deep in the gorge: room for an arch under the road. */
export const gorgeLevel = new Level({
  id: "gorge",
  theme: "desert",
  name: "Deep gorge",
  description: "An 80 m gorge with ledges 16 m down. Arch over it from the ledges. Four 40 t trucks.",
  terrain: [...cliffs(-40, 40), { x0: -40, x1: -34, y: -6 }, { x0: 34, x1: 40, y: -6 }],
  anchors: [
    { x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 },
    { x: -34, y: -6 }, { x: 34, y: -6 },
  ],
  startX: -46,
  finishX: 48,
  convoy: trucks(4),
  budget: 45000, // a braced light-steel arch on thin hangers: ~$40,700; trusses cost $49,000+
  stars: { two: 43000, three: 41200 },
  view: { x0: -65, x1: 65, y: 4 },
  water: -20,
});

/** The finale: long, uphill, one rock in the river and a long convoy. */
export const grandLevel = new Level({
  id: "grand",
  theme: "snow",
  name: "Grand crossing",
  description: "160 m, climbing 6 m, with a rock mid-river. Six 40 t trucks.",
  terrain: [...cliffs(-80, 80, 10, 16), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -90, y: 10 }, { x: -80, y: 10 }, { x: 80, y: 16 }, { x: 90, y: 16 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -86,
  finishX: 88,
  convoy: trucks(6),
  budget: 118000, // two 7 m trusses on an A-frame pier: ~$105,200
  stars: { two: 110000, three: 106600 },
  view: { x0: -105, x1: 105, y: 8 },
  water: -2,
});

/** All levels, in play order. */
export const levels = [
  brookLevel, creekLevel, ledgesLevel, canyonLevel, stepLevel, heavyLevel,
  downhillLevel, rushLevel, pierLevel, longSpanLevel, viaductLevel, gorgeLevel, grandLevel,
];
levels.forEach((level, i) => { level.number = i + 1; });

/**
 * @param {string | null | undefined} id
 * @returns {Level | undefined}
 */
export function findLevel(id) {
  return levels.find(level => level.id === id);
}
