import { SAVE_FORMAT_VERSION, Scene } from "./scene.js";
import { Vehicle } from "./vehicle.mjs";

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
 * @property {number} budget - maximum structure cost
 * @property {{ x0: number, x1: number, y: number }} view - area to fit on screen
 * @property {() => import("./scene.js").SavedStructure} [example] - starting structure
 *   instead of bare anchors
 */

/**
 * A level: terrain with a gap, anchors to build from, a convoy of trucks that must drive
 * from the start to the flag, and a budget for the structure.
 */
export class Level {
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
    this.view = opts.view;
    this.example = opts.example;
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
    return Array.from({ length: this.vehicleCount }, (_, i) => new Vehicle(this, this.startX - i * this.vehicleSpacing));
  }

  /**
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
    const depth = 10000;
    ctx.fillStyle = "#5b4636";
    for (const { x0, x1, y } of this.terrain) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineTo(x1, y - depth);
      ctx.lineTo(x0, y - depth);
      ctx.closePath();
      ctx.fill();
    }

    // finish flag
    const flagY = this.groundAt(this.finishX) ?? 0;
    ctx.beginPath();
    ctx.moveTo(this.finishX, flagY);
    ctx.lineTo(this.finishX, flagY + 4);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 0.15;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.finishX, flagY + 4);
    ctx.lineTo(this.finishX + 1.6, flagY + 3.4);
    ctx.lineTo(this.finishX, flagY + 2.8);
    ctx.closePath();
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
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
  name: "1. Creek",
  description: "A 40 m gap and two 40 t trucks. A bare road deck won't hold: support it.",
  terrain: cliffs(-20, 20),
  anchors: [{ x: -30, y: 10 }, { x: -20, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }],
  startX: -26,
  finishX: 28,
  vehicleMass: 40000,
  vehicleCount: 2,
  vehicleSpacing: 20,
  budget: 18000, // a small suspension bridge with light towers and thin hangers: ~$16,400
  view: { x0: -45, x1: 45, y: 15 },
});

/**
 * An 80 m canyon crossed by a jam of four 40 t trucks (the usual maximum for a heavy goods
 * vehicle). It starts from the demo suspension bridge, which carries them but costs more
 * than the budget: cheaper designs exist (~$35,300 with lower towers, cable backstays and
 * thin hangers), so the puzzle is to economise.
 */
export const canyonLevel = new Level({
  id: "canyon",
  name: "2. Canyon",
  description: "80 m and four 40 t trucks. The example bridge works, but costs too much.",
  terrain: cliffs(-40, 40),
  anchors: [{ x: -50, y: 10 }, { x: -40, y: 10 }, { x: 40, y: 10 }, { x: 50, y: 10 }],
  startX: -46,
  finishX: 48,
  vehicleMass: 40000,
  vehicleCount: 4,
  vehicleSpacing: 20,
  budget: 38000,
  view: { x0: -65, x1: 65, y: 15 },
  example: () => new Scene().serialize(), // the default scene is the demo bridge
});

/** The far side is 8 m higher: the road has to climb. */
export const stepLevel = new Level({
  id: "step",
  name: "3. Step up",
  description: "A 60 m gap with the far side 8 m higher. Three 40 t trucks.",
  terrain: cliffs(-30, 30, 10, 18),
  anchors: [{ x: -40, y: 10 }, { x: -30, y: 10 }, { x: 30, y: 18 }, { x: 40, y: 18 }],
  startX: -36,
  finishX: 38,
  vehicleMass: 40000,
  vehicleCount: 3,
  vehicleSpacing: 20,
  budget: 37500, // a Pratt truss over the ramp with light verticals: ~$34,600
  view: { x0: -55, x1: 55, y: 18 },
});

/** 120 m is a long way; a rock in the river can carry a pier. */
export const pierLevel = new Level({
  id: "pier",
  name: "4. River pier",
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
  view: { x0: -85, x1: 85, y: 8 },
});

/** All levels, in play order. */
export const levels = [creekLevel, canyonLevel, stepLevel, pierLevel];

/**
 * @param {string | null | undefined} id
 * @returns {Level | undefined}
 */
export function findLevel(id) {
  return levels.find(level => level.id === id);
}
