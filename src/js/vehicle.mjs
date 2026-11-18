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
   * @param {number} [paint] - picks the cab colour, so trucks in a convoy look different
   */
  constructor(level, startX = level.startX, paint = 0) {
    this.level = level;
    this.paint = paint;
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
   * A semi-trailer truck: tractor unit on the right (it drives to the right), box trailer
   * behind. It tilts with the road, noses down while falling, and its wheels turn as it moves.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
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
    const lost = this.state === "fell";
    const cab = lost ? "#5e5e5e" : CAB_COLORS[this.paint % CAB_COLORS.length];

    /** @param {[number, number][]} pts @param {string} fill */
    const poly = (pts, fill) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    const half = this.length / 2;
    const top = this.height;

    // chassis
    poly([[-half + 0.2, 0.75], [half - 0.1, 0.75], [half - 0.1, 1.15], [-half + 0.2, 1.15]], "#26282b");

    // trailer box with panel seams and a stripe
    const t0 = -half, t1 = half - 2.9;
    poly([[t0, 1.2], [t1, 1.2], [t1, top], [t0, top]], lost ? "#8a8a8a" : "#eceeef");
    g.strokeStyle = "rgba(0, 0, 0, 0.12)";
    g.lineWidth = 0.05;
    g.beginPath();
    for (let x = t0 + 1.2; x < t1 - 0.2; x += 1.2) {
      g.moveTo(x, 1.25);
      g.lineTo(x, top - 0.05);
    }
    g.stroke();
    poly([[t0, 1.65], [t1, 1.65], [t1, 1.95], [t0, 1.95]], cab);
    poly([[t0, top - 0.12], [t1, top - 0.12], [t1, top], [t0, top]], "rgba(0, 0, 0, 0.15)");

    // tractor: cab with a sloped front, window, bumper, headlight and fuel tank
    const c0 = half - 2.7;
    poly([[c0, 1.0], [half, 1.0], [half, 2.3], [half - 0.3, 3.25], [c0, 3.3]], cab);
    poly([[c0, 3.3], [half - 1.6, 3.3], [half - 1.9, 3.75], [c0, 3.75]], cab); // roof fairing
    poly([[half - 1.15, 2.25], [half - 0.12, 2.25], [half - 0.36, 3.05], [half - 1.15, 3.05]], lost ? "#3d4247" : "#a9cde2");
    poly([[c0 + 0.25, 1.35], [half - 1.4, 1.35], [half - 1.4, 3.0], [c0 + 0.25, 3.0]], "rgba(0, 0, 0, 0.12)"); // door
    poly([[half - 0.15, 0.85], [half + 0.12, 0.85], [half + 0.12, 1.35], [half - 0.15, 1.35]], "#9aa0a6");
    poly([[half - 0.05, 1.5], [half + 0.06, 1.5], [half + 0.06, 1.72], [half - 0.05, 1.72]], lost ? "#777" : "#ffe08a");
    poly([[c0 + 0.2, 0.8], [c0 + 1.3, 0.8], [c0 + 1.3, 1.25], [c0 + 0.2, 1.25]], "#c3c8cc");

    // wheels: steer axle, two drive axles under the fifth wheel, two trailer axles
    const R = 0.5;
    const spin = -this.x / R;
    for (const x of [half - 1.2, c0 - 0.2, c0 - 1.25, -half + 2.4, -half + 1.3]) {
      g.beginPath();
      g.arc(x, R, R, 0, 2 * Math.PI);
      g.fillStyle = "#1b1c1e";
      g.fill();
      g.beginPath();
      g.arc(x, R, R * 0.48, 0, 2 * Math.PI);
      g.fillStyle = "#8e959c";
      g.fill();
      g.strokeStyle = "#4b5056";
      g.lineWidth = 0.06;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = spin + k * Math.PI / 3;
        g.moveTo(x + Math.cos(a) * R * 0.45, R + Math.sin(a) * R * 0.45);
        g.lineTo(x - Math.cos(a) * R * 0.45, R - Math.sin(a) * R * 0.45);
      }
      g.stroke();
    }
    g.restore();
  }

  /** Last drawn tilt, kept when a truck comes to rest after falling. */
  __tilt = 0;
}

/** Cab paint colours, one per truck in a convoy. */
const CAB_COLORS = ["#c0392b", "#1f6fb2", "#e08e0b", "#1e8449", "#7d3c98"];

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
