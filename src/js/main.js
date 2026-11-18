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
  /** @type {HTMLButtonElement} */
  const btnUndo = document.getElementById('undo');
  /** @type {HTMLButtonElement} */
  const btnRedo = document.getElementById('redo');
  /** @type {HTMLInputElement} */
  const chkSnap = document.getElementById('toggle-snap');
  /** @type {HTMLButtonElement} */
  const btnNew = document.getElementById('new-structure');
  /** @type {HTMLButtonElement} */
  const btnExport = document.getElementById('export-structure');
  /** @type {HTMLButtonElement} */
  const btnImport = document.getElementById('import-structure');
  /** @type {HTMLInputElement} */
  const fileImport = document.getElementById('import-file');
  /** @type {HTMLDivElement} */
  const txtStatus = document.getElementById('status-message');

  /** @type {number | undefined} */
  let statusTimer;
  /**
   * @param {string} text
   * @param {boolean} [isError]
   */
  function showStatus(text, isError = false) {
    txtStatus.textContent = text;
    txtStatus.classList.toggle('error', isError);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { txtStatus.textContent = ''; }, isError ? 8000 : 3000);
  }

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

  btnUndo.addEventListener('click', () => game.undo());
  btnRedo.addEventListener('click', () => game.redo());

  game.snapToGrid = chkSnap.checked;
  chkSnap.addEventListener('change', () => {
    game.snapToGrid = chkSnap.checked;
  });

  btnNew.addEventListener('click', () => {
    game.loadDefault();
    chkSimulation.checked = false;
    showStatus('Demo bridge loaded (Undo to go back)');
  });

  btnExport.addEventListener('click', () => {
    const json = JSON.stringify(game.exportStructure(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bridge.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  btnImport.addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', async () => {
    const file = fileImport.files?.[0];
    fileImport.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      game.importStructure(JSON.parse(await file.text()));
      chkSimulation.checked = false;
      showStatus(`Loaded ${file.name}`);
    } catch (err) {
      showStatus(`Could not load ${file.name}: ${err instanceof Error ? err.message : err}`, true);
    }
  });

  function tick() {
    game.tick();
    game.render();
    txtTime.innerText = game.evalCtx.time.toFixed(2) + 's';
    btnReset.disabled = game.isBuildMode;
    btnUndo.disabled = !game.canUndo;
    btnRedo.disabled = !game.canRedo;
    txtMode.innerText = game.isBuildMode
      ? 'Build mode'
      : (game.evalCtx.simulation ? 'Simulating' : 'Paused (Reset to edit)');
    requestAnimationFrame(tick);
  }

  tick();
});