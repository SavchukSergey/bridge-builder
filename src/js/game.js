import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { EvalCtx } from "./eval-ctx.mjs";
import { findLevel, levels } from "./level.mjs";
import { materials } from "./materials/index.mjs";
import { steel } from "./materials/steel.mjs";
import { createVec3F, vec3fadd, vec3flen, vec3fmul, vec3fsub } from "./math.js";
import { RenderCtx } from "./render-ctx.mjs";
import { renderBackground } from "./scenery.mjs";
import { CompositeScene, Scene } from "./scene.js";
/** @typedef {import("./vehicle.mjs").Vehicle} Vehicle */

// @ts-check

/** Pointer travel (in screen pixels) after which a press counts as a pan, not a click. */
const DRAG_THRESHOLD_PX = 4;
/** Default simulated seconds per frame when the caller does not pass the elapsed time. */
const SIM_TIME_PER_FRAME = 1 / 60;
/**
 * Longest stretch of real time simulated in one frame. Longer gaps (a background tab,
 * a breakpoint) are dropped instead of being caught up in one huge frame.
 */
const MAX_FRAME_TIME = 0.1;
const MAX_SUBSTEPS = 1000;
/** Hit radius (in screen pixels) for snapping to joints and picking links. */
const PICK_RADIUS_PX = 12;
/** Grid step (in metres) that new joints snap to. */
const SNAP_STEP = 1;
const MAX_UNDO = 100;
/** Per-level autosave: `${AUTOSAVE_KEY}:${level.id}`. */
const AUTOSAVE_KEY = "bridge-builder:structure";
const LEVEL_KEY = "bridge-builder:level";
const COMPLETED_KEY = "bridge-builder:completed";

export class Game {

  /**
   * 
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
    this.selectLevel(storageGet(LEVEL_KEY) ?? levels[0].id);

    this.__handleMouseDown = this.__handleMouseDown.bind(this);
    this.__handleMouseMove = this.__handleMouseMove.bind(this);
    this.__handleMouseUp = this.__handleMouseUp.bind(this);
    this.__handleWheel = this.__handleWheel.bind(this);
    this.__handleClick = this.__handleClick.bind(this);
    this.__handleContextMenu = this.__handleContextMenu.bind(this);
    this.__handleKeyDown = this.__handleKeyDown.bind(this);

    canvas.addEventListener("pointerdown", this.__handleMouseDown);
    canvas.addEventListener("pointermove", this.__handleMouseMove);
    canvas.addEventListener("pointerup", this.__handleMouseUp);
    canvas.addEventListener("wheel", this.__handleWheel);
    canvas.addEventListener("click", this.__handleClick);
    canvas.addEventListener("contextmenu", this.__handleContextMenu);
    this.__handlePointerLeave = this.__handlePointerLeave.bind(this);
    canvas.addEventListener("pointerleave", this.__handlePointerLeave);
    window.addEventListener("keydown", this.__handleKeyDown);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.__handleMouseDown)
    this.canvas.removeEventListener("pointermove", this.__handleMouseMove)
    this.canvas.removeEventListener("pointerup", this.__handleMouseUp)
    this.canvas.removeEventListener("wheel", this.__handleWheel)
    this.canvas.removeEventListener("click", this.__handleClick)
    this.canvas.removeEventListener("contextmenu", this.__handleContextMenu)
    this.canvas.removeEventListener("pointerleave", this.__handlePointerLeave)
    window.removeEventListener("keydown", this.__handleKeyDown)
  }

  /**
   * @type {DragState | undefined}
   */
  __dragState = undefined;

  /**
 * @type {ClickState | undefined}
 */
  __clickState = undefined;

  /** Whether new joints snap to the {@link SNAP_STEP} grid (hold Alt to place freely). */
  snapToGrid = true;

  /** Colour members by their load instead of drawing their material. */
  showStress = false;

  /** Called after every change to the built structure (edit, undo, load). */
  onChange = () => { };

