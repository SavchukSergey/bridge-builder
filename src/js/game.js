import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { EvalCtx } from "./eval-ctx.mjs";
import { materials } from "./materials/index.mjs";
import { steel } from "./materials/steel.mjs";
import { createVec3F, vec3fadd, vec3flen, vec3fmul, vec3fsub } from "./math.js";
import { RenderCtx } from "./render-ctx.mjs";
import { CompositeScene, Scene } from "./scene.js";

// @ts-check

/** Pointer travel (in screen pixels) after which a press counts as a pan, not a click. */
const DRAG_THRESHOLD_PX = 4;
/** Simulated seconds per rendered frame (real time at 60 fps). */
const SIM_TIME_PER_FRAME = 1 / 60;
const MAX_SUBSTEPS = 400;
/** Hit radius (in screen pixels) for snapping to joints and picking links. */
const PICK_RADIUS_PX = 12;
/** Grid step (in metres) that new joints snap to. */
const SNAP_STEP = 1;
const MAX_UNDO = 100;
const AUTOSAVE_KEY = "bridge-builder:structure";

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
    this.__loadAutosave();

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
    window.addEventListener("keydown", this.__handleKeyDown);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.__handleMouseDown)
    this.canvas.removeEventListener("pointermove", this.__handleMouseMove)
    this.canvas.removeEventListener("pointerup", this.__handleMouseUp)
    this.canvas.removeEventListener("wheel", this.__handleWheel)
    this.canvas.removeEventListener("click", this.__handleClick)
    this.canvas.removeEventListener("contextmenu", this.__handleContextMenu)
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

  /** Called after every change to the built structure (edit, undo, load). */
  onChange = () => { };

  /** @type {import("./scene.js").SavedStructure[]} */
  __undoStack = [];
  /** @type {import("./scene.js").SavedStructure[]} */
  __redoStack = [];

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
    }
    this.evalCtx.simulation = running;
  }

  /** Stops the simulation and restores the structure as it was built. */
  reset() {
    this.evalCtx.simulation = false;
    if (this.__snapshot) {
      this.scene.restore(this.__snapshot);
      this.__snapshot = undefined;
    }
    this.evalCtx.time = 0;
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
   * The structure as built (pre-simulation positions), as plain JSON.
   * @returns {import("./scene.js").SavedStructure}
   */
  exportStructure() {
    return this.scene.serialize(this.__snapshot);
  }

  /**
   * Replaces the structure (undoable). Resets any running simulation first.
   * @param {unknown} data
   * @throws {Error} if data is not a valid structure; the scene is left unchanged
   */
  importStructure(data) {
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.load(data));
  }

  /** Replaces the structure with the built-in demo bridge (undoable). */
  loadDefault() {
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.loadDefault());
  }

  __saveAutosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.scene.serialize(this.__snapshot)));
    } catch {
      // storage unavailable (private mode, quota, blocked): autosave is best effort
    }
  }

  __loadAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) this.scene.load(JSON.parse(raw));
    } catch (err) {
      console.warn("Ignoring unreadable autosave:", err);
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
    this.scene.render(this.ctx);
  }

  tick() {
    if (this.evalCtx.simulation) {
      // Advance a fixed amount of simulated time per frame; stiff structures need
      // more (smaller) substeps. The cap keeps the page responsive and slows the
      // simulation down instead of freezing when the budget is exceeded.
      let simulated = 0;
      for (let i = 0; i < MAX_SUBSTEPS && simulated < SIM_TIME_PER_FRAME; i++) {
        simulated += this.scene.tick(this.evalCtx);
      }
    }
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