/**
 * What the game keeps in localStorage, and access to it that never throws.
 */

/** Per-level autosave: `${AUTOSAVE_KEY}:${level.id}`. */
export const AUTOSAVE_KEY = "bridge-builder:structure";
export const LEVEL_KEY = "bridge-builder:level";
export const COMPLETED_KEY = "bridge-builder:completed";
/** Best (cheapest) winning cost and stars per level: { [levelId]: { cost, stars } }. */
export const BEST_KEY = "bridge-builder:best";
/** Load tests that ended without a win, per level: { [levelId]: count }. */
export const TRIES_KEY = "bridge-builder:tries";

/**
 * localStorage access that never throws (private mode, blocked storage, quota).
 * @param {string} key
 * @returns {string | null}
 */
export function storageGet(key) {
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
export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}
