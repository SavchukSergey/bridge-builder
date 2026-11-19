// The daily challenge: each day, one of the levels already open, with a twist from the kinds
// in challenges.mjs (a tight cost, few pieces, no cables or no heavy steel). Every twist is met
// by that level's reference bridge (solutions.mjs), so none is impossible. Done days are kept
// on this browser, for a streak.

import { CHALLENGE_KINDS } from "./challenges.mjs";
import { solutions } from "./solutions.mjs";
import { Scene } from "./scene.js";
import { storageGet, storageSet } from "./storage.mjs";

export const DAILY_KEY = "bridge-builder:daily";

/**
 * @typedef {Object} Daily
 * @property {string} date - YYYY-MM-DD, the player's own day
 * @property {string} level - level id
 * @property {import("./challenges.mjs").ChallengeId} kind
 * @property {number} param
 */

/** The player's local date as YYYY-MM-DD. @param {Date} [now] */
export function dayOf(now = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A small, stable hash of a string (FNV-1a). @param {string} text */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The twists a level's reference bridge meets: a cost at its rounded-up price, a few more
 * pieces than it has, and no cables or no heavy steel if it does without.
 * @param {import("./level.mjs").Level} level
 * @returns {[import("./challenges.mjs").ChallengeId, number][]}
 */
export function twistsFor(level) {
  const build = solutions[level.id];
  if (!build) return [];
  const scene = new Scene();
  scene.load(build(level));
  const names = new Set(scene.links.map(l => l.material.name));
  /** @type {[import("./challenges.mjs").ChallengeId, number][]} */
  const twists = [["cost", Math.ceil(scene.cost / 100) * 100], ["members", scene.links.length + 2]];
  if (!names.has("cable") && !names.has("cable-thin")) twists.push(["noCables", 0]);
  if (!names.has("steel")) twists.push(["light", 0]);
  return twists;
}

/**
 * Today's challenge: picked from the date, among the open levels, so it is the same all day
 * (and for everyone with the same levels open).
 * @param {string} date - YYYY-MM-DD
 * @param {import("./level.mjs").Level[]} open - levels the player can play, in order
 * @returns {Daily | undefined}
 */
export function dailyFor(date, open) {
  const playable = open.filter(l => !l.sandbox && solutions[l.id]);
  if (!playable.length) return undefined;
  const h = hash(date);
  const level = playable[h % playable.length];
  const twists = twistsFor(level);
  const [kind, param] = twists[Math.floor(h / playable.length) % twists.length];
  return { date, level: level.id, kind, param };
}

/** What the challenge asks for, in words. @param {Daily} daily */
export const dailyLabel = (daily) => CHALLENGE_KINDS[daily.kind].label(daily.param);

/**
 * Whether a win on the day's level met it.
 * @param {Daily} daily @param {import("./challenges.mjs").BridgeStats} stats
 */
export const dailyMet = (daily, stats) => CHALLENGE_KINDS[daily.kind].met(stats, daily.param);

/** @returns {string[]} the days done, YYYY-MM-DD */
export function daysDone() {
  try {
    const days = JSON.parse(storageGet(DAILY_KEY) ?? "[]");
    return Array.isArray(days) ? days.filter(d => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/** Records a day as done (keeps the last 60). @param {string} date */
export function markDone(date) {
  const days = [...new Set([...daysDone(), date])].sort().slice(-60);
  storageSet(DAILY_KEY, JSON.stringify(days));
}

/**
 * Days in a row done, up to today (or up to yesterday, while today is still to do).
 * @param {string} today - YYYY-MM-DD
 */
export function streak(today) {
  const done = new Set(daysDone());
  const day = new Date(`${today}T12:00:00`);
  if (!done.has(today)) day.setDate(day.getDate() - 1);
  let n = 0;
  while (done.has(dayOf(day))) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}