  /** @type {import("./scene.js").SavedStructure[]} */
  __undoStack = [];
  /** @type {import("./scene.js").SavedStructure[]} */
  __redoStack = [];

  /** Simulated-minus-real time left over from the previous frame (see {@link tick}). */
  __timeCarry = 0;

  /** Set when the last pointer press was a pan, so the following click is ignored. */
  __suppressClick = false;

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
      this.__snapshot = this.scene.snapshot();
      this.vehicles = this.level.createConvoy();
    }
    this.evalCtx.simulation = running;
  }

  /** Stops the simulation and restores the structure as it was built. */
  reset() {
    this.evalCtx.simulation = false;
    this.__timeCarry = 0;
    if (this.__snapshot) {
      this.scene.restore(this.__snapshot);
      this.__snapshot = undefined;
    }
    this.vehicles = [];
    this.evalCtx.time = 0;
  }

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

  get canUndo() {
    return this.isBuildMode && this.__undoStack.length > 0;
  }

  get canRedo() {
    return this.isBuildMode && this.__redoStack.length > 0;
  }

  undo() {
    this.__stepHistory(this.__undoStack, this.__redoStack);
  }

  redo() {
    this.__stepHistory(this.__redoStack, this.__undoStack);
  }

  /**
   * @param {import("./scene.js").SavedStructure[]} from
   * @param {import("./scene.js").SavedStructure[]} to
   */
  __stepHistory(from, to) {
    if (!this.isBuildMode) return;
    const state = from.pop();
    if (!state) return;
    this.__cancelLink();
    to.push(this.scene.serialize());
    this.scene.load(state);
    this.__afterChange();
  }

  /**
   * Applies a change to the built structure as one undoable step.
   * @param {() => boolean | void} change - return false if nothing changed
   */
  __edit(change) {
    const before = this.scene.serialize();
    if (change() === false) return;
    this.__undoStack.push(before);
    if (this.__undoStack.length > MAX_UNDO) this.__undoStack.shift();
    this.__redoStack = [];
    this.__afterChange();
  }

  __afterChange() {
    this.__saveAutosave();
    this.onChange();
  }

  /**
   * Switches to a level: stops any simulation, clears undo history, and loads that level's
   * autosaved structure (or its starting structure). Unknown ids fall back to the first level.
   * @param {string} id
   */
  selectLevel(id) {
    this.reset();
    this.__cancelLink();
    this.level = findLevel(id) ?? levels[0];
    this.__undoStack = [];
    this.__redoStack = [];
    this.__convoyPreviewCache = undefined;
    if (!this.__loadAutosave()) {
      this.scene.load(this.level.initialStructure());
    }
    storageSet(LEVEL_KEY, this.level.id);
    this.fitView();
    this.onChange();
  }

  /**
   * Screen pixels covered by UI panels drawn over the canvas, so {@link fitView} centres
   * the level in the part of the canvas that is actually visible.
   */
  viewInsets = { top: 0, right: 0 };

  /** Centres and zooms the view on the current level, inside {@link viewInsets}. */
  fitView() {
    const { x0, x1, y } = this.level.view;
    const { top, right } = this.viewInsets;
    const visibleWidth = Math.max(100, (this.canvas.width || 800) - right);
    const zoom = Math.max(1, visibleWidth / (x1 - x0));
    this.ctx.zoom = zoom;
    // The visible area's centre is offset from the canvas centre by half of each inset.
    this.ctx.shift = createVec3F((x0 + x1) / 2 + right / 2 / zoom, y + top / 2 / zoom, 0);
  }

  /** Whether the level has been won within budget (ever, on this browser). */
  isCompleted(id = this.level.id) {
    return this.__completed().includes(id);
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
    this.onChange();
  }

  /**
   * The structure as built (pre-simulation positions), as plain JSON, tagged with the level.
   * @returns {import("./scene.js").SavedStructure}
   */
  exportStructure() {
    return { ...this.scene.serialize(this.__snapshot), level: this.level.id };
  }

  /**
   * Replaces the structure (undoable). Resets any running simulation first. A structure
   * exported from another level switches to that level first.
   * @param {unknown} data
   * @throws {Error} if data is not a valid structure; the scene is left unchanged
   */
  importStructure(data) {
    const levelId = /** @type {any} */ (data)?.level;
    const target = findLevel(levelId);
    if (target && target !== this.level) {
      // Validate before switching, so a bad file doesn't change the level either.
      new Scene().load(data);
      this.selectLevel(target.id);
    }
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.load(data));
  }

  /** Starts the current level over from its starting structure (undoable). */
  restartLevel() {
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.load(this.level.initialStructure()));
  }

  get __autosaveKey() {
    return `${AUTOSAVE_KEY}:${this.level.id}`;
  }

  __saveAutosave() {
    storageSet(this.__autosaveKey, JSON.stringify(this.scene.serialize(this.__snapshot)));
  }

  /** @returns {boolean} whether a saved structure was loaded */
  __loadAutosave() {
    const raw = storageGet(this.__autosaveKey);
    if (!raw) return false;
    try {
      this.scene.load(JSON.parse(raw));
      return true;
    } catch (err) {
      console.warn("Ignoring unreadable autosave:", err);
      return false;
    }
  }

  __cancelLink() {
    if (this.__clickState) {
      this.scene.preview = this.__clickState.previewBackup;
      this.__clickState = undefined;
    }
  }

  /**
   * 
   * @param {PointerEvent} ev 
   */
  __handleMouseDown(ev) {
    const client = this.__getPointerClient(ev);
    const clientToGlobal = this.ctx.getClientToGlobalMatrix();

    this.__dragState = {
      startGlobal: clientToGlobal.transformPoint(client),
      startClient: client,
      original: this.ctx.shift,
      clientToGlobal,
      moved: false
    };
  }

  /**
 * 
 * @param {PointerEvent} ev 
 */
  __handleClick(ev) {
    if (this.__suppressClick) {
      this.__suppressClick = false;
      return;
    }
    if (!this.isBuildMode) {
      return;
    }
    const client = this.__getPointerClient(ev);
    const globalPoint = this.ctx.clientToGlobal(client);

    if (!this.__clickState) {
      const jointA = this.scene.findJoint(globalPoint, this.__pickRadius());
      if (jointA) {
        const preview = new CompositeScene();
        this.__clickState = {
          startGlobal: globalPoint,
          startClient: client,
          jointA: jointA,
          preview: preview,
          previewBackup: this.scene.preview
        };
        this.scene.preview = preview;
      }
    } else {
      const material = this.__getCurrentMaterial();
      const path = this.__buildLink(this.__clickState.jointA, globalPoint, material, !ev.altKey);
      this.__cancelLink();

      // An empty path means the second click landed on the start joint: treat it as cancel.
      if (path.links.length) {
        this.__edit(() => {
          this.scene.joints.push(...path.joints);
          this.scene.links.push(...path.links);
          this.scene.distributeMass();
        });
      }
    }
  }

  /**
   * 
   * @param {PointerEvent} ev 
   */
  __handleMouseMove(ev) {
    const client = this.__getPointerClient(ev);
    this.__hoverClient = client;
    if (this.__dragState) {
      if (!this.__dragState.moved) {
        const dx = client.x - this.__dragState.startClient.x;
        const dy = client.y - this.__dragState.startClient.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        this.__dragState.moved = true;
      }
      const newGlobal = this.__dragState.clientToGlobal.transformPoint(client);
      const deltaGlobal = vec3fsub(newGlobal, this.__dragState.startGlobal);
      const newPos = vec3fsub(this.__dragState.original, deltaGlobal);
      this.ctx.shift = newPos;
    } else if (this.__clickState) {
      const material = this.__getCurrentMaterial();
      const path = this.__buildLink(this.__clickState.jointA, this.ctx.clientToGlobal(client), material, !ev.altKey);
      this.__clickState.preview.joints = path.joints;
      this.__clickState.preview.links = path.links;
      this.__clickState.preview.distributeMass();
    }
  }

  /**
   * @param {Joint} jointA
   * @param {import("./math.js").Vec3F} globalB
   * @param {import("./materials/material.mjs").Material} material
   * @param {boolean} [allowSnap] - snap a new end joint to the grid if snapping is enabled
   */
  __buildLink(jointA, globalB, material, allowSnap = true) {
    /**
     * @type {Joint[]}
     */
    const joints = [];
    const links = [];

    // Existing joints near the cursor win over grid snapping.
    let jointB = this.scene.findJoint(globalB, this.__pickRadius());
    if (!jointB && allowSnap && this.snapToGrid) {
      const snapped = createVec3F(
        Math.round(globalB.x / SNAP_STEP) * SNAP_STEP,
        Math.round(globalB.y / SNAP_STEP) * SNAP_STEP,
        0,
      );
      jointB = this.scene.findJoint(snapped, 1e-6) ?? new Joint(snapped);
    }
    if (!jointB) {
      jointB = new Joint(globalB);
    }

    const dir = vec3fsub(jointB.position, jointA.position);
    const dist = vec3flen(dir);

    // Zero-length links would divide by zero in strain and poison the simulation with NaN.
    const minLinkLength = 0.1;
    if (jointB === jointA || dist < minLinkLength) {
      return { joints, links };
    }
    if (!this.scene.joints.includes(jointB)) {
      joints.push(jointB);
    }

    const maxSegLength = 10;
    const partsCount = Math.ceil(dist / maxSegLength);

    // A single-segment link between two existing joints may already exist.
    if (partsCount === 1 && this.scene.hasLink(jointA, jointB)) {
      return { joints: [], links };
    }

    const segLength = dist / partsCount;

    let jointWalker = jointA;
    const dirN = vec3fmul(dir, 1 / dist);
    for (let i = 1; i < partsCount; i++) {
      const point = vec3fadd(jointA.position, vec3fmul(dirN, segLength * i));
      const midJoint = new Joint(point);
      joints.push(midJoint);
      const midLink = new Link(jointWalker, midJoint, material);
      midLink.preEval();
      links.push(midLink);
      jointWalker = midJoint;
    }
    const finalLink = new Link(jointWalker, jointB, material);
    finalLink.preEval();
    links.push(finalLink);

    return {
      joints,
      links
    };
  }

  /**
   * Right click: cancels the link being built, otherwise deletes the joint or link under the cursor.
   * @param {MouseEvent} ev
   */
  __handleContextMenu(ev) {
    ev.preventDefault();
    if (this.__suppressClick) {
      // released after a right-button pan
      this.__suppressClick = false;
      return;
    }
    if (!this.isBuildMode) return;
    if (this.__clickState) {
      this.__cancelLink();
      return;
    }
    const globalPoint = this.ctx.clientToGlobal(this.__getPointerClient(ev));
    const radius = this.__pickRadius();
    const joint = this.scene.findJoint(globalPoint, radius);
    if (joint) {
      // Fixed anchors are not removable; don't fall through to deleting a link attached to one.
      this.__edit(() => this.scene.removeJoint(joint));
      return;
    }
    const link = this.scene.findLink(globalPoint, radius);
    if (link) this.__edit(() => this.scene.removeLink(link));
  }

  /**
   * @param {KeyboardEvent} ev
   */
  __handleKeyDown(ev) {
    const target = /** @type {HTMLElement | null} */ (ev.target);
    if (target?.closest?.("input[type=text], input[type=number], textarea, [contenteditable]")) return;

    if (ev.key === "Escape") {
      this.__cancelLink();
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (mod && key === "z" && !ev.shiftKey) {
      ev.preventDefault();
      this.undo();
    } else if (mod && (key === "y" || (key === "z" && ev.shiftKey))) {
      ev.preventDefault();
      this.redo();
    }
  }

  /**
   * Last pointer position over the canvas (client pixels), or undefined once it left.
   * @type {import("./math.js").Vec3F | undefined}
   */
  __hoverClient = undefined;

  __handlePointerLeave() {
    this.__hoverClient = undefined;
  }

  /**
   * The unbroken link under the pointer, unless the pointer is busy panning or placing a link.
   * Looked up on demand so it follows links as they move during a simulation.
   * @returns {import("./engine/link.mjs").Link | undefined}
   */
  get hoveredLink() {
    if (!this.__hoverClient || this.__clickState || this.__dragState?.moved) return undefined;
    return this.scene.findLink(this.ctx.clientToGlobal(this.__hoverClient), this.__pickRadius());
  }

  /**
   * What the stress tooltip shows for the hovered link.
   * @returns {LinkInfo | undefined}
   */
  get hoverInfo() {
    const link = this.hoveredLink;
    if (!link || !this.__hoverClient) return undefined;
    const force = link.stressForce;
    /** @type {LinkInfo["state"]} */
    let state = "unloaded";
    if (force > 0) state = "tension";
    else if (force < 0) state = "compression";
    else if (link.strain < 0) state = "slack"; // a cable pushed shorter than its length
    return {
      client: this.__hoverClient,
      material: link.material.name,
      label: link.material.label,
      length: link.length,
      cost: link.length * link.material.costPerMeter,
      state,
      forceKN: Math.abs(force) / 1000,
      utilization: link.utilization,
      peakUtilization: this.isBuildMode ? undefined : link.peakUtilization,
    };
  }

  /** Pick radius in world units, constant on screen regardless of zoom. */
  __pickRadius() {
    return PICK_RADIUS_PX / this.ctx.zoom;
  }

  /**
   * 
   * @param {PointerEvent} _ev 
   */
  __handleMouseUp(_ev) {
    this.__suppressClick = this.__dragState?.moved ?? false;
    this.__dragState = undefined;
  }

  /**
   * 
   * @param {WheelEvent} ev 
   */
  __handleWheel(ev) {
    if (ev.ctrlKey && ev.deltaY) {
      const client = this.__getPointerClient(ev);
      const oldGlobalPoint = this.ctx.clientToGlobal(client);

      const kz = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.ctx.zoom *= kz;

      const newGlobalPoint = this.ctx.clientToGlobal(client);

      const delta = vec3fsub(newGlobalPoint, oldGlobalPoint);
      this.ctx.shift = vec3fsub(this.ctx.shift, delta);

      ev.preventDefault();
    } else {
      if (ev.shiftKey) {
        this.ctx.shift.x += ev.deltaY / this.ctx.zoom;
      } else {
        this.ctx.shift.y -= ev.deltaY / this.ctx.zoom;
      }
    }
  }

  /**
   * 
   * @param {MouseEvent} ev 
   * @returns {import("./math.js").Vec3F}
   */
  __getPointerClient(ev) {
    const parentRect = this.canvas.getBoundingClientRect();

    return createVec3F(ev.clientX - parentRect.x, ev.clientY - parentRect.y, 0);
  }

  /**
   * 
   * @param {PointerEvent} ev 
   * @returns {import("./math.js").Vec3F}
   */
  __getPointerGlobal(ev) {
    const client = this.__getPointerClient(ev);
    return this.ctx.clientToGlobal(client);
  }

  render() {
    this.ctx.width = this.canvas.width;
    this.ctx.height = this.canvas.height;
    this.ctx.clear();
    renderBackground(this.ctx, this.level.startY);
    this.level.render(this.ctx);
    if (this.isBuildMode) this.scene.grid.render(this.ctx);
    const hovered = this.hoveredLink;
    if (hovered) {
      // halo under the hovered link
      const g = this.ctx.ctx;
      g.beginPath();
      g.moveTo(hovered.a.position.x, hovered.a.position.y);
      g.lineTo(hovered.b.position.x, hovered.b.position.y);
      g.strokeStyle = "rgba(255, 214, 64, 0.85)";
      g.lineCap = "round";
      g.lineWidth = hovered.drawnWidth(this.ctx.zoom) * (hovered.material.look.kind === "deck" ? 2 : 1) + 8 / this.ctx.zoom;
      g.stroke();
    }
    this.scene.renderStructure(this.ctx, { stress: this.showStress });
    // Before the first run, show the convoy lined up at the start.
    for (const vehicle of this.vehicles.length ? this.vehicles : this.__convoyPreview()) {
      vehicle.render(this.ctx);
    }
  }

  /**
   * Advances the simulation by the real time that passed since the previous frame, so it
   * runs at the same speed at any frame rate. Stiff structures need more (smaller)
   * substeps; the substep cap keeps the page responsive and slows the simulation down
   * instead of freezing when exceeded.
   * @param {number} [elapsed] - seconds since the previous frame
   */
  tick(elapsed = SIM_TIME_PER_FRAME) {
    if (this.evalCtx.simulation) {
      // Substeps don't divide the frame exactly; carry the over/undershoot to the next frame
      // so simulated time doesn't drift from real time.
      const target = Math.min(Math.max(elapsed, 0), MAX_FRAME_TIME) + this.__timeCarry;
      let simulated = 0;
      const vehicles = this.vehicles;
      for (let i = 0; i < MAX_SUBSTEPS && simulated < target; i++) {
        const loads = vehicles.flatMap(v => v.loads(this.evalCtx));
        const dt = this.scene.tick(this.evalCtx, loads);
        for (const vehicle of vehicles) vehicle.update(this.scene, this.evalCtx, dt);
        simulated += dt;
      }
      if (this.testState === "crossed" && !this.overBudget) this.__markCompleted();
      // If the substep cap was hit, drop the backlog rather than chase it.
      this.__timeCarry = simulated >= target ? target - simulated : 0;
    }
  }

  /** @type {Vehicle[] | undefined} */
  __convoyPreviewCache = undefined;

  __convoyPreview() {
    return this.__convoyPreviewCache ??= this.level.createConvoy();
  }

  __getCurrentMaterial() {
    /**
     * @type {HTMLInputElement | null}
     */
    const node = document.querySelector("input[name=material]:checked");
    const value = node?.value || "steel";
    return Object.hasOwn(materials, value) ? materials[value] : steel;
  }
}

