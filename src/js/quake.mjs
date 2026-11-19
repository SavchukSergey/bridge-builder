// Earthquakes, for sandbox levels: a few seconds into the test the ground shakes, side to
// side and up and down. The physics runs in the ground's own frame: there the sideways
// shaking feels like a push on every piece by its own weight, back and forth, and the up and
// down like gravity, and so every load, growing and shrinking. The view shakes along.
// A bridge built right at its limit breaks when everything suddenly weighs more.

/** @typedef {"none" | "small" | "big"} QuakeId */

/** @type {QuakeId[]} */
export const QUAKES = ["none", "small", "big"];

/** The ground's strongest shove, m/s² (a big one is about a third of gravity). */
export const QUAKE_ACCEL = { none: 0, small: 0.8, big: 3 };

/** How far the view shakes at the strongest, m. */
const SWAY = { none: 0, small: 0.12, big: 0.35 };

/** When it starts and how long it lasts, s. */
export const QUAKE_START = 4;
export const QUAKE_LENGTH = 9;

/** Shaking each second, Hz: a main sway and a quicker jolt, and the bounce up and down. */
const SLOW = 1.3, FAST = 2.9, BOUNCE = 2.1;

/** The up and down shove, as a share of the sideways one. */
const UP_DOWN = 0.6;

/**
 * How strong the shaking is, 0 to 1: it rumbles up, holds, then dies away.
 * @param {number} t - seconds since the test started
 */
export function quakeEnvelope(t) {
  const s = (t - QUAKE_START) / QUAKE_LENGTH;
  if (s <= 0 || s >= 1) return 0;
  return s < 0.2 ? s / 0.2 : s > 0.6 ? (1 - s) / 0.4 : 1;
}

/**
 * The ground's shove now, m/s² (positive to the right). The same every run, so replays
 * break the same way.
 * @param {QuakeId | undefined} quake @param {number} t
 */
export function quakeAt(quake, t) {
  const a = quake ? QUAKE_ACCEL[quake] ?? 0 : 0;
  if (!a) return 0;
  const w = 2 * Math.PI;
  return a * quakeEnvelope(t) * (0.75 * Math.sin(w * SLOW * t) + 0.25 * Math.sin(w * FAST * t + 1));
}

/**
 * What the up and down shaking adds to gravity now, m/s² (below zero, everything weighs
 * more): it weighs on vehicles as well as the bridge.
 * @param {QuakeId | undefined} quake @param {number} t
 */
export function quakeUpAt(quake, t) {
  const a = quake ? QUAKE_ACCEL[quake] ?? 0 : 0;
  return a ? -a * UP_DOWN * quakeEnvelope(t) * Math.sin(2 * Math.PI * BOUNCE * t + 0.5) : 0;
}

/**
 * How far the ground is to the side now, m, for drawing.
 * @param {QuakeId | undefined} quake @param {number} t
 */
export function quakeShift(quake, t) {
  const d = quake ? SWAY[quake] ?? 0 : 0;
  return d ? d * quakeEnvelope(t) * Math.sin(2 * Math.PI * SLOW * t) : 0;
}

/**
 * In the shaking ground's frame, every free joint feels its own weight pushed the other way.
 * @param {import("./engine/joint.mjs").Joint[]} joints
 * @param {number} accel - from {@link quakeAt}
 */
export function applyQuake(joints, accel) {
  for (const joint of joints) {
    if (!joint.fixed) joint.force.x -= joint.mass * accel;
  }
}
