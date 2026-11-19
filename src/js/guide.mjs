// "Build it with me": a level's reference bridge, one piece at a time.
//
// The plan is a list of steps: pieces of the level's starting bridge to take away (when it has
// one, as Canyon does), then the reference bridge's pieces to build, road first and from left
// to right, each one starting from a dot that's already there. Where the player has got to is
// worked out from the scene every time, so building out of order, undoing or reloading never
// confuses it.

import { MAX_LINK_LENGTH } from "./game-config.mjs";

/** Dots this close are the same dot. */
const SAME = 0.01;

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ kind: "build" | "remove", a: Point, b: Point, material: string }} GuideStep
 *   a build step's `a` is the end that is there before it (the one to click first)
 * @typedef {{ a: Point, b: Point, material: string }} Piece
 */

/** @param {Point} p @param {Point} q */
export const samePoint = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < SAME;

/** @param {Piece} p @param {Point} a @param {Point} b */
const joins = (p, a, b) => (samePoint(p.a, a) && samePoint(p.b, b)) || (samePoint(p.a, b) && samePoint(p.b, a));

/**
 * The pieces of a saved structure, by position. A piece longer than the editor builds in one
 * go is split the way the editor splits it, so the steps are pieces the player can place.
 * @param {import("./scene.js").SavedStructure} structure
 * @returns {Piece[]}
 */
export function piecesOf(structure) {
  /** @type {Piece[]} */
  const pieces = [];
  for (const { a, b, material } of structure.links) {
    const pa = { x: structure.joints[a].x, y: structure.joints[a].y };
    const pb = { x: structure.joints[b].x, y: structure.joints[b].y };
    const parts = Math.max(1, Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y) / MAX_LINK_LENGTH));
    for (let i = 0; i < parts; i++) {
      const at = (/** @type {number} */ k) => ({ x: pa.x + (pb.x - pa.x) * k / parts, y: pa.y + (pb.y - pa.y) * k / parts });
      pieces.push({ a: at(i), b: at(i + 1), material });
    }
  }
  return pieces;
}

/**
 * The steps from a level's starting structure to its reference bridge.
 * @param {import("./scene.js").SavedStructure} reference
 * @param {import("./scene.js").SavedStructure} start
 * @param {(material: string) => boolean} isDeck
 * @returns {GuideStep[]}
 */
export function planGuide(reference, start, isDeck) {
  const want = piecesOf(reference);
  const have = piecesOf(start);
  const kept = (/** @type {Piece} */ p) => want.some(w => joins(w, p.a, p.b) && w.material === p.material);

  /** @type {GuideStep[]} */
  const steps = have.filter(p => !kept(p)).map(p => ({ kind: "remove", ...p }));

  // what's there to build from: the anchors, and the starting pieces that stay
  /** @type {Point[]} */
  const known = start.joints.filter(j => j.fixed).map(j => ({ x: j.x, y: j.y }));
  for (const p of have.filter(kept)) known.push(p.a, p.b);
  const isKnown = (/** @type {Point} */ p) => known.some(k => samePoint(k, p));

  const todo = want.filter(w => !have.some(h => joins(h, w.a, w.b) && h.material === w.material));
  while (todo.length) {
    const reachable = todo.filter(p => isKnown(p.a) || isKnown(p.b));
    const pool = reachable.length ? reachable : todo; // nothing joins on: start anywhere
    pool.sort((p, q) =>
      Number(isDeck(q.material)) - Number(isDeck(p.material)) // the road first
      || Math.min(p.a.x, p.b.x) - Math.min(q.a.x, q.b.x) // then from left to right
      || Math.min(p.a.y, p.b.y) - Math.min(q.a.y, q.b.y)); // and from the bottom up
    const next = pool[0];
    todo.splice(todo.indexOf(next), 1);
    // start from the end that's there; on a level road, from the left
    const flip = isKnown(next.a) ? false : isKnown(next.b);
    const step = flip ? { kind: /** @type {const} */ ("build"), a: next.b, b: next.a, material: next.material }
      : { kind: /** @type {const} */ ("build"), a: next.a, b: next.b, material: next.material };
    steps.push(step);
    known.push(step.a, step.b);
  }
  return steps;
}

/**
 * Where the player is: the first step not yet done (a build step whose first end isn't there
 * yet waits for one that can be started), how many are done, and, if the next piece is there
 * but made of the wrong material, which one.
 * @param {readonly GuideStep[]} steps
 * @param {readonly Piece[]} pieces the scene's pieces now
 * @param {readonly Point[]} dots the scene's dots now
 * @returns {{ step?: GuideStep, done: number, total: number, wrong?: string }}
 */
export function guideProgress(steps, pieces, dots) {
  const isDone = (/** @type {GuideStep} */ s) => s.kind === "remove"
    ? !pieces.some(p => joins(p, s.a, s.b))
    : pieces.some(p => joins(p, s.a, s.b) && p.material === s.material);
  const open = steps.filter(s => !isDone(s));
  const there = (/** @type {Point} */ p) => dots.some(d => samePoint(d, p));
  /** @type {GuideStep | undefined} */
  let step = open.find(s => s.kind === "remove") ?? open.find(s => there(s.a) || there(s.b)) ?? open[0];
  if (step?.kind === "build" && !there(step.a) && there(step.b)) step = { ...step, a: step.b, b: step.a };
  const wrong = step?.kind === "build" ? pieces.find(p => joins(p, step.a, step.b))?.material : undefined;
  return { step, done: steps.length - open.length, total: steps.length, wrong };
}
