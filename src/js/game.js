import { RenderCtx } from "./render-ctx.js";
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
    this.ctx.clear(this.canvas.width, this.canvas.height);
    this.scene.render(this.ctx);
  }

  tick() {
    for (let i = 0; i < 50; i++) {
      this.scene.tick();
    }
  }
}