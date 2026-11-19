// Main entry point for the Bridge Builder game
import { Game, SPEEDS } from './game.js';
import { findLevel, levels } from './level.mjs';
import { bridgeInHash, bridgeUrl, decodeBridge } from './share.mjs';
import { Sound } from './audio.mjs';
import { renderLevelPreview } from './level-preview.mjs';
import { SANDBOX_DEFAULT, SANDBOX_LIMITS, SANDBOX_TRAFFIC, normalizeSandbox, parseSandboxId, sandboxId } from './sandbox.mjs';
import { challengesFor } from './challenges.mjs';
import { failureTip, levelHint } from './hints.mjs';

const SOUND_KEY = 'bridge-builder:sound';
const TUTORIAL_KEY = 'bridge-builder:tutorial';
/** The last sandbox designed (its level id), to start the next one from. */
const SANDBOX_KEY = 'bridge-builder:sandbox';
const SPEED_KEY = 'bridge-builder:speed';
const FOLLOW_KEY = 'bridge-builder:follow';
const VOLUME_KEY = 'bridge-builder:volume';
const SHAKE_KEY = 'bridge-builder:shake';


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
  if (game.replay?.seeking) return { text: 'Rewinding to just before it broke...', kind: '' };
  const paused = (game.evalCtx.simulation ? '' : ' (paused)') + (game.replay ? ' \u00b7 replay' : '');
  const { one, many } = game.level.vehicleNoun;
  const train = game.level.track === 'rail';
  const a = train ? 'The train' : `A ${one}`;
  const all = train ? 'The train' : `All ${many}`;
  switch (game.testState) {
    case 'building': {
      const sel = game.selectionInfo;
      if (!sel) return { text: 'Build mode', kind: '' };
      const parts = [];
      if (sel.links) parts.push(`${sel.links} member${sel.links === 1 ? '' : 's'}`);
      if (sel.joints) parts.push(`${sel.joints} joint${sel.joints === 1 ? '' : 's'}`);
      return { text: `${parts.join(', ')} selected: drag to move, Del deletes, Ctrl+C copies`, kind: '' };
    }
    case 'waiting':
      return { text: 'Loading the bridge...' + paused, kind: '' };
    case 'driving':
      return { text: `${capitalize(many)} crossing...` + paused, kind: '' };
    case 'falling':
      return { text: `${a} is falling!` + paused, kind: 'failure' };
    case 'crossed':
      return game.overBudget
        ? { text: `${all} crossed, but over budget. Reset and make it cheaper.`, kind: 'failure' }
        : { text: `Success! ${all} crossed.`, kind: 'success' };
    case 'fell':
      return { text: `${a} fell. Reset and try again.`, kind: 'failure' };
  }
}

/**
 * Colour of the load bar in the tooltip: the stress view's blue for tension and orange for
 * compression (brightened for the dark tooltip), grey otherwise.
 * @param {import('./game.js').LinkInfo['state']} state
 */
function loadColor(state) {
  return state === 'tension' ? '#4f8fe0' : state === 'compression' ? '#f08a24' : '#8c949c';
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
  el.meter.style.backgroundColor = loadColor(info.state);
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
  const btnShare = byId('share-structure', HTMLButtonElement);
  const fileImport = byId('import-file', HTMLInputElement);
  const txtStatus = byId('status-message', HTMLDivElement);
  const btnLevel = byId('level-button', HTMLButtonElement);
  const txtLevelName = byId('level-button-name', HTMLSpanElement);
  const picker = {
    root: byId('levels', HTMLDivElement),
    grid: byId('levels-grid', HTMLDivElement),
    total: byId('levels-total', HTMLSpanElement),
    close: byId('levels-close', HTMLButtonElement),
  };
  const tooltip = {
    root: byId('link-tooltip', HTMLDivElement),
    title: byId('link-tooltip-title', HTMLDivElement),
    force: byId('link-tooltip-force', HTMLDivElement),
    meter: byId('link-tooltip-meter', HTMLDivElement),
    peak: byId('link-tooltip-peak', HTMLDivElement),
    load: byId('link-tooltip-load', HTMLDivElement),
  };
  const goalChallenges = byId('goal-challenges', HTMLUListElement);
  const txtLevel = byId('level-description', HTMLDivElement);
  const boxCost = byId('cost', HTMLElement);
  const txtCost = byId('cost-value', HTMLSpanElement);
  const txtBudget = byId('budget-value', HTMLSpanElement);
  const txtLoad = byId('load-value', HTMLSpanElement);
  const barBudget = byId('budget-fill', HTMLDivElement);
  const goals = {
    two: byId('goal-two', HTMLElement),
    three: byId('goal-three', HTMLElement),
    best: byId('best', HTMLElement),
  };
  const dlg = {
    root: byId('result', HTMLElement),
    stars: [...document.querySelectorAll('#result-stars .big-star')],
    title: byId('result-title', HTMLElement),
    text: byId('result-text', HTMLElement),
    cost: byId('result-cost', HTMLElement),
    budget: byId('result-budget', HTMLElement),
    best: byId('result-best', HTMLElement),
    hint: byId('result-hint', HTMLElement),
    retry: byId('result-retry', HTMLButtonElement),
    next: byId('result-next', HTMLButtonElement),
    close: byId('result-close', HTMLButtonElement),
    tip: byId('result-tip', HTMLParagraphElement),
    share: byId('result-share', HTMLButtonElement),
    replay: byId('result-replay', HTMLButtonElement),
    challenges: byId('result-challenges', HTMLUListElement),
  };
  const placeTip = {
    root: byId('place-tip', HTMLDivElement),
    what: byId('place-tip-what', HTMLDivElement),
    left: byId('place-tip-left', HTMLDivElement),
  };
  const tutorial = {
    root: byId('tutorial', HTMLDivElement),
    step: byId('tutorial-step', HTMLSpanElement),
    text: byId('tutorial-text', HTMLParagraphElement),
    skip: byId('tutorial-skip', HTMLButtonElement),
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
  const toolbar = byId('control-panel', HTMLElement);
  const sidePanel = byId('material-panel', HTMLElement);
  const updateInsets = () => {
    const top = toolbar.offsetHeight;
    // the side panel runs under the toolbar; keep its content below it
    document.documentElement.style.setProperty('--toolbar-height', `${top}px`);
    // phones: the panel is a sheet along the bottom instead of a column on the right
    const sheet = sidePanel.offsetWidth >= window.innerWidth - 1;
    game.viewInsets = sheet
      ? { top, right: 0, bottom: sidePanel.offsetHeight }
      : { top, right: sidePanel.offsetWidth, bottom: 0 };
  };
  // on short windows start with the controls help folded, so the materials stay in view
  const help = byId('help', HTMLDetailsElement);
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

  // ---- keyboard: materials by number, T to test
  const materialInputs = () => [...document.querySelectorAll('input[name="material"]')]
    .filter(el => el instanceof HTMLInputElement && !el.closest('[hidden]'));
  for (const input of materialInputs()) {
    // a clicked card would keep the arrow keys for itself: give them back to the cursor
    input.addEventListener('change', () => { if (input instanceof HTMLInputElement) input.blur(); });
  }
  window.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const target = ev.target;
    if (target instanceof Element && target.closest('input[type=text], input[type=number], textarea, select, [contenteditable]')) return;
    if (!picker.root.hidden || !dlg.root.hidden || !settings.root.hidden || !sandbox.root.hidden) return;
    const n = Number(ev.key);
    if (Number.isInteger(n) && n >= 1) {
      const input = materialInputs()[n - 1];
      if (input instanceof HTMLInputElement) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (ev.key.toLowerCase() === 't' && !(target instanceof HTMLButtonElement)) {
      chkSimulation.checked = !chkSimulation.checked;
      chkSimulation.dispatchEvent(new Event('change'));
    }
  });

  btnUndo.addEventListener('click', () => game.undo());
  btnRedo.addEventListener('click', () => game.redo());

  const chkStress = byId('toggle-stress', HTMLInputElement);
  game.showStress = chkStress.checked;
  const stressKey = byId('stress-key', HTMLDivElement);
  stressKey.hidden = !chkStress.checked;
  chkStress.addEventListener('change', () => {
    game.showStress = chkStress.checked;
    stressKey.hidden = !chkStress.checked;
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

  // ---- test speed and the follow camera, remembered between visits
  const btnSpeed = byId('speed', HTMLButtonElement);
  const txtSpeed = byId('speed-value', HTMLSpanElement);
  const chkFollow = byId('toggle-follow', HTMLInputElement);
  try {
    const speed = Number(localStorage.getItem(SPEED_KEY));
    if (SPEEDS.includes(speed)) game.speed = speed;
    // on small screens the traffic soon drives out of view: follow it unless told otherwise
    const follow = localStorage.getItem(FOLLOW_KEY);
    game.follow = follow === null ? window.innerWidth <= 640 : follow === 'on';
  } catch { /* storage blocked */ }
  btnSpeed.addEventListener('click', (ev) => {
    // cycles up (Shift: down) from any speed, including the replay's
    game.speed = ev.shiftKey
      ? SPEEDS.findLast(s => s < game.speed) ?? /** @type {number} */ (SPEEDS.at(-1))
      : SPEEDS.find(s => s > game.speed) ?? SPEEDS[0];
    btnSpeed.blur();
  });
  chkFollow.addEventListener('change', () => {
    game.follow = chkFollow.checked;
    chkFollow.blur();
  });
  let shownSpeed = NaN, shownFollow = /** @type {boolean | undefined} */ (undefined);
  /** Shows the speed and follow state (keys and panning change them too) and remembers them. */
  function syncSpeed() {
    if (game.speed !== shownSpeed) {
      shownSpeed = game.speed;
      txtSpeed.textContent = `${game.speed === 0.25 ? '\u00bc' : game.speed}\u00d7`;
      btnSpeed.classList.toggle('active', game.speed !== 1);
      // the replay's slow motion is not the player's choice: don't remember it
      if (!game.replay) try { localStorage.setItem(SPEED_KEY, String(game.speed)); } catch { /* ignore */ }
    }
    if (game.follow !== shownFollow) {
      const first = shownFollow === undefined;
      shownFollow = chkFollow.checked = game.follow;
      if (!first && !game.replay) try { localStorage.setItem(FOLLOW_KEY, game.follow ? 'on' : 'off'); } catch { /* ignore */ }
    }
  }

  btnNew.addEventListener('click', () => {
    game.restartLevel();
    chkSimulation.checked = false;
    showStatus('Level restarted (Undo to go back)');
  });

  // Road on road levels, Rail on railway levels: the other deck is no use there
  const railCard = byId('material-rail', HTMLLabelElement);
  const roadCardForTrack = byId('material-road', HTMLLabelElement);
  function showDecks() {
    const rail = game.level.track === 'rail';
    railCard.hidden = !rail;
    roadCardForTrack.hidden = rail;
    const hiddenPick = (rail ? roadCardForTrack : railCard).querySelector('input');
    if (hiddenPick instanceof HTMLInputElement && hiddenPick.checked) {
      const deck = (rail ? railCard : roadCardForTrack).querySelector('input');
      if (deck instanceof HTMLInputElement) deck.checked = true;
    }
  }

  function refreshLevels() {
    showDecks();
    txtLevelName.textContent = game.level.sandbox ? game.level.name : `${game.level.number}. ${game.level.name}`;
    txtLevel.textContent = game.level.description;
    if (!picker.root.hidden) renderLevelCards();

    const { stars } = game.level;
    lastChild(goals.two).textContent = `\u2264 ${formatMoney(stars.two)}`;
    lastChild(goals.three).textContent = `\u2264 ${formatMoney(stars.three)}`;
    const best = game.bestResult();
    goals.best.textContent = best ? `Best ${formatMoney(best.cost)}  ${starText(best.stars)}` : '';
    const earned = game.challengesEarned();
    goalChallenges.replaceChildren(...challengesFor(game.level.id).map(c =>
      challengeItem(c.name, c.label, { earned: earned.includes(c.id) })));
  }

  /**
   * One line of a challenge list: a diamond (filled once earned), the name and what it asks.
   * @param {string} name
   * @param {string} label
   * @param {{ earned?: boolean, met?: boolean, isNew?: boolean }} state
   */
  function challengeItem(name, label, { earned = false, met = false, isNew = false }) {
    const li = document.createElement('li');
    li.className = 'challenge';
    li.classList.toggle('earned', earned);
    li.classList.toggle('met', met);
    const title = document.createElement('span');
    title.className = 'name';
    title.textContent = name;
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = label;
    li.append(title);
    if (isNew) {
      const badge = document.createElement('span');
      badge.className = 'new-best';
      badge.textContent = 'Done';
      title.append(badge);
    }
    li.append(what);
    li.title = earned ? `Done: ${label}` : `Challenge: ${label}, and win within budget`;
    return li;
  }

  /** @param {import('./game.js').TestResult} result */
  function showResult(result) {
    dlg.root.className = result.kind;
    dlg.stars.forEach((star, i) => star.classList.toggle('earned', i < result.stars));
    const over = result.cost - result.budget;
    const train = game.level.track === 'rail';
    if (result.kind === 'success') {
      dlg.title.textContent = ['', 'Bridge holds!', 'Great bridge!', 'Perfect bridge!'][result.stars];
      const n = game.level.vehicleCount;
      dlg.text.textContent = train ? 'The train made it across.'
        : n === 1 ? 'It made it across.' : n === 2 ? 'Both made it across.' : `All ${n} made it across.`;
    } else if (result.kind === 'over-budget') {
      dlg.title.textContent = 'Over budget';
      dlg.text.textContent = `${train ? 'The train' : `All ${game.level.vehicleNoun.many}`} crossed, but the bridge costs ${formatMoney(over)} more than the budget.`;
    } else {
      dlg.title.textContent = 'Bridge failed';
      const a = train ? 'The train' : `A ${game.level.vehicleNoun.one}`;
      const how = { fell: `${a} fell into the gap.`, crashed: `${a} crashed into the cliff.`, 'hard landing': `${a} landed too hard.` };
      const broke = result.broken ? ` ${result.broken} member${result.broken === 1 ? '' : 's'} broke.` : '';
      dlg.text.textContent = (how[result.reason ?? 'fell'] ?? how.fell) + broke;
    }
    dlg.tip.hidden = result.kind !== 'failed';
    dlg.tip.textContent = result.kind === 'failed'
      ? failureTip(result, game.level.track) + (result.failure ? ' It is marked in red on your bridge.' : '')
      : '';
    // after a win, how the bridge did on the level's challenges
    dlg.challenges.replaceChildren(...(result.kind === 'success' ? result.challenges : []).map(c =>
      challengeItem(c.name, c.label, { earned: c.earned, met: c.met, isNew: c.isNew })));
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
    dlg.share.hidden = result.kind !== 'success';
    dlg.replay.hidden = !game.canReplay;
    if (result.kind !== 'success' && game.hintAvailable && hintStage === 0) {
      dlg.hint.textContent = 'Stuck? There is a hint in the panel.';
    }
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

  // ---- a hint for a level that keeps failing: first in words, then as an outline
  const hint = {
    root: byId('hint', HTMLElement),
    text: byId('hint-text', HTMLParagraphElement),
    button: byId('hint-button', HTMLButtonElement),
  };
  /** 0: offered, 1: the words shown, 2: the outline offered or shown. */
  let hintStage = 0;
  let hintLevel = '';
  function updateHint() {
    if (game.level.id !== hintLevel) {
      hintLevel = game.level.id;
      hintStage = 0;
    }
    const words = levelHint(game.level.id);
    hint.root.hidden = !words || (hintStage === 0 && !game.hintAvailable);
    hint.text.hidden = hintStage === 0;
    if (hintStage > 0 && words) {
      const cost = document.createElement('span');
      cost.className = 'outline-cost';
      const outline = game.outline;
      cost.textContent = game.showOutline && outline ? `The outline costs ${formatMoney(outline.cost)}.` : '';
      hint.text.replaceChildren(words, cost);
    }
    lastChild(hint.button).textContent = hintStage === 0 ? 'Stuck? Get a hint'
      : game.showOutline ? 'Hide the outline' : 'Show the outline';
  }
  hint.button.addEventListener('click', () => {
    if (hintStage === 0) hintStage = 1;
    else {
      hintStage = 2;
      game.showOutline = !game.showOutline;
    }
    updateHint();
    hint.button.blur();
  });

  game.onResult = (result) => {
    updateHint();
    showResult(result);
    sound.jingle(result.kind === 'success');
  };
  dlg.close.addEventListener('click', hideResult);
  dlg.retry.addEventListener('click', () => {
    hideResult();
    game.reset();
    chkSimulation.checked = false;
  });
  dlg.replay.addEventListener('click', () => {
    hideResult();
    if (game.replayFailure()) chkSimulation.checked = true;
  });
  dlg.next.addEventListener('click', () => {
    hideResult();
    const next = game.result?.nextLevel;
    if (next) game.selectLevel(next);
    chkSimulation.checked = false;
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!picker.root.hidden) hideLevels();
    else if (!dlg.root.hidden) hideResult();
  });
  game.onChange = () => {
    refreshLevels();
    updateHint();
  };
  refreshLevels();
  updateHint();

  // ---- level-select screen
  /**
   * A card per level: preview, number and name, stars and best cost, or what unlocks it. The
   * sandbox card shows a sandbox level and opens the sandbox designer.
   * @param {import('./level.mjs').Level} level
   * @param {{ sandbox?: boolean }} [options]
   */
  function levelCard(level, { sandbox: isSandbox = false } = {}) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card';
    card.dataset.level = level.id;
    const unlocked = game.isUnlocked(level.id);
    const best = game.bestResult(level.id);
    const previous = levels[level.number - 2];
    card.disabled = !unlocked;
    card.classList.toggle('current', isSandbox ? game.level.sandbox !== undefined : level === game.level);
    card.classList.toggle('sandbox-card', isSandbox);
    if (isSandbox) card.dataset.level = 'sandbox';
    card.classList.toggle('locked', !unlocked);

    const thumb = document.createElement('canvas');
    thumb.className = 'level-thumb';
    const W = 216, H = 108, ratio = window.devicePixelRatio || 1;
    thumb.width = Math.round(W * ratio);
    thumb.height = Math.round(H * ratio);
    const g = thumb.getContext('2d');
    if (g) {
      g.scale(ratio, ratio);
      renderLevelPreview(g, level, W, H);
    }

    const title = document.createElement('div');
    title.className = 'level-title';
    const num = document.createElement('span');
    num.className = 'level-num';
    num.textContent = isSandbox ? '✦' : String(level.number);
    const name = document.createElement('span');
    name.textContent = level.name;
    title.append(num, name);

    const stars = document.createElement('div');
    stars.className = 'level-stars';
    for (let i = 0; i < 3; i++) {
      const star = svgIcon('icon-star');
      star.classList.toggle('earned', i < (best?.stars ?? 0));
      stars.append(star);
    }

    const detail = document.createElement('div');
    detail.className = 'level-detail';
    if (unlocked) {
      detail.textContent = best ? `Best ${formatMoney(best.cost)}` : `Budget ${formatMoney(level.budget)}`;
      const all = challengesFor(level.id);
      if (all.length) {
        const done = game.challengesEarned(level.id).length;
        const chip = document.createElement('span');
        chip.className = 'level-challenges';
        chip.classList.toggle('all', done === all.length);
        chip.textContent = `\u25C6 ${done}/${all.length}`;
        chip.title = `Challenges done: ${done} of ${all.length}`;
        detail.append(chip);
      }
    } else {
      detail.append(svgIcon('icon-lock'), `Win ${previous.name} to unlock`);
    }

    if (isSandbox) {
      detail.textContent = 'Design your own gap';
      card.append(thumb, title, detail);
      card.title = 'Choose the gap, the traffic and the budget yourself';
      card.addEventListener('click', () => {
        hideLevels();
        showSandbox();
      });
      return card;
    }
    card.append(thumb, title, stars, detail);
    card.title = unlocked ? level.description : `Locked: win ${previous.name} within budget first`;
    card.addEventListener('click', () => {
      hideLevels();
      hideResult();
      if (level !== game.level) game.selectLevel(level.id);
      chkSimulation.checked = false;
    });
    return card;
  }

  /** @param {string} id - symbol id in the page's icon sprite */
  function svgIcon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  }

  /** The last card: the sandbox, showing the sandbox being played or the last one designed. */
  function sandboxCard() {
    const level = /** @type {import('./level.mjs').Level} */ (findLevel(sandboxId(currentSandbox())));
    return levelCard(level, { sandbox: true });
  }

  function renderLevelCards() {
    picker.grid.replaceChildren(...levels.map(level => levelCard(level)), sandboxCard());
    const { earned, max } = game.totalStars;
    picker.total.textContent = `${earned} / ${max}`;
  }

  function showLevels() {
    renderLevelCards();
    picker.root.hidden = false;
    btnLevel.setAttribute('aria-expanded', 'true');
    const current = picker.grid.querySelector('.level-card.current');
    if (current instanceof HTMLElement) current.focus();
  }

  function hideLevels() {
    picker.root.hidden = true;
    btnLevel.setAttribute('aria-expanded', 'false');
  }

  btnLevel.addEventListener('click', () => (picker.root.hidden ? showLevels() : hideLevels()));
  picker.close.addEventListener('click', hideLevels);
  // a click on the backdrop, outside the panel, closes it
  picker.root.addEventListener('click', (ev) => { if (ev.target === picker.root) hideLevels(); });

  btnExport.addEventListener('click', () => {
    const json = JSON.stringify(game.exportStructure(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bridge.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  // ---- bridges in links
  async function shareBridge() {
    const url = bridgeUrl(location.href.split('#')[0], game.exportStructure());
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
      // phones: the system share sheet
      try {
        await navigator.share({ title: 'Bridge Builder', text: `My bridge for ${game.level.name}`, url });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) showStatus('Could not share the link.', true);
      }
      return;
    }
    // Copy within the click itself: the async clipboard API can wait on a permission
    // prompt, and the click no longer counts by the time that is answered.
    if (copyNow(url)) {
      showStatus('Link copied: anyone who opens it gets this bridge.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showStatus('Link copied: anyone who opens it gets this bridge.');
    } catch {
      showStatus('Could not copy the link.', true);
    }
  }

  /**
   * Copies text with a selection and the copy command, which works right away in a click.
   * @param {string} text
   * @returns {boolean} whether it was copied
   */
  function copyNow(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
    area.remove();
    return ok;
  }
  btnShare.addEventListener('click', shareBridge);
  dlg.share.addEventListener('click', shareBridge);

  /** Opens the bridge in the address's #hash, if there is one, then clears the hash. */
  function openSharedBridge() {
    const text = bridgeInHash(location.hash);
    if (text === undefined) return;
    history.replaceState(null, '', location.pathname + location.search);
    let data;
    try {
      data = decodeBridge(text);
    } catch {
      showStatus('This bridge link is damaged: it could not be opened.', true);
      return;
    }
    const level = findLevel(data.level);
    if (!level) {
      showStatus('This bridge link is for a level that doesn\u2019t exist.', true);
      return;
    }
    if (!game.isUnlocked(level.id)) {
      const before = levels[levels.indexOf(level) - 1];
      showStatus(`This bridge is for ${level.number}. ${level.name}: win ${before.name} first to open it.`, true);
      return;
    }
    try {
      game.importStructure(data);
    } catch {
      showStatus('This bridge link is damaged: it could not be opened.', true);
      return;
    }
    chkSimulation.checked = false;
    if (!dlg.root.hidden) hideResult();
    if (!picker.root.hidden) hideLevels();
    showStatus(`Opened a shared bridge for ${level.name}. Undo to get yours back.`);
  }
  window.addEventListener('hashchange', openSharedBridge);

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

  // ---- readout while placing a link
  function updatePlaceTip() {
    const info = game.placementInfo;
    placeTip.root.hidden = !info;
    if (!info) return;
    placeTip.what.textContent = `${info.label} \u00b7 ${info.length.toFixed(1)} m${info.mirrored ? ' \u00d7 2' : ''} \u00b7 ${formatMoney(info.cost)}`;
    placeTip.left.textContent = info.remaining >= 0
      ? `${formatMoney(info.remaining)} of the budget left`
      : `${formatMoney(-info.remaining)} over budget`;
    placeTip.root.classList.toggle('over', info.remaining < 0);
    const rect = canvas.getBoundingClientRect();
    if (game.pointerType === 'touch') {
      // above the finger, where it can be seen
      const w = placeTip.root.offsetWidth;
      const x = Math.min(Math.max(8, rect.left + info.client.x - w / 2), window.innerWidth - w - 8);
      placeTip.root.style.left = `${x}px`;
      placeTip.root.style.top = `${Math.max(8, rect.top + info.client.y - 90)}px`;
    } else {
      placeTip.root.style.left = `${rect.left + info.client.x + 18}px`;
      placeTip.root.style.top = `${rect.top + info.client.y + 18}px`;
    }
  }

  // ---- tutorial on the first level
  let tutorialDone = false;
  try { tutorialDone = localStorage.getItem(TUTORIAL_KEY) === 'done'; } catch { /* storage blocked */ }
  tutorial.skip.addEventListener('click', () => {
    tutorialDone = true;
    tutorialReplay = false;
    try { localStorage.setItem(TUTORIAL_KEY, 'done'); } catch { /* ignore */ }
  });
  /** Set by "Play it again": the tutorial runs even though Brook is already won. */
  let tutorialReplay = false;
  function resetTutorial() {
    tutorialDone = false;
    try { localStorage.removeItem(TUTORIAL_KEY); } catch { /* ignore */ }
  }
  /** Brook from scratch, with the tutorial (the old bridge is one Undo away). */
  function replayTutorial() {
    resetTutorial();
    tutorialReplay = true;
    hideResult();
    if (game.level.id !== 'brook') game.selectLevel('brook');
    game.restartLevel();
    chkSimulation.checked = false;
  }
  const roadCard = byId('material-road', HTMLLabelElement);
  const testButton = byId('test-label', HTMLLabelElement);
  /** @type {Element | undefined} */
  let focused;

  /**
   * The tutorial step for the game's current state, or nothing once Brook is won (or the
   * tutorial was skipped, or on another level).
   * @returns {{ n: number, text: string, focus?: Element, target?: { x: number, y: number } } | undefined}
   */
  function tutorialStep() {
    if (tutorialDone || game.level.id !== 'brook') return undefined;
    if (game.isCompleted('brook') && !(tutorialReplay && game.result?.kind !== 'success')) {
      tutorialReplay = false;
      return undefined;
    }
    if (!game.isBuildMode) return game.result ? undefined : { n: 4, text: 'Watch the test: every vehicle has to reach the flag. Win within budget to unlock the next level.' };
    if (game.roadAcross && !game.isPlacing) {
      return { n: 4, text: 'That\u2019s a road across. Press Test to send the traffic over it.', focus: testButton };
    }
    const material = document.querySelector('input[name="material"]:checked');
    if (!(material instanceof HTMLInputElement) || material.value !== 'road') {
      return { n: 1, text: 'Pick Road in the materials panel: it\u2019s the only thing vehicles can drive on.', focus: roadCard };
    }
    const xs = game.level.anchors.map(a => a.x);
    const left = Math.max(...xs.filter(x => x < 0)), right = Math.min(...xs.filter(x => x > 0));
    const y = game.level.anchors[0].y;
    const touch = game.pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)').matches;
    const click = touch ? 'Tap' : 'Click';
    if (!game.isPlacing) return { n: 2, text: `${click} the anchor at the edge of the brook to start the road.`, target: { x: left, y } };
    return {
      n: 3,
      text: touch ? 'Now tap the anchor on the far bank. Tap the first anchor again to cancel.'
        : 'Now click the anchor on the far bank. Esc or right-click cancels.',
      target: { x: right, y },
    };
  }

  function updateTutorial() {
    const step = tutorialStep();
    tutorial.root.hidden = !step;
    game.tutorialTarget = step?.target;
    if (focused !== step?.focus) {
      focused?.classList.remove('tutorial-focus');
      step?.focus?.classList.add('tutorial-focus');
      focused = step?.focus;
    }
    if (!step) return;
    tutorial.step.textContent = `${step.n} / 4`;
    if (tutorial.text.textContent !== step.text) tutorial.text.textContent = step.text;
  }

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
    syncSpeed();
    btnUndo.disabled = !game.canUndo;
    btnRedo.disabled = !game.canRedo;
    const mode = modeText(game);
    txtMode.innerText = mode.text;
    txtMode.className = mode.kind;
    txtCost.textContent = formatMoney(game.cost);
    txtBudget.textContent = formatMoney(game.level.budget);
    txtLoad.textContent = game.level.convoySummary;
    if (!game.result && !dlg.root.hidden) hideResult();
    boxCost.classList.toggle('over', game.overBudget);
    goals.two.classList.toggle('met', !game.overBudget && game.cost <= game.level.stars.two);
    goals.three.classList.toggle('met', !game.overBudget && game.cost <= game.level.stars.three);
    const share = game.cost / game.level.budget;
    barBudget.style.width = `${Math.min(1, share) * 100}%`;
    barBudget.classList.toggle('near', share > 0.85 && !game.overBudget);
    updateTooltip(tooltip, game.hoverInfo, canvas);
    updatePlaceTip();
    updateTutorial();
    updateSound();
    requestAnimationFrame(tick);
  }

  // ---- sandbox: a level the player designs
  const sandbox = {
    root: byId('sandbox', HTMLDivElement),
    form: byId('sandbox-form', HTMLFormElement),
    close: byId('sandbox-close', HTMLButtonElement),
    cancel: byId('sandbox-cancel', HTMLButtonElement),
    preview: byId('sandbox-preview', HTMLCanvasElement),
    gap: byId('sandbox-gap', HTMLInputElement),
    gapValue: byId('sandbox-gap-value', HTMLOutputElement),
    far: byId('sandbox-far', HTMLInputElement),
    farValue: byId('sandbox-far-value', HTMLOutputElement),
    rock: byId('sandbox-rock', HTMLInputElement),
    rockNote: byId('sandbox-rock-note', HTMLSpanElement),
    traffic: byId('sandbox-traffic', HTMLSelectElement),
    budget: byId('sandbox-budget', HTMLInputElement),
    theme: byId('sandbox-theme', HTMLSelectElement),
  };
  sandbox.traffic.replaceChildren(...Object.entries(SANDBOX_TRAFFIC).map(([key, { label }]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    return option;
  }));

  /** The sandbox being played, else the last one designed, else the default. */
  function currentSandbox() {
    if (game.level.sandbox) return game.level.sandbox;
    try {
      const last = parseSandboxId(localStorage.getItem(SANDBOX_KEY));
      if (last) return last;
    } catch { /* storage blocked */ }
    return SANDBOX_DEFAULT;
  }

  /** @returns {import('./sandbox.mjs').SandboxSpec} */
  function readSandboxForm() {
    return normalizeSandbox({
      gap: Number(sandbox.gap.value),
      far: Number(sandbox.far.value),
      rock: sandbox.rock.checked,
      traffic: sandbox.traffic.value,
      budget: Number(sandbox.budget.value),
      theme: /** @type {import('./themes.mjs').ThemeId} */ (sandbox.theme.value),
    });
  }

  /** Shows the values and redraws the preview after any change. */
  function updateSandboxForm() {
    const spec = readSandboxForm();
    sandbox.gapValue.textContent = `${spec.gap} m`;
    sandbox.farValue.textContent = spec.far === 0 ? 'level' : `${Math.abs(spec.far)} m ${spec.far > 0 ? 'higher' : 'lower'}`;
    const roomForRock = spec.gap >= SANDBOX_LIMITS.rockMinGap;
    sandbox.rock.disabled = !roomForRock;
    sandbox.rockNote.textContent = roomForRock ? 'in the middle, to stand a pier on' : `needs a gap of ${SANDBOX_LIMITS.rockMinGap} m or more`;
    const level = findLevel(sandboxId(spec));
    const g = sandbox.preview.getContext('2d');
    if (level && g) {
      const ratio = window.devicePixelRatio || 1;
      const W = 376, H = 140;
      if (sandbox.preview.width !== Math.round(W * ratio)) {
        sandbox.preview.width = Math.round(W * ratio);
        sandbox.preview.height = Math.round(H * ratio);
      }
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, W, H);
      renderLevelPreview(g, level, W, H);
    }
  }

  function showSandbox() {
    hideResult();
    const spec = currentSandbox();
    sandbox.gap.value = String(spec.gap);
    sandbox.far.value = String(spec.far);
    sandbox.rock.checked = spec.rock;
    sandbox.traffic.value = spec.traffic;
    sandbox.budget.value = String(spec.budget);
    sandbox.theme.value = spec.theme;
    updateSandboxForm();
    sandbox.root.hidden = false;
    sandbox.gap.focus();
  }
  function hideSandbox() {
    sandbox.root.hidden = true;
  }
  sandbox.form.addEventListener('input', updateSandboxForm);
  sandbox.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = sandboxId(readSandboxForm());
    hideSandbox();
    try { localStorage.setItem(SANDBOX_KEY, id); } catch { /* ignore */ }
    if (id !== game.level.id) game.selectLevel(id);
    chkSimulation.checked = false;
  });
  sandbox.close.addEventListener('click', hideSandbox);
  sandbox.cancel.addEventListener('click', hideSandbox);
  sandbox.root.addEventListener('click', (ev) => { if (ev.target === sandbox.root) hideSandbox(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !sandbox.root.hidden) {
      ev.stopImmediatePropagation();
      hideSandbox();
    }
  }, true);

  // ---- settings
  const settings = {
    root: byId('settings', HTMLDivElement),
    button: byId('settings-button', HTMLButtonElement),
    close: byId('settings-close', HTMLButtonElement),
    volume: byId('setting-volume', HTMLInputElement),
    volumeValue: byId('setting-volume-value', HTMLOutputElement),
    shake: byId('setting-shake', HTMLInputElement),
    tutorial: byId('setting-tutorial', HTMLButtonElement),
    reset: byId('setting-reset', HTMLButtonElement),
    confirm: byId('setting-reset-confirm', HTMLDivElement),
    cancel: byId('setting-reset-cancel', HTMLButtonElement),
    yes: byId('setting-reset-yes', HTMLButtonElement),
  };
  try {
    const volume = Number(localStorage.getItem(VOLUME_KEY) ?? 100);
    if (Number.isFinite(volume)) settings.volume.value = String(Math.min(100, Math.max(0, volume)));
    const shake = localStorage.getItem(SHAKE_KEY);
    settings.shake.checked = shake === null ? !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches : shake === 'on';
  } catch {
    settings.shake.checked = true;
  }
  const applyVolume = () => {
    sound.setVolume(Number(settings.volume.value) / 100);
    settings.volumeValue.textContent = `${settings.volume.value}%`;
  };
  applyVolume();
  game.screenShake = settings.shake.checked;
  settings.volume.addEventListener('input', () => {
    applyVolume();
    try { localStorage.setItem(VOLUME_KEY, settings.volume.value); } catch { /* ignore */ }
  });
  settings.volume.addEventListener('change', () => sound.horn()); // hear the new level
  settings.shake.addEventListener('change', () => {
    game.screenShake = settings.shake.checked;
    try { localStorage.setItem(SHAKE_KEY, settings.shake.checked ? 'on' : 'off'); } catch { /* ignore */ }
  });

  function showSettings() {
    hideResult();
    if (!picker.root.hidden) hideLevels();
    settings.confirm.hidden = true;
    settings.reset.hidden = false;
    settings.root.hidden = false;
    settings.button.setAttribute('aria-expanded', 'true');
    settings.close.focus();
  }
  function hideSettings() {
    settings.root.hidden = true;
    settings.button.setAttribute('aria-expanded', 'false');
  }
  settings.button.addEventListener('click', () => (settings.root.hidden ? showSettings() : hideSettings()));
  settings.close.addEventListener('click', hideSettings);
  settings.root.addEventListener('click', (ev) => { if (ev.target === settings.root) hideSettings(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !settings.root.hidden) {
      ev.stopImmediatePropagation();
      hideSettings();
    }
  }, true);

  settings.tutorial.addEventListener('click', () => {
    hideSettings();
    replayTutorial();
  });
  settings.reset.addEventListener('click', () => {
    settings.reset.hidden = true;
    settings.confirm.hidden = false;
    settings.cancel.focus();
  });
  settings.cancel.addEventListener('click', () => {
    settings.confirm.hidden = true;
    settings.reset.hidden = false;
    settings.reset.focus();
  });
  settings.yes.addEventListener('click', () => {
    game.resetProgress();
    chkSimulation.checked = false;
    resetTutorial();
    hideSettings();
    showStatus('Progress reset: back to the first level.');
  });

  openSharedBridge();
  tick();
});