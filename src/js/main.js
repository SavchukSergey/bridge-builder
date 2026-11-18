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

/**
 * Colour for a load fraction: green when relaxed, through amber, to red at the limit.
 * @param {number} fraction
 */
function loadColor(fraction) {
  const hue = 120 * (1 - Math.min(1, Math.max(0, fraction)));
  return `hsl(${hue}, 75%, 50%)`;
}

/**
 * @param {string} name
 */
function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Shows the stress tooltip next to the pointer for the hovered link, or hides it.
 * @param {Record<string, HTMLElement>} el
 * @param {import('./game.js').LinkInfo | undefined} info
 * @param {HTMLCanvasElement} canvas
 */
function updateTooltip(el, info, canvas) {
  if (!info) {
    el.root.hidden = true;
    return;
  }
  el.root.hidden = false;
  el.title.textContent = `${info.label} \u00b7 ${info.length.toFixed(1)} m \u00b7 ${formatMoney(info.cost)}`;
  el.force.textContent = info.state === 'slack' ? 'Slack (cables only pull)'
    : info.state === 'unloaded' ? 'Unloaded'
      : `${capitalize(info.state)}: ${Math.round(info.forceKN).toLocaleString('en-US')} kN`;

  const now = Math.min(1, info.utilization);
  el.meter.style.width = `${now * 100}%`;
  el.meter.style.backgroundColor = loadColor(info.utilization);
  const hasPeak = info.peakUtilization !== undefined;
  el.peak.hidden = !hasPeak;
  if (hasPeak) el.peak.style.left = `calc(${Math.min(1, info.peakUtilization) * 100}% - 1px)`;
  el.load.textContent = `${Math.round(info.utilization * 100)}% of strength`
    + (hasPeak ? ` \u00b7 peak ${Math.round(info.peakUtilization * 100)}%` : '');

  // next to the pointer, flipped to stay on screen
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + info.client.x, y = rect.top + info.client.y;
  const { offsetWidth: w, offsetHeight: h } = el.root;
  el.root.style.left = `${x + 16 + w > window.innerWidth ? x - 16 - w : x + 16}px`;
  el.root.style.top = `${y + 16 + h > window.innerHeight ? y - 16 - h : y + 16}px`;
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
  const tooltip = {
    root: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip')),
    title: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-title')),
    force: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-force')),
    meter: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-meter')),
    peak: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-peak')),
    load: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-load')),
  };
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
  /** @type {HTMLDivElement} */
  const barBudget = document.getElementById('budget-fill');

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
  const game = new Game(canvas);

  // Size the canvas in device pixels, so it is sharp on high-DPI screens. Browser zoom and
  // moving the window to another monitor change the ratio; both fire 'resize'.
  function resizeCanvas() {
    const container = canvas.parentElement;
    if (!container) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(container.clientWidth * ratio);
    canvas.height = Math.round(container.clientHeight * ratio);
    game.ctx.pixelRatio = canvas.width / container.clientWidth || 1;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  const toolbar = /** @type {HTMLElement} */ (document.getElementById('control-panel'));
  const sidePanel = /** @type {HTMLElement} */ (document.getElementById('material-panel'));
  const updateInsets = () => {
    const top = toolbar.offsetHeight;
    // the side panel runs under the toolbar; keep its content below it
    document.documentElement.style.setProperty('--toolbar-height', `${top}px`);
    game.viewInsets = { top, right: sidePanel.offsetWidth };
  };
  // on short windows start with the controls help folded, so the materials stay in view
  const help = /** @type {HTMLDetailsElement} */ (document.getElementById('help'));
  help.open = window.innerHeight >= 860;

  updateInsets();
  game.fitView(); // now that the canvas has its real size
  window.addEventListener('resize', updateInsets);
  // the toolbar wraps onto more rows on narrow windows: refit when its height changes
  let toolbarHeight = toolbar.offsetHeight;
  new ResizeObserver(() => {
    if (toolbar.offsetHeight === toolbarHeight) return;
    toolbarHeight = toolbar.offsetHeight;
    updateInsets();
    game.fitView();
  }).observe(toolbar);

  chkSimulation.checked = false;
  chkSimulation.addEventListener('change', () => {
    game.setSimulationRunning(chkSimulation.checked);
    chkSimulation.blur(); // keep keyboard shortcuts working on the canvas
  });
  btnReset.addEventListener('click', () => {
    game.reset();
    chkSimulation.checked = false;
  });

  btnUndo.addEventListener('click', () => game.undo());
  btnRedo.addEventListener('click', () => game.redo());

  /** @type {HTMLInputElement} */
  const chkStress = document.getElementById('toggle-stress');
  game.showStress = chkStress.checked;
  chkStress.addEventListener('change', () => {
    game.showStress = chkStress.checked;
    chkStress.blur();
  });

  /** @type {HTMLInputElement} */
  const chkMirror = document.getElementById('toggle-mirror');
  game.mirror = chkMirror.checked;
  chkMirror.addEventListener('change', () => {
    game.mirror = chkMirror.checked;
    chkMirror.blur();
  });

  game.snapToGrid = chkSnap.checked;
  chkSnap.addEventListener('change', () => {
    game.snapToGrid = chkSnap.checked;
    chkSnap.blur();
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
    chkMirror.checked = game.mirror; // the M key toggles it too
    btnUndo.disabled = !game.canUndo;
    btnRedo.disabled = !game.canRedo;
    const mode = modeText(game);
    txtMode.innerText = mode.text;
    txtMode.className = mode.kind;
    txtCost.textContent = formatMoney(game.cost);
    txtBudget.textContent = formatMoney(game.level.budget);
    txtLoad.textContent = `${game.level.vehicleCount} × ${game.level.vehicleMass / 1000} t trucks`;
    boxCost.classList.toggle('over', game.overBudget);
    const share = game.cost / game.level.budget;
    barBudget.style.width = `${Math.min(1, share) * 100}%`;
    barBudget.classList.toggle('near', share > 0.85 && !game.overBudget);
    updateTooltip(tooltip, game.hoverInfo, canvas);
    requestAnimationFrame(tick);
  }

  tick();
});