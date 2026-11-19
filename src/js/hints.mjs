/**
 * Advice shown after a load test.
 */

import { t } from './i18n.mjs';

/**
 * Advice for a failed test: what the first member to break tells you, or what was missing.
 * @param {import('./game.js').TestResult} result
 * @param {'road' | 'rail'} [track] - what the level's traffic runs on
 * @returns {string}
 */
export function failureTip(result, track = 'road') {
  const f = result.failure;
  if (!f) {
    if (result.roadAcross === false) return t(track === 'rail' ? 'tip.gapTrack' : 'tip.gapRoad');
    if (result.reason === 'crashed') return t('tip.crashed');
    if (result.reason === 'hard landing') return t('tip.hardLanding');
    return t('tip.sagged');
  }
  const what = f.label.toLowerCase();
  if (f.kind === 'deck') {
    const deck = t(f.material === 'rail' ? 'tip.deck.rail' : 'tip.deck.road');
    return t(f.mode === 'tension' ? 'tip.deckStretched' : 'tip.deckCrushed', { deck });
  }
  if (f.kind === 'cable') return t(f.material === 'cable-thin' ? 'tip.thinCable' : 'tip.cable');
  if (f.mode === 'compression') return f.material === 'steel-light' ? t('tip.lightCrushed') : t('tip.crushed', { what });
  return f.material === 'steel-light' ? t('tip.lightPulled') : t('tip.pulled', { what });
}

/**
 * A nudge towards a design that works on each level, for a player who is stuck. Each one
 * describes the level's reference bridge (src/js/solutions.mjs), which the outline shows.
 * The English; translations are keyed hint.<level id> in locales/.
 * @type {Record<string, string>}
 */
export const LEVEL_HINTS = {
  brook: 'A single stretch of road carries a car and a bus over 20 m. Click the anchor at the edge of the gap, then the one on the other bank.',
  creek: 'A deck alone sags and snaps over 40 m. Stand a light steel post on each bank and hang the road from a cable that sags between their tops, with thin cables down to each road joint. A cable from each post back to the bank holds it upright.',
  ledges: 'Use the rock ledges: a light steel strut from each ledge up to the road joint nearest the middle props the deck for very little.',
  canyon: 'A steel truss this long costs too much. Hang the road instead: steel towers at the edges, a main cable sagging between their tops, thin cables down to the road, and a cable from each tower back to the bank.',
  step: 'A low truss that climbs with the road: a steel top chord 4 m above it, light steel verticals, and cable diagonals sloping down towards the middle.',
  heavy: 'Cables stretch too far under 200 t, so the road drops. A shallow truss, 3 m deep, with light steel verticals and diagonals is stiff enough.',
  downhill: 'A shallow truss that follows the slope: a steel top chord about 3 m above the road, light steel verticals, and cable diagonals sloping down towards the middle.',
  rush: 'The Creek\u2019s design, stretched to 60 m, carries all nine: light steel posts, a sagging main cable, thin cables down to the road.',
  pier: 'Rest the middle on the rock: two steel legs from the rock up to one road joint (an A-frame), with a shallow truss on each side of it.',
  'long-span': 'With nothing to stand on, hang it: towers about 16 m above the road and a deep sag in the main cable, so the road isn\u2019t stretched too hard.',
  viaduct: 'Three spans of shallow truss, with a steel A-frame on each rock under the joints where the spans meet.',
  gorge: 'Push instead of pull: an arch of light steel from the low ledges up to the road at mid-span, a post from the arch up to each road joint, and diagonal bracing in every panel so the arch can\u2019t fold.',
  grand: 'Two long trusses, about 7 m deep, meeting over a steel A-frame on the rock in the middle.',
  'branch-line': 'Trains need Rail. The Creek\u2019s light suspension bridge works with a rail deck: posts, a sagging cable and thin cables down to the track.',
  freight: 'Cables stretch too much under 380 t. A truss about 6 m deep with light steel verticals and diagonals holds the train.',
  mountain: 'Like River pier: two rail trusses meeting over a steel A-frame on the rock.',
};

/**
 * @param {string} levelId
 * @returns {string | undefined}
 */
export function levelHint(levelId) {
  const english = LEVEL_HINTS[levelId];
  return english === undefined ? undefined : t(`hint.${levelId}`, {}, english);
}
