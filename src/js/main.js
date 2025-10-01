// Main entry point for the Bridge Builder game
import { Game } from './game.js';

// @ts-check

/**
 * @returns {HTMLCanvasElement}
 */
function getCanvas() {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById('game-canvas');

  if (!canvas) {
    throw new Error("canvas is not found");
  }

  return canvas;
}

document.addEventListener('DOMContentLoaded', function () {
  const canvas = getCanvas();
  /** @type {HTMLInputElement} */
  const chkSimulation = document.getElementById('toggle-simluation');
  /** @type {HTMLDivElement} */
  const txtTime = document.getElementById('simulation-time-value');

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
    game.evalCtx.simulation = chkSimulation.checked;
    game.tick();
    game.render();
    txtTime.innerText = game.evalCtx.time.toFixed(2) + 's';
    requestAnimationFrame(tick);
  }

  tick();
});