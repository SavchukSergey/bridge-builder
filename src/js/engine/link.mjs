import { createVec3F, lerpColor, vec3flen, vec3fmul, vec3fsub } from "../math.js";

/** Fraction of critical damping applied along each link. */
export const DAMPING_RATIO = 0.1;

/** Stress view colours (0..1 RGB): relaxed, and at the limit in tension and compression. */
export const STRESS_COLORS = {
  relaxed: { r: 0.86, g: 0.87, b: 0.88 },
  tension: { r: 0.10, g: 0.33, b: 0.72 },
  compression: { r: 0.90, g: 0.38, b: 0.0 },
};

export class Link {

  /**
   * 
   * @param {import("./joint.mjs").Joint} a 
   * @param {import("./joint.mjs").Joint} b 
   * @param {import("../materials/material.mjs").Material} material 
   */
  constructor(a, b, material) {
    this.a = a;
    this.b = b;
    this.material = material;

    const dx = this.b.position.x - this.a.position.x;
    const dy = this.b.position.y - this.a.position.y;
    const dz = this.b.position.z - this.a.position.z;
    this.length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.actualLength = this.length;
    /**
     * Which side of a-to-b the top of a deck is on, as built: 1 to the left (a road laid left
     * to right), -1 to the right. It stays with the piece, so a broken road swinging past
     * upright keeps its surface and rail on the same side instead of flipping over.
     */
    this.side = Math.sign(dx) || 1;

    this.direction = createVec3F(dx, dy, dz);
    this.directionN = vec3fmul(this.direction, 1 / this.length);

    this.broken = false;
    /**
     * How long it wants to be, as a share of {@link length}: 1, except a winch pulled in
     * during a drawbridge's test.
     */
    this.pull = 1;
    /** Highest {@link utilization} reached since the simulation started. */
    this.peakUtilization = 0;
  }

  /** Its new rest shape, after its ends were moved while building. */
  rest() {
    this.length = vec3flen(vec3fsub(this.b.position, this.a.position));
    this.side = Math.sign(this.b.position.x - this.a.position.x) || 1;
    this.preEval();
  }

  preEval() {
    const { a, b } = this;
    this.direction.x = b.position.x - a.position.x;
    this.direction.y = b.position.y - a.position.y;
    this.direction.z = b.position.z - a.position.z;

    const length = vec3flen(this.direction);
    this.actualLength = length;

    this.directionN.x = this.direction.x / length;
    this.directionN.y = this.direction.y / length;
    this.directionN.z = this.direction.z / length;
  }

  /**
   * Width as drawn (m): true to scale when zoomed in, with a minimum size on screen.
   * @param {number} zoom - pixels per metre
   */
  drawnWidth(zoom) {
    const { width, minPx } = this.material.look;
    return Math.max(width, minPx / zoom);
  }

  /**
   * Draws the member as what it is made of. With `stress`, it is coloured by its load instead
   * (green relaxed; towards red in compression, blue in tension); otherwise only members
   * close to breaking glow, amber to red.
   * @param {import("../render-ctx.mjs").RenderCtx} ctx
   * @param {{ stress?: boolean, paint?: { color: string, highlight: string } }} [opts] - paint:
   *   the player's colour for beams
   */
  render(ctx, { stress = false, paint } = {}) {
    const g = ctx.ctx;
    const { a, b } = this;
    const own = this.material.look;
    const look = paint && own.kind === "beam" ? { ...own, ...paint } : own;
    const width = this.drawnWidth(ctx.zoom);
    g.lineCap = "round";

    if (stress) {
      const clr = this.stressColor;
      strokeLine(g, a, b, `rgb(${clr.r * 255}, ${clr.g * 255}, ${clr.b * 255})`, width);
      if (this.stressPressure < 0 && this.utilization > 0.05) {
        // compression also shows as a dashed centre line, so it reads without colour
        g.setLineDash([7 / ctx.zoom, 5 / ctx.zoom]);
        g.lineCap = "butt";
        strokeLine(g, a, b, "rgba(25, 20, 15, 0.7)", Math.max(width * 0.35, 1.5 / ctx.zoom));
        g.setLineDash([]);
        g.lineCap = "round";
      }
      return;
    }

    if (look.kind === "deck") {
      renderDeck(g, a.position, b.position, width, look, ctx.zoom, this.side);
    } else {
      strokeLine(g, a, b, look.color, width);
      if (look.kind === "beam" && look.highlight && width * ctx.zoom >= 3) {
        strokeLine(g, a, b, look.highlight, width * 0.35);
      }
    }

    const warning = (this.utilization - 0.6) / 0.4;
    if (warning > 0) {
      const hue = 45 * (1 - Math.min(1, warning));
      const glow = look.kind === "deck" ? width * 0.6 : width;
      strokeLine(g, a, b, `hsla(${hue}, 100%, 50%, ${0.35 + 0.5 * Math.min(1, warning)})`, glow + 3 / ctx.zoom);
    }
  }

  get volume() {
    return this.crossSectionalArea * this.length;
  }

  get mass() {
    return this.material.density * this.volume;
  }

  get crossSectionalArea() {
    //todo: poissonRatio
    return this.material.crossSectionalArea;
  }

  /** Axial spring stiffness k = E*A/L (N/m). */
  get stiffness() {
    return this.material.youngModulus * this.crossSectionalArea / (this.length * this.pull);
  }

