import { SAVE_FORMAT_VERSION, Scene } from "./scene.js";
import { Vehicle } from "./vehicle.mjs";
import { VEHICLE_TYPES } from "./vehicle-types.mjs";
import { THEMES } from "./themes.mjs";
import { findSandboxLevel } from "./sandbox.mjs";
import { t } from "./i18n.mjs";
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
 * @property {string | (() => string)} description - English (translations are in locales/), or
 *   a function that writes it in the current language
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
 * @property {import("./sandbox.mjs").SandboxSpec} [sandbox] - a level the player designed
 *   (sandbox.mjs): always open, and not part of the progression
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
    this.__name = opts.name;
    this.__description = opts.description;
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
    this.sandbox = opts.sandbox;
  }

  /** The level's name, in the player's language. */
  get name() {
    return this.sandbox ? t("sandbox.name") : t(`level.${this.id}.name`, {}, this.__name);
  }

  /** What the level asks for, in the player's language. */
  get description() {
    const d = this.__description;
    return typeof d === "function" ? d() : t(`level.${this.id}.description`, {}, d);
  }

  /** What the convoy needs to drive on: road, or rail for a train. */
  get track() {
    return VEHICLE_TYPES[this.convoy[0]].track;
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
    if (this.track === "rail") return { one: t("vehicle.train"), many: t("vehicle.train") };
    const kinds = new Set(this.convoy);
    if (kinds.size !== 1) return { one: t("vehicle.any"), many: t("vehicle.any.many") };
    const id = this.convoy[0];
    return { one: t(`vehicle.${id}`), many: t(`vehicle.${id}.many`) };
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
    if (this.track === "rail") {
      const tonnes = this.convoy.reduce((sum, id) => sum + VEHICLE_TYPES[id].mass, 0) / 1000;
      return t("convoy.train", { n: this.convoy.length - 1, tonnes });
    }
    /** @type {Map<import("./vehicle-types.mjs").VehicleTypeId, number>} */
    const counts = new Map();
    for (const id of this.convoy) counts.set(id, (counts.get(id) ?? 0) + 1);
    const vehicles = (/** @type {string} */ id, /** @type {number} */ n) => t(`vehicle.${id}.count`, { n });
    if (counts.size === 1) {
      const [[id, n]] = counts;
      return t("convoy.same", { n, tonnes: VEHICLE_TYPES[id].mass / 1000, vehicles: vehicles(id, n) });
    }
    return [...counts].map(([id, n]) => t("convoy.item", { n, vehicles: vehicles(id, n) })).join(" · ");
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

/** A locomotive pulling `wagons` loaded wagons. */
const train = (/** @type {number} */ wagons) => /** @type {import("./vehicle-types.mjs").VehicleTypeId[]} */ (
  ["locomotive", ...Array(wagons).fill("wagon")]);

/** Two cliffs either side of a gap from x0 to x1. */
const cliffs = (/** @type {number} */ x0, /** @type {number} */ x1, leftY = 10, rightY = 10) => [
  { x0: -FAR, x1: x0, y: leftY },
  { x0: x1, x1: FAR, y: rightY },
];

/** A 40 m creek and two 40 t trucks. A bare deck sags and snaps: it needs holding up. */
export const creekLevel = new Level({
  id: "creek",
  name: "Creek",
  description: "A wider gap and two big trucks. Build a post on each side, then hang the road from them, like on Hanging road.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  convoy: trucks(2),
  budget: 23500, // a small suspension bridge with light towers and thin hangers: ~$16,400
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
  description: "A huge canyon and four trucks. The bridge is already built and it works, but it costs too much. Make it cheaper!",
  terrain: cliffs(-40, 40),
  anchors: [{ x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 }],
  startX: -46,
  finishX: 48,
  convoy: trucks(4),
  budget: 44000,
  stars: { two: 36800, three: 35600 },
  view: { x0: -65, x1: 65, y: 15 },
  water: -14,
  example: () => new Scene().serialize(), // the default scene is the demo bridge
});

/** The far side is 8 m higher: the road has to climb. */
export const stepLevel = new Level({
  id: "step",
  name: "Step up",
  description: "The other side is higher, so the road has to climb. Hold it up with triangles. Three trucks.",
  terrain: cliffs(-30, 30, 10, 18),
  anchors: [{ x: -40, y: 10 }, { x: -30, y: 10 }, { x: 30, y: 18 }, { x: 40, y: 18 }],
  startX: -36,
  finishX: 38,
  convoy: trucks(3),
  budget: 49500, // a Pratt truss over the ramp with light verticals: ~$34,600
  stars: { two: 36000, three: 34900 },
  view: { x0: -55, x1: 55, y: 18 },
  water: 3,
});

/** 120 m is a long way; a rock in the river can carry a pier. */
export const pierLevel = new Level({
  id: "pier",
  name: "River pier",
  description: "A wide river with a rock in the middle. Build on the rock to hold up the middle. Four trucks.",
  terrain: [...cliffs(-60, 60), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -70, y: 10 }, { x: -60, y: 10 }, { x: 60, y: 10 }, { x: 70, y: 10 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -66,
  finishX: 68,
  convoy: trucks(4),
  budget: 107000, // two trussed spans on an A-frame pier, light verticals: ~$75,200
  stars: { two: 78000, three: 75800 },
  view: { x0: -85, x1: 85, y: 8 },
  water: -2,
});

/** The first level: a short gap that plain road can span. */
export const brookLevel = new Level({
  id: "brook",
  name: "Brook",
  description: "A little brook, a car and a bus. Build a road across: click an anchor, then the one on the other side.",
  terrain: cliffs(-10, 10),
  anchors: [{ x: -20, y: 10 }, { x: -10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 10 }],
  startX: -16,
  finishX: 18,
  convoy: ["car", "bus"],
  budget: 8600, // plain road: $6,000
  stars: { two: 6300, three: 6000 },
  view: { x0: -30, x1: 30, y: 12 },
  water: 5,
});

/**
 * Teaches triangles: a 30 m gap a plain road would hold for a truck, but not for the 200 t
 * hauler. A row of light steel triangles on top holds it if they are tall enough (5 m or
 * more; 4 m ones break), and full steel ones hold at any height.
 */
export const trianglesLevel = new Level({
  id: "triangles",
  name: "Triangles",
  description: "A giant 200 t truck! A plain road will break. Build triangles on top of the road: tall ones are stronger.",
  terrain: cliffs(-15, 15),
  anchors: [{ x: -25, y: 10 }, { x: -15, y: 10 }, { x: 15, y: 10 }, { x: 25, y: 10 }],
  startX: -21,
  finishX: 23,
  convoy: ["hauler"],
  budget: 21000, // light steel triangles 6 m tall: ~$13,700; full steel ones 3 m tall: ~$20,000
  stars: { two: 16000, three: 14000 },
  view: { x0: -35, x1: 35, y: 14 },
  water: 4,
});

/**
 * Teaches hanging the road from above: the posts are already up, with their backstays, and a
 * plain 50 m road breaks under two trucks. Cables from the post tops down to the road (a fan,
 * ~$20,000 in thin cable) or a sagging main cable with hangers both hold.
 */
export const hangLevel = new Level({
  id: "hang",
  name: "Hanging road",
  description: "The posts are already up. Build a road across, then hang it from them: a cable from the top of a post down to each dot of the road.",
  terrain: cliffs(-25, 25),
  anchors: [{ x: -35, y: 10 }, { x: -25, y: 10 }, { x: 25, y: 10 }, { x: 35, y: 10 }],
  startX: -31,
  finishX: 33,
  convoy: trucks(2),
  budget: 28000, // a fan of thin cables: ~$20,000; of full cables: ~$23,700
  stars: { two: 23000, three: 20500 },
  view: { x0: -45, x1: 45, y: 16 },
  water: 4,
  example: () => ({
    version: SAVE_FORMAT_VERSION,
    joints: [
      { x: -35, y: 10, fixed: true }, { x: -25, y: 10, fixed: true }, { x: 25, y: 10, fixed: true }, { x: 35, y: 10, fixed: true },
      { x: -25, y: 20 }, { x: 25, y: 20 },
    ],
    links: [
      { a: 1, b: 4, material: "steel-light" }, { a: 2, b: 5, material: "steel-light" },
      { a: 0, b: 4, material: "cable" }, { a: 3, b: 5, material: "cable" },
    ],
  }),
});

/** Ledges 10 m below the road on both sides: struts from them shorten the span. */
export const ledgesLevel = new Level({
  id: "ledges",
  name: "Ledges",
  description: "Rocks stick out below the road. Put a light steel piece from each rock up to the road, to hold it from below.",
  terrain: [...cliffs(-25, 25), { x0: -25, x1: -20, y: 0 }, { x0: 20, x1: 25, y: 0 }],
  anchors: [
    { x: -35, y: 10 }, { x: -25, y: 10 }, { x: 25, y: 10 }, { x: 35, y: 10 },
    { x: -20, y: 0 }, { x: 20, y: 0 },
  ],
  startX: -31,
  finishX: 33,
  convoy: trucks(2),
  budget: 25000, // a light strut from each ledge: ~$17,500
  stars: { two: 18600, three: 17800 },
  view: { x0: -48, x1: 48, y: 8 },
  water: -6,
});

/** One very heavy truck: members sized for 40 t won't do. */
export const heavyLevel = new Level({
  id: "heavy",
  theme: "desert",
  name: "Heavy load",
  description: "A dry gully and one giant 200 t truck carrying a huge machine.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  convoy: ["hauler"],
  budget: 32000, // a 3 m truss with light diagonals and verticals: ~$22,300; cables stretch too much
  stars: { two: 23400, three: 22600 },
  view: { x0: -45, x1: 45, y: 15 },
});

/** The far side is lower, and a long convoy is queued up. */
export const downhillLevel = new Level({
  id: "downhill",
  theme: "snow",
  name: "Downhill",
  description: "The other side is lower, so the road goes downhill. Five trucks.",
  terrain: cliffs(-30, 30, 18, 8),
  anchors: [{ x: -40, y: 18 }, { x: -30, y: 18 }, { x: 30, y: 8 }, { x: 40, y: 8 }],
  startX: -36,
  finishX: 38,
  convoy: trucks(5),
  budget: 49000, // a 3 m truss with cable diagonals: ~$34,200
  stars: { two: 36000, three: 34700 },
  view: { x0: -55, x1: 55, y: 16 },
  water: 2,
});

/** Mixed traffic packed close together: the whole span is loaded at once. */
export const rushLevel = new Level({
  id: "rush",
  theme: "night",
  name: "Rush hour",
  description: "A river and nine cars, buses and trucks, one right after another.",
  terrain: cliffs(-30, 30),
  anchors: [{ x: -40, y: 10 }, { x: -30, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 10 }],
  startX: -36,
  finishX: 38,
  convoy: ["car", "truck", "bus", "car", "truck", "car", "bus", "truck", "car"],
  vehicleGap: 4,
  budget: 34000, // a light suspension bridge like the creek's: ~$23,600; trusses cost $33,700+
  stars: { two: 24900, three: 24000 },
  view: { x0: -55, x1: 55, y: 15 },
  water: 3,
});

/** 100 m with nothing in between: hang it from towers. */
export const longSpanLevel = new Level({
  id: "long-span",
  theme: "snow",
  name: "Long span",
  description: "A very long gap, with nothing to build on in the middle. Two trucks.",
  terrain: cliffs(-50, 50),
  anchors: [{ x: -60, y: 10 }, { x: -50, y: 10 }, { x: 50, y: 10 }, { x: 60, y: 10 }],
  startX: -56,
  finishX: 58,
  convoy: trucks(2),
  budget: 66000, // a suspension bridge, towers 16 m, sag 10 m: ~$46,400
  stars: { two: 48500, three: 46500 },
  view: { x0: -75, x1: 75, y: 15 },
  water: -18,
});

/** A wide river with two rocks: three spans. */
export const viaductLevel = new Level({
  id: "viaduct",
  name: "Viaduct",
  description: "A very wide river with two rocks in it. Build on both. Five trucks.",
  terrain: [...cliffs(-90, 90), { x0: -34, x1: -26, y: -4 }, { x0: 26, x1: 34, y: -4 }],
  anchors: [
    { x: -100, y: 10 }, { x: -90, y: 10 }, { x: 90, y: 10 }, { x: 100, y: 10 },
    { x: -34, y: -4 }, { x: -26, y: -4 }, { x: 26, y: -4 }, { x: 34, y: -4 },
  ],
  startX: -96,
  finishX: 98,
  convoy: trucks(5),
  budget: 164000, // three trussed spans on A-frame piers: ~$114,500
  stars: { two: 120000, three: 116000 },
  view: { x0: -115, x1: 115, y: 6 },
  water: 0,
});

/** Low ledges deep in the gorge: room for an arch under the road. */
export const gorgeLevel = new Level({
  id: "gorge",
  theme: "desert",
  name: "Deep gorge",
  description: "A deep gorge. Build an arch from the rocks at the bottom up to the road. Four trucks.",
  terrain: [...cliffs(-40, 40), { x0: -40, x1: -34, y: -6 }, { x0: 34, x1: 40, y: -6 }],
  anchors: [
    { x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 },
    { x: -34, y: -6 }, { x: 34, y: -6 },
  ],
  startX: -46,
  finishX: 48,
  convoy: trucks(4),
  budget: 58000, // a braced light-steel arch on thin hangers: ~$40,700; trusses cost $49,000+
  stars: { two: 43000, three: 41200 },
  view: { x0: -65, x1: 65, y: 4 },
  water: -20,
});

/** The finale: long, uphill, one rock in the river and a long convoy. */
export const grandLevel = new Level({
  id: "grand",
  theme: "snow",
  name: "Grand crossing",
  description: "The longest crossing: it climbs, and there is a rock in the river. Six trucks.",
  terrain: [...cliffs(-80, 80, 10, 16), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -90, y: 10 }, { x: -80, y: 10 }, { x: 80, y: 16 }, { x: 90, y: 16 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -86,
  finishX: 88,
  convoy: trucks(6),
  budget: 150000, // two 7 m trusses on an A-frame pier: ~$105,200
  stars: { two: 110000, three: 106600 },
  view: { x0: -105, x1: 105, y: 8 },
  water: -2,
});

/** All levels, in play order. */
/** The first railway: trains are long and heavy, and run only on rail. */
export const branchLineLevel = new Level({
  id: "branch-line",
  name: "Branch line",
  description: "Here comes the train! Trains run only on Rail, so build the road out of Rail.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  convoy: train(2),
  vehicleGap: 1,
  budget: 29000, // a light suspension bridge, as at the creek: ~$20,400
  stars: { two: 22000, three: 21000 },
  view: { x0: -45, x1: 45, y: 12 },
  water: -2,
});

/** The whole train is on the bridge at once. */
export const freightLevel = new Level({
  id: "freight",
  theme: "desert",
  name: "Freight",
  description: "A long, heavy goods train, almost as long as the bridge.",
  terrain: cliffs(-40, 40),
  anchors: [{ x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 }],
  startX: -46,
  finishX: 48,
  convoy: train(4),
  vehicleGap: 1,
  budget: 81000, // a 6 m truss with light diagonals: ~$56,500 (cables stretch too much)
  stars: { two: 60000, three: 57500 },
  view: { x0: -65, x1: 65, y: 15 },
  water: -14,
});

/** A long freight over a wide valley, with a rock for a pier. */
export const mountainLevel = new Level({
  id: "mountain",
  theme: "snow",
  name: "Mountain railway",
  description: "A valley with a rock in the middle, and the heaviest train of all.",
  terrain: [...cliffs(-60, 60), { x0: -4, x1: 4, y: -6 }],
  anchors: [
    { x: -70, y: 10 }, { x: -60, y: 10 }, { x: 60, y: 10 }, { x: 70, y: 10 },
    { x: -4, y: -6 }, { x: 4, y: -6 },
  ],
  startX: -66,
  finishX: 68,
  convoy: train(6),
  vehicleGap: 1,
  budget: 126000, // two 4 m trusses on an A-frame pier: ~$88,000
  stars: { two: 94000, three: 89500 },
  view: { x0: -85, x1: 85, y: 10 },
  water: -12,
});

export const levels = [
  brookLevel, trianglesLevel, ledgesLevel, hangLevel, creekLevel, canyonLevel, stepLevel, heavyLevel,
  downhillLevel, rushLevel, pierLevel, longSpanLevel, viaductLevel, gorgeLevel, grandLevel,
  branchLineLevel, freightLevel, mountainLevel,
];
levels.forEach((level, i) => { level.number = i + 1; });

/**
 * A level by id: one of {@link levels}, or a sandbox level (whose id describes it).
 * @param {string | null | undefined} id
 * @returns {Level | undefined}
 */
export function findLevel(id) {
  return levels.find(level => level.id === id) ?? findSandboxLevel(id);
}
