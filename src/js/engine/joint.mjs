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
    // a gusset plate with a bolt; anchors get a bigger pin
    const g = ctx.ctx;
    const { x, y } = this.position;
    const r = Math.max(this.fixed ? 0.45 : 0.3, (this.fixed ? 4 : 2.6) * ctx.jointScale / ctx.zoom);
    g.beginPath();
    g.arc(x, y, r, 0, 2 * Math.PI);
    g.fillStyle = this.fixed ? "#23272c" : "#353b42";
    g.fill();
    g.beginPath();
    g.arc(x, y, r * 0.42, 0, 2 * Math.PI);
    g.fillStyle = "#a9b2ba";
    g.fill();
  }

}
