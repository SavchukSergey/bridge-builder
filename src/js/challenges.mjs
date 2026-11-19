/**
 * Extra challenges on each level, on top of the stars: win within budget with a twist (no
 * cables, no full-size steel, few members, or a tight cost). Every one is met by the level's
 * reference bridge (solutions.mjs), which the tests check, so none is impossible.
 */

import { formatMoney, t } from "./i18n.mjs";

/**
 * What a winning bridge is judged on: as built, before the test.
 * @typedef {Object} BridgeStats
 * @property {number} cost
 * @property {number} members - links, after long ones are split into segments
 * @property {string[]} materials - material ids used
 */

/**
 * @typedef {Object} ChallengeKind
 * @property {string} name
 * @property {(param: number) => string} label - what it asks for
 * @property {(stats: BridgeStats, param: number) => boolean} met
 */

/** @type {Record<"cost" | "members" | "noCables" | "light", ChallengeKind>} */
export const CHALLENGE_KINDS = {
  cost: {
    get name() { return t("challenge.cost.name"); },
    label: (p) => t("challenge.cost.label", { cost: formatMoney(p) }),
    met: (s, p) => s.cost <= p,
  },
  members: {
    get name() { return t("challenge.members.name"); },
    label: (p) => t("challenge.members.label", { n: p }),
    met: (s, p) => s.members <= p,
  },
  noCables: {
    get name() { return t("challenge.noCables.name"); },
    label: () => t("challenge.noCables.label"),
    met: (s) => !s.materials.some(m => m === "cable" || m === "cable-thin"),
  },
  light: {
    get name() { return t("challenge.light.name"); },
    label: () => t("challenge.light.label"),
    met: (s) => !s.materials.includes("steel"),
  },
};

/** @typedef {keyof typeof CHALLENGE_KINDS} ChallengeId */

/**
 * Each level's challenges: [kind, parameter]. The costs are the reference bridge's, rounded
 * up to $100: a little tighter than three stars.
 * @type {Record<string, [ChallengeId, number?][]>}
 */
const LEVEL_CHALLENGES = {
  brook: [["members", 2]],
  creek: [["light"], ["cost", 16400]],
  ledges: [["noCables"], ["members", 7]],
  canyon: [["cost", 35400], ["members", 27]],
  step: [["cost", 34600], ["members", 21]],
  heavy: [["noCables"], ["cost", 22300]],
  downhill: [["cost", 34200], ["members", 21]],
  rush: [["light"], ["cost", 23700]],
  pier: [["cost", 75200], ["members", 44]],
  "long-span": [["cost", 46400], ["members", 33]],
  viaduct: [["cost", 114600], ["members", 67]],
  gorge: [["light"], ["cost", 40700]],
  grand: [["cost", 105300], ["members", 60]],
  "branch-line": [["light"], ["cost", 20400]],
  freight: [["noCables"], ["cost", 56600]],
  mountain: [["noCables"], ["cost", 88100]],
};

/**
 * @typedef {Object} Challenge
 * @property {ChallengeId} id - unique within its level
 * @property {string} name
 * @property {string} label
 * @property {(stats: BridgeStats) => boolean} met
 */

/**
 * A level's challenges (none for a sandbox or an unknown level).
 * @param {string} levelId
 * @returns {Challenge[]}
 */
export function challengesFor(levelId) {
  return (LEVEL_CHALLENGES[levelId] ?? []).map(([id, param = 0]) => {
    const kind = CHALLENGE_KINDS[id];
    return { id, name: kind.name, label: kind.label(param), met: (stats) => kind.met(stats, param) };
  });
}
