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
  const chkSimulation = document.getElementById('toggle-simulation');
  /** @type {HTMLButtonElement} */
  const btnReset = document.getElementById('reset-simulation');
  /** @type {HTMLDivElement} */
  const txtTime = document.getElementById('simulation-time-value');
  /** @type {HTMLDivElement} */
  const txtMode = document.getElementById('mode-label');

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

  chkSimulation.checked = false;
  chkSimulation.addEventListener('change', () => {
    game.setSimulationRunning(chkSimulation.checked);
  });
  btnReset.addEventListener('click', () => {
    game.reset();
    chkSimulation.checked = false;
  });

  function tick() {
    game.tick();
    game.render();
    txtTime.innerText = game.evalCtx.time.toFixed(2) + 's';
    btnReset.disabled = game.isBuildMode;
    txtMode.innerText = game.isBuildMode
      ? 'Build mode'
      : (game.evalCtx.simulation ? 'Simulating' : 'Paused (Reset to edit)');
    requestAnimationFrame(tick);
  }

  tick();
});