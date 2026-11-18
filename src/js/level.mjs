import { Vehicle } from "./vehicle.mjs";

/**
 * A level: two cliffs separated by a gap, a vehicle that must drive from one side to the
 * other, and a budget for the structure.
 */
export class Level {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {number} opts.groundY - height of both cliff tops
   * @param {number} opts.gapLeftX - right edge of the left cliff
   * @param {number} opts.gapRightX - left edge of the right cliff
   * @param {number} opts.startX - where the vehicle starts (on the left cliff)
   * @param {number} opts.finishX - the vehicle has crossed once it reaches this x
   * @param {number} opts.vehicleMass - kg, per truck
   * @param {number} [opts.vehicleCount] - trucks in the convoy
   * @param {number} [opts.vehicleSpacing] - m between the fronts of consecutive trucks
   * @param {number} opts.budget - maximum structure cost
   */
  constructor(opts) {
    this.name = opts.name;
    this.groundY = opts.groundY;
    this.gapLeftX = opts.gapLeftX;
    this.gapRightX = opts.gapRightX;
    this.startX = opts.startX;
    this.finishX = opts.finishX;
    this.vehicleMass = opts.vehicleMass;
    this.vehicleCount = opts.vehicleCount ?? 1;
    this.vehicleSpacing = opts.vehicleSpacing ?? 10;
    this.budget = opts.budget;
  }

  /**
   * The trucks for one load test, queued on the left cliff with the first at startX.
   * @returns {Vehicle[]}
   */
  createConvoy() {
    return Array.from({ length: this.vehicleCount }, (_, i) => new Vehicle(this, this.startX - i * this.vehicleSpacing));
  }

  /**
   * Whether solid ground (rather than the gap) is under x.
   * @param {number} x
   */
  isGround(x) {
    return x <= this.gapLeftX || x >= this.gapRightX;
  }

  /**
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  render(ctx) {
    const far = 10000;
    const { groundY, gapLeftX, gapRightX } = this;
    ctx.fillStyle = "#5b4636";
    for (const [x0, x1] of [[gapLeftX - far, gapLeftX], [gapRightX, gapRightX + far]]) {
      ctx.beginPath();
      ctx.moveTo(x0, groundY);
      ctx.lineTo(x1, groundY);
      ctx.lineTo(x1, groundY - far);
      ctx.lineTo(x0, groundY - far);
      ctx.closePath();
      ctx.fill();
    }

    // finish flag
    ctx.beginPath();
    ctx.moveTo(this.finishX, groundY);
    ctx.lineTo(this.finishX, groundY + 4);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 0.15;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.finishX, groundY + 4);
    ctx.lineTo(this.finishX + 1.6, groundY + 3.4);
    ctx.lineTo(this.finishX, groundY + 2.8);
    ctx.closePath();
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
  }
}

/**
 * An 80 m gap between cliffs at y = 10, crossed by a jam of four 40 t trucks (the usual
 * maximum for a heavy goods vehicle). The demo bridge carries them, but costs more than
 * the budget: cheaper designs exist (around $40,500), so the puzzle is to economise.
 */
export const demoLevel = new Level({
  name: "Demo gap",
  groundY: 10,
  gapLeftX: -40,
  gapRightX: 40,
  startX: -46,
  finishX: 48,
  vehicleMass: 40000,
  vehicleCount: 4,
  vehicleSpacing: 20,
  budget: 44000,
});
