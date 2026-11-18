
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
    this.canCompress = opts.canCompress ?? true;
    this.costPerMeter = opts.costPerMeter;
    this.drivable = opts.drivable ?? false;
  }
}