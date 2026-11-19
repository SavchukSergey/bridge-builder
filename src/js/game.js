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

import { GameInput } from "./game-input.mjs";
import { LEVEL_KEY, storageGet } from "./storage.mjs";
import { findLevel, levels } from "./level.mjs";
import { createVec3F } from "./math.js";
import { renderBackground } from "./scenery.mjs";

export { SPEEDS } from "./game-config.mjs";
/** @typedef {import("./game-types.mjs").TestResult} TestResult */
/** @typedef {import("./game-types.mjs").LinkInfo} LinkInfo */
/** @typedef {import("./game-types.mjs").PlacementInfo} PlacementInfo */
/** @typedef {import("./game-types.mjs").BestResult} BestResult */

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
    if (shake > 0.01) {
      // shake the camera for this frame only, without moving the view
      this.ctx.shift = createVec3F(shift.x + (Math.random() - 0.5) * shake, shift.y + (Math.random() - 0.5) * shake, 0);
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
    if (this.isBuildMode) this.scene.grid.render(this.ctx);
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
    this.scene.renderStructure(this.ctx, { stress: this.showStress });
    if (this.isBuildMode) this.__renderMarks();
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

  /** The member that broke first, and the tutorial's next click, both pulsing. */
  __renderMarks() {
    const g = this.ctx.ctx;
    const zoom = this.ctx.zoom;
    const pulse = 0.5 + 0.5 * Math.sin((globalThis.performance?.now() ?? 0) / 220);
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
