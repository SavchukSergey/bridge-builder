import { createVec3F } from "./math.js";

export class RenderCtx {
  /**
   * 
   * @param {CanvasRenderingContext2D} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /** Size in CSS pixels; the canvas itself has {@link pixelRatio} times as many. */
  width = 0;
  height = 0;
  /** CSS pixels per metre. */
  zoom = 8;
  /**
   * Device pixels per CSS pixel (window.devicePixelRatio): drawing at the screen's real
   * resolution keeps lines sharp on high-DPI displays. Everything else, including pointer
   * positions, stays in CSS pixels.
   */
  pixelRatio = 1;
  /** How much bigger dots are drawn than usual, e.g. on a touch screen where a finger has to find them. */
  jointScale = 1;
  shift = createVec3F(0, 0, 0);

  #updateTransform() {
    const { zoom, shift, width, height, pixelRatio: r } = this;
    this.ctx.setTransform(zoom * r, 0, 0, -zoom * r, (width / 2 - shift.x * zoom) * r, (height / 2 + shift.y * zoom) * r);
  }

  /** Switches drawing to screen space: CSS pixels from the top left. */
  screenSpace() {
    const r = this.pixelRatio;
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
  }

  getTransform() {
    return this.ctx.getTransform();
  }

  /**
   * A client-to-world mapping frozen at the current view, for dragging: it keeps mapping
   * with the view the drag started from while the view itself moves.
   * @returns {{ transformPoint(p: import("./math.js").Vec3F): import("./math.js").Vec3F }}
   */
  getClientToGlobalMatrix() {
    const frozen = new RenderCtx(this.ctx);
    Object.assign(frozen, { width: this.width, height: this.height, zoom: this.zoom, shift: { ...this.shift } });
    return { transformPoint: (p) => frozen.clientToGlobal(p) };
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
   * The inverse of {@link clientToGlobal}: where a world point is on the canvas.
   * @param {import("./math.js").Vec3F} vec
   * @returns {import("./math.js").Vec3F}
   */
  globalToClient(vec) {
    const { shift, zoom, width, height } = this;
    return createVec3F((vec.x - shift.x) * zoom + width / 2, height / 2 - (vec.y - shift.y) * zoom, 0);
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
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