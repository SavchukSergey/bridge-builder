// The family scoreboard: everyone who plays on this browser can put their name to a win.
// Each player keeps their cheapest win on each level; the board ranks players by stars, and
// shows who built each level cheapest. Kept on this browser only.

import { storageGet, storageSet } from "./storage.mjs";

export const SCORES_KEY = "bridge-builder:scores";
export const PLAYER_KEY = "bridge-builder:player";
/** Longest player name, in characters. */
export const PLAYER_MAX = 20;

/** @typedef {{ name: string, cost: number, stars: number }} Score */

/** A player's name, tidied: spaces squeezed, trimmed and cut short. @param {string} name */
export const tidyName = (name) => name.replace(/\s+/g, " ").trim().slice(0, PLAYER_MAX);

/** @returns {Record<string, Score[]>} */
function allScores() {
  try {
    const all = JSON.parse(storageGet(SCORES_KEY) ?? "{}");
    if (!all || typeof all !== "object" || Array.isArray(all)) return {};
    for (const id of Object.keys(all)) {
      all[id] = Array.isArray(all[id]) ? all[id].filter(isScore) : [];
    }
    return all;
  } catch {
    return {};
  }
}

/** @param {any} s @returns {s is Score} */
const isScore = (s) => s && typeof s.name === "string" && s.name && typeof s.cost === "number" && typeof s.stars === "number";

/** Same player whatever the case. @param {string} a @param {string} b */
const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * Puts a player's name to a win, keeping their cheapest on the level.
 * @param {string} levelId @param {string} name @param {number} cost @param {number} stars
 * @returns {{ name: string, place: number, of: number, better: boolean, before: Score | undefined } | undefined}
 *   the name as kept, their place on the level (from 1), out of how many, whether this beat
 *   their own earlier score, and that score (to undo it with {@link undoScore}); undefined
 *   for an empty name
 */
export function addScore(levelId, name, cost, stars) {
  const who = tidyName(name);
  if (!who) return undefined;
  const all = allScores();
  const scores = all[levelId] ?? [];
  const old = scores.find(s => same(s.name, who));
  const better = !old || cost < old.cost - 0.5;
  const kept = better ? { name: who, cost: Math.round(cost), stars } : /** @type {Score} */ (old);
  all[levelId] = [...scores.filter(s => !same(s.name, who)), kept].sort((a, b) => a.cost - b.cost);
  storageSet(SCORES_KEY, JSON.stringify(all));
  storageSet(PLAYER_KEY, who);
  return { name: who, place: all[levelId].indexOf(kept) + 1, of: all[levelId].length, better: better && old !== undefined, before: old };
}

/**
 * Takes back a score just added: the player's earlier score on the level comes back, or,
 * if they had none, they are taken off it.
 * @param {string} levelId @param {string} name @param {Score | undefined} before
 */
export function undoScore(levelId, name, before) {
  const all = allScores();
  const rest = (all[levelId] ?? []).filter(s => !same(s.name, name));
  all[levelId] = (before ? [...rest, before] : rest).sort((a, b) => a.cost - b.cost);
  storageSet(SCORES_KEY, JSON.stringify(all));
}

/** A level's scores, cheapest first. @param {string} levelId */
export const scoresFor = (levelId) => allScores()[levelId] ?? [];

/** The last name put to a win, to fill in next time. */
export const lastPlayer = () => tidyName(storageGet(PLAYER_KEY) ?? "");

/**
 * Everyone on the board, most stars first (then most levels, then name): levels won, stars,
 * and on how many levels theirs is the cheapest.
 * @param {string[]} levelIds - the levels that count, in order
 * @returns {{ name: string, levels: number, stars: number, cheapest: number }[]}
 */
export function players(levelIds) {
  const all = allScores();
  /** @type {Map<string, { name: string, levels: number, stars: number, cheapest: number }>} */
  const byName = new Map();
  for (const id of levelIds) {
    (all[id] ?? []).forEach((s, i) => {
      const key = s.name.toLocaleLowerCase();
      const p = byName.get(key) ?? { name: s.name, levels: 0, stars: 0, cheapest: 0 };
      p.levels++;
      p.stars += s.stars;
      if (i === 0) p.cheapest++;
      byName.set(key, p);
    });
  }
  return [...byName.values()].sort((a, b) => b.stars - a.stars || b.levels - a.levels || a.name.localeCompare(b.name));
}
