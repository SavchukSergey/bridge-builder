/**
 * Fourth layer: mouse, touch, wheel and keyboard. Turns pointer events into the edits,
 * pans and zooms of the layers below.
 */

import { GameEditing } from "./game-editing.mjs";
import { DRAG_THRESHOLD_PX, SPEEDS, LONG_PRESS_MS, MIN_ZOOM, MAX_ZOOM, SNAP_STEP } from "./game-config.mjs";
import { createVec3F, vec3fsub } from "./math.js";
import { CompositeScene } from "./scene.js";

export class GameInput extends GameEditing {
  /** Listens to the canvas and the keyboard; {@link destroy} stops. */
  __attachInput() {
    const canvas = this.canvas;
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
    this.__handlePointerCancel = this.__handlePointerCancel.bind(this);
    canvas.addEventListener("pointercancel", this.__handlePointerCancel);
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
    this.canvas.removeEventListener("pointercancel", this.__handlePointerCancel)
    this.__clearLongPress();
    window.removeEventListener("keydown", this.__handleKeyDown)
  }

  /** Set when the last pointer press was a pan, so the following click is ignored. */
  __suppressClick = false;

  /**
   * 
   * @param {PointerEvent} ev 
   */
  __handleMouseDown(ev) {
    const client = this.__getPointerClient(ev);
    this.pointerType = ev.pointerType === "touch" || ev.pointerType === "pen" ? ev.pointerType : "mouse";
    if (ev.pointerType === "touch") {
      this.__touches.set(ev.pointerId ?? 0, client);
      if (this.__touches.size >= 2) {
        this.__startPinch();
        return;
      }
      this.__hoverClient = client; // the tooltip shows while the finger is down
      if (this.__clickState) {
        // aiming the second end: slide the finger, lift it to place (or just tap)
        this.__placingTouch = { startClient: client, moved: false };
        this.__updatePreview(client, ev.altKey);
        return;
      }
    }
    const clientToGlobal = this.ctx.getClientToGlobalMatrix();
    const startGlobal = clientToGlobal.transformPoint(client);

    // Shift-dragging from empty space draws a selection box.
    if ((ev.button ?? 0) === 0 && ev.shiftKey && this.isBuildMode && !this.__clickState && ev.pointerType !== "touch"
      && !this.scene.findJoint(startGlobal, this.__pickRadius())) {
      this.__box = { startClient: client, client };
      return;
    }

    // Left-dragging a free joint in build mode moves it; any other drag pans.
    let moves;
    if ((ev.button ?? 0) === 0 && this.isBuildMode && !this.__clickState) {
      const joint = this.scene.findJoint(startGlobal, this.__pickRadius());
      if (joint && !joint.fixed) moves = this.__jointMoves(joint);
    }

    this.__dragState = {
      startGlobal,
      startClient: client,
      original: this.ctx.shift,
      clientToGlobal,
      moved: false,
      moves,
    };
    if (ev.pointerType === "touch" && this.isBuildMode) {
      this.__clearLongPress();
      this.__longPressTimer = setTimeout(() => this.__longPress(), LONG_PRESS_MS);
    }
  }

  /**
   * A selection box being drawn (Shift+drag), in client pixels.
   * @type {{ startClient: import("./math.js").Vec3F, client: import("./math.js").Vec3F } | undefined}
   */
  __box = undefined;

  /** Fingers on the canvas: pointer id → client position. @type {Map<number, import("./math.js").Vec3F>} */
  __touches = new Map();

  /** A finger placing the second end of a link. @type {{ startClient: import("./math.js").Vec3F, moved: boolean } | undefined} */
  __placingTouch = undefined;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  __longPressTimer = undefined;

  __clearLongPress() {
    if (this.__longPressTimer !== undefined) clearTimeout(this.__longPressTimer);
    this.__longPressTimer = undefined;
  }

  /** A finger held still: delete the joint or link under it, as right-click would. */
  __longPress() {
    this.__longPressTimer = undefined;
    const drag = this.__dragState;
    if (!drag || drag.moved || !this.isBuildMode) return;
    this.__cancelDrag();
    this.__dragState = undefined;
    this.__suppressClick = true; // the finger lifting is not a tap
    this.__hoverClient = undefined;
    if (this.__deleteAt(drag.startGlobal)) globalThis.navigator?.vibrate?.(15);
  }

  /** The midpoint of the first two fingers and the distance between them. */
  __pinchGeometry() {
    const [a, b] = [...this.__touches.values()];
    return {
      mid: createVec3F((a.x + b.x) / 2, (a.y + b.y) / 2, 0),
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  }

  /** A second finger landed: whatever the first was doing turns into a pinch. */
  __startPinch() {
    this.__clearLongPress();
    this.__cancelDrag();
    this.__dragState = undefined;
    this.__placingTouch = undefined;
    this.__hoverClient = undefined;
    const { mid, distance } = this.__pinchGeometry();
    this.__pinch = { distance, zoom: this.ctx.zoom, anchor: this.ctx.clientToGlobal(mid) };
  }

  /** Zoom by how far the fingers spread, keeping the world point under them in place. */
  __movePinch() {
    const pinch = this.__pinch;
    if (!pinch) return;
    const { mid, distance } = this.__pinchGeometry();
    this.ctx.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * distance / pinch.distance));
    const under = this.ctx.clientToGlobal(mid);
    this.ctx.shift = vec3fsub(this.ctx.shift, vec3fsub(under, pinch.anchor));
  }

  /** A finger lifted or was taken by the browser. */
  __releaseTouch(/** @type {PointerEvent} */ ev) {
    this.__touches.delete(ev.pointerId ?? 0);
    if (!this.__pinch) return false;
    if (this.__touches.size < 2) this.__pinch = undefined;
    // the remaining finger does nothing until it lifts too
    this.__suppressClick = true;
    return true;
  }

  /** @param {PointerEvent} ev */
  __handlePointerCancel(ev) {
    this.__clearLongPress();
    this.__touches.delete(ev.pointerId ?? 0);
    if (this.__touches.size < 2) this.__pinch = undefined;
    this.__placingTouch = undefined;
    this.__cancelDrag();
    this.__dragState = undefined;
    this.__hoverClient = undefined;
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
      if (ev.shiftKey) {
        // Shift+click picks a joint for the selection instead of starting a link
        if (jointA) this.toggleSelected(jointA);
        return;
      }
      if (!jointA) this.clearSelection(); // a click on empty space lets go of the selection
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
      this.__finishLink(globalPoint, !ev.altKey);
    }
  }

  /**
   * 
   * @param {PointerEvent} ev 
   */
  __handleMouseMove(ev) {
    const client = this.__getPointerClient(ev);
    if (ev.pointerType === "touch") {
      if (!this.__touches.has(ev.pointerId ?? 0)) return; // (a finger only moves while down)
      this.__touches.set(ev.pointerId ?? 0, client);
      if (this.__pinch) {
        this.__movePinch();
        return;
      }
    }
    this.__hoverClient = client;
    if (this.__box) {
      this.__box.client = client;
      return;
    }
    const placing = this.__placingTouch;
    if (placing && !placing.moved) {
      const dx = client.x - placing.startClient.x, dy = client.y - placing.startClient.y;
      placing.moved = dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
    }
    if (this.__dragState) {
      if (!this.__dragState.moved) {
        const dx = client.x - this.__dragState.startClient.x;
        const dy = client.y - this.__dragState.startClient.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        this.__dragState.moved = true;
        this.__clearLongPress();
      }
      if (this.__dragState.cancelled) return;
      if (this.__dragState.moves) {
        let target = this.ctx.clientToGlobal(client);
        if (this.snapToGrid && !ev.altKey) {
          target = createVec3F(Math.round(target.x / SNAP_STEP) * SNAP_STEP, Math.round(target.y / SNAP_STEP) * SNAP_STEP, 0);
        }
        this.__dragJoints(this.__dragState.moves, target);
        return;
      }
      if (this.evalCtx.simulation) this.follow = false; // the player takes the view back
      const newGlobal = this.__dragState.clientToGlobal.transformPoint(client);
      const deltaGlobal = vec3fsub(newGlobal, this.__dragState.startGlobal);
      const newPos = vec3fsub(this.__dragState.original, deltaGlobal);
      this.ctx.shift = newPos;
    } else if (this.__clickState) {
      this.__updatePreview(client, ev.altKey);
    }
  }

  /**
   * Right click: cancels the link being built, otherwise deletes the joint or link under the cursor.
   * @param {MouseEvent} ev
   */
  __handleContextMenu(ev) {
    ev.preventDefault();
    // a long press on a touch screen: handled by the long-press timer
    if (this.pointerType === "touch" || /** @type {PointerEvent} */ (ev).pointerType === "touch") return;
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
    this.__deleteAt(this.ctx.clientToGlobal(this.__getPointerClient(ev)));
  }

  /**
   * @param {KeyboardEvent} ev
   */
  __handleKeyDown(ev) {
    const target = /** @type {HTMLElement | null} */ (ev.target);
    if (target?.closest?.("input[type=text], input[type=number], textarea, [contenteditable]")) return;

    if (ev.key === "Escape") {
      if (this.__box) this.__box = undefined;
      else if (this.__cancelDrag()) { /* the drag is undone */ }
      else if (this.__clickState) this.__cancelLink();
      else this.clearSelection();
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (this.isBuildMode && !mod && (ev.key === "Delete" || ev.key === "Backspace") && this.selectionInfo) {
      ev.preventDefault();
      this.deleteSelection();
    } else if (this.isBuildMode && mod && key === "a") {
      ev.preventDefault();
      this.selectAll();
    } else if (this.isBuildMode && mod && key === "c" && this.selectedLinks.length) {
      ev.preventDefault();
      this.copySelection();
    } else if (mod && key === "v" && this.canPaste) {
      ev.preventDefault();
      this.__cancelLink();
      const at = this.__hoverClient ? this.ctx.clientToGlobal(this.__hoverClient) : this.ctx.shift;
      this.pasteAt(at);
    } else if (mod && key === "z" && !ev.shiftKey) {
      ev.preventDefault();
      this.undo();
    } else if (mod && (key === "y" || (key === "z" && ev.shiftKey))) {
      ev.preventDefault();
      this.redo();
    } else if (!mod && !ev.altKey && key === "m") {
      this.mirror = !this.mirror;
    } else if (!mod && !ev.altKey && key === "f") {
      this.follow = !this.follow;
    } else if (!mod && !ev.altKey && (key === "]" || key === "[")) {
      // the next speed up or down, from any speed (the replay's is not one of SPEEDS)
      this.speed = key === "]"
        ? SPEEDS.find(s => s > this.speed) ?? this.speed
        : SPEEDS.findLast(s => s < this.speed) ?? this.speed;
    }
  }

  __handlePointerLeave() {
    if (this.__pinch) return;
    this.__hoverClient = undefined;
  }

  /**
   * 
   * @param {PointerEvent} [ev]
   */
  __handleMouseUp(ev) {
    this.__clearLongPress();
    if (ev?.pointerType === "touch") {
      this.__hoverClient = undefined; // a lifted finger no longer points at anything
      if (this.__releaseTouch(ev)) return;
      const placing = this.__placingTouch;
      this.__placingTouch = undefined;
      if (placing) {
        // slid to aim: place where the finger lifted (a tap places through the click)
        this.__suppressClick = placing.moved;
        if (placing.moved) this.__finishLink(this.ctx.clientToGlobal(this.__getPointerClient(ev)), !ev.altKey);
        return;
      }
    }
    const box = this.__box;
    if (box) {
      this.__box = undefined;
      const dx = box.client.x - box.startClient.x, dy = box.client.y - box.startClient.y;
      this.__suppressClick = true;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        this.selectInRect(this.ctx.clientToGlobal(box.startClient), this.ctx.clientToGlobal(box.client));
      }
      return;
    }
    const drag = this.__dragState;
    this.__suppressClick = drag?.moved ?? false;
    this.__dragState = undefined;
    if (!drag?.moves || !drag.moved || drag.cancelled) return;

    // Put the joints back, then redo the move as an edit, so undo restores where they were.
    const final = drag.moves.map(m => ({ joint: m.joint, position: { ...m.joint.position } }));
    this.__placeJoints(drag.moves.map(m => ({ joint: m.joint, position: m.start })));
    const changed = final.some(({ joint, position }) => position.x !== joint.position.x || position.y !== joint.position.y);
    if (changed) this.__edit(() => this.__placeJoints(final));
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
      this.ctx.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.ctx.zoom * kz));

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
}
