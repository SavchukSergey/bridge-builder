// The drawbridge: before the traffic, a tall-masted boat sails through a canal, and the space
// it needs must be clear. Winches (a material) pull themselves in to lift a road hung from
// them out of the boat's way, then let it back down for the traffic.

/**
 * @typedef {Object} DrawbridgeSpec
 * @property {number} x0 - left edge of the space the boat needs (m)
 * @property {number} x1 - right edge
 * @property {number} top - height its mast reaches; the bottom is the water
 * @property {[number, number]} lift - when the winches pull in (s from the start of the test)
 * @property {[number, number]} pass - when the boat sails through
 * @property {[number, number]} lower - when the winches let out again
 * @property {number} pull - how short a winch gets, as a share of its built length
 */

/** 0 to 1 over [t0, t1], eased at both ends. @param {number} t @param {[number, number]} span */
const ease = (t, [t0, t1]) => {
  const s = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return s * s * (3 - 2 * s);
};

/**
 * A winch's length as a share of its built length at time t: pulled in for the boat, then
 * let back out.
 * @param {DrawbridgeSpec} spec @param {number} t
 */
export function winchPull(spec, t) {
  const pulledIn = ease(t, spec.lift) - ease(t, spec.lower);
  return 1 - (1 - spec.pull) * pulledIn;
}

/** When the traffic may set off: once the road is back down. @param {DrawbridgeSpec} spec */
export const trafficStart = (spec) => spec.lower[1] + 1;

/**
 * Whether the segment a-b passes through the rectangle.
 * @param {{x: number, y: number}} a @param {{x: number, y: number}} b
 * @param {{x0: number, x1: number, y0: number, y1: number}} r
 */
export function segmentHitsBox(a, b, r) {
  // Liang-Barsky clipping: the part of the segment inside the box is not empty
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** The boat that sails through the canal before the traffic. */
export class Boat {
  /** @type {"waiting" | "sailing" | "through" | "hit"} */
  state = "waiting";
  /** When it hit the bridge, for the drawing. */
  hitTime = 0;

  /** @param {DrawbridgeSpec} spec @param {number} water - the water's height */
  constructor(spec, water) {
    this.spec = spec;
    this.water = water;
  }

  /** The space the boat needs while it sails through. */
  get box() {
    const { x0, x1, top } = this.spec;
    return { x0, x1, y0: this.water, y1: top };
  }

  /**
   * After each physics step: sails through on time, and stops if the bridge is in the way.
   * @param {import("./scene.js").Scene} scene @param {number} time
   */
  update(scene, time) {
    if (this.state === "hit" || this.state === "through") return;
    const [start, end] = this.spec.pass;
    if (time < start) return;
    if (time >= end) {
      this.state = "through";
      return;
    }
    this.state = "sailing";
    const box = this.box;
    if (scene.links.some(l => !l.broken && segmentHitsBox(l.a.position, l.b.position, box))) {
      this.state = "hit";
      this.hitTime = time;
    }
  }

  /**
   * Draws it in the canal: waiting a little way off, coming through (nearer, so bigger),
   * gone once through; stopped and tipped if it hit.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx @param {number} time
   */
  render(ctx, time) {
    if (this.state === "through") return;
    const [start, end] = this.spec.pass;
    const t = this.state === "hit" ? this.hitTime : time;
    const k = Math.min(1, Math.max(0, (t - start) / (end - start)));
    drawBoat(ctx.ctx, this.spec, this.water, {
      scale: 0.72 + 0.4 * k,
      alpha: this.state === "waiting" ? 0.75 : k > 0.85 ? (1 - k) / 0.15 : 1,
      tilt: this.state === "hit" ? 0.12 : Math.sin(time * 1.7) * 0.025,
      bob: Math.sin(time * 2.1) * 0.12,
    });
  }
}

/**
 * The boat: a hull on the water and a mast that reaches the top of the space it needs (at
 * full size).
 * @param {CanvasRenderingContext2D} g
 * @param {DrawbridgeSpec} spec @param {number} water
 * @param {{ scale: number, alpha: number, tilt: number, bob: number }} look
 */
function drawBoat(g, spec, water, { scale, alpha, tilt, bob }) {
  const cx = (spec.x0 + spec.x1) / 2;
  const width = (spec.x1 - spec.x0) * 0.72;
  const mast = spec.top - water - 0.3;
  g.save();
  g.globalAlpha *= Math.max(0, alpha);
  g.translate(cx, water + bob);
  g.scale(scale, scale);
  g.rotate(tilt);
  const w = width / 2;
  // sail
  g.fillStyle = "#f4f1e8";
  g.beginPath();
  g.moveTo(0.3, 2.2);
  g.lineTo(0.3, mast - 0.4);
  g.lineTo(w * 0.85, 2.4);
  g.closePath();
  g.fill();
  g.fillStyle = "#e2654b";
  g.beginPath();
  g.moveTo(-0.3, mast * 0.45);
  g.lineTo(-0.3, mast - 1.2);
  g.lineTo(-w * 0.6, mast * 0.45);
  g.closePath();
  g.fill();
  // mast and flag
  g.strokeStyle = "#5b4630";
  g.lineWidth = 0.35;
  g.beginPath();
  g.moveTo(0, 0.5);
  g.lineTo(0, mast);
  g.stroke();
  g.fillStyle = "#f2b233";
  g.fillRect(0, mast - 0.9, 1.4, 0.8);
  // hull
  g.fillStyle = "#2f5d8a";
  g.beginPath();
  g.moveTo(-w, 2);
  g.lineTo(w, 2);
  g.lineTo(w * 0.8, -0.6);
  g.lineTo(-w * 0.75, -0.6);
  g.closePath();
  g.fill();
  g.fillStyle = "#f4f1e8";
  g.fillRect(-w * 0.9, 1.3, w * 1.8, 0.35);
  g.restore();
}

/**
 * The space the boat needs, dashed, so the player can see what to keep clear.
 * @param {import("./render-ctx.mjs").RenderCtx} ctx @param {DrawbridgeSpec} spec @param {number} water
 */
export function renderClearance(ctx, spec, water) {
  const g = ctx.ctx;
  g.save();
  g.setLineDash([6 / ctx.zoom, 5 / ctx.zoom]);
  g.strokeStyle = "rgba(242, 178, 51, 0.85)";
  g.fillStyle = "rgba(242, 178, 51, 0.08)";
  g.lineWidth = 2 / ctx.zoom;
  g.beginPath();
  g.rect(spec.x0, water, spec.x1 - spec.x0, spec.top - water);
  g.fill();
  g.stroke();
  g.restore();
}
