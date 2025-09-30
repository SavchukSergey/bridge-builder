import { createVec3F, vec3fadd, vec3flen, vec3fmul, vec3fnorm, vec3fsub } from "./math.js";

export class Grid {

  /**
   * 
   * @param {import("./render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    const { width, height } = ctx;

    const clientTl = createVec3F(-width / 2, -height / 2, 0);
    const clientTr = createVec3F(width / 2, -height / 2, 0);
    const clientBl = createVec3F(-width / 2, height / 2, 0);

    const globalTl = ctx.clientToGlobal(clientTl);
    const globalTr = ctx.clientToGlobal(clientTr);
    const globalBl = ctx.clientToGlobal(clientBl);

    const globalU = vec3fsub(globalTr, globalTl);
    const globalV = vec3fsub(globalBl, globalTl);
    const globalUNorm = vec3fnorm(globalU);
    const globalVNorm = vec3fnorm(globalV);

    const globalWidth = vec3flen(globalU);
    const globalHeight = vec3flen(globalV);

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
      // ctx.strokeStyle = `rgba(192, 192, 192, 1)`;

      const ucnt = Math.ceil(globalWidth / step) + 1;
      const vcnt = Math.ceil(globalHeight / step) + 1;

      const ustep = vec3fmul(globalUNorm, step);
      const vstep = vec3fmul(globalVNorm, step);

      const globalGridTl = floor(globalTl, step);

      let walkerStart = globalGridTl;
      let walkerEnd = vec3fadd(walkerStart, vec3fmul(vstep, vcnt));

      for (let i = 0; i < ucnt; i++) {
        ctx.beginPath();
        ctx.moveTo(walkerStart.x, walkerStart.y);
        ctx.lineTo(walkerEnd.x, walkerEnd.y);
        walkerStart = vec3fadd(walkerStart, ustep);
        walkerEnd = vec3fadd(walkerEnd, ustep);
        ctx.stroke();
      }

      walkerStart = globalGridTl;
      walkerEnd = vec3fadd(walkerStart, vec3fmul(ustep, ucnt));

      for (let i = 0; i < vcnt; i++) {
        ctx.beginPath();
        ctx.moveTo(walkerStart.x, walkerStart.y);
        ctx.lineTo(walkerEnd.x, walkerEnd.y);
        walkerStart = vec3fadd(walkerStart, vstep);
        walkerEnd = vec3fadd(walkerEnd, vstep);
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