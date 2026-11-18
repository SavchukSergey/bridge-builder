import { createVec3F } from "./math.js";

export class RenderCtx {
  /**
   * 
   * @param {CanvasRenderingContext2D} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  width = 0;
  height = 0;
  zoom = 8;
  shift = createVec3F(0, 0, 0);

  #updateTransform() {
    const { zoom, shift, width, height } = this;
    this.ctx.setTransform(zoom, 0, 0, -zoom, width / 2 - shift.x * zoom, height / 2 + shift.y * zoom);
  }

  getTransform() {
    return this.ctx.getTransform();
  }

  getClientToGlobalMatrix() {
    //todo: optimize. Inverse is expensive
    return this.ctx.getTransform().inverse();
  }

  /**
   * 
   * @param {import("./math.js").Vec3F} vec 
   * @returns {import("./math.js").Vec3F} 
   */
  clientToGlobal(vec) {
    const { shift, zoom, width, height } = this;

    return createVec3F(
      (vec.x - width / 2) / zoom + shift.x,
      (height / 2 - vec.y) / zoom + shift.y,
      vec.z / zoom + shift.z,
    );
  }

  /**
   * 
   * @param {import("./math.js").Vec3F} vec 
   * @returns {import("./math.js").Vec3F} 
   */
  globalToClient(vec) {
    const { shift, zoom } = this;

    return createVec3F(
      (vec.x - shift.x) * zoom,
      (vec.y - shift.y) * zoom,
      (vec.z - shift.z) * zoom
    );
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.#updateTransform();
  }

  beginPath() {
    this.ctx.beginPath();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  lineTo(x, y) {
    this.ctx.lineTo(x, y);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  moveTo(x, y) {
    this.ctx.moveTo(x, y);
  }

  stroke() {
    this.ctx.stroke();
  }

  /**
   * @param {string} val
   */
  set strokeStyle(val) {
    this.ctx.strokeStyle = val;
  }

  /**
   * @param {string} val
   */
  set fillStyle(val) {
    this.ctx.fillStyle = val;
  }

  fill() {
    this.ctx.fill();
  }

  closePath() {
    this.ctx.closePath();
  }

  /**
   * @param {number} val
   */
  set lineWidth(val) {
    this.ctx.lineWidth = val;
  }

  /**
   * 
   * @param {number} x 
   * @param {number} y 
   * @param {number} radius 
   */
  circle(x, y, radius) {
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  }
}