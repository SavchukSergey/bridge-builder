/**
 * A test vehicle: a moving load that drives along road links.
 *
 * It isn't a rigid body. Each substep every axle finds the road link under it and pushes
 * that link's two joints down with its share of the weight, split by where along the link
 * it is. Driving, falling and crashing follow the vehicle's centre: if no road is under it,
 * it falls; if it falls far enough, the test is lost.
 */

import { drawHeadlight, VEHICLE_TYPES } from "./vehicle-types.mjs";

/** Seconds to wait before driving: the gravity ramp-up in EvalCtx. */
export const VEHICLE_START_DELAY = 2;
/** Highest step (m) the vehicle can climb onto a road surface above it. */
const STEP_UP = 0.5;
/** Largest drop (m) it follows by staying on the road; a bigger drop means falling. */
const STEP_DOWN = 1;
/** Falling this far (m) loses the test, wherever it ends up. */
const FALL_LIMIT = 20;
/** A truck survives landing after falling at most this far (m). */
export const MAX_SAFE_DROP = 4;

/**
 * @typedef {"waiting" | "driving" | "falling" | "crossed" | "fell"} VehicleState
 */

/**
 * @typedef {Object} RoadContact
 * @property {import("./engine/link.mjs").Link} link
 * @property {number} t - 0 at link.a, 1 at link.b
 * @property {number} y - road height at the vehicle's x
 */

/**
 * @typedef {Object} JointLoad
 * @property {import("./engine/joint.mjs").Joint} joint
 * @property {number} fy - vertical force (N), negative is down
 */

/**
 * A vehicle has crossed once its rear is this far short of the level's finish line: where
 * a 12 m truck's rear is when its centre reaches the line.
 */
const FINISH_REAR_OFFSET = 6;

export class Vehicle {
  /** @type {VehicleState} */
  state = "waiting";
  vy = 0;
  /** Height the current fall started from. */
  fallStartY = 0;
  /**
   * Why the truck was lost: fell into the gap, drove into a cliff face, or landed too hard.
   * @type {"fell" | "crashed" | "hard landing" | undefined}
   */
  lostReason = undefined;
  /** @type {RoadContact | undefined} */
  contact = undefined;

  /**
   * @param {import("./level.mjs").Level} level
   * @param {number} [startX] - centre; defaults to the level's start
   * @param {number} [paint] - picks the paint colour, so vehicles in a convoy look different
   * @param {import("./vehicle-types.mjs").VehicleType} [type]
   */
  constructor(level, startX = level.startX, paint = 0, type = VEHICLE_TYPES.truck) {
    this.level = level;
    this.paint = paint;
    this.type = type;
    this.mass = type.mass;
    /** Drawn size (m), bumper to bumper. */
    this.length = type.length;
    this.height = type.height;
    /** m/s */
    this.speed = type.speed;
    this.x = startX;
    this.y = level.groundAt(startX) ?? 0;
  }

  get finished() {
    return this.state === "crossed" || this.state === "fell";
  }

  /**
   * Forces the vehicle applies to the structure during the next substep: each axle on a
   * road link pushes that link's joints down with its share of the weight. Axles on the
   * banks put theirs on the ground.
   * @param {import("./eval-ctx.mjs").EvalCtx} evalCtx
   * @param {import("./scene.js").Scene} scene
   * @returns {JointLoad[]}
   */
  loads(evalCtx, scene) {
    if (this.state === "falling" || this.finished) return [];
    const weight = this.mass * evalCtx.gravity.y;
    /** @type {JointLoad[]} */
    const out = [];
    for (const { dx, share } of this.type.axles) {
      const x = this.x + dx;
      // the road under this axle, near the height the vehicle is at (allowing for slopes)
      const reach = STEP_UP + Math.abs(dx) * 0.3;
      const road = findRoad(scene, x, this.y + reach, this.type.track);
      if (!road || road.y < this.y - reach - STEP_DOWN) continue;
      const ground = this.level.groundAt(x);
      if (ground !== undefined && ground > road.y + 1e-6) continue; // on the bank
      const { link, t } = road;
      out.push({ joint: link.a, fy: weight * share * (1 - t) }, { joint: link.b, fy: weight * share * t });
    }
    return out;
  }

