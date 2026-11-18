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
   * @param {number} opts.vehicleMass - kg
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
    this.budget = opts.budget;
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

/** The level the demo bridge is built for: a 80 m gap between cliffs at y = 10. */
export const demoLevel = new Level({
  name: "Demo gap",
  groundY: 10,
  gapLeftX: -40,
  gapRightX: 40,
  startX: -48,
  finishX: 48,
  vehicleMass: 20000,
  budget: 60000,
});
