
export class Material {
  /**
   * 
   * @param {import("./material.types.mjs").MaterialOpts} opts 
   */
  constructor(opts) {
    this.youngModulus = opts.youngModulus;
    this.compressionStrength = opts.compressionStrength;
    this.tensileStrength = opts.tensileStrength;
    this.density = opts.density;
    this.crossSectionalArea = opts.crossSectionalArea;
    this.name = opts.name;
    this.label = opts.label ?? opts.name;
    this.canCompress = opts.canCompress ?? true;
    this.costPerMeter = opts.costPerMeter;
    this.drivable = opts.drivable ?? false;
    /** @type {import("./material.types.mjs").MaterialLook} */
    this.look = opts.look ?? { kind: "beam", color: "#666", highlight: "#888", width: 0.3, minPx: 2 };
  }
}