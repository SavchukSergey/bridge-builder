// Challenge a friend: a link with a level and a price to beat, but not the bridge, so the
// friend builds their own. Opening one sets that price as a goal on the level, kept on this
// browser until it is beaten (and after, marked beaten) or put away.

import { storageGet, storageSet } from "./storage.mjs";

export const FRIEND_HASH_PREFIX = "#beat=";
export const FRIEND_KEY = "bridge-builder:friend";

/** @typedef {{ cost: number, beaten: boolean }} FriendGoal */

/**
 * The link that challenges a friend to build a level for less.
 * @param {string} base - the page's address, without a #hash
 * @param {string} levelId
 * @param {number} cost
 */
export function friendUrl(base, levelId, cost) {
  return `${base}${FRIEND_HASH_PREFIX}${encodeURIComponent(levelId)}~${Math.round(cost)}`;
}

/**
 * The level and price in a challenge link's #hash, if it is one.
 * @param {string} hash - e.g. `location.hash`
 * @returns {{ level: string, cost: number } | undefined}
 */
export function friendInHash(hash) {
  if (!hash.startsWith(FRIEND_HASH_PREFIX)) return undefined;
  const m = /^(.+)~(\d{1,8})$/.exec(hash.slice(FRIEND_HASH_PREFIX.length));
  if (!m) return undefined;
  let level;
  try {
    level = decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
  const cost = Number(m[2]);
  return cost > 0 ? { level, cost } : undefined;
}

/** @returns {Record<string, FriendGoal>} */
function allGoals() {
  try {
    const all = JSON.parse(storageGet(FRIEND_KEY) ?? "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, FriendGoal>} all */
const saveGoals = (all) => storageSet(FRIEND_KEY, JSON.stringify(all));

/**
 * The price a friend set on a level, if any.
 * @param {string} levelId
 * @returns {FriendGoal | undefined}
 */
export function friendGoal(levelId) {
  const goal = allGoals()[levelId];
  return goal && typeof goal.cost === "number" && goal.cost > 0 ? { cost: goal.cost, beaten: goal.beaten === true } : undefined;
}

/** A friend's price for a level, replacing any before. @param {string} levelId @param {number} cost */
export function setFriendGoal(levelId, cost) {
  saveGoals({ ...allGoals(), [levelId]: { cost: Math.round(cost), beaten: false } });
}

/** Puts a level's friend goal away. @param {string} levelId */
export function clearFriendGoal(levelId) {
  const all = allGoals();
  delete all[levelId];
  saveGoals(all);
}

/**
 * After a win within budget: whether it beat the friend's price, marking it beaten the
 * first time.
 * @param {string} levelId @param {number} cost
 * @returns {{ goal: FriendGoal, beat: boolean, isNew: boolean } | undefined}
 */
export function judgeFriend(levelId, cost) {
  const goal = friendGoal(levelId);
  if (!goal) return undefined;
  const beat = cost < goal.cost - 0.5;
  const isNew = beat && !goal.beaten;
  if (isNew) saveGoals({ ...allGoals(), [levelId]: { cost: goal.cost, beaten: true } });
  return { goal, beat, isNew };
}
