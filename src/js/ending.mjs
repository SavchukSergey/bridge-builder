// The ending: what the player has done once every level is won, and what is still there to win.

/**
 * @typedef {object} EndingSummary
 * @property {number} levels      levels won (all of them, by now)
 * @property {number} stars
 * @property {number} maxStars
 * @property {number} goals       extra goals done
 * @property {number} maxGoals
 * @property {number} badges
 * @property {number} maxBadges
 * @property {number} starsLeft   stars still to win
 * @property {boolean} everything every star, goal and badge
 */

/**
 * @param {import("./badges.mjs").Progress} progress
 * @param {readonly string[]} earned the badges earned
 * @param {number} badgeCount how many badges there are
 * @returns {EndingSummary}
 */
export function endingSummary(progress, earned, badgeCount) {
  const starsLeft = Math.max(0, progress.maxStars - progress.stars);
  return {
    levels: progress.wins,
    stars: progress.stars,
    maxStars: progress.maxStars,
    goals: progress.goals,
    maxGoals: progress.maxGoals,
    badges: earned.length,
    maxBadges: badgeCount,
    starsLeft,
    everything: starsLeft === 0 && progress.goals >= progress.maxGoals && earned.length >= badgeCount,
  };
}

/** Whether the game is finished: every level won. @param {import("./badges.mjs").Progress} progress */
export const isFinished = (progress) => progress.levels > 0 && progress.wins >= progress.levels;