  /**
   * Moves the vehicle after the structure has been integrated by dt.
   * @param {import("./scene.js").Scene} scene
   * @param {import("./eval-ctx.mjs").EvalCtx} evalCtx
   * @param {number} dt
   */
  update(scene, evalCtx, dt) {
    if (this.state === "crossed") {
      // Drive on along the far side, clearing the flag for the trucks behind.
      this.x += this.speed * dt;
      this.y = this.level.groundAt(this.x) ?? this.y;
      return;
    }
    if (this.finished) return;
    if (this.state === "waiting") {
      if (evalCtx.time < VEHICLE_START_DELAY) return;
      this.state = "driving";
    }

    this.x += this.speed * dt;

    if (this.state === "falling") {
      this.vy += evalCtx.gravity.y * dt;
      const nextY = this.y + this.vy * dt;
      const landing = this.__support(scene, this.y + STEP_UP);
      if (landing && landing.y >= nextY) {
        this.y = landing.y;
        this.vy = 0;
        if (this.fallStartY - landing.y > MAX_SAFE_DROP) {
          this.__lose("hard landing");
        } else {
          this.state = "driving";
          this.contact = landing.road;
        }
      } else {
        this.y = nextY;
        this.contact = undefined;
        if (this.y < this.fallStartY - FALL_LIMIT) this.__lose("fell");
      }
      return;
    }

    const ground = this.level.groundAt(this.x);
    if (ground !== undefined && ground > this.y + STEP_UP) {
      this.__lose("crashed"); // drove into a cliff face
      return;
    }

    const support = this.__support(scene, this.y + STEP_UP);
    if (!support || support.y < this.y - STEP_DOWN) {
      this.state = "falling";
      this.fallStartY = this.y;
      this.vy = 0;
      this.contact = undefined;
      return;
    }
    this.y = support.y;
    this.contact = support.road;

    if (this.x - this.length / 2 >= this.level.finishX - FINISH_REAR_OFFSET) {
      this.contact = undefined;
      this.state = "crossed";
    }
  }

  /**
   * @param {"fell" | "crashed" | "hard landing"} reason
   */
  __lose(reason) {
    this.state = "fell";
    this.lostReason = reason;
    this.contact = undefined;
  }

  /**
   * The highest surface under the truck, road or ground, no higher than maxY.
   * @param {import("./scene.js").Scene} scene
   * @param {number} maxY
   * @returns {{ y: number, road: RoadContact | undefined } | undefined}
   */
  __support(scene, maxY) {
    const road = findRoad(scene, this.x, maxY, this.type.track);
    const ground = this.level.groundAt(this.x);
    const groundOk = ground !== undefined && ground <= maxY;
    if (road && (!groundOk || road.y >= /** @type {number} */ (ground))) return { y: road.y, road };
    if (groundOk) return { y: /** @type {number} */ (ground), road: undefined };
    return undefined;
  }

  /**
   * Draws the vehicle facing right (the way it drives), tilted with the road; it noses down
   * while falling, and its wheels turn as it moves.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   * @param {{ lights?: boolean }} [opts] - lights: headlights on
   */
  render(ctx, opts = {}) {
    const g = ctx.ctx;
    let angle = this.__tilt;
    if (this.contact) {
      const { a, b } = this.contact.link;
      angle = Math.atan2(b.position.y - a.position.y, b.position.x - a.position.x);
      if (Math.abs(angle) > Math.PI / 2) angle += Math.PI; // link drawn right-to-left
    } else if (this.state === "falling") {
      angle = Math.max(-0.8, Math.min(0.3, this.vy * 0.04));
    } else if (this.state !== "fell") {
      angle = 0;
    }
    this.__tilt = angle;

    g.save();
    g.translate(this.x, this.y);
    g.rotate(angle);
    this.type.draw(g, {
      lost: this.state === "fell",
      paint: this.paint,
      spin: -this.x / this.type.wheelRadius,
      lights: opts.lights ?? false,
    });
    g.restore();
  }

  /**
   * The headlight beam, drawn after the night darkening so it lights up the scene. Uses
   * the tilt from the last {@link render}.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  renderLights(ctx) {
    if (this.state === "fell" || this.type.id === "wagon") return;
    const g = ctx.ctx;
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.__tilt);
    g.globalCompositeOperation = "lighter";
    drawHeadlight(g, ...this.type.lamp);
    g.restore();
  }

  /** Last drawn tilt, kept when a vehicle comes to rest after falling. */
  __tilt = 0;
}


/**
 * The highest deck surface of the given kind (road, or rail for trains) under x that is no
 * higher than maxY.
 * @param {import("./scene.js").Scene} scene
 * @param {number} x
 * @param {number} maxY
 * @param {"road" | "rail"} [track]
 * @returns {RoadContact | undefined}
 */
export function findRoad(scene, x, maxY, track = "road") {
  /** @type {RoadContact | undefined} */
  let best = undefined;
  for (const link of scene.links) {
    if (link.broken || link.material.carries !== track) continue;
    const ax = link.a.position.x, bx = link.b.position.x;
    const dx = bx - ax;
    if (Math.abs(dx) < 1e-9) continue; // vertical: nothing to drive on
    const t = (x - ax) / dx;
    if (t < 0 || t > 1) continue;
    const y = link.a.position.y + (link.b.position.y - link.a.position.y) * t;
    if (y <= maxY && (!best || y > best.y)) best = { link, t, y };
  }
  return best;
}
