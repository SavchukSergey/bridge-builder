
import { t } from "../i18n.mjs";

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
    /** English; {@link label} is in the player's language. */
    this.__label = opts.label ?? opts.name;
    this.canCompress = opts.canCompress ?? true;
    this.costPerMeter = opts.costPerMeter;
    /** What drives on it, if it is a deck. */
    this.carries = opts.carries;
    /** Something drives on it. */
    this.drivable = opts.carries !== undefined;
    /** @type {import("./material.types.mjs").MaterialLook} */
    this.look = opts.look ?? { kind: "beam", color: "#666", highlight: "#888", width: 0.3, minPx: 2 };
  }

  /** The name shown to the player. */
  get label() {
    return t(`material.${this.name}`, {}, this.__label);
  }
}