/**
 * The test vehicle: a moving point load that drives along road links.
 *
 * It isn't a rigid body. Each substep it finds the road link under it and pushes that
 * link's two joints down with its weight, split by where along the link it is. If no
 * road is under it, it falls; if it falls far enough, the test is lost.
 */

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

export class Vehicle {
  /** Drawn size (m); the vehicle acts on the structure as a single point load. */
  length = 12;
  height = 3.5;
  /** m/s */
  speed = 5;
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
   * @param {number} [startX] - defaults to the level's start; convoys queue up behind it
   */
  constructor(level, startX = level.startX) {
    this.level = level;
    this.mass = level.vehicleMass;
    this.x = startX;
    this.y = level.groundAt(startX) ?? 0;
  }

  get finished() {
    return this.state === "crossed" || this.state === "fell";
  }

  /**
   * Forces the vehicle applies to the structure during the next substep.
   * @param {import("./eval-ctx.mjs").EvalCtx} evalCtx
   * @returns {JointLoad[]}
   */
  loads(evalCtx) {
    if (!this.contact || this.contact.link.broken) return [];
    const weight = this.mass * evalCtx.gravity.y;
    const { link, t } = this.contact;
    return [
      { joint: link.a, fy: weight * (1 - t) },
      { joint: link.b, fy: weight * t },
    ];
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

    if (this.x >= this.level.finishX) {
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
    const road = findRoad(scene, this.x, maxY);
    const ground = this.level.groundAt(this.x);
    const groundOk = ground !== undefined && ground <= maxY;
    if (road && (!groundOk || road.y >= /** @type {number} */ (ground))) return { y: road.y, road };
    if (groundOk) return { y: /** @type {number} */ (ground), road: undefined };
    return undefined;
  }

  /**
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
    // Tilt with the road it is on.
    let angle = 0;
    if (this.contact) {
      const { a, b } = this.contact.link;
      angle = Math.atan2(b.position.y - a.position.y, b.position.x - a.position.x);
      if (Math.abs(angle) > Math.PI / 2) angle += Math.PI; // link drawn right-to-left
    }
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const point = (/** @type {number} */ dx, /** @type {number} */ dy) =>
      [this.x + dx * cos - dy * sin, this.y + dx * sin + dy * cos];

    const half = this.length / 2;
    const corners = [point(-half, 0.3), point(half, 0.3), point(half, this.height), point(-half, this.height)];
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (const [x, y] of corners.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = this.state === "fell" ? "#7f8c8d" : "#f1c40f";
    ctx.fill();

    ctx.fillStyle = "#222";
    for (const dx of [-half * 0.6, half * 0.6]) {
      const [x, y] = point(dx, 0.3);
      ctx.beginPath();
      ctx.circle(x, y, 0.35);
      ctx.fill();
    }
  }
}

/**
 * The highest drivable road surface under x that is no higher than maxY.
 * @param {import("./scene.js").Scene} scene
 * @param {number} x
 * @param {number} maxY
 * @returns {RoadContact | undefined}
 */
export function findRoad(scene, x, maxY) {
  /** @type {RoadContact | undefined} */
  let best = undefined;
  for (const link of scene.links) {
    if (link.broken || !link.material.drivable) continue;
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
