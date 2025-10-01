import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { EvalCtx } from "./eval-ctx.mjs";
import { cable } from "./materials/cable.mjs";
import { createVec3F, vec3fadd, vec3flen, vec3fmul, vec3fsub } from "./math.js";
import { RenderCtx } from "./render-ctx.mjs";
import { Scene } from "./scene.js";

// @ts-check

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

    this.__handleMouseDown = this.__handleMouseDown.bind(this);
    this.__handleMouseMove = this.__handleMouseMove.bind(this);
    this.__handleMouseUp = this.__handleMouseUp.bind(this);
    this.__handleWheel = this.__handleWheel.bind(this);
    this.__handleClick = this.__handleClick.bind(this);

    canvas.addEventListener("pointerdown", this.__handleMouseDown);
    canvas.addEventListener("pointermove", this.__handleMouseMove);
    canvas.addEventListener("pointerup", this.__handleMouseUp);
    canvas.addEventListener("wheel", this.__handleWheel);
    canvas.addEventListener("click", this.__handleClick);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.__handleMouseDown)
    this.canvas.removeEventListener("pointermove", this.__handleMouseMove)
    this.canvas.removeEventListener("pointerup", this.__handleMouseUp)
    this.canvas.removeEventListener("wheel", this.__handleWheel)
    this.canvas.removeEventListener("click", this.__handleClick)
  }

  /**
   * @type {DragState | undefined}
   */
  __dragState = undefined;

  /**
 * @type {ClickState | undefined}
 */
  __clickState = undefined;

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
      clientToGlobal
    };
  }

  /**
 * 
 * @param {PointerEvent} ev 
 */
  __handleClick(ev) {
    const client = this.__getPointerClient(ev);
    const globalPoint = this.ctx.clientToGlobal(client);

    if (!this.__clickState) {
      const jointA = this.scene.findJoint(globalPoint, 2);
      if (jointA) {
        this.__clickState = {
          startGlobal: globalPoint,
          startClient: client,
          jointA: jointA
        };
      }
    } else {
      const jointA = this.__clickState.jointA;
      let jointB = this.scene.findJoint(globalPoint, 2);
      if (!jointB) {
        jointB = new Joint(globalPoint);
        this.scene.joints.push(jointB);
      }

      const dir = vec3fsub(jointB.position, jointA.position);
      const dist = vec3flen(dir);

      const maxSegLength = 5;

      const partsCount = Math.ceil(dist / maxSegLength);

      const segLength = dist / partsCount;

      const material = cable;

      let jointWalker = jointA;
      const dirN = vec3fmul(dir, 1 / dist);
      for (let i = 1; i < partsCount; i++) {
        const point = vec3fadd(jointA.position, vec3fmul(dirN, segLength * i));
        const midJoint = new Joint(point);
        this.scene.joints.push(midJoint);
        this.scene.links.push(new Link(jointWalker, midJoint, material));
        jointWalker = midJoint;
      }
      this.scene.links.push(new Link(jointWalker, jointB, material));
      this.__clickState = undefined;

      this.scene.distributeMass();
    }
  }

  /**
   * 
   * @param {PointerEvent} ev 
   */
  __handleMouseMove(ev) {
    if (this.__dragState) {
      const newClient = this.__getPointerClient(ev);
      const newGlobal = this.__dragState.clientToGlobal.transformPoint(newClient);
      const deltaGlobal = vec3fsub(newGlobal, this.__dragState.startGlobal);
      const newPos = vec3fsub(this.__dragState.original, deltaGlobal);
      this.ctx.shift = newPos;
    }
  }

  /**
   * 
   * @param {PointerEvent} _ev 
   */
  __handleMouseUp(_ev) {
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
   * @param {PointerEvent|WheelEvent} ev 
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
      for (let i = 0; i < 50; i++) {
        this.scene.tick(this.evalCtx);
      }
    }
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
 */

/**
 * @typedef {Object} ClickState
 * @property {import("./math.js").Vec3F} startGlobal 
 * @property {import("./math.js").Vec3F} startClient 
 * @property {Joint} jointA
 */