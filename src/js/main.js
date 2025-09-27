// Main entry point for the Bridge Builder game
import { Game } from './game.js';

/**
 * @returns {HTMLCanvasElement}
 */
function getCanvas() {
  /** @type {HTMLCanvasElement | null} */
  const canvas = /** @type {HTMLCanvasElement | null} */document.getElementById('game-canvas');

  if (!canvas) {
    throw new Error("canvas is not found");
  }

  return canvas;
}

document.addEventListener('DOMContentLoaded', function () {
  const canvas = getCanvas();

  // Initialize canvas dimensions
  function resizeCanvas() {
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const game = new Game(canvas);
  
  function tick() {
    game.tick();
    game.render();
    requestAnimationFrame(tick);
  }

  tick();
});