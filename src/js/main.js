// Main entry point for the Bridge Builder game
import { Game, SPEEDS } from './game.js';
import { findLevel, levels } from './level.mjs';
import { bridgeInHash, bridgeUrl, decodeBridge } from './share.mjs';
import { Sound } from './audio.mjs';
import { renderLevelPreview } from './level-preview.mjs';
import { SANDBOX_DEFAULT, SANDBOX_LIMITS, SANDBOX_TRAFFIC, normalizeSandbox, parseSandboxId, sandboxId } from './sandbox.mjs';
import { challengesFor } from './challenges.mjs';
import { failureTip, levelHint } from './hints.mjs';
import { setUpReading } from './speech.mjs';
import { BADGES, earnedBadges, newBadges } from './badges.mjs';
import { confetti } from './confetti.mjs';
import { Guide } from './guide-ui.mjs';
import { endingSummary, isFinished } from './ending.mjs';
import { REAL_BRIDGES, bridgeDrawing, realBridgeFor } from './real-bridges.mjs';
import { PAINTS, loadLooks, saveLooks } from './looks.mjs';
import { dailyFor, dailyLabel, dailyMet, dayOf, daysDone, markDone, streak } from './daily.mjs';
import { clearFriendGoal, friendGoal, friendInHash, friendUrl, judgeFriend, setFriendGoal } from './friend.mjs';
import { addScore, lastPlayer, players, scoresFor } from './scoreboard.mjs';
import { LANGUAGES, detectLanguage, formatMoney, formatNumber, isLanguage, language, saveLanguage, setLanguage, t, translatePage } from './i18n.mjs';

// before anything is shown: the page and everything it builds are in this language
setLanguage(detectLanguage());

const SOUND_KEY = 'bridge-builder:sound';
const TUTORIAL_KEY = 'bridge-builder:tutorial';
/** The last sandbox designed (its level id), to start the next one from. */
const SANDBOX_KEY = 'bridge-builder:sandbox';
const SPEED_KEY = 'bridge-builder:speed';
const FOLLOW_KEY = 'bridge-builder:follow';
const VOLUME_KEY = 'bridge-builder:volume';
const SHAKE_KEY = 'bridge-builder:shake';
/** The badges the player has been told about. */
const BADGES_KEY = 'bridge-builder:badges';
/** 'off' once the player asks for every tool; simple controls are the default. */
const SIMPLE_KEY = 'bridge-builder:simple';


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
 * Status line: build/simulation mode and the load test outcome.
 * @param {Game} game
 * @returns {{ text: string, kind: '' | 'success' | 'failure' }}
 */