/**
 * @typedef {DragState | ClickState | undefined} InteractionState
 */

/**
 * @typedef {Object} LinkInfo
 * @property {import("./math.js").Vec3F} client - pointer position, client pixels
 * @property {string} material - material id
 * @property {string} label - material name to show
 * @property {number} length - rest length, m
 * @property {number} cost
 * @property {"tension" | "compression" | "slack" | "unloaded"} state
 * @property {number} forceKN - magnitude of the axial force
 * @property {number} utilization - fraction of the material's strength in use now
 * @property {number | undefined} peakUtilization - highest since the simulation started
 */

/**
 * @typedef {Object} DragState
 * @property {import("./math.js").Vec3F} startGlobal 
 * @property {import("./math.js").Vec3F} startClient 
 * @property {import("./math.js").Vec3F} original 
 * @property {DOMMatrix} clientToGlobal 
 * @property {boolean} moved - pointer travelled past DRAG_THRESHOLD_PX
 */

/**
 * @typedef {Object} ClickState
 * @property {import("./math.js").Vec3F} startGlobal 
 * @property {import("./math.js").Vec3F} startClient 
 * @property {Joint} jointA
 * @property {CompositeScene} preview
 * @property {CompositeScene} previewBackup
 */

/**
 * localStorage access that never throws (private mode, blocked storage, quota).
 * @param {string} key
 * @returns {string | null}
 */
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}
