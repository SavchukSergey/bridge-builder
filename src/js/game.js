import { RenderCtx } from "./render-ctx.mjs";
import { Scene } from "./scene.js";

// @ts-check

export class Game {

  /**
   * 
   * @param {HTMLCanvasElement} canvas 
   */
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Could not create 2d context");
    }
    this.ctx = new RenderCtx(ctx);
    this.scene = new Scene();
  }

  render() {
    // this.ctx.zoom = 40 * Math.sin(new Date().valueOf() / 2e3) + 45;

    this.ctx.width = this.canvas.width;
    this.ctx.height = this.canvas.height;
    this.ctx.clear();
    this.scene.render(this.ctx);
  }

  tick() {
    for (let i = 0; i < 50; i++) {
      this.scene.tick();
    }
  }
}