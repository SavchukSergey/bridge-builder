export class RenderCtx {
  /**
   * 
   * @param {CanvasRenderingContext2D} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  #updateTransform() {
    this.ctx.setTransform(8, 0, 0, -8, 800, 600);
  }

  /**
   * @param {number} w
   * @param {number} h
  */
  clear(w, h) {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
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
   * 
   * @param {number} x 
   * @param {number} y 
   * @param {number} radius 
   */
  circle(x, y, radius) {
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  }
}