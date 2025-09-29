import { createVec3F } from "./math.js";

export class Grid {

  /**
   * 
   * @param {import("./render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    const { width, height } = ctx;

    const clientTl = createVec3F(-width / 2, -height / 2, 0);
    const clientBr = createVec3F(width / 2, height / 2, 0);

    const globalTl = ctx.clientToGlobal(clientTl);
    const globalBr = ctx.clientToGlobal(clientBr);

    const globalWidth = globalBr.x - globalTl.x;
    const globalHeight = globalBr.y - globalTl.y;

    const globalSize = Math.min(globalWidth, globalHeight);

    const GRID_FACTOR = 8;

    const majorLogSize = Math.floor(Math.log(globalSize) / Math.log(GRID_FACTOR) - 0);

    const majorSize = Math.pow(GRID_FACTOR, majorLogSize);
    const minorSize = majorSize / GRID_FACTOR;

    /**
     * 
     * @param {number} step
     */
    function renderGrid(step) {
      ctx.lineWidth = step * 0.001;
      const steps = globalSize / step;
      ctx.strokeStyle = `rgba(192, 192, 192, ${Math.min(1, steps / GRID_FACTOR)})`;

      const globalGridTl = floor(globalTl, step);
      const globalGridBr = ceil(globalBr, step);

      for (let globalY = globalGridTl.y; globalY < globalGridBr.y; globalY += step) {
        ctx.beginPath();
        ctx.moveTo(globalGridTl.x, globalY);
        ctx.lineTo(globalGridBr.x, globalY);
        ctx.stroke();
      }

      for (let globalX = globalGridTl.x; globalX < globalGridBr.x; globalX += step) {
        ctx.beginPath();
        ctx.moveTo(globalX, globalGridTl.y);
        ctx.lineTo(globalX, globalGridBr.y);
        ctx.stroke();
      }
    }

    renderGrid(minorSize);
    renderGrid(majorSize);
    renderGrid(majorSize * GRID_FACTOR);
  }
}

/**
 * @param {import("./math.js").Vec3F} vec 
 * @param {number} step
 * @returns {import("./math.js").Vec3F}
 */
function floor(vec, step) {
  return createVec3F(
    Math.floor(vec.x / step) * step,
    Math.floor(vec.y / step) * step,
    Math.floor(vec.z / step) * step,
  )
}

/**
 * @param {import("./math.js").Vec3F} vec 
 * @param {number} step
 * @returns {import("./math.js").Vec3F}
 */
function ceil(vec, step) {
  return createVec3F(
    Math.ceil(vec.x / step) * step,
    Math.ceil(vec.y / step) * step,
    Math.ceil(vec.z / step) * step,
  )
}