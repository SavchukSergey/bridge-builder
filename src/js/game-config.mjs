/**
 * Tuning values for the game: input feel, simulation pacing, link limits.
 */

/** Pointer travel (in screen pixels) after which a press counts as a pan, not a click. */
export const DRAG_THRESHOLD_PX = 4;
/** Default simulated seconds per frame when the caller does not pass the elapsed time. */
export const SIM_TIME_PER_FRAME = 1 / 60;
/**
 * Longest stretch of real time simulated in one frame. Longer gaps (a background tab,
 * a breakpoint) are dropped instead of being caught up in one huge frame.
 */
export const MAX_FRAME_TIME = 0.1;
export const MAX_SUBSTEPS = 1000;
/** Simulation speeds the player can pick: simulated seconds per real second. */
export const SPEEDS = [0.5, 1, 2, 4];
/** How quickly the follow camera catches up with the traffic, per (simulated) second. */
export const FOLLOW_RATE = 2.5;
/** Hit radius (in screen pixels) for snapping to joints and picking links. */
export const PICK_RADIUS_PX = 12;
/** A fingertip covers more than a mouse pointer: pick within this radius on touch. */
export const TOUCH_PICK_RADIUS_PX = 24;
/** Holding a finger still this long deletes what is under it (the touch right-click). */
export const LONG_PRESS_MS = 500;
/** View zoom limits, pixels per metre. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 80;
/** Grid step (in metres) that new joints snap to. */
export const SNAP_STEP = 1;
/** Longest single link (m); longer ones are split into segments when built. */
export const MAX_LINK_LENGTH = 10;
/** Shortest link (m): zero-length links would divide by zero in strain. */
export const MIN_LINK_LENGTH = 0.1;
/** Joints closer than this (m) count as the same point when matching mirror images. */
export const MIRROR_EPS = 1e-3;
export const MAX_UNDO = 100;
