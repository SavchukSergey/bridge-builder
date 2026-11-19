/**
 * The game's first layer: what the other layers share (canvas, scene, level, options,
 * view), saved progress, and the load test: running the simulation, its outcome, the
 * follow camera and the effects.
 *
 * The game is built up in layers, each a subclass of the one before:
 * GameCore -> GameLevels -> GameEditing -> GameInput -> Game. A layer only uses what
 * it or the layers below it define.
 */

import { SIM_TIME_PER_FRAME, MAX_FRAME_TIME, MAX_SUBSTEPS, FOLLOW_RATE, HINT_AFTER, MAX_ZOOM, REPLAY_LEAD, REPLAY_SPEED, REPLAY_VIEW_M, SEEK_BUDGET_MS } from "./game-config.mjs";
import { COMPLETED_KEY, BEST_KEY, CHALLENGES_KEY, TRIES_KEY, storageGet, storageSet } from "./storage.mjs";
import { challengesFor } from "./challenges.mjs";
import { solutions } from "./solutions.mjs";
import { Effects } from "./effects.mjs";
import { EvalCtx } from "./eval-ctx.mjs";
import { findLevel, levels } from "./level.mjs";
import { createVec3F } from "./math.js";
import { RenderCtx } from "./render-ctx.mjs";
import { Scene } from "./scene.js";
import { findRoad } from "./vehicle.mjs";
/** @typedef {import("./game-types.mjs").BestResult} BestResult */
/** @typedef {import("./game-types.mjs").TestResult} TestResult */
/** @typedef {import("./game-types.mjs").DragState} DragState */
/** @typedef {import("./game-types.mjs").ClickState} ClickState */
/** @typedef {import("./vehicle.mjs").Vehicle} Vehicle */

export class GameCore {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Could not create 2d context");
    }
    this.ctx = new RenderCtx(ctx);
    this.evalCtx = new EvalCtx();
    this.scene = new Scene();
    /** @type {import("./level.mjs").Level} */
    this.level = levels[0];
    /**
     * The load-test convoy; exists from the first simulation start until reset.
     * @type {Vehicle[]}
     */
    this.vehicles = [];
  }

  /**
   * @type {DragState | undefined}
   */
  __dragState = undefined;

  /**
 * @type {ClickState | undefined}
 */
  __clickState = undefined;

  /** Debris, dust, sparks, splashes and camera shake. */
  effects = new Effects(levels[0]);

  /**
   * Events since the last call, for sound: breaks, splashes, thuds and trucks reaching the flag.
   * @returns {import("./effects.mjs").EffectEvent[]}
   */
  drainEvents() {
    return this.effects.drainEvents();
  }

  /** Whether new joints snap to the {@link SNAP_STEP} grid (hold Alt to place freely). */
  snapToGrid = true;

  /** Colour members by their load instead of drawing their material. */
  showStress = false;

  /**
   * Mirror mode: every link built, deleted or moved also happens to its mirror image across
   * the level's {@link Level.mirrorAxis}.
   */
  mirror = false;

  /** Called after every change to the built structure (edit, undo, load). */
  onChange = () => { };

  /**
   * How fast the load test runs: simulated seconds per real second, one of {@link SPEEDS}.
   * The physics steps are the same at every speed, so the result is too.
   */
  speed = 1;

  /** Whether breaks and crashes shake the view. */
  screenShake = true;

  /** Whether the view follows the traffic during a load test. Panning by hand turns it off. */
  follow = false;

  /** Whether the follow camera moved the view in this test (reset puts it back). */
  __followMoved = false;

  /** The view when the test started. @type {{ x: number, y: number } | undefined} */
  __viewBeforeTest = undefined;

  /** Simulated-minus-real time left over from the previous frame (see {@link tick}). */
  __timeCarry = 0;

  /**
   * Structure saved when the simulation was first started. While it exists the
   * scene shows a simulated (deformed) state and building is disabled.
   * @type {import("./scene.js").SceneSnapshot | undefined}
   */
  __snapshot = undefined;

  /** True while the structure can be edited (no simulation has run since the last reset). */
  get isBuildMode() {
    return !this.__snapshot;
  }

  /**
   * Starts or pauses the simulation. The first start saves the structure for {@link reset}.
   * @param {boolean} running
   */
  setSimulationRunning(running) {
    if (running && !this.__snapshot) {
      this.__cancelLink();
      this.__viewBeforeTest = { ...this.ctx.shift };
      this.__snapshot = this.scene.snapshot();
      this.__roadAcrossAtStart = this.roadAcross;
      this.vehicles = this.level.createConvoy();
      this.failedLink = undefined;
    }
    this.evalCtx.simulation = running;
  }

  /** Stops the simulation and restores the structure as it was built. */
  reset() {
    this.evalCtx.simulation = false;
    if (this.replay) {
      const { before } = this.replay;
      this.replay = undefined;
      if (this.speed === REPLAY_SPEED) this.speed = before.speed;
      this.follow = before.follow;
      this.ctx.zoom = before.zoom;
      this.ctx.shift = before.shift;
      this.__followMoved = false;
    }
    this.__timeCarry = 0;
    if (this.__snapshot) {
      this.scene.restore(this.__snapshot);
      this.__snapshot = undefined;
    }
    this.vehicles = [];
    this.evalCtx.time = 0;
    this.result = undefined;
    // back to where the view was before the camera followed the traffic
    if (this.__followMoved && this.__viewBeforeTest) this.ctx.shift = createVec3F(this.__viewBeforeTest.x, this.__viewBeforeTest.y, 0);
    this.__followMoved = false;
    this.__viewBeforeTest = undefined;
    this.scene.breaks = [];
    // the member that broke first stays marked on the rebuilt bridge until the next edit
    this.failedLink = this.scene.firstFailure?.link;
    this.scene.firstFailure = undefined;
    this.effects.clear();
  }

  /**
   * The member that broke first in the last load test, marked in build mode until the
   * bridge is edited or tested again.
   * @type {import("./engine/link.mjs").Link | undefined}
   */
  failedLink = undefined;

  /** Whether there was road across the whole gap when the test started. */
  __roadAcrossAtStart = true;

  /**
   * Whether road links cover every point between the start and the finish that has no
   * ground under it (not whether they are strong enough).
   */
  get roadAcross() {
    const { startX, finishX } = this.level;
    for (let x = startX; x <= finishX; x += 0.5) {
      if (this.level.groundAt(x) !== undefined) continue;
      if (!findRoad(this.scene, x, Infinity, this.level.track)) return false;
    }
    return true;
  }

  /** Whether a link is being placed: its first end is down, the second not yet. */
  get isPlacing() {
    return this.__clickState !== undefined;
  }

  /**
   * A point in the world to draw attention to (the tutorial's next click), drawn as a
   * pulsing ring.
   * @type {{ x: number, y: number } | undefined}
   */
  tutorialTarget = undefined;

  /** Structure cost, counted against {@link Level#budget}. */
  get cost() {
    return this.scene.cost;
  }

  get overBudget() {
    return this.cost > this.level.budget;
  }

  /**
   * Outcome of the load test so far, over the whole convoy: lost as soon as any truck
   * falls, won once every truck has crossed.
   * @returns {"building" | "waiting" | "driving" | "falling" | "crossed" | "fell"}
   */
  get testState() {
    const states = this.vehicles.map(v => v.state);
    if (!states.length) return "building";
    if (states.includes("fell")) return "fell";
    if (states.includes("falling")) return "falling";
    if (states.every(s => s === "crossed")) return "crossed";
    if (states.every(s => s === "waiting")) return "waiting";
    return "driving";
  }

  /** True once the load test has been won or lost. */
  get testFinished() {
    const state = this.testState;
    return state === "crossed" || state === "fell";
  }

  /**
   * Screen pixels covered by UI panels drawn over the canvas, so {@link fitView} centres
   * the level in the part of the canvas that is actually visible.
   */
  viewInsets = { top: 0, right: 0, bottom: 0 };

  /** Centres and zooms the view on the current level, inside {@link viewInsets}. */
  fitView() {
    const { x0, x1, y } = this.level.view;
    const { top, right, bottom = 0 } = this.viewInsets;
    const visibleWidth = Math.max(100, (this.canvas.width / this.ctx.pixelRatio || 800) - right);
    const zoom = Math.max(1, visibleWidth / (x1 - x0));
    this.ctx.zoom = zoom;
    // The visible area's centre is offset from the canvas centre by half of each inset.
    this.ctx.shift = createVec3F((x0 + x1) / 2 + right / 2 / zoom, y + (top - bottom) / 2 / zoom, 0);
  }

  /** Whether the level has been won within budget (ever, on this browser). */
  isCompleted(id = this.level.id) {
    return this.__completed().includes(id);
  }

  /**
   * Whether a level can be played: the first always, a later one once the level before it
   * has been won within budget. A level already won stays open.
   * @param {string} [id]
   */
  isUnlocked(id = this.level.id) {
    if (findLevel(id)?.sandbox) return true;
    const i = levels.findIndex(level => level.id === id);
    if (i < 0) return false;
    // open once the one before is won, or any later one (a level added in between since)
    return i === 0 || levels.slice(i - 1).some(level => this.isCompleted(level.id));
  }

  /** Stars earned over all levels (the best result on each), and how many there are. */
  get totalStars() {
    const earned = levels.reduce((sum, level) => sum + (this.bestResult(level.id)?.stars ?? 0), 0);
    return { earned, max: levels.length * 3 };
  }

  /** @returns {string[]} */
  __completed() {
    try {
      const list = JSON.parse(storageGet(COMPLETED_KEY) ?? "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  __markCompleted() {
    if (this.isCompleted()) return;
    storageSet(COMPLETED_KEY, JSON.stringify([...this.__completed(), this.level.id]));
  }

  /**
   * The cheapest winning bridge on a level so far (on this browser).
   * @param {string} [id]
   * @returns {BestResult | undefined}
   */
  bestResult(id = this.level.id) {
    const entry = this.__bests()[id];
    return entry && Number.isFinite(entry.cost) && [1, 2, 3].includes(entry.stars) ? entry : undefined;
  }

  /** @returns {Record<string, BestResult>} */
  __bests() {
    try {
      const all = JSON.parse(storageGet(BEST_KEY) ?? "{}");
      return all && typeof all === "object" && !Array.isArray(all) ? all : {};
    } catch {
      return {};
    }
  }

  /**
   * How the load test that just finished went; also records a win.
   * @returns {TestResult}
   */
  __finishTest() {
    const level = this.level;
    const cost = this.cost;
    const previousBest = this.bestResult();
    // a sandbox is not part of the progression: no next level, and nothing recorded
    const sandbox = level.sandbox !== undefined;
    const next = sandbox ? undefined : levels[levels.indexOf(level) + 1];
    const base = { cost, budget: level.budget, goals: level.stars, previousBest, nextLevel: next?.id, challenges: this.__challengeResults(false) };
    const broken = this.scene.links.filter(l => l.broken).length;

    if (this.testState === "fell") {
      const lost = this.vehicles.find(v => v.state === "fell");
      const first = this.scene.firstFailure;
      const failure = first && {
        material: first.link.material.name,
        label: first.link.material.label,
        kind: first.link.material.look.kind,
        mode: first.mode,
      };
      this.__countTry();
      return {
        ...base, kind: "failed", stars: 0, best: previousBest, newBest: false, reason: lost?.lostReason ?? "fell", broken,
        failure: failure && { ...failure, time: first.time, x: first.x, y: first.y }, roadAcross: this.__roadAcrossAtStart,
      };
    }
    if (this.overBudget) {
      this.__countTry();
      return { ...base, kind: "over-budget", stars: 0, best: previousBest, newBest: false, broken };
    }
    const stars = level.starsFor(cost);
    const newBest = !previousBest || cost < previousBest.cost - 0.5;
    const best = newBest ? { cost, stars } : previousBest;
    if (newBest && !sandbox) storageSet(BEST_KEY, JSON.stringify({ ...this.__bests(), [level.id]: best }));
    if (!sandbox) this.__markCompleted();
    const challenges = this.__challengeResults(true);
    this.onChange();
    return { ...base, kind: "success", stars, best, newBest, broken, challenges };
  }

  /** The current bridge, as challenges judge it. @returns {import("./challenges.mjs").BridgeStats} */
  get bridgeStats() {
    const links = this.scene.links;
    return { cost: this.cost, members: links.length, materials: [...new Set(links.map(l => l.material.name))] };
  }

  /**
   * Challenges on a level met in a win so far (on this browser).
   * @param {string} [id]
   * @returns {string[]}
   */
  challengesEarned(id = this.level.id) {
    try {
      const all = JSON.parse(storageGet(CHALLENGES_KEY) ?? "{}");
      const list = all && typeof all === "object" ? all[id] : undefined;
      return Array.isArray(list) ? list.filter(c => typeof c === "string") : [];
    } catch {
      return [];
    }
  }

  /**
   * The level's challenges against this test: after a win, which ones the bridge met
   * (recording any new ones).
   * @param {boolean} won - within budget
   * @returns {import("./game-types.mjs").ChallengeResult[]}
   */
  __challengeResults(won) {
    const earned = this.challengesEarned();
    const stats = this.bridgeStats;
    const results = challengesFor(this.level.id).map(c => {
      const met = won && c.met(stats);
      return { id: c.id, name: c.name, label: c.label, met, earned: met || earned.includes(c.id), isNew: met && !earned.includes(c.id) };
    });
    if (results.some(r => r.isNew) && !this.level.sandbox) {
      let all = {};
      try { all = JSON.parse(storageGet(CHALLENGES_KEY) ?? "{}") ?? {}; } catch { /* start afresh */ }
      storageSet(CHALLENGES_KEY, JSON.stringify({ ...all, [this.level.id]: results.filter(r => r.earned).map(r => r.id) }));
    }
    return results;
  }

  /** Load tests on a level that ended without a win (on this browser). */
  triesWithoutWin(id = this.level.id) {
    const n = this.__tries()[id];
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  /** Whether the player seems stuck on this level: offer a hint. */
  get hintAvailable() {
    return this.triesWithoutWin() >= HINT_AFTER && this.outline !== undefined;
  }

  /** @returns {Record<string, number>} */
  __tries() {
    try {
      const all = JSON.parse(storageGet(TRIES_KEY) ?? "{}");
      return all && typeof all === "object" && !Array.isArray(all) ? all : {};
    } catch {
      return {};
    }
  }

  __countTry() {
    if (this.replay || this.level.sandbox) return; // watching it again is not another try
    storageSet(TRIES_KEY, JSON.stringify({ ...this.__tries(), [this.level.id]: this.triesWithoutWin() + 1 }));
  }

  /** Draw the {@link outline} over the build area. */
  showOutline = false;

  /** @type {{ level: import("./level.mjs").Level, structure: import("./scene.js").SavedStructure, cost: number } | undefined} */
  __outlineCache = undefined;

  /**
   * The level's reference bridge, for the hint: a design known to win within budget.
   * @returns {{ structure: import("./scene.js").SavedStructure, cost: number } | undefined}
   */
  get outline() {
    const build = solutions[this.level.id];
    if (!build) return undefined;
    if (this.__outlineCache?.level !== this.level) {
      const structure = build(this.level);
      const scene = new Scene();
      scene.load(structure);
      this.__outlineCache = { level: this.level, structure, cost: scene.cost };
    }
    return this.__outlineCache;
  }

  /**
   * Set once the current load test is won or lost, until reset.
   * @type {TestResult | undefined}
   */
  result = undefined;

  /**
   * Called once when a load test is won or lost.
   * @type {(result: TestResult) => void}
   */
  onResult = () => { };

  __cancelLink() {
    if (this.__clickState) {
      this.scene.preview = this.__clickState.previewBackup;
      this.__clickState = undefined;
    }
  }

  /**
   * What last pointed at the canvas. Touch picks within a larger radius, and long-press
   * stands in for right-click.
   * @type {"mouse" | "touch" | "pen"}
   */
  pointerType = "mouse";

  /**
   * Two fingers down: the zoom and the world point under their midpoint when they landed.
   * @type {{ distance: number, zoom: number, anchor: import("./math.js").Vec3F } | undefined}
   */
  __pinch = undefined;

  /**
   * Advances the simulation by the real time that passed since the previous frame, so it
   * runs at the same speed at any frame rate. Stiff structures need more (smaller)
   * substeps; the substep cap keeps the page responsive and slows the simulation down
   * instead of freezing when exceeded.
   * @param {number} [elapsed] - seconds since the previous frame
   */
  tick(elapsed = SIM_TIME_PER_FRAME) {
    if (this.evalCtx.simulation && this.replay?.seeking) {
      this.__seek();
    } else if (this.evalCtx.simulation) {
      // Substeps don't divide the frame exactly; carry the over/undershoot to the next frame
      // so simulated time doesn't drift from real time.
      const target = Math.min(Math.max(elapsed, 0), MAX_FRAME_TIME) * this.speed + this.__timeCarry;
      let simulated = 0;
      const vehicles = this.vehicles;
      const before = vehicles.map(v => ({ y: v.y, state: v.state }));
      for (let i = 0; i < MAX_SUBSTEPS && simulated < target; i++) simulated += this.__substep();
      this.__emitEffects(before);
      this.effects.step(simulated);
      if (this.follow && !this.__dragState?.moved && !this.__pinch) this.__followTraffic(simulated);
      if (!this.result && this.testFinished) {
        this.result = this.__finishTest();
        this.onResult(this.result);
      }
      // If the substep cap was hit, drop the backlog rather than chase it.
      this.__timeCarry = simulated >= target ? target - simulated : 0;
    }
  }

  /** One physics step of the bridge and the vehicles; returns its length (s). */
  __substep() {
    const vehicles = this.vehicles;
    const loads = vehicles.flatMap(v => v.loads(this.evalCtx, this.scene));
    const dt = this.scene.tick(this.evalCtx, loads);
    for (const vehicle of vehicles) vehicle.update(this.scene, this.evalCtx, dt);
    return dt;
  }

  /**
   * A slow-motion replay of the last failure, from {@link replayFailure} until reset. The
   * physics is deterministic, so re-running the test from the start breaks the same member
   * at the same moment.
   * @type {{ seekTo: number, seeking: boolean, before: { speed: number, follow: boolean, zoom: number, shift: import("./math.js").Vec3F } } | undefined}
   */
  replay = undefined;

  /** Whether the last test failed with a break that {@link replayFailure} can show. */
  get canReplay() {
    return this.result?.kind === "failed" && this.result.failure !== undefined;
  }

  /**
   * Runs the failed test again: fast-forwards (over a few frames, without effects) to
   * {@link REPLAY_LEAD} seconds before the first break, then plays at
   * {@link REPLAY_SPEED} with the view on the member that broke. Reset ends it and puts
   * the speed, the follow camera and the view back.
   * @returns {boolean} whether a replay started
   */
  replayFailure() {
    const failure = this.result?.kind === "failed" ? this.result.failure : undefined;
    if (!failure) return false;
    const prior = this.replay?.before;
    this.reset(); // also puts back a view the follow camera moved
    const before = prior ?? { speed: this.speed, follow: this.follow, zoom: this.ctx.zoom, shift: this.ctx.shift };
    this.setSimulationRunning(true);
    this.follow = false;
    this.speed = REPLAY_SPEED;
    this.replay = { seekTo: Math.max(0, failure.time - REPLAY_LEAD), seeking: true, before };
    this.__lookAt(failure.x, failure.y);
    return true;
  }

  /** Fast-forwards the replay towards its start, for up to {@link SEEK_BUDGET_MS} per frame. */
  __seek() {
    const replay = /** @type {NonNullable<typeof this.replay>} */ (this.replay);
    const deadline = performance.now() + SEEK_BUDGET_MS;
    while (this.evalCtx.time < replay.seekTo && performance.now() < deadline) {
      for (let i = 0; i < 50 && this.evalCtx.time < replay.seekTo; i++) this.__substep();
    }
    this.scene.breaks = [];
    if (this.evalCtx.time >= replay.seekTo) {
      replay.seeking = false;
      this.__timeCarry = 0;
      this.effects.clear();
    }
  }

  /**
   * Centres the view on a world point, zoomed in to show at least {@link REPLAY_VIEW_M}
   * around it (never zooming out).
   * @param {number} x
   * @param {number} y
   */
  __lookAt(x, y) {
    const { top, right, bottom = 0 } = this.viewInsets;
    const visibleWidth = Math.max(100, (this.canvas.width / this.ctx.pixelRatio || 800) - right);
    const zoom = Math.min(MAX_ZOOM, Math.max(this.ctx.zoom, visibleWidth / REPLAY_VIEW_M));
    this.ctx.zoom = zoom;
    this.ctx.shift = createVec3F(x + right / 2 / zoom, y + (top - bottom) / 2 / zoom, 0);
  }

  /**
   * Moves the view towards the traffic still on its way: centred on the convoy, or with a
   * long convoy, on its front part. Vertically it follows the vehicles still on the road.
   * @param {number} dt - simulated time this frame
   */
  __followTraffic(dt) {
    const active = this.vehicles.filter(v => v.state === "waiting" || v.state === "driving" || v.state === "falling");
    const watched = active.length ? active : this.vehicles.filter(v => v.state === "fell");
    if (!watched.length || dt <= 0) return;
    const { top, right, bottom = 0 } = this.viewInsets;
    const zoom = this.ctx.zoom;
    const visible = Math.max(10, (this.canvas.width / this.ctx.pixelRatio || 800) - right) / zoom;
    const xs = watched.map(v => v.x);
    const front = Math.max(...xs), back = Math.min(...xs);
    const centre = Math.max((front + back) / 2, front - 0.35 * visible);
    const goal = { x: centre + right / 2 / zoom, y: this.ctx.shift.y };
    const onRoad = watched.filter(v => v.state === "driving");
    if (onRoad.length) goal.y = onRoad.reduce((sum, v) => sum + v.y, 0) / onRoad.length + 4 + (top - bottom) / 2 / zoom;
    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    const shift = this.ctx.shift;
    this.ctx.shift = createVec3F(shift.x + (goal.x - shift.x) * k, shift.y + (goal.y - shift.y) * k, 0);
    this.__followMoved = true;
  }

  /**
   * Turns what happened this frame into effects: breaks, a truck hitting the water or the
   * ground, a truck reaching the flag.
   * @param {{ y: number, state: string }[]} before - each vehicle at the start of the frame
   */
  __emitEffects(before) {
    for (const link of this.scene.breaks) this.effects.breakLink(link);
    this.scene.breaks = [];
    const water = this.level.water;
    this.vehicles.forEach((v, i) => {
      const was = before[i];
      if (!was) return;
      const ground = this.level.groundAt(v.x);
      const overWater = water !== undefined && (ground === undefined || ground < water);
      if (overWater && was.y > /** @type {number} */ (water) && v.y <= /** @type {number} */ (water)) {
        this.effects.splash(v.x, 1);
      }
      const landed = was.state === "falling" && v.state !== "falling" && v.lostReason !== "fell";
      if (landed && !(overWater && v.y < /** @type {number} */ (water))) this.effects.thud(v.x, v.y, v.lostReason ? 1.4 : 0.8);
      if (was.state !== "crossed" && v.state === "crossed") this.effects.events.push({ type: "crossed" });
    });
  }

  /** @type {Vehicle[] | undefined} */
  __convoyPreviewCache = undefined;

  __convoyPreview() {
    return this.__convoyPreviewCache ??= this.level.createConvoy();
  }
}
