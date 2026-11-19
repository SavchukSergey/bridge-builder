// Badges: milestones over the whole game, shown in the level list and announced in the result
// that earns them. Each is worked out from the progress already saved, so nothing new is kept
// except which ones the player has already been told about.

/**
 * @typedef {object} Progress
 * @property {number} stars       stars earned over all levels
 * @property {number} maxStars
 * @property {number} wins        levels won
 * @property {number} levels      levels there are
 * @property {number} goals       extra goals done
 * @property {number} maxGoals
 * @property {boolean} train      a railway level won
 */

/** In the order they're shown: the easy ones first. @type {{ id: string, earned: (p: Progress) => boolean }[]} */
export const BADGES = [
  { id: "first", earned: p => p.wins >= 1 },
  { id: "stars10", earned: p => p.stars >= 10 },
  { id: "goals5", earned: p => p.goals >= 5 },
  { id: "train", earned: p => p.train },
  { id: "stars30", earned: p => p.stars >= 30 },
  { id: "allLevels", earned: p => p.wins >= p.levels },
  { id: "allGoals", earned: p => p.maxGoals > 0 && p.goals >= p.maxGoals },
  { id: "allStars", earned: p => p.stars >= p.maxStars },
];

/**
 * The badges earned so far.
 * @param {Progress} progress
 * @returns {string[]}
 */
export function earnedBadges(progress) {
  return BADGES.filter(b => b.earned(progress)).map(b => b.id);
}

/**
 * Badges earned but not yet announced, given the ones already told about.
 * @param {readonly string[]} earned
 * @param {readonly string[]} told
 */
export function newBadges(earned, told) {
  return earned.filter(id => !told.includes(id));
}