function modeText(game) {
  if (game.replay?.seeking) return { text: t('mode.rewinding'), kind: '' };
  const paused = (game.evalCtx.simulation ? '' : t('mode.paused')) + (game.replay ? t('mode.replay') : '');
  const noun = game.level.vehicleNoun;
  /** A message about the traffic, which says "the train" its own way. @param {string} key */
  const say = (key) => t(game.level.track === 'rail' ? `${key}.train` : key, noun);
  switch (game.testState) {
    case 'building': {
      const sel = game.selectionInfo;
      if (!sel) return { text: t('mode.build'), kind: '' };
      const parts = [];
      if (sel.links) parts.push(t('mode.members', { n: sel.links }));
      if (sel.joints) parts.push(t('mode.joints', { n: sel.joints }));
      return { text: t('mode.selected', { what: parts.join(', ') }), kind: '' };
    }
    case 'waiting': {
      // a drawbridge: what the road and the boat are doing before the traffic sets off
      const draw = game.level.drawbridge;
      const time = game.evalCtx.time;
      const stage = !draw || time < draw.lift[0] ? 'mode.loading'
        : game.boat?.state === 'sailing' ? 'mode.boatSailing'
          : game.boat?.state === 'through' ? 'mode.lowering' : 'mode.lifting';
      return { text: t(stage) + paused, kind: '' };
    }
    case 'driving':
      return { text: say('mode.driving') + paused, kind: '' };
    case 'falling':
      return { text: say('mode.falling') + paused, kind: 'failure' };
    case 'crossed':
      return game.overBudget
        ? { text: say('mode.overBudget'), kind: 'failure' }
        : { text: say('mode.crossed'), kind: 'success' };
    case 'fell':
      return { text: game.boat?.state === 'hit' ? t('mode.boatHit') : say('mode.fell'), kind: 'failure' };
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
  el.title.textContent = t('tooltip.title', { label: info.label, length: formatNumber(info.length, 1), cost: formatMoney(info.cost) });
  el.force.textContent = t(`tooltip.${info.state}`, { kn: Math.round(info.forceKN) });

  const now = Math.min(1, info.utilization);
  el.meter.style.width = `${now * 100}%`;
  el.meter.style.backgroundColor = loadColor(info.state);
  const peak = info.peakUtilization;
  el.peak.hidden = peak === undefined;
  if (peak !== undefined) el.peak.style.left = `calc(${Math.min(1, peak) * 100}% - 1px)`;
  el.load.textContent = t('tooltip.load', { pct: Math.round(info.utilization * 100) })
    + (peak !== undefined ? t('tooltip.peak', { pct: Math.round(peak * 100) }) : '');

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
  document.documentElement.lang = language();
  translatePage(document);
  const stopReading = setUpReading(document, language());
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
    badges: byId('levels-badges', HTMLUListElement),
    close: byId('levels-close', HTMLButtonElement),
    trophy: byId('levels-trophy', HTMLButtonElement),
    daily: byId('levels-daily', HTMLElement),
    dailyWhat: byId('daily-what', HTMLElement),
    dailyStreak: byId('daily-streak', HTMLSpanElement),
    dailyPlay: byId('daily-play', HTMLButtonElement),
    real: byId('levels-real', HTMLDivElement),
  };
  const ending = {
    root: byId('ending', HTMLDivElement),
    text: byId('ending-text', HTMLParagraphElement),
    stars: byId('ending-stars', HTMLSpanElement),
    goals: byId('ending-goals', HTMLSpanElement),
    badges: byId('ending-badges', HTMLSpanElement),
    next: byId('ending-next', HTMLParagraphElement),
    close: byId('ending-close', HTMLButtonElement),
    levels: byId('ending-levels', HTMLButtonElement),
    sandbox: byId('ending-sandbox', HTMLButtonElement),
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
    help: byId('result-help', HTMLButtonElement),
    next: byId('result-next', HTMLButtonElement),
    close: byId('result-close', HTMLButtonElement),
    tip: byId('result-tip', HTMLParagraphElement),
    share: byId('result-share', HTMLButtonElement),
    replay: byId('result-replay', HTMLButtonElement),
    challenges: byId('result-challenges', HTMLUListElement),
    badges: byId('result-badges', HTMLUListElement),
    real: byId('result-real', HTMLButtonElement),
    friend: byId('result-friend', HTMLButtonElement),
    score: byId('result-score', HTMLFormElement),
    scoreName: byId('result-score-name', HTMLInputElement),
    scoreDone: byId('result-score-done', HTMLParagraphElement),
    name: byId('result-name', HTMLParagraphElement),
    compare: byId('result-compare', HTMLDivElement),
    compareText: byId('result-compare-text', HTMLParagraphElement),
    compareShow: byId('result-compare-show', HTMLButtonElement),
    realName: byId('result-real-name', HTMLElement),
  };
  const real = {
    root: byId('real-bridge', HTMLDivElement),
    picture: byId('real-picture', HTMLDivElement),
    name: byId('real-name', HTMLElement),
    place: byId('real-place', HTMLParagraphElement),
    fact: byId('real-fact', HTMLParagraphElement),
    close: byId('real-close', HTMLButtonElement),
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
    why: byId('tutorial-why', HTMLParagraphElement),
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
    showStatus(t('status.restarted'));
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

  // the Winch only on a drawbridge level: elsewhere it would be a dear cable
  const winchCard = byId('material-winch', HTMLLabelElement);
  function showWinch() {
    const drawbridge = game.level.drawbridge !== undefined;
    winchCard.hidden = !drawbridge;
    const pick = winchCard.querySelector('input');
    if (!drawbridge && pick instanceof HTMLInputElement && pick.checked) {
      const steel = document.querySelector('input[name="material"][value="steel"]');
      if (steel instanceof HTMLInputElement) steel.click();
    }
  }

  // ---- paint and name your bridge: kept for each level
  const nameInput = byId('bridge-name', HTMLInputElement);
  const paintPicks = /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll('input[name="paint"]')]);
  function showLooks() {
    const looks = loadLooks(game.level.id);
    if (document.activeElement !== nameInput) nameInput.value = looks.name;
    nameInput.placeholder = t('looks.placeholder');
    for (const pick of paintPicks) pick.checked = pick.value === looks.paint;
    game.paint = PAINTS[looks.paint];
  }
  nameInput.addEventListener('input', () => saveLooks(game.level.id, { name: nameInput.value }));
  nameInput.addEventListener('change', () => { nameInput.value = saveLooks(game.level.id, { name: nameInput.value }).name; });
  // typing a name mustn't build or delete: the game's keys are for the canvas
  nameInput.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter' || ev.key === 'Escape') nameInput.blur();
  });
  for (const pick of paintPicks) {
    pick.addEventListener('change', () => {
      if (pick.checked) game.paint = PAINTS[saveLooks(game.level.id, { paint: pick.value }).paint];
    });
  }

  function refreshLevels() {
    showDecks();
    showWinch();
    showLooks();
    txtLevelName.textContent = game.level.sandbox ? game.level.name : `${game.level.number}. ${game.level.name}`;
    if (txtLevel.textContent !== game.level.description) stopReading?.();
    txtLevel.textContent = game.level.description;
    if (!picker.root.hidden) renderLevelCards();

    const { stars } = game.level;
    lastChild(goals.two).textContent = `\u2264 ${formatMoney(stars.two)}`;
    lastChild(goals.three).textContent = `\u2264 ${formatMoney(stars.three)}`;
    const best = game.bestResult();
    goals.best.textContent = best ? t('goal.best', { cost: formatMoney(best.cost), stars: starText(best.stars) }) : '';
    const earned = game.challengesEarned();
    showFriendGoal();
    const daily = today();
    goalChallenges.replaceChildren(...challengesFor(game.level.id).map(c =>
      challengeItem(c.name, c.label, { earned: earned.includes(c.id) })),
    ...(daily?.level === game.level.id ? [challengeItem(t('daily.title'), dailyLabel(daily), { earned: daysDone().includes(daily.date) })] : []));
  }

  // ---- a friend's price to beat on this level
  const friendBox = {
    root: byId('friend-goal', HTMLDivElement),
    text: byId('friend-goal-text', HTMLSpanElement),
    clear: byId('friend-goal-clear', HTMLButtonElement),
  };
  function showFriendGoal() {
    const goal = friendGoal(game.level.id);
    friendBox.root.hidden = !goal;
    if (goal) friendBox.text.textContent = t(goal.beaten ? 'friend.beaten' : 'friend.goal', { cost: formatMoney(goal.cost) });
  }
  friendBox.clear.addEventListener('click', () => {
    clearFriendGoal(game.level.id);
    showFriendGoal();
  });
  /** @type {ReturnType<typeof judgeFriend>} */
  let friendResult;

  // ---- the daily challenge: one open level, with a twist, each day
  /** Today's challenge, among the levels open now. */
  function today() {
    return dailyFor(dayOf(), levels.filter(l => game.isUnlocked(l.id)));
  }
  function renderDaily() {
    const daily = today();
    picker.daily.hidden = !daily;
    if (!daily) return;
    const level = /** @type {import("./level.mjs").Level} */ (findLevel(daily.level));
    picker.dailyWhat.textContent = t('daily.what', { n: level.number, level: level.name, what: dailyLabel(daily) });
    const done = daysDone().includes(daily.date);
    picker.daily.classList.toggle('done', done);
    const days = streak(daily.date);
    picker.dailyStreak.textContent = done ? t('daily.done', { n: days }) : days ? t('daily.streak', { n: days }) : t('daily.new');
  }
  picker.dailyPlay.addEventListener('click', () => {
    const daily = today();
    if (!daily) return;
    hideLevels();
    game.selectLevel(daily.level);
  });
  /**
   * After a win: whether it met today's challenge, recording it the first time.
   * @param {import("./game-types.mjs").TestResult} result
   * @returns {{ label: string, met: boolean, isNew: boolean } | undefined}
   */
  function dailyAfter(result) {
    const daily = today();
    if (!daily || result.kind !== 'success' || daily.level !== game.level.id) return undefined;
    const met = dailyMet(daily, game.bridgeStats);
    const isNew = met && !daysDone().includes(daily.date);
    if (isNew) markDone(daily.date);
    return { label: dailyLabel(daily), met, isNew };
  }
  /** @type {ReturnType<typeof dailyAfter>} */
  let dailyResult;

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
      badge.textContent = t('challenge.done');
      title.append(badge);
    }
    li.append(what);
    li.title = t(earned ? 'challenge.doneTitle' : 'challenge.todoTitle', { label });
    return li;
  }

  // ---- badges: milestones over the whole game
  /** @returns {import('./badges.mjs').Progress} */
  function progress() {
    const real = levels.filter(level => !level.sandbox);
    const won = real.filter(level => game.isCompleted(level.id));
    const { earned, max } = game.totalStars;
    return {
      stars: earned,
      maxStars: max,
      wins: won.length,
      levels: real.length,
      goals: real.reduce((n, level) => n + game.challengesEarned(level.id).length, 0),
      maxGoals: real.reduce((n, level) => n + challengesFor(level.id).length, 0),
      train: won.some(level => level.track === 'rail'),
    };
  }
  /** The badges already announced. @returns {string[]} */
  function toldBadges() {
    try {
      const list = JSON.parse(localStorage.getItem(BADGES_KEY) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }
  /**
   * @param {string} id
   * @param {boolean} earned
   * @param {{ isNew?: boolean, how?: boolean }} [opts] how: say how it's earned, under its name
   */
  function badgeItem(id, earned, { isNew = false, how = false } = {}) {
    const li = document.createElement('li');
    li.className = 'badge';
    li.classList.toggle('earned', earned);
    li.classList.toggle('new', isNew);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-medal');
    icon.append(use);
    const name = document.createElement('span');
    name.textContent = t(`badge.${id}.name`);
    const text = document.createElement('span');
    text.className = 'badge-text';
    text.append(name);
    if (how) {
      const line = document.createElement('span');
      line.className = 'how';
      line.textContent = t(`badge.${id}.how`);
      text.append(line);
    } else {
      li.title = t(`badge.${id}.how`);
    }
    if (!earned) {
      // said, not only shown by its colour
      const status = document.createElement('span');
      status.className = 'visually-hidden';
      status.textContent = ` (${t('badge.notYet')})`;
      name.append(status);
    }
    li.append(icon, text);
    return li;
  }
  // a player from before badges: what they have counts as told, so the next win doesn't list it all
  try {
    if (localStorage.getItem(BADGES_KEY) === null) localStorage.setItem(BADGES_KEY, JSON.stringify(earnedBadges(progress())));
  } catch { /* storage blocked: nothing to remember */ }

  /** @param {import('./game.js').TestResult} result */
  function showResult(result) {
    dlg.root.className = result.kind;
    const named = loadLooks(game.level.id).name;
    dlg.name.hidden = !named;
    dlg.name.textContent = named ? t('result.named', { name: named }) : '';
    dlg.stars.forEach((star, i) => star.classList.toggle('earned', i < result.stars));
    const over = result.cost - result.budget;
    const train = game.level.track === 'rail';
    /** A message about the traffic, which says "the train" its own way. @param {string} key @param {Record<string, string | number>} [params] */
    const say = (key, params = {}) => t(train ? `${key}.train` : key, { ...game.level.vehicleNoun, ...params });
    if (result.kind === 'success') {
      dlg.title.textContent = t(['', 'result.holds', 'result.great', 'result.perfect'][result.stars]);
      const n = game.level.vehicleCount;
      dlg.text.textContent = train ? t('result.across.train') : n === 2 ? t('result.across.both') : t('result.across', { n });
    } else if (result.kind === 'over-budget') {
      dlg.title.textContent = t('result.overBudget');
      dlg.text.textContent = say('result.overBudgetText', { over: formatMoney(over) });
    } else {
      dlg.title.textContent = t('result.failed');
      const how = { fell: 'result.fell', crashed: 'result.crashed', 'hard landing': 'result.hardLanding', boat: 'result.boat' };
      const broke = result.broken ? t('result.broke', { n: result.broken }) : '';
      dlg.text.textContent = say(how[result.reason ?? 'fell'] ?? how.fell) + broke;
    }
    // after a win: how it compares with the hint bridge
    const outline = result.kind === 'success' && !game.level.sandbox ? game.outline : undefined;
    dlg.compare.hidden = !outline;
    if (outline) {
      const diff = Math.round(outline.cost - result.cost);
      const price = Math.abs(diff) < 50 ? t('compare.same', { ref: formatMoney(outline.cost) })
        : diff > 0 ? t('compare.cheaper', { diff: formatMoney(diff), ref: formatMoney(outline.cost) })
          : t('compare.dearer', { diff: formatMoney(-diff), ref: formatMoney(outline.cost) });
      dlg.compareText.textContent = `${price} ${t('compare.pieces', { n: game.bridgeStats.members, m: outline.structure.links.length })}`;
    }
    // after a failure, what to try; after a win, a piece that hardly worked, to save money on
    const idle = result.kind === 'success' ? result.idle : undefined;
    dlg.tip.hidden = result.kind !== 'failed' && !idle;
    dlg.tip.classList.toggle('saver', Boolean(idle));
    dlg.tip.textContent = result.kind === 'failed'
      ? failureTip(result, game.level.track) + (result.failure ? t('result.marked') : '')
      : idle ? t('result.idle', { what: idle.label.toLowerCase(), to: idle.to.toLowerCase(), saving: formatMoney(idle.saving), n: Math.max(1, Math.round(idle.load * 100)) }) : '';
    // after a win, how the bridge did on the level's challenges
    dlg.challenges.replaceChildren(...(result.kind === 'success' ? result.challenges : []).map(c =>
      challengeItem(c.name, c.label, { earned: c.earned, met: c.met, isNew: c.isNew })),
    ...(friendResult ? [challengeItem(t('friend.title'), friendResult.beat
      ? t('friend.won', { cost: formatMoney(friendResult.goal.cost), diff: formatMoney(friendResult.goal.cost - result.cost) })
      : t('friend.notYet', { cost: formatMoney(friendResult.goal.cost) }),
    { earned: friendResult.beat, met: friendResult.beat, isNew: friendResult.isNew })] : []),
    ...(dailyResult ? [challengeItem(t('daily.title'), dailyResult.isNew ? `${dailyResult.label} · ${t('daily.done', { n: streak(dayOf()) })}` : dailyResult.label,
      { earned: dailyResult.met, met: dailyResult.met, isNew: dailyResult.isNew })] : []));
    dlg.cost.textContent = formatMoney(result.cost);
    dlg.budget.textContent = formatMoney(result.budget);
    dlg.best.replaceChildren(result.best ? `${formatMoney(result.best.cost)} ${starText(result.best.stars)}` : '\u2014');
    if (result.newBest && result.previousBest) {
      const badge = document.createElement('span');
      badge.className = 'new-best';
      badge.textContent = t('result.newBest');
      dlg.best.append(badge);
    }

    // what the next star needs
    const { goals: g } = result;
    dlg.hint.textContent = result.kind !== 'success' ? ''
      : result.stars === 1 ? t('result.nextTwo', { cost: formatMoney(g.two), trim: formatMoney(result.cost - g.two) })
        : result.stars === 2 ? t('result.nextThree', { cost: formatMoney(g.three), trim: formatMoney(result.cost - g.three) })
          : t('result.cheapest');

    lastChild(dlg.retry).textContent = t(result.kind === 'success' ? (result.stars < 3 ? 'result.cheaper' : 'result.rebuild')
      : result.kind === 'over-budget' ? 'result.cheaper' : 'result.retry');
    dlg.retry.classList.toggle('primary', result.kind !== 'success' || !result.nextLevel);
    dlg.next.hidden = result.kind !== 'success' || !result.nextLevel;
    dlg.share.hidden = result.kind !== 'success';
    dlg.replay.hidden = !game.canReplay;
    // help straight from the result: the hint in words, then the bridge that works
    const helpful = result.kind !== 'success' && game.hintAvailable && Boolean(levelHint(game.level.id));
    if (helpful && hintStage === 0 && !isGuiding()) dlg.hint.textContent = t('result.stuck'); // (the guide is the help already)
    dlg.help.hidden = !helpful || isGuiding();
    lastChild(dlg.help).textContent = t(hintStage === 0 ? 'result.help' : !game.showOutline ? 'hint.show' : 'guide.offer');
    // a win: confetti, and any badge it earned
    /** @type {string[]} */
    let fresh = [];
    if (result.kind === 'success' && !game.level.sandbox) {
      const have = earnedBadges(progress());
      fresh = newBadges(have, toldBadges());
      try { localStorage.setItem(BADGES_KEY, JSON.stringify(have)); } catch { /* ignore */ }
    }
    // a win on a level built on the same idea as a famous bridge: a button to see it
    const famous = result.kind === 'success' ? realBridgeFor(game.level.id) : undefined;
    dlg.real.hidden = !famous;
    dlg.friend.hidden = result.kind !== 'success' || game.level.sandbox !== undefined;
    // a win: put a name to it on the family scoreboard
    dlg.score.hidden = result.kind !== 'success' || game.level.sandbox !== undefined;
    dlg.score.classList.remove('added');
    dlg.scoreDone.hidden = true;
    dlg.scoreName.value = lastPlayer();
    dlg.scoreName.placeholder = t('score.placeholder');
    if (famous) {
      const picture = dlg.real.firstElementChild;
      if (picture) picture.innerHTML = bridgeDrawing(famous.kind);
      dlg.realName.textContent = t(`realBridge.${famous.id}.name`);
      dlg.real.dataset.bridge = famous.id;
    }
    // the win that finishes the game: its result leads on to the ending
    endingDue = fresh.includes('allLevels');
    if (endingDue) {
      dlg.next.hidden = false;
      (/** @type {HTMLElement} */ (dlg.next.firstElementChild)).textContent = t('ending.see');
    } else {
      (/** @type {HTMLElement} */ (dlg.next.firstElementChild)).textContent = t('ui.nextLevel', {}, 'Next level');
    }
    dlg.badges.replaceChildren(...fresh.map(id => badgeItem(id, true, { isNew: true })));
    dlg.badges.hidden = fresh.length === 0;
    dlg.root.hidden = false;
    if (result.kind === 'success') confetti(window, result.stars + (fresh.length ? 1 : 0));
    (dlg.next.hidden ? dlg.retry : dlg.next).focus();
  }

  // ---- the family scoreboard: names put to wins, on this browser
  dlg.scoreName.addEventListener('keydown', (ev) => ev.stopPropagation()); // typing isn't building
  dlg.score.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const result = game.result;
    if (result?.kind !== 'success') return;
    const placed = addScore(game.level.id, dlg.scoreName.value, result.cost, result.stars);
    if (!placed) {
      dlg.scoreName.focus();
      return;
    }
    dlg.score.classList.add('added');
    dlg.scoreDone.hidden = false;
    dlg.scoreDone.textContent = t('score.placed', { place: placed.place, of: placed.of });
  });
  const board = {
    root: byId('scoreboard', HTMLDivElement),
    open: byId('levels-scores', HTMLButtonElement),
    close: byId('scoreboard-close', HTMLButtonElement),
    empty: byId('scoreboard-empty', HTMLParagraphElement),
    players: byId('scoreboard-players', HTMLTableElement),
    levels: byId('scoreboard-levels', HTMLOListElement),
  };
  function showScoreboard() {
    const everyone = players(levels.map(l => l.id));
    board.empty.hidden = everyone.length > 0;
    board.players.hidden = everyone.length === 0;
    const body = /** @type {HTMLTableSectionElement} */ (board.players.tBodies[0]);
    body.replaceChildren(...everyone.map(p => {
      const row = document.createElement('tr');
      for (const value of [p.name, String(p.stars), String(p.levels), String(p.cheapest)]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    board.levels.replaceChildren(...levels.map(level => {
      const li = document.createElement('li');
      const [first] = scoresFor(level.id);
      li.append(`${level.name}: `);
      const who = document.createElement('span');
      who.className = first ? 'who' : 'none';
      who.textContent = first ? `${first.name}, ${formatMoney(first.cost)}` : '\u2014';
      li.append(who);
      return li;
    }));
    board.root.hidden = false;
    board.close.focus();
  }
  function hideScoreboard() {
    board.root.hidden = true;
    if (!picker.root.hidden) board.open.focus();
  }
  board.open.addEventListener('click', showScoreboard);
  board.close.addEventListener('click', hideScoreboard);
  board.root.addEventListener('click', (ev) => { if (ev.target === board.root) hideScoreboard(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !board.root.hidden) {
      ev.stopImmediatePropagation();
      hideScoreboard();
    }
  }, true);

  // ---- for grown-ups: what the game teaches, how to help, privacy, and progress so far
  const grownups = {
    root: byId('grownups', HTMLDivElement),
    open: byId('setting-grownups', HTMLButtonElement),
    close: byId('grownups-close', HTMLButtonElement),
    progress: byId('grownups-progress', HTMLParagraphElement),
  };
  grownups.open.addEventListener('click', () => {
    const { wins, levels: count, stars, maxStars, goals, maxGoals } = progress();
    grownups.progress.textContent = t('grown.progress', { wins, levels: count, stars, maxStars, goals, maxGoals });
    grownups.root.hidden = false;
    grownups.close.focus();
  });
  const hideGrownups = () => {
    grownups.root.hidden = true;
    grownups.open.focus();
  };
  grownups.close.addEventListener('click', hideGrownups);
  grownups.root.addEventListener('click', (ev) => { if (ev.target === grownups.root) hideGrownups(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !grownups.root.hidden) {
      ev.stopImmediatePropagation();
      hideGrownups();
    }
  }, true);

  // ---- real bridges: a famous bridge built on the same idea as a level
  /** @param {string} id */
  function showRealBridge(id) {
    const bridge = REAL_BRIDGES.find(b => b.id === id);
    if (!bridge) return;
    const name = t(`realBridge.${id}.name`);
    real.picture.innerHTML = bridgeDrawing(bridge.kind, name);
    real.name.textContent = name;
    real.place.textContent = t(`realBridge.${id}.place`);
    real.fact.textContent = t(`realBridge.${id}.fact`);
    real.root.hidden = false;
    real.close.focus();
  }
  function hideRealBridge() {
    real.root.hidden = true;
    stopReading?.();
  }
  dlg.real.addEventListener('click', () => showRealBridge(dlg.real.dataset.bridge ?? ''));
  real.close.addEventListener('click', hideRealBridge);
  real.root.addEventListener('click', (ev) => { if (ev.target === real.root) hideRealBridge(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !real.root.hidden) {
      ev.stopImmediatePropagation();
      hideRealBridge();
    }
  }, true);
  /** The level list's collection: the real bridges of the levels won, the others locked. */
  function renderRealBridges() {
    picker.real.replaceChildren(...REAL_BRIDGES.map((bridge) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'real-item';
      const open = game.isCompleted(bridge.level);
      const level = levels.find(l => l.id === bridge.level);
      const number = levels.indexOf(/** @type {any} */ (level)) + 1;
      button.innerHTML = bridgeDrawing(bridge.kind);
      const label = document.createElement('span');
      label.textContent = open ? t(`realBridge.${bridge.id}.name`) : t('real.locked', { n: number });
      button.append(label);
      button.disabled = !open;
      if (open) button.addEventListener('click', () => showRealBridge(bridge.id));
      return button;
    }));
  }

  /** The result on show is the win that finished the game: its button opens the ending. */
  let endingDue = false;

  // ---- the ending: every level won
  function showEnding() {
    hideResult();
    if (!picker.root.hidden) hideLevels();
    const p = progress();
    const s = endingSummary(p, earnedBadges(p), BADGES.length);
    ending.text.textContent = t('ending.text', { n: s.levels });
    ending.stars.textContent = t('ending.stars', { n: s.stars, max: s.maxStars });
    ending.goals.textContent = t('ending.goals', { n: s.goals, max: s.maxGoals });
    ending.badges.textContent = t('ending.badges', { n: s.badges, max: s.maxBadges });
    ending.next.textContent = s.everything ? t('ending.everything')
      : s.starsLeft > 0 ? t('ending.moreStars', { n: s.starsLeft }) : t('ending.moreGoals');
    ending.root.hidden = false;
    ending.levels.focus();
    confetti(window, 5);
  }
  function hideEnding() {
    ending.root.hidden = true;
    stopReading?.();
  }
  ending.close.addEventListener('click', hideEnding);
  ending.root.addEventListener('click', (ev) => { if (ev.target === ending.root) hideEnding(); });
  ending.levels.addEventListener('click', () => {
    hideEnding();
    showLevels();
  });
  ending.sandbox.addEventListener('click', () => {
    hideEnding();
    showSandbox();
  });
  picker.trophy.addEventListener('click', showEnding);
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !ending.root.hidden) {
      ev.stopImmediatePropagation();
      hideEnding();
    }
  });

  function hideResult() {
    dlg.root.hidden = true;
    stopReading?.();
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
      if (ev.type === 'break') sound.snap(ev.kind, ev.size, ev.material);
      else if (ev.type === 'place') sound.place(ev.material);
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

  // ---- "Build it with me": the level's working bridge, one glowing piece at a time
  const guide = new Guide({
    game,
    isTouch: () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
    testButton: byId('test-label', HTMLLabelElement),
    onChange: () => updateHint(),
  });
  const isGuiding = () => guide.active;
  function startGuide() {
    hintStage = Math.max(hintStage, 1);
    guide.start();
  }

  // ---- a hint for a level that keeps failing: first in words, then as an outline
  const hint = {
    root: byId('hint', HTMLElement),
    text: byId('hint-text', HTMLParagraphElement),
    button: byId('hint-button', HTMLButtonElement),
    guide: byId('hint-guide', HTMLButtonElement),
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
      cost.textContent = game.showOutline && outline ? t('hint.cost', { cost: formatMoney(outline.cost) }) : '';
      hint.text.replaceChildren(words, cost);
    }
    lastChild(hint.button).textContent = t(hintStage === 0 ? 'hint.offer'
      : game.showOutline ? 'hint.hide' : 'hint.show');
    hint.button.hidden = isGuiding();
    hint.guide.hidden = hintStage === 0 || isGuiding() || !game.outline;
  }
  /** The next step of the hint: the words, then the outline on and off. */
  function advanceHint() {
    if (hintStage === 0) hintStage = 1;
    else {
      hintStage = 2;
      game.showOutline = !game.showOutline;
    }
    updateHint();
  }
  hint.button.addEventListener('click', () => {
    advanceHint();
    hint.button.blur();
  });
  hint.guide.addEventListener('click', () => {
    startGuide();
    hint.guide.blur();
  });

  game.onResult = (result) => {
    if (result.kind === 'success' && isGuiding()) guide.end();
    dailyResult = dailyAfter(result);
    friendResult = result.kind === 'success' && !game.level.sandbox ? judgeFriend(game.level.id, result.cost) : undefined;
    if (friendResult) showFriendGoal();
    updateHint();
    showResult(result);
    sound.jingle(result.kind === 'success');
  };
  dlg.close.addEventListener('click', hideResult);
  // after a win: back to building, with the hint bridge drawn over yours
  dlg.compareShow.addEventListener('click', () => {
    hideResult();
    game.reset();
    chkSimulation.checked = false;
    hintLevel = game.level.id;
    hintStage = 2;
    game.showOutline = true;
    updateHint();
  });
  dlg.help.addEventListener('click', () => {
    hideResult();
    game.reset();
    chkSimulation.checked = false;
    if (hintStage > 0 && game.showOutline) {
      startGuide();
      return;
    }
    advanceHint();
    hint.root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    hint.root.classList.remove('flash');
    void hint.root.offsetWidth; // restart the animation
    hint.root.classList.add('flash');
  });
  dlg.retry.addEventListener('click', () => {
    hideResult();
    game.reset();
    chkSimulation.checked = false;
  });
  dlg.replay.addEventListener('click', () => {
    const result = game.result;
    hideResult();
    replayOf = result?.kind === 'failed' ? result : undefined;
    replayLink = game.scene.firstFailure?.link; // the same piece, once the bridge is put back
    if (game.replayFailure()) chkSimulation.checked = true;
  });
  dlg.next.addEventListener('click', () => {
    hideResult();
    if (endingDue) {
      endingDue = false;
      showEnding();
      return;
    }
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
      detail.textContent = best ? t('card.best', { cost: formatMoney(best.cost) }) : t('card.budget', { cost: formatMoney(level.budget) });
      const all = challengesFor(level.id);
      if (all.length) {
        const done = game.challengesEarned(level.id).length;
        const chip = document.createElement('span');
        chip.className = 'level-challenges';
        chip.classList.toggle('all', done === all.length);
        chip.textContent = `\u25C6 ${done}/${all.length}`;
        chip.title = t('card.challenges', { done, all: all.length });
        detail.append(chip);
      }
    } else {
      detail.append(svgIcon('icon-lock'), t('card.locked', { name: previous.name }));
    }

    if (isSandbox) {
      detail.textContent = t('card.sandbox');
      card.append(thumb, title, detail);
      card.title = t('card.sandboxTitle');
      card.addEventListener('click', () => {
        hideLevels();
        showSandbox();
      });
      return card;
    }
    card.append(thumb, title, stars, detail);
    card.title = unlocked ? level.description : t('card.lockedTitle', { name: previous.name });
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
    const have = earnedBadges(progress());
    picker.badges.replaceChildren(...BADGES.map(b => badgeItem(b.id, have.includes(b.id), { how: true })));
    picker.trophy.hidden = !isFinished(progress());
    renderDaily();
    renderRealBridges();
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
  function shareBridge() {
    return shareLink(bridgeUrl(location.href.split('#')[0], game.exportStructure()), t('share.text', { name: game.level.name }));
  }
  /** A link that dares a friend to build this level for less than the last win. */
  function shareFriend() {
    const cost = game.result?.kind === 'success' ? game.result.cost : game.bestResult()?.cost;
    if (cost === undefined) return;
    return shareLink(friendUrl(location.href.split('#')[0], game.level.id, cost),
      t('friend.text', { name: game.level.name, cost: formatMoney(cost) }), t('friend.copied'));
  }
  /**
   * Shares a link: the system share sheet on phones, else copied.
   * @param {string} url @param {string} text @param {string} [copied] - the message once copied
   */
  async function shareLink(url, text, copied = t('share.copied')) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
      // phones: the system share sheet
      try {
        await navigator.share({ title: 'Bridge Builder', text, url });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) showStatus(t('share.failed'), true);
      }
      return;
    }
    // Copy within the click itself: the async clipboard API can wait on a permission
    // prompt, and the click no longer counts by the time that is answered.
    if (copyNow(url)) {
      showStatus(copied);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showStatus(copied);
    } catch {
      showStatus(t('share.copyFailed'), true);
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
  dlg.friend.addEventListener('click', shareFriend);

  /** Opens the bridge in the address's #hash, if there is one, then clears the hash. */
  function openSharedBridge() {
    if (openFriendChallenge()) return;
    const text = bridgeInHash(location.hash);
    if (text === undefined) return;
    history.replaceState(null, '', location.pathname + location.search);
    let data;
    try {
      data = decodeBridge(text);
    } catch {
      showStatus(t('link.damaged'), true);
      return;
    }
    const level = findLevel(data.level);
    if (!level) {
      showStatus(t('link.noLevel'), true);
      return;
    }
    if (!game.isUnlocked(level.id)) {
      const before = levels[levels.indexOf(level) - 1];
      showStatus(t('link.locked', { number: level.number, name: level.name, before: before.name }), true);
      return;
    }
    try {
      game.importStructure(data);
    } catch {
      showStatus(t('link.damaged'), true);
      return;
    }
    chkSimulation.checked = false;
    if (!dlg.root.hidden) hideResult();
    if (!picker.root.hidden) hideLevels();
    showStatus(t('link.opened', { name: level.name }));
  }
  window.addEventListener('hashchange', openSharedBridge);

  /** Opens a friend's challenge in the address's #hash, if it is one: its level, with the price to beat. */
  function openFriendChallenge() {
    const dare = friendInHash(location.hash);
    if (!location.hash.startsWith('#beat=')) return false;
    history.replaceState(null, '', location.pathname + location.search);
    const level = dare && findLevel(dare.level);
    if (!dare || !level || level.sandbox) {
      showStatus(t(dare ? 'link.noLevel' : 'link.damaged'), true);
      return true;
    }
    if (!game.isUnlocked(level.id)) {
      const before = levels[levels.indexOf(level) - 1];
      showStatus(t('friend.locked', { number: level.number, name: level.name, before: before.name }), true);
      return true;
    }
    setFriendGoal(level.id, dare.cost);
    if (!dlg.root.hidden) hideResult();
    if (!picker.root.hidden) hideLevels();
    if (game.level.id === level.id) showFriendGoal();
    else game.selectLevel(level.id);
    chkSimulation.checked = false;
    showStatus(t('friend.opened', { name: level.name, cost: formatMoney(dare.cost) }));
    return true;
  }

  btnImport.addEventListener('click', () => fileImport.click());
  fileImport.addEventListener('change', async () => {
    const file = fileImport.files?.[0];
    fileImport.value = ''; // allow re-importing the same file
    if (!file) return;
    try {
      game.importStructure(JSON.parse(await file.text()));
      chkSimulation.checked = false;
      showStatus(t('import.loaded', { file: file.name }));
    } catch (err) {
      showStatus(t('import.failed', { file: file.name, error: err instanceof Error ? err.message : String(err) }), true);
    }
  });

  // ---- readout while placing a link
  function updatePlaceTip() {
    const info = game.placementInfo;
    placeTip.root.hidden = !info;
    if (!info) return;
    placeTip.what.textContent = t('place.what', {
      label: info.label, length: formatNumber(info.length, 1), mirror: info.mirrored ? ' \u00d7 2' : '', cost: formatMoney(info.cost),
    });
    placeTip.left.textContent = info.remaining >= 0
      ? t('place.left', { cost: formatMoney(info.remaining) })
      : t('place.over', { cost: formatMoney(-info.remaining) });
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
    if (isGuiding()) {
      guide.stop();
      return;
    }
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
    if (!game.isBuildMode) return game.result ? undefined : { n: 4, text: t('tutorial.watch') };
    if (game.roadAcross && !game.isPlacing) {
      return { n: 4, text: t('tutorial.test'), focus: testButton };
    }
    const material = document.querySelector('input[name="material"]:checked');
    if (!(material instanceof HTMLInputElement) || material.value !== 'road') {
      return { n: 1, text: t('tutorial.road'), focus: roadCard };
    }
    const xs = game.level.anchors.map(a => a.x);
    const left = Math.max(...xs.filter(x => x < 0)), right = Math.min(...xs.filter(x => x > 0));
    const y = game.level.anchors[0].y;
    const touch = game.pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)').matches;
    const how = touch ? 'tap' : 'click';
    if (!game.isPlacing) return { n: 2, text: t(`tutorial.start.${how}`), target: { x: left, y } };
    return { n: 3, text: t(`tutorial.far.${how}`), target: { x: right, y } };
  }

  function updateTutorial() {
    const brook = tutorialStep();
    const guided = brook ? undefined : guide.view();
    const step = brook ?? guided;
    tutorial.root.hidden = !step;
    game.tutorialTarget = step?.target;
    if (focused !== step?.focus) {
      focused?.classList.remove('tutorial-focus');
      step?.focus?.classList.add('tutorial-focus');
      focused = step?.focus;
    }
    if (!step) return;
    tutorial.step.textContent = `${step.n} / ${guided ? guided.of : 4}`;
    if (tutorial.text.textContent !== step.text) tutorial.text.textContent = step.text;
    const why = guided?.why ?? '';
    if (tutorial.why.textContent !== why) tutorial.why.textContent = why;
    tutorial.why.hidden = !why;
    const skip = guided ? t('guide.stop') : t('ui.skipTutorial', {}, 'Skip tutorial');
    if (tutorial.skip.textContent !== skip) tutorial.skip.textContent = skip;
  }

  // ---- the replay's note: which piece to watch, its load as it rises, and why it broke
  const replayNote = {
    root: byId('replay-note', HTMLDivElement),
    text: byId('replay-note-text', HTMLParagraphElement),
    bar: byId('replay-note-bar', HTMLSpanElement),
    tip: byId('replay-note-tip', HTMLParagraphElement),
  };
  /** The failed test being replayed. @type {import("./game-types.mjs").TestResult | undefined} */
  let replayOf;
  /** @type {import("./engine/link.mjs").Link | undefined} */
  let replayLink;
  function updateReplayNote() {
    const failure = replayOf?.kind === 'failed' ? replayOf.failure : undefined;
    const link = replayLink;
    const show = Boolean(game.replay && !game.replay.seeking && failure && link);
    if (replayNote.root.hidden === show) replayNote.root.hidden = !show;
    if (!show || !failure || !link) {
      if (!game.replay) replayOf = undefined;
      return;
    }
    const what = failure.label.toLowerCase();
    const broke = link.broken;
    const text = t(broke ? `replay.broke.${failure.mode}` : `replay.watch.${failure.mode}`, { what });
    if (replayNote.text.textContent !== text) replayNote.text.textContent = text;
    const load = broke ? 1 : Math.min(1, link.utilization);
    replayNote.bar.style.width = `${Math.round(load * 100)}%`;
    const tip = broke ? failureTip(/** @type {any} */ (replayOf), game.level.track) : '';
    if (replayNote.tip.textContent !== tip) replayNote.tip.textContent = tip;
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
    txtTime.innerText = t('time', { s: formatNumber(game.evalCtx.time, 2) });
    btnReset.disabled = game.isBuildMode;
    chkMirror.checked = game.mirror; // the M key toggles it too
    syncSpeed();
    btnUndo.disabled = !game.canUndo;
    btnRedo.disabled = !game.canRedo;
    const mode = modeText(game);
    if (txtMode.textContent !== mode.text) {
      txtMode.textContent = mode.text;
      txtMode.title = mode.text; // all of it, if it's cut short
    }
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
    updateReplayNote();
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
    wind: byId('sandbox-wind', HTMLSelectElement),
  };
  sandbox.traffic.replaceChildren(...Object.keys(SANDBOX_TRAFFIC).map((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = t(`traffic.${key}`);
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
      wind: /** @type {import('./wind.mjs').WindId} */ (sandbox.wind.value),
    });
  }

  /** Shows the values and redraws the preview after any change. */
  function updateSandboxForm() {
    const spec = readSandboxForm();
    sandbox.gapValue.textContent = t('sandbox.metres', { m: spec.gap });
    sandbox.farValue.textContent = spec.far === 0 ? t('sandbox.level') : t(spec.far > 0 ? 'sandbox.higher' : 'sandbox.lower', { m: Math.abs(spec.far) });
    const roomForRock = spec.gap >= SANDBOX_LIMITS.rockMinGap;
    sandbox.rock.disabled = !roomForRock;
    sandbox.rockNote.textContent = roomForRock ? t('sandbox.rockNote') : t('sandbox.rockNeeds', { m: SANDBOX_LIMITS.rockMinGap });
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
    sandbox.wind.value = spec.wind;
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
    simple: byId('setting-simple', HTMLInputElement),
    language: byId('setting-language', HTMLSelectElement),
    installRow: byId('setting-install-row', HTMLDivElement),
    install: byId('setting-install', HTMLButtonElement),
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

  // ---- a touch screen: bigger dots, for a finger to find
  const coarse = window.matchMedia?.('(pointer: coarse)');
  const sizeDots = () => { game.ctx.jointScale = coarse?.matches ? 1.6 : 1; };
  sizeDots();
  coarse?.addEventListener?.('change', sizeDots);

  // ---- simple controls: the extra tools put away, for younger players (on unless turned off)
  /** @param {boolean} on */
  function applySimple(on) {
    document.body.classList.toggle('simple', on);
    if (!on) return;
    // nothing hidden stays switched on
    for (const chk of [chkMirror, chkStress]) {
      if (chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }
    }
  }
  try { settings.simple.checked = localStorage.getItem(SIMPLE_KEY) !== 'off'; } catch { settings.simple.checked = true; }
  applySimple(settings.simple.checked);
  settings.simple.addEventListener('change', () => {
    applySimple(settings.simple.checked);
    try { localStorage.setItem(SIMPLE_KEY, settings.simple.checked ? 'on' : 'off'); } catch { /* ignore */ }
  });
  // M would switch on the mirror, whose button is put away: ignore it (this runs before the game sees the key)
  window.addEventListener('keydown', (ev) => {
    if (settings.simple.checked && ev.key?.toLowerCase() === 'm' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const target = ev.target;
      if (!(target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))) ev.stopImmediatePropagation();
    }
  }, true);

  // ---- the language: the page is reloaded in the new one (the bridge is autosaved)
  settings.language.replaceChildren(...Object.entries(LANGUAGES).map(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.lang = code;
    option.textContent = name;
    return option;
  }));
  settings.language.value = language();
  settings.language.addEventListener('change', () => {
    const lang = settings.language.value;
    if (!isLanguage(lang) || lang === language()) return;
    saveLanguage(lang);
    location.reload();
  });

  // ---- installable, and playable offline
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline play is not available:', err));
  }
  /** The browser's offer to install the game, kept for the Settings button. @type {any} */
  let installOffer;
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installOffer = ev;
    settings.installRow.hidden = false;
  });
  window.addEventListener('appinstalled', () => { settings.installRow.hidden = true; });
  settings.install.addEventListener('click', async () => {
    if (!installOffer) return;
    const offer = installOffer;
    installOffer = undefined;
    settings.installRow.hidden = true;
    hideSettings();
    await offer.prompt();
  });

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
    showStatus(t('status.reset'));
  });

  openSharedBridge();
  tick();
});