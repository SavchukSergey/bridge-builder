import { createVec3F } from "../math.js";

export class Joint {

  velocity = createVec3F(0, 0, 0);
  force = createVec3F(0, 0, 0);
  mass = 0;

  /**
   * 
   * @param {import("../math.js").Vec3F} initialPosition 
   * @param {boolean} [fixed]
   */
  constructor(initialPosition, fixed) {
    this.position = initialPosition;
    this.fixed = fixed ?? false;
  }

  /**
   * 
   * @param {import("../render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    ctx.beginPath();
    ctx.circle(this.position.x, this.position.y, 0.2);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 0.2;
    ctx.stroke();
  }

}
