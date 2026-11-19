// Paint and name your bridge: a name and a paint colour for the steel and wood, kept for
// each level on this browser.

import { storageGet, storageSet } from "./storage.mjs";

export const LOOKS_KEY = "bridge-builder:looks";

/** Longest name, in characters. */
export const NAME_MAX = 30;

/**
 * Paints for the beams (steel, light steel and wood): the main colour and the lighter
 * centre line. Plain is the materials' own colours.
 * @type {Record<string, { color: string, highlight: string } | undefined>}
 */
export const PAINTS = {
  plain: undefined,
  red: { color: "#b8382c", highlight: "#e0705f" },
  blue: { color: "#2f63a8", highlight: "#6b98d8" },
  green: { color: "#2d7d50", highlight: "#62b386" },
  yellow: { color: "#d39a16", highlight: "#f2c86a" },
  purple: { color: "#6f45a3", highlight: "#a684d2" },
};

/** @typedef {{ name: string, paint: string }} Looks */

/** @returns {Record<string, Looks>} */
function allLooks() {
  try {
    const all = JSON.parse(storageGet(LOOKS_KEY) ?? "{}");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

/**
 * The name and paint of a level's bridge, tidied: a name of at most {@link NAME_MAX}
 * characters, and a paint from {@link PAINTS} (plain otherwise).
 * @param {string} levelId
 * @returns {Looks}
 */
export function loadLooks(levelId) {
  const looks = allLooks()[levelId];
  return tidy(looks?.name, looks?.paint);
}

/**
 * @param {string} levelId
 * @param {Partial<Looks>} looks
 * @returns {Looks} what was kept
 */
export function saveLooks(levelId, looks) {
  const now = { ...loadLooks(levelId), ...looks };
  const kept = tidy(now.name, now.paint);
  const all = allLooks();
  if (!kept.name && kept.paint === "plain") delete all[levelId];
  else all[levelId] = kept;
  storageSet(LOOKS_KEY, JSON.stringify(all));
  return kept;
}

/** @param {unknown} name @param {unknown} paint @returns {Looks} */
function tidy(name, paint) {
  return {
    name: typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "",
    paint: typeof paint === "string" && Object.hasOwn(PAINTS, paint) ? paint : "plain",
  };
}
