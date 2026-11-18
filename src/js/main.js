// Main entry point for the Bridge Builder game
import { Game } from './game.js';
import { levels } from './level.mjs';
import { Sound } from './audio.mjs';

const SOUND_KEY = 'bridge-builder:sound';


/**
 * The element with this id, checked to exist and be of the expected kind.
 * @template {HTMLElement} T
 * @param {string} id
 * @param {{ new(): T, name: string }} type - e.g. HTMLButtonElement
 * @returns {T}
 */
function byId(id, type) {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return el;
}

/**
 * The last child element, e.g. the label span after an icon.
 * @param {Element} el
 * @returns {Element}
 */
function lastChild(el) {
  const child = el.lastElementChild;
  if (!child) throw new Error(`${el.id || el.tagName} has no child element`);
  return child;
}

function getCanvas() {
  return byId('game-canvas', HTMLCanvasElement);
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
  const peak = info.peakUtilization;
  el.peak.hidden = peak === undefined;
  if (peak !== undefined) el.peak.style.left = `calc(${Math.min(1, peak) * 100}% - 1px)`;
  el.load.textContent = `${Math.round(info.utilization * 100)}% of strength`
    + (peak !== undefined ? ` \u00b7 peak ${Math.round(peak * 100)}%` : '');

  // next to the pointer, flipped to stay on screen
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + info.client.x, y = rect.top + info.client.y;
  const { offsetWidth: w, offsetHeight: h } = el.root;
  el.root.style.left = `${x + 16 + w > window.innerWidth ? x - 16 - w : x + 16}px`;
  el.root.style.top = `${y + 16 + h > window.innerHeight ? y - 16 - h : y + 16}px`;
}

/**
 * @param {number} stars - 0 to 3
 */
function starText(stars) {
  return '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
}

document.addEventListener('DOMContentLoaded', function () {
  const canvas = getCanvas();
  const chkSimulation = byId('toggle-simulation', HTMLInputElement);
  const btnReset = byId('reset-simulation', HTMLButtonElement);
  const txtTime = byId('simulation-time-value', HTMLSpanElement);
  const txtMode = byId('mode-label', HTMLDivElement);
  const btnUndo = byId('undo', HTMLButtonElement);
  const btnRedo = byId('redo', HTMLButtonElement);
  const chkSnap = byId('toggle-snap', HTMLInputElement);
  const btnNew = byId('new-structure', HTMLButtonElement);
  const btnExport = byId('export-structure', HTMLButtonElement);
  const btnImport = byId('import-structure', HTMLButtonElement);
  const fileImport = byId('import-file', HTMLInputElement);
  const txtStatus = byId('status-message', HTMLDivElement);
  const selLevel = byId('level-select', HTMLSelectElement);
  const tooltip = {
    root: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip')),
    title: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-title')),
    force: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-force')),
    meter: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-meter')),
    peak: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-peak')),
    load: /** @type {HTMLDivElement} */ (document.getElementById('link-tooltip-load')),
  };
  const txtLevel = byId('level-description', HTMLDivElement);
  const boxCost = byId('cost', HTMLElement);
  const txtCost = byId('cost-value', HTMLSpanElement);
  const txtBudget = byId('budget-value', HTMLSpanElement);
  const txtLoad = byId('load-value', HTMLSpanElement);
  const barBudget = byId('budget-fill', HTMLDivElement);
  const goals = {
    two: /** @type {HTMLElement} */ (document.getElementById('goal-two')),
    three: /** @type {HTMLElement} */ (document.getElementById('goal-three')),
    best: /** @type {HTMLElement} */ (document.getElementById('best')),
  };
  const dlg = {
    root: /** @type {HTMLElement} */ (document.getElementById('result')),
    stars: [...document.querySelectorAll('#result-stars .big-star')],
    title: /** @type {HTMLElement} */ (document.getElementById('result-title')),
    text: /** @type {HTMLElement} */ (document.getElementById('result-text')),
    cost: /** @type {HTMLElement} */ (document.getElementById('result-cost')),
    budget: /** @type {HTMLElement} */ (document.getElementById('result-budget')),
    best: /** @type {HTMLElement} */ (document.getElementById('result-best')),
    hint: /** @type {HTMLElement} */ (document.getElementById('result-hint')),
    retry: /** @type {HTMLButtonElement} */ (document.getElementById('result-retry')),
    next: /** @type {HTMLButtonElement} */ (document.getElementById('result-next')),
    close: /** @type {HTMLButtonElement} */ (document.getElementById('result-close')),
  };

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

  const chkStress = byId('toggle-stress', HTMLInputElement);
  game.showStress = chkStress.checked;
  chkStress.addEventListener('change', () => {
    game.showStress = chkStress.checked;
    chkStress.blur();
  });

  const chkMirror = byId('toggle-mirror', HTMLInputElement);
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
      const best = game.bestResult(level.id);
      option.textContent = level.name + (best ? `  ${starText(best.stars)}` : game.isCompleted(level.id) ? ' \u2713' : '');
      return option;
    }));
    selLevel.value = game.level.id;
    txtLevel.textContent = game.level.description;

    const { stars } = game.level;
    lastChild(goals.two).textContent = `\u2264 ${formatMoney(stars.two)}`;
    lastChild(goals.three).textContent = `\u2264 ${formatMoney(stars.three)}`;
    const best = game.bestResult();
    goals.best.textContent = best ? `Best ${formatMoney(best.cost)}  ${starText(best.stars)}` : '';
  }

  /** @param {import('./game.js').TestResult} result */
  function showResult(result) {
    dlg.root.className = result.kind;
    dlg.stars.forEach((star, i) => star.classList.toggle('earned', i < result.stars));
    const over = result.cost - result.budget;
    if (result.kind === 'success') {
      dlg.title.textContent = ['', 'Bridge holds!', 'Great bridge!', 'Perfect bridge!'][result.stars];
      dlg.text.textContent = `All ${game.level.vehicleCount} trucks crossed.`;
    } else if (result.kind === 'over-budget') {
      dlg.title.textContent = 'Over budget';
      dlg.text.textContent = `All trucks crossed, but the bridge costs ${formatMoney(over)} more than the budget.`;
    } else {
      dlg.title.textContent = 'Bridge failed';
      const how = { fell: 'A truck fell into the gap.', crashed: 'A truck crashed into the cliff.', 'hard landing': 'A truck landed too hard.' };
      const broke = result.broken ? ` ${result.broken} member${result.broken === 1 ? '' : 's'} broke.` : '';
      dlg.text.textContent = (how[result.reason ?? 'fell'] ?? how.fell) + broke;
    }
    dlg.cost.textContent = formatMoney(result.cost);
    dlg.budget.textContent = formatMoney(result.budget);
    dlg.best.replaceChildren(result.best ? `${formatMoney(result.best.cost)} ${starText(result.best.stars)}` : '\u2014');
    if (result.newBest && result.previousBest) {
      const badge = document.createElement('span');
      badge.className = 'new-best';
      badge.textContent = 'New best';
      dlg.best.append(badge);
    }

    // what the next star needs
    const { goals: g } = result;
    dlg.hint.textContent = result.kind !== 'success' ? ''
      : result.stars === 1 ? `\u2605\u2605 at ${formatMoney(g.two)} or less: trim ${formatMoney(result.cost - g.two)}.`
        : result.stars === 2 ? `\u2605\u2605\u2605 at ${formatMoney(g.three)} or less: trim ${formatMoney(result.cost - g.three)}.`
          : 'As cheap as it gets. Or is it?';

    lastChild(dlg.retry).textContent = result.kind === 'success' ? (result.stars < 3 ? 'Make it cheaper' : 'Rebuild')
      : result.kind === 'over-budget' ? 'Make it cheaper' : 'Try again';
    dlg.retry.classList.toggle('primary', result.kind !== 'success' || !result.nextLevel);
    dlg.next.hidden = result.kind !== 'success' || !result.nextLevel;
    dlg.root.hidden = false;
    (dlg.next.hidden ? dlg.retry : dlg.next).focus();
  }

  function hideResult() {
    dlg.root.hidden = true;
  }

  // ---- sound
  const sound = new Sound();
  const chkSound = byId('toggle-sound', HTMLInputElement);
  try {
    chkSound.checked = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch { /* storage blocked: default on */ }
  sound.setMuted(!chkSound.checked);
  chkSound.addEventListener('change', () => {
    sound.setMuted(!chkSound.checked);
    try { localStorage.setItem(SOUND_KEY, chkSound.checked ? 'on' : 'off'); } catch { /* ignore */ }
    chkSound.blur();
  });
  // audio may only start from a user gesture
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  /** Plays what happened since the last frame, and keeps the engines and creaks going. */
  function updateSound() {
    for (const ev of game.drainEvents()) {
      if (ev.type === 'break') sound.snap(ev.kind, ev.size);
      else if (ev.type === 'splash') sound.splash(ev.size);
      else if (ev.type === 'thud') sound.thud(ev.size);
      else if (ev.type === 'crossed') sound.horn();
    }
    const running = game.evalCtx.simulation;
    sound.engines(running ? game.vehicles.filter(v => v.state === 'driving').length : 0);
    if (running) {
      let load = 0;
      for (const link of game.scene.links) if (!link.broken) load = Math.max(load, Math.min(1, link.utilization));
      sound.creak(load);
    }
    const water = game.level.water !== undefined ? 1 : 0;
    if (water !== lastWater) {
      sound.setWater(water);
      lastWater = water;
    }
  }
  /** @type {number | undefined} */
  let lastWater;

  game.onResult = (result) => {
    showResult(result);
    sound.jingle(result.kind === 'success');
  };
  dlg.close.addEventListener('click', hideResult);
  dlg.retry.addEventListener('click', () => {
    hideResult();
    game.reset();
    chkSimulation.checked = false;
  });
  dlg.next.addEventListener('click', () => {
    hideResult();
    const next = game.result?.nextLevel;
    if (next) game.selectLevel(next);
    chkSimulation.checked = false;
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !dlg.root.hidden) hideResult();
  });
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
    if (!game.result && !dlg.root.hidden) hideResult();
    boxCost.classList.toggle('over', game.overBudget);
    goals.two.classList.toggle('met', !game.overBudget && game.cost <= game.level.stars.two);
    goals.three.classList.toggle('met', !game.overBudget && game.cost <= game.level.stars.three);
    const share = game.cost / game.level.budget;
    barBudget.style.width = `${Math.min(1, share) * 100}%`;
    barBudget.classList.toggle('near', share > 0.85 && !game.overBudget);
    updateTooltip(tooltip, game.hoverInfo, canvas);
    updateSound();
    requestAnimationFrame(tick);
  }

  tick();
});