/**
 * Third layer: changing the bridge. Building links (split into segments, snapped, joined
 * to joints nearby), mirror images, dragging joints, deleting, and what is under the
 * pointer.
 */

import { GameLevels } from "./game-levels.mjs";
import { PICK_RADIUS_PX, TOUCH_PICK_RADIUS_PX, SNAP_STEP, MAX_LINK_LENGTH, MIN_LINK_LENGTH, MIRROR_EPS } from "./game-config.mjs";
import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { materials } from "./materials/index.mjs";
import { steel } from "./materials/steel.mjs";
import { createVec3F, vec3fadd, vec3flen, vec3fmul, vec3fsub } from "./math.js";
/** @typedef {import("./game-types.mjs").PlacementInfo} PlacementInfo */
/** @typedef {import("./game-types.mjs").LinkInfo} LinkInfo */
/** @typedef {import("./game-types.mjs").JointMove} JointMove */

export class GameEditing extends GameLevels {
  /**
   * What the readout next to the pointer shows while a link is being placed: what a click
   * would add (including its mirror image), and the budget left after it.
   * @returns {PlacementInfo | undefined}
   */
  get placementInfo() {
    if (!this.__clickState || !this.__hoverClient) return undefined;
    const { links } = this.__clickState.preview;
    if (!links.length) return undefined;
    let length = 0, cost = 0;
    for (const link of links) {
      length += link.length;
      cost += link.length * link.material.costPerMeter;
    }
    return {
      client: this.__hoverClient,
      label: links[0].material.label,
      length: this.mirror ? length / 2 : length,
      mirrored: this.mirror,
      cost,
      remaining: this.level.budget - this.cost - cost,
    };
  }

  /**
   * The joints that move together when `joint` is dragged.
   * @param {Joint} joint
   * @returns {JointMove[]}
   */
  __jointMoves(joint) {
    const moves = [{ joint, start: { ...joint.position }, map: (/** @type {import("./math.js").Vec3F} */ t) => t }];
    // a selected joint takes the rest of the selection along (mirror mode aside)
    const group = this.selectedJoints.filter(j => !j.fixed);
    if (group.length > 1 && group.includes(joint)) {
      const from = { ...joint.position };
      return group.map(j => {
        const start = { ...j.position };
        return { joint: j, start, map: (/** @type {import("./math.js").Vec3F} */ t) => createVec3F(start.x + t.x - from.x, start.y + t.y - from.y, 0) };
      });
    }
    if (!this.mirror) return moves;
    const image = this.__mirrorJoint(joint);
    if (image === joint) {
      const axis = this.level.mirrorAxis;
      moves[0].map = (t) => createVec3F(axis, t.y, 0);
    } else if (image && !image.fixed) {
      moves.push({ joint: image, start: { ...image.position }, map: (t) => this.__mirrorPoint(t) });
    }
    return moves;
  }

  /**
   * Drags the grabbed joint(s) towards `target`, if every attached link stays between the
   * minimum and maximum length and no joint lands on another; otherwise they stay put.
   * @param {JointMove[]} moves
   * @param {import("./math.js").Vec3F} target
   */
  __dragJoints(moves, target) {
    const placed = moves.map(m => ({ joint: m.joint, position: m.map(target) }));
    const moving = new Set(moves.map(m => m.joint));
    const at = (/** @type {Joint} */ j) => placed.find(p => p.joint === j)?.position ?? j.position;
    const startAt = (/** @type {Joint} */ j) => moves.find(m => m.joint === j)?.start ?? j.position;
    for (const { joint, position } of placed) {
      for (const other of this.scene.joints) {
        if (!moving.has(other) && vec3flen(vec3fsub(other.position, position)) < MIN_LINK_LENGTH) return;
      }
      // a joint and its mirror image meeting on the axis
      for (const p of placed) {
        if (p.joint !== joint && vec3flen(vec3fsub(p.position, position)) < MIN_LINK_LENGTH) return;
      }
    }
    for (const link of this.scene.links) {
      if (!moving.has(link.a) && !moving.has(link.b)) continue;
      const length = vec3flen(vec3fsub(at(link.b), at(link.a)));
      // a link that was already longer than the maximum (e.g. in an example bridge) may
      // shorten, but not grow further
      const limit = Math.max(MAX_LINK_LENGTH, vec3flen(vec3fsub(startAt(link.b), startAt(link.a))));
      if (length < MIN_LINK_LENGTH || length > limit + 1e-9) return;
    }
    this.__placeJoints(placed);
  }

  /**
   * Moves joints, giving the links attached to them their new lengths.
   * @param {{ joint: Joint, position: import("./math.js").Vec3F }[]} placed
   */
  __placeJoints(placed) {
    for (const { joint, position } of placed) {
      joint.position.x = position.x;
      joint.position.y = position.y;
    }
    const moved = new Set(placed.map(p => p.joint));
    for (const link of this.scene.links) {
      if (!moved.has(link.a) && !moved.has(link.b)) continue;
      link.length = vec3flen(vec3fsub(link.b.position, link.a.position));
      link.preEval();
    }
    this.scene.distributeMass();
  }

  /**
   * Places the link being built, ending at `globalPoint`.
   * @param {import("./math.js").Vec3F} globalPoint
   * @param {boolean} allowSnap
   */
  __finishLink(globalPoint, allowSnap) {
    if (!this.__clickState) return;
    {
      const material = this.__getCurrentMaterial();
      const path = this.__buildLink(this.__clickState.jointA, globalPoint, material, allowSnap);
      const start = this.__clickState.jointA;
      this.__cancelLink();

      // An empty path means the second click landed on the start joint: treat it as cancel.
      if (path.links.length) {
        this.__edit(() => {
          this.scene.joints.push(...path.joints);
          this.scene.links.push(...path.links);
          if (this.mirror) {
            // built after the original is in the scene, so it joins up with its joints
            const image = this.__mirrorPath(start, path, material);
            this.scene.joints.push(...image.joints);
            this.scene.links.push(...image.links);
          }
          this.scene.distributeMass();
        });
      }
    }
  }

  /**
   * Shows the link that a click at `client` would place.
   * @param {import("./math.js").Vec3F} client
   * @param {boolean} [altKey]
   */
  __updatePreview(client, altKey = false) {
    if (this.__clickState) {
      const material = this.__getCurrentMaterial();
      const path = this.__buildLink(this.__clickState.jointA, this.ctx.clientToGlobal(client), material, !altKey);
      const image = this.mirror && path.links.length
        ? this.__mirrorPath(this.__clickState.jointA, path, material)
        : { joints: [], links: [] };
      this.__clickState.preview.joints = [...path.joints, ...image.joints];
      this.__clickState.preview.links = [...path.links, ...image.links];
      this.__clickState.preview.distributeMass();
    }
  }

  /**
   * @param {Joint} jointA
   * @param {import("./math.js").Vec3F} globalB
   * @param {import("./materials/material.mjs").Material} material
   * @param {boolean} [allowSnap] - snap a new end joint to the grid if snapping is enabled
   * @param {number} [joinRadius] - an existing joint this close to globalB is used as the end
   * @returns {{ joints: Joint[], links: Link[] }}
   */
  __buildLink(jointA, globalB, material, allowSnap = true, joinRadius = this.__pickRadius()) {
    /**
     * @type {Joint[]}
     */
    const joints = [];
    /** @type {Link[]} */
    const links = [];

    // Existing joints near the cursor win over grid snapping.
    let jointB = this.scene.findJoint(globalB, joinRadius);
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
    const minLinkLength = MIN_LINK_LENGTH;
    if (jointB === jointA || dist < minLinkLength) {
      return { joints, links };
    }
    if (!this.scene.joints.includes(jointB)) {
      joints.push(jointB);
    }

    const maxSegLength = MAX_LINK_LENGTH;
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
   * @param {import("./math.js").Vec3F} p
   * @returns {import("./math.js").Vec3F}
   */
  __mirrorPoint(p) {
    return createVec3F(2 * this.level.mirrorAxis - p.x, p.y, 0);
  }

  /**
   * The joint at the mirror image of `joint` (itself if it is on the axis), if there is one.
   * @param {Joint} joint
   */
  __mirrorJoint(joint) {
    return this.scene.findJoint(this.__mirrorPoint(joint.position), MIRROR_EPS);
  }

  /**
   * The mirror image of a path from `start`: new joints and links to add. Empty if the path
   * is its own mirror image (it crosses or lies on the axis symmetrically).
   * @param {Joint} start
   * @param {{ joints: Joint[], links: Link[] }} path
   * @param {import("./materials/material.mjs").Material} material
   * @returns {{ joints: Joint[], links: Link[] }}
   */
  __mirrorPath(start, path, material) {
    const end = /** @type {Link} */ (path.links.at(-1)).b;
    const ma = this.__mirrorPoint(start.position), mb = this.__mirrorPoint(end.position);
    const same = (/** @type {import("./math.js").Vec3F} */ p, /** @type {import("./math.js").Vec3F} */ q) =>
      vec3flen(vec3fsub(p, q)) < MIRROR_EPS;
    if ((same(ma, end.position) && same(mb, start.position)) || (same(ma, start.position) && same(mb, end.position))) {
      return { joints: [], links: [] };
    }
    const existing = this.scene.findJoint(ma, MIRROR_EPS);
    const imageStart = existing ?? new Joint(ma);
    const image = this.__buildLink(imageStart, mb, material, false, MIRROR_EPS);
    if (!image.links.length) return { joints: [], links: [] };
    return { joints: existing ? image.joints : [imageStart, ...image.joints], links: image.links };
  }

  /**
   * Deletes the joint under `globalPoint` (with its links), or else the link there; with
   * mirror on, their mirror images too.
   * @param {import("./math.js").Vec3F} globalPoint
   * @returns {boolean} whether something was deleted
   */
  __deleteAt(globalPoint) {
    const radius = this.__pickRadius();
    const joint = this.scene.findJoint(globalPoint, radius);
    const before = this.scene.links.length + this.scene.joints.length;
    if (joint) {
      // Fixed anchors are not removable; don't fall through to deleting a link attached to one.
      this.__edit(() => {
        const image = this.mirror ? this.__mirrorJoint(joint) : undefined;
        const removed = this.scene.removeJoint(joint);
        // (the image may already be gone, as an orphan of the first removal)
        if (removed && image && image !== joint && this.scene.joints.includes(image)) this.scene.removeJoint(image);
        return removed;
      });
      return this.scene.links.length + this.scene.joints.length < before;
    }
    const link = this.scene.findLink(globalPoint, radius);
    if (link) this.__edit(() => {
      let image;
      if (this.mirror) {
        const ia = this.__mirrorJoint(link.a), ib = this.__mirrorJoint(link.b);
        image = this.scene.links.find(l => l !== link && ((l.a === ia && l.b === ib) || (l.a === ib && l.b === ia)));
      }
      const removed = this.scene.removeLink(link);
      if (image && this.scene.links.includes(image)) this.scene.removeLink(image);
      return removed;
    });
    return this.scene.links.length + this.scene.joints.length < before;
  }

  /**
   * Joints picked with a box or Shift+click. Anchors can be picked too, so the links between
   * them count as selected; only free joints move or are deleted.
   * @type {Set<Joint>}
   */
  __selection = new Set();

  /**
   * Copied members, relative to the middle of what was copied.
   * @type {{ joints: { x: number, y: number }[], links: { a: number, b: number, material: string }[] } | undefined}
   */
  __clipboard = undefined;

  /** The selected joints still in the structure (undo and loads replace the joints). */
  get selectedJoints() {
    const joints = new Set(this.scene.joints);
    for (const j of this.__selection) if (!joints.has(j)) this.__selection.delete(j);
    return [...this.__selection];
  }

  /** Links with both ends selected. */
  get selectedLinks() {
    const picked = new Set(this.selectedJoints);
    return this.scene.links.filter(l => picked.has(l.a) && picked.has(l.b));
  }

  /** What is selected, for the status line: undefined when nothing is. */
  get selectionInfo() {
    if (!this.isBuildMode) return undefined;
    const joints = this.selectedJoints.filter(j => !j.fixed).length;
    const links = this.selectedLinks.length;
    return joints || links ? { joints, links } : undefined;
  }

  clearSelection() {
    this.__selection.clear();
  }

  /**
   * Adds every joint inside the rectangle between two world points to the selection.
   * @param {import("./math.js").Vec3F} a
   * @param {import("./math.js").Vec3F} b
   */
  selectInRect(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (const j of this.scene.joints) {
      const { x, y } = j.position;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.__selection.add(j);
    }
  }

  /** @param {Joint} joint */
  toggleSelected(joint) {
    if (this.__selection.has(joint)) this.__selection.delete(joint);
    else this.__selection.add(joint);
  }

  selectAll() {
    for (const j of this.scene.joints) this.__selection.add(j);
  }

  /**
   * Deletes the selected free joints (with their links) and the links between selected
   * anchors, as one undoable step.
   * @returns {boolean} whether anything was deleted
   */
  deleteSelection() {
    if (!this.isBuildMode) return false;
    const links = this.selectedLinks;
    const joints = this.selectedJoints.filter(j => !j.fixed);
    if (!links.length && !joints.length) return false;
    this.__edit(() => {
      for (const link of links) if (this.scene.links.includes(link)) this.scene.removeLink(link);
      for (const joint of joints) if (this.scene.joints.includes(joint)) this.scene.removeJoint(joint);
    });
    this.clearSelection();
    return true;
  }

  /** Copies the selected links (and their joints). @returns {boolean} whether anything was copied */
  copySelection() {
    const links = this.selectedLinks;
    if (!links.length) return false;
    const joints = [...new Set(links.flatMap(l => [l.a, l.b]))];
    const xs = joints.map(j => j.position.x), ys = joints.map(j => j.position.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.__clipboard = {
      joints: joints.map(j => ({ x: j.position.x - cx, y: j.position.y - cy })),
      links: links.map(l => ({ a: joints.indexOf(l.a), b: joints.indexOf(l.b), material: l.material.name })),
    };
    return true;
  }

  /** Whether {@link pasteAt} has something to paste. */
  get canPaste() {
    return this.isBuildMode && this.__clipboard !== undefined;
  }

  /**
   * Pastes the copied members centred near `globalPoint`, moved by whole grid steps so a
   * copy of a gridded bridge stays on the grid. A pasted joint that lands on an existing
   * one (an anchor, say) joins it. The paste becomes the selection, ready to drag.
   * @param {import("./math.js").Vec3F} globalPoint
   * @returns {boolean} whether anything was added
   */
  pasteAt(globalPoint) {
    const clip = this.__clipboard;
    if (!clip || !this.isBuildMode) return false;
    const step = this.snapToGrid ? SNAP_STEP : 1e-9;
    const dx = Math.round(globalPoint.x / step) * step, dy = Math.round(globalPoint.y / step) * step;
    /** @type {Joint[]} */
    const placed = [];
    let added = false;
    this.__edit(() => {
      for (const { x, y } of clip.joints) {
        const position = createVec3F(x + dx, y + dy, 0);
        let joint = this.scene.findJoint(position, MIRROR_EPS);
        if (!joint) {
          joint = new Joint(position);
          this.scene.joints.push(joint);
        }
        placed.push(joint);
      }
      for (const { a, b, material } of clip.links) {
        const ja = placed[a], jb = placed[b];
        if (ja === jb || this.scene.hasLink(ja, jb)) continue;
        const link = new Link(ja, jb, Object.hasOwn(materials, material) ? materials[material] : steel);
        link.preEval();
        this.scene.links.push(link);
        added = true;
      }
      // joints added for links that all existed already would be left dangling
      const used = new Set(this.scene.links.flatMap(l => [l.a, l.b]));
      this.scene.content.joints = this.scene.joints.filter(j => j.fixed || used.has(j));
      this.scene.distributeMass();
      return added;
    });
    if (added) {
      this.__selection = new Set(placed.filter(j => this.scene.joints.includes(j)));
    }
    return added;
  }

  /**
   * Last pointer position over the canvas (client pixels), or undefined once it left.
   * @type {import("./math.js").Vec3F | undefined}
   */
  __hoverClient = undefined;

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
    return (this.pointerType === "mouse" ? PICK_RADIUS_PX : TOUCH_PICK_RADIUS_PX) / this.ctx.zoom;
  }

  /** Esc while dragging a joint: put it back. */
  __cancelDrag() {
    const drag = this.__dragState;
    if (!drag?.moves || drag.cancelled) return false;
    this.__placeJoints(drag.moves.map(m => ({ joint: m.joint, position: m.start })));
    drag.cancelled = true;
    return true;
  }

  /**
   * The free joint under the pointer that a drag would move (or the one being dragged).
   * @returns {Joint | undefined}
   */
  get hoveredJoint() {
    if (this.__dragState?.moves) return this.__dragState.cancelled ? undefined : this.__dragState.moves[0].joint;
    if (!this.__hoverClient || !this.isBuildMode || this.__clickState) return undefined;
    const joint = this.scene.findJoint(this.ctx.clientToGlobal(this.__hoverClient), this.__pickRadius());
    return joint && !joint.fixed ? joint : undefined;
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