  /**
   * Axial damping c = 2*zeta*sqrt(k*m), using the reduced mass of the two end joints, so
   * every link's own vibration is damped at the same ratio {@link DAMPING_RATIO}
   * regardless of how stiff or heavy it is.
   */
  get dampingCoefficient() {
    const invMassA = this.a.fixed || !this.a.mass ? 0 : 1 / this.a.mass;
    const invMassB = this.b.fixed || !this.b.mass ? 0 : 1 / this.b.mass;
    const invMass = invMassA + invMassB;
    return invMass ? 2 * DAMPING_RATIO * Math.sqrt(this.stiffness / invMass) : 0;
  }

  get strain() {
    const rest = this.length * this.pull;
    return (this.actualLength - rest) / rest;
  }

  /**
   * @returns {number} Negative value if compressed, positive if stretched
   */
  get stressForce() {
    return this.stressPressure * this.crossSectionalArea;
  }

  /**
   * @returns {number} Negative value if compressed, positive if stretched
   */
  get stressPressure() {
    const strain = this.strain;
    if (strain < 0 && !this.material.canCompress) {
      return 0; // slack cable
    }
    return strain * this.material.youngModulus;
  }

  /**
   * Stress view colour: pale grey when relaxed, deepening to blue in tension and orange in
   * compression as the load nears the limit. Blue and orange stay apart for the common
   * kinds of colour blindness (unlike red and green).
   */
  get stressColor() {
    const stressPressure = this.stressPressure;
    if (stressPressure < 0) {
      const rel = Math.min(1, -stressPressure / this.material.compressionStrength);
      return lerpColor(STRESS_COLORS.relaxed, STRESS_COLORS.compression, rel);
    } else {
      const rel = Math.min(1, stressPressure / this.material.tensileStrength);
      return lerpColor(STRESS_COLORS.relaxed, STRESS_COLORS.tension, rel);
    }
  }

  get overStressed() {
    return this.utilization > 1;
  }

  /**
   * Current stress as a fraction of what the material can take in that direction
   * (tensile or compressive strength): 1 means at the breaking point.
   */
  get utilization() {
    const sp = this.stressPressure;
    return sp < 0 ? -sp / this.material.compressionStrength : sp / this.material.tensileStrength;
  }

  get dx() {
    return this.b.position.x - this.a.position.x;
  }

  get dy() {
    return this.b.position.y - this.a.position.y;
  }

  get dz() {
    return this.b.position.z - this.a.position.z;
  }
}


/**
 * @param {CanvasRenderingContext2D} g
 * @param {import("./joint.mjs").Joint} a
 * @param {import("./joint.mjs").Joint} b
 * @param {string} color
 * @param {number} width
 */
function strokeLine(g, a, b, color, width) {
  g.beginPath();
  g.moveTo(a.position.x, a.position.y);
  g.lineTo(b.position.x, b.position.y);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

/**
 * A concrete deck slab hanging below the road line, with the road surface on top and a
 * guard rail above it.
 * @param {CanvasRenderingContext2D} g
 * @param {import("../math.js").Vec3F} a
 * @param {import("../math.js").Vec3F} b
 * @param {number} depth - slab depth (m)
 * @param {import("../materials/material.types.mjs").MaterialLook} look
 * @param {number} zoom
 * @param {number} side - {@link Link.side}
 */
function renderDeck(g, a, b, depth, look, zoom, side) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  // towards the top as built (up, while the deck is in its place)
  const nx = -dy / len * side, ny = dx / len * side;

  const quad = (/** @type {number} */ top, /** @type {number} */ bottom, /** @type {string} */ fill) => {
    g.beginPath();
    g.moveTo(a.x + nx * top, a.y + ny * top);
    g.lineTo(b.x + nx * top, b.y + ny * top);
    g.lineTo(b.x + nx * bottom, b.y + ny * bottom);
    g.lineTo(a.x + nx * bottom, a.y + ny * bottom);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  quad(0, -depth, look.color);
  quad(-depth * 0.85, -depth, "rgba(0, 0, 0, 0.18)"); // shadowed underside
  quad(0, -Math.min(0.2, depth * 0.25), look.surface ?? "#444");

  if (zoom < 3) return;
  if (look.track) {
    // sleepers every 0.8 m and the rail on them
    g.lineCap = "butt";
    g.strokeStyle = "#3a2c20";
    g.lineWidth = Math.max(0.12, 1 / zoom);
    g.beginPath();
    const sleepers = Math.max(1, Math.round(len / 0.8));
    for (let i = 0; i <= sleepers; i++) {
      const t = i / sleepers;
      const x = a.x + dx * t, y = a.y + dy * t;
      g.moveTo(x - dx / len * 0.15, y - dy / len * 0.15);
      g.lineTo(x + dx / len * 0.15 + nx * 0.14, y + dy / len * 0.15 + ny * 0.14);
    }
    g.stroke();
    g.strokeStyle = "#b9c0c7";
    g.lineWidth = Math.max(0.1, 1.5 / zoom);
    g.beginPath();
    g.moveTo(a.x + nx * 0.2, a.y + ny * 0.2);
    g.lineTo(b.x + nx * 0.2, b.y + ny * 0.2);
    g.stroke();
    g.lineCap = "round";
    return;
  }
  // guard rail: posts every ~2 m and a rail 1 m above the road
  const RAIL = 1.0;
  g.strokeStyle = "#c3c7cc";
  g.lineWidth = Math.max(0.06, 1 / zoom);
  g.lineCap = "butt";
  g.beginPath();
  g.moveTo(a.x + nx * RAIL, a.y + ny * RAIL);
  g.lineTo(b.x + nx * RAIL, b.y + ny * RAIL);
  const posts = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const x = a.x + dx * t, y = a.y + dy * t;
    g.moveTo(x, y);
    g.lineTo(x + nx * RAIL, y + ny * RAIL);
  }
  g.stroke();
  g.lineCap = "round";
}
