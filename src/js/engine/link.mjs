import { lerpColor } from "../math.js";

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

    const dx = this.a.position.x - this.b.position.x;
    const dy = this.a.position.y - this.b.position.y;
    const dz = this.a.position.z - this.b.position.z;
    this.length = Math.sqrt(dx * dx + dy * dy + dz * dz);
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

  get mass() {
    return this.material.density * this.crossSectionalArea * this.length;
  }

  get actualLength() {
    const dx = this.dx;
    const dy = this.dy;
    const dz = this.dz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  get crossSectionalArea() {
    //todo: poissonRatio
    return this.material.crossSectionalArea;
  }

  get strain() {
    return (this.actualLength - this.length) / this.length;
  }

  /**
   * @returns {number} Negative value if compressed, positive if stretched
   */
  get stressForce() {
    return this.strain * this.material.youngModulus * this.crossSectionalArea;
  }

  /**
   * @returns {number} Negative value if compressed, positive if stretched
   */
  get stressPressure() {
    return this.strain * this.material.youngModulus;
    // return this.stressForce / this.crossSectionalArea;
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

