import { createVec3F, lerpColor, vec3flen, vec3fmul } from "../math.js";

/** Fraction of critical damping applied along each link. */
export const DAMPING_RATIO = 0.1;

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

    this.direction = createVec3F(dx, dy, dz);
    this.directionN = vec3fmul(this.direction, 1 / this.length);

    this.broken = false;
    /** Highest {@link utilization} reached since the simulation started. */
    this.peakUtilization = 0;
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
   * 
   * @param {import("../render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    ctx.beginPath();
    ctx.moveTo(this.a.position.x, this.a.position.y);
    ctx.lineTo(this.b.position.x, this.b.position.y);
    const clr = this.stressColor;
    ctx.strokeStyle = `rgb(${clr.r * 255}, ${clr.g * 255}, ${clr.b * 255})`;
    ctx.lineWidth = Math.sqrt(this.material.crossSectionalArea);
    ctx.stroke();
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
    return this.material.youngModulus * this.crossSectionalArea / this.length;
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
    return (this.actualLength - this.length) / this.length;
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

  get stressColor() {
    const stressPressure = this.stressPressure;
    if (stressPressure < 0) {
      const rel = -stressPressure / this.material.compressionStrength;
      return lerpColor({ r: 0, g: 1, b: 0 }, { r: 1, g: 0, b: 0 }, rel);
    } else {
      const rel = stressPressure / this.material.tensileStrength;
      return lerpColor({ r: 0, g: 1, b: 0 }, { r: 0, g: 0, b: 1 }, rel);
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

