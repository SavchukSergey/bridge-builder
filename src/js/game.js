/**
 * The game: a level, the bridge built on it, and the load test, drawn on a canvas.
 *
 * Built up in layers, each a subclass of the one before:
 * - game-core.mjs: shared state, options, view, progress, the load test
 * - game-levels.mjs: levels, undo and redo, saving, import and export
 * - game-editing.mjs: building, mirroring, dragging and deleting
 * - game-input.mjs: mouse, touch, wheel and keyboard
 * - game.js (this): wiring it up, and drawing
 */

import { renderWind } from "./wind.mjs";
import { quakeShift } from "./quake.mjs";
import { GameInput } from "./game-input.mjs";
import { LEVEL_KEY, storageGet } from "./storage.mjs";
import { findLevel, levels } from "./level.mjs";
import { createVec3F } from "./math.js";
import { renderBackground } from "./scenery.mjs";
import { Boat, renderClearance } from "./drawbridge.mjs";
import { materials } from "./materials/index.mjs";

export { SPEEDS } from "./game-config.mjs";
/** @typedef {import("./game-types.mjs").TestResult} TestResult */
/** @typedef {import("./game-types.mjs").LinkInfo} LinkInfo */
/** @typedef {import("./game-types.mjs").PlacementInfo} PlacementInfo */
/** @typedef {import("./game-types.mjs").BestResult} BestResult */

/** The system asks for less motion: the marks on the canvas glow steadily instead of pulsing. */
const REDUCED_MOTION = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");

export class Game extends GameInput {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    super(canvas);
    // the last level played, unless it has since become locked (e.g. new levels were added)
    const saved = findLevel(storageGet(LEVEL_KEY));
    this.selectLevel(saved && this.isUnlocked(saved.id) ? saved.id : levels[0].id);
    this.__attachInput();
  }

  render() {
    const shift = this.ctx.shift;
    const shake = this.screenShake ? this.effects.shake : 0;
    // an earthquake moves the ground, and everything on it, from side to side
    const quake = this.evalCtx.simulation ? quakeShift(this.level.quake, this.evalCtx.time) : 0;
    if (shake > 0.01 || quake) {
      // shake the camera for this frame only, without moving the view
      this.ctx.shift = createVec3F(shift.x - quake + (Math.random() - 0.5) * shake, shift.y + (Math.random() - 0.5) * shake, 0);
    }
    try {
      this.__render();
    } finally {
      this.ctx.shift = shift;
    }
  }

  __render() {
    this.ctx.width = this.canvas.width / this.ctx.pixelRatio;
    this.ctx.height = this.canvas.height / this.ctx.pixelRatio;
    this.ctx.clear();
    renderBackground(this.ctx, this.level.startY, this.level.theme);
    this.level.render(this.ctx);
    renderWind(this.ctx, this.level.wind, (typeof performance === "object" ? performance.now() : 0) / 1000);
    if (this.isBuildMode) this.scene.grid.render(this.ctx);
    if (this.isBuildMode && this.showOutline) this.__renderOutline();
    if (this.isBuildMode && this.mirror) {
      const g = this.ctx.ctx;
      const x = this.level.mirrorAxis;
      const top = this.ctx.clientToGlobal({ x: 0, y: 0, z: 0 }).y;
      const bottom = this.ctx.clientToGlobal({ x: 0, y: this.ctx.height, z: 0 }).y;
      g.save();
      g.setLineDash([8 / this.ctx.zoom, 6 / this.ctx.zoom]);
      g.strokeStyle = "rgba(242, 178, 51, 0.9)";
      g.lineWidth = 2 / this.ctx.zoom;
      g.beginPath();
      g.moveTo(x, bottom);
      g.lineTo(x, top);
      g.stroke();
      g.restore();
    }
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
    // a drawbridge: the space the boat needs, until it is through, and the boat
    const draw = this.level.drawbridge;
    const water = this.level.water ?? 0;
    const boat = draw && (this.boat ?? new Boat(draw, water));
    if (draw && boat && (boat.state === "waiting" || boat.state === "sailing")) renderClearance(this.ctx, draw, water);
    if (boat) boat.render(this.ctx, this.evalCtx.time);
    if (this.isBuildMode) this.__renderSelection("under");
    this.scene.renderStructure(this.ctx, { stress: this.showStress, paint: this.paint });
    if (this.isBuildMode) {
      this.__renderSelection("over");
      this.__renderMarks();
      this.__renderKeyCursor();
    }
    const grab = this.hoveredJoint;
    if (grab) {
      const g = this.ctx.ctx;
      g.beginPath();
      g.arc(grab.position.x, grab.position.y, 9 / this.ctx.zoom, 0, 2 * Math.PI);
      g.strokeStyle = "rgba(255, 214, 64, 0.95)";
      g.lineWidth = 2.5 / this.ctx.zoom;
      g.stroke();
    }
    if (this.canvas.style) {
      this.canvas.style.cursor = this.__dragState?.moves && this.__dragState.moved ? "grabbing"
        : grab ? "grab"
          : this.__clickState ? "crosshair" : "";
    }
    // Before the first run, show the convoy lined up at the start.
    this.effects.renderDebris(this.ctx);
    for (const vehicle of this.vehicles.length ? this.vehicles : this.__convoyPreview()) {
      vehicle.render(this.ctx, { lights: this.level.theme.dark > 0 });
    }
    this.level.renderFront(this.ctx);
    this.effects.renderParticles(this.ctx);

    const { dark } = this.level.theme;
    if (dark > 0) {
      // night: darken everything drawn so far, then let the headlights shine through
      const g = this.ctx.ctx;
      g.save();
      this.ctx.screenSpace();
      g.fillStyle = `rgba(4, 10, 28, ${dark})`;
      g.fillRect(0, 0, this.ctx.width, this.ctx.height);
      g.restore();
      for (const vehicle of this.vehicles.length ? this.vehicles : this.__convoyPreview()) {
        vehicle.renderLights(this.ctx);
      }
    }
  }

  /**
   * The hint's outline: the reference bridge, dashed, under the player's own. Decks are drawn
   * wider than beams and cables, as in the game.
   */
  __renderOutline() {
    const outline = this.outline;
    if (!outline) return;
    const { joints, links } = outline.structure;
    const g = this.ctx.ctx;
    const zoom = this.ctx.zoom;
    g.save();
    g.lineCap = "round";
    for (const pass of ["shadow", "line"]) {
      g.setLineDash(pass === "line" ? [7 / zoom, 5 / zoom] : []);
      for (const { a, b, material } of links) {
        const deck = materials[material]?.look.kind === "deck";
        g.beginPath();
        g.moveTo(joints[a].x, joints[a].y);
        g.lineTo(joints[b].x, joints[b].y);
        g.lineWidth = ((deck ? 7 : 3.5) + (pass === "shadow" ? 3 : 0)) / zoom;
        g.strokeStyle = pass === "shadow" ? "rgba(10, 20, 35, 0.35)" : "rgba(130, 225, 255, 0.85)";
        g.stroke();
      }
    }
    g.setLineDash([]);
    g.fillStyle = "rgba(130, 225, 255, 0.95)";
    for (const j of joints) {
      if (j.fixed) continue;
      g.beginPath();
      g.arc(j.x, j.y, 3.5 / zoom, 0, 2 * Math.PI);
      g.fill();
    }
    g.restore();
  }

  /**
   * The selection: a halo under the selected links, rings over the selected joints, and
   * the box being drawn.
   * @param {"under" | "over"} pass
   */
  __renderSelection(pass) {
    const g = this.ctx.ctx;
    const zoom = this.ctx.zoom;
    const colour = "rgba(120, 200, 255, 0.9)";
    if (pass === "under") {
      const links = this.selectedLinks;
      if (!links.length) return;
      g.save();
      g.lineCap = "round";
      g.strokeStyle = "rgba(120, 200, 255, 0.55)";
      for (const link of links) {
        g.beginPath();
        g.moveTo(link.a.position.x, link.a.position.y);
        g.lineTo(link.b.position.x, link.b.position.y);
        g.lineWidth = link.drawnWidth(zoom) * (link.material.look.kind === "deck" ? 2 : 1) + 8 / zoom;
        g.stroke();
      }
      g.restore();
      return;
    }
    const joints = this.selectedJoints;
    const box = this.__box;
    if (!joints.length && !box) return;
    g.save();
    g.strokeStyle = colour;
    g.lineWidth = 2 / zoom;
    for (const joint of joints) {
      g.beginPath();
      g.arc(joint.position.x, joint.position.y, 7 / zoom, 0, 2 * Math.PI);
      g.stroke();
    }
    if (box) {
      const a = this.ctx.clientToGlobal(box.startClient), b = this.ctx.clientToGlobal(box.client);
      g.setLineDash([5 / zoom, 4 / zoom]);
      g.fillStyle = "rgba(120, 200, 255, 0.1)";
      g.beginPath();
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.fill();
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }

  /** The keyboard cursor: a crosshair on its grid point, filled while carrying a joint. */
  __renderKeyCursor() {
    const p = this.keyCursor;
    if (!p) return;
    const g = this.ctx.ctx;
    const zoom = this.ctx.zoom;
    const r = 9 / zoom, arm = 15 / zoom;
    g.save();
    g.strokeStyle = "rgba(242, 178, 51, 0.95)";
    g.lineWidth = 2.5 / zoom;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 2 * Math.PI);
    g.moveTo(p.x - arm, p.y);
    g.lineTo(p.x - r, p.y);
    g.moveTo(p.x + r, p.y);
    g.lineTo(p.x + arm, p.y);
    g.moveTo(p.x, p.y - arm);
    g.lineTo(p.x, p.y - r);
    g.moveTo(p.x, p.y + r);
    g.lineTo(p.x, p.y + arm);
    g.stroke();
    if (this.__keyGrab) {
      g.fillStyle = "rgba(242, 178, 51, 0.35)";
      g.beginPath();
      g.arc(p.x, p.y, r, 0, 2 * Math.PI);
      g.fill();
    }
    g.restore();
  }

  /** The member that broke first, and the tutorial's next click, both pulsing. */
  __renderMarks() {
    const g = this.ctx.ctx;
    const zoom = this.ctx.zoom;
    // (steady when the system asks for reduced motion)
    const pulse = REDUCED_MOTION?.matches ? 0.6 : 0.5 + 0.5 * Math.sin((globalThis.performance?.now() ?? 0) / 220);
    const idle = this.idleLink;
    if (idle && this.scene.links.includes(idle)) {
      // the piece that hardly worked in the last win: a place to save money
      g.save();
      g.beginPath();
      g.moveTo(idle.a.position.x, idle.a.position.y);
      g.lineTo(idle.b.position.x, idle.b.position.y);
      g.strokeStyle = `rgba(90, 200, 120, ${0.4 + 0.4 * pulse})`;
      g.lineCap = "round";
      g.setLineDash([6 / zoom, 5 / zoom]);
      g.lineWidth = idle.drawnWidth(zoom) + (6 + 4 * pulse) / zoom;
      g.stroke();
      g.restore();
    }
    const failed = this.failedLink;
    if (failed && this.scene.links.includes(failed)) {
      g.save();
      g.beginPath();
      g.moveTo(failed.a.position.x, failed.a.position.y);
      g.lineTo(failed.b.position.x, failed.b.position.y);
      g.strokeStyle = `rgba(255, 90, 70, ${0.45 + 0.4 * pulse})`;
      g.lineCap = "round";
      g.setLineDash([6 / zoom, 5 / zoom]);
      g.lineWidth = failed.drawnWidth(zoom) + (6 + 4 * pulse) / zoom;
      g.stroke();
      g.restore();
    }
    const guide = this.isBuildMode ? this.guideStep : undefined;
    if (guide) {
      // the piece to build next, or to take away, glowing
      const remove = guide.kind === "remove";
      g.save();
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(guide.a.x, guide.a.y);
      g.lineTo(guide.b.x, guide.b.y);
      g.strokeStyle = remove ? `rgba(255, 90, 70, ${0.5 + 0.4 * pulse})` : `rgba(242, 178, 51, ${0.55 + 0.35 * pulse})`;
      g.lineWidth = (7 + 4 * pulse) / zoom;
      if (remove) g.setLineDash([6 / zoom, 5 / zoom]);
      g.stroke();
      g.setLineDash([]);
      if (!remove) {
        g.fillStyle = "rgba(242, 178, 51, 0.95)";
        for (const p of [guide.a, guide.b]) {
          g.beginPath();
          g.arc(p.x, p.y, 5 / zoom, 0, 2 * Math.PI);
          g.fill();
        }
      }
      g.restore();
    }
    const target = this.tutorialTarget;
    if (target) {
      g.save();
      g.beginPath();
      g.arc(target.x, target.y, (12 + 8 * pulse) / zoom, 0, 2 * Math.PI);
      g.strokeStyle = `rgba(242, 178, 51, ${0.5 + 0.5 * (1 - pulse)})`;
      g.lineWidth = 3 / zoom;
      g.stroke();
      g.restore();
    }
  }
}
