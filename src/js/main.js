// Main entry point for the Bridge Builder game
import { Game } from './game.js';
import { levels } from './level.mjs';

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

/**
 * @param {number} value
 */
function formatMoney(value) {
  return '$' + Math.round(value).toLocaleString('en-US');
}

/**
 * Status line: build/simulation mode and the load test outcome.
 * @param {Game} game
 * @returns {{ text: string, kind: '' | 'success' | 'failure' }}
 */
function modeText(game) {
  const paused = game.evalCtx.simulation ? '' : ' (paused)';
  switch (game.testState) {
    case 'building':
      return { text: 'Build mode', kind: '' };
    case 'waiting':
      return { text: 'Loading the bridge...' + paused, kind: '' };
    case 'driving':
      return { text: 'Trucks crossing...' + paused, kind: '' };
    case 'falling':
      return { text: 'A truck is falling!' + paused, kind: 'failure' };
    case 'crossed':
      return game.overBudget
        ? { text: 'All trucks crossed, but over budget. Reset and make it cheaper.', kind: 'failure' }
        : { text: 'Success! All trucks crossed.', kind: 'success' };
    case 'fell':
      return { text: 'A truck fell. Reset and try again.', kind: 'failure' };
  }
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
  /** @type {HTMLSelectElement} */
  const selLevel = document.getElementById('level-select');
  /** @type {HTMLDivElement} */
  const txtLevel = document.getElementById('level-description');
  /** @type {HTMLDivElement} */
  const boxCost = document.getElementById('cost');
  /** @type {HTMLSpanElement} */
  const txtCost = document.getElementById('cost-value');
  /** @type {HTMLSpanElement} */
  const txtBudget = document.getElementById('budget-value');
  /** @type {HTMLSpanElement} */
  const txtLoad = document.getElementById('load-value');

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
  const updateInsets = () => {
    game.viewInsets = {
      top: document.getElementById('control-panel')?.offsetHeight ?? 0,
      right: document.getElementById('material-panel')?.offsetWidth ?? 0,
    };
  };
  updateInsets();
  game.fitView(); // now that the canvas has its real size
  window.addEventListener('resize', updateInsets);

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
    game.restartLevel();
    chkSimulation.checked = false;
    showStatus('Level restarted (Undo to go back)');
  });

  function refreshLevels() {
    selLevel.replaceChildren(...levels.map(level => {
      const option = document.createElement('option');
      option.value = level.id;
      option.textContent = level.name + (game.isCompleted(level.id) ? ' \u2713' : '');
      return option;
    }));
    selLevel.value = game.level.id;
    txtLevel.textContent = game.level.description;
  }
  game.onChange = refreshLevels;
  refreshLevels();

  selLevel.addEventListener('change', () => {
    game.selectLevel(selLevel.value);
    chkSimulation.checked = false;
    selLevel.blur(); // keep keyboard shortcuts working on the canvas
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

  /** @type {number | undefined} */
  let lastFrame;

  /**
   * @param {DOMHighResTimeStamp} [now]
   */
  function tick(now = performance.now()) {
    const elapsed = lastFrame === undefined ? 0 : (now - lastFrame) / 1000;
    lastFrame = now;
    game.tick(elapsed);
    game.render();
    txtTime.innerText = game.evalCtx.time.toFixed(2) + 's';
    btnReset.disabled = game.isBuildMode;
    btnUndo.disabled = !game.canUndo;
    btnRedo.disabled = !game.canRedo;
    const mode = modeText(game);
    txtMode.innerText = mode.text;
    txtMode.className = mode.kind;
    txtCost.textContent = formatMoney(game.cost);
    txtBudget.textContent = formatMoney(game.level.budget);
    txtLoad.textContent = `${game.level.vehicleCount} × ${game.level.vehicleMass / 1000} t trucks`;
    boxCost.classList.toggle('over', game.overBudget);
    requestAnimationFrame(tick);
  }

  tick();
});