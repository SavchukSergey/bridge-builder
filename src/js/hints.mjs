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
  if (result.reason === 'boat') return t('tip.boat');
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
  brook: 'One piece of Road is enough. Click the anchor at the edge of the water, then the one on the other side.',
  triangles: 'Make a row of triangles on top of the road. From each road dot, put a light steel piece up to a point 6 m above the middle, and back down to the next dot. Then join the tops of the triangles.',
  ledges: 'Pick Light steel. Click a rock, then the road dot nearest the middle. Do the same on the other side.',
  hang: 'Pick Cable. Click the top of a post, then a road dot. Do it for every road dot on that side, then the same from the other post. Thin cable is strong enough, and cheaper.',
  creek: 'Build a light steel post standing up on each side. Hang a cable between the tops of the posts, sagging in the middle, and thin cables from it down to each road dot. A cable from each post back to the ground stops it falling over.',
  canyon: 'This bridge costs too much. Try a hanging bridge: steel posts on each side, a sagging cable between their tops, thin cables down to the road, and a cable from each post back to the ground.',
  step: 'Build triangles on top of the road as it climbs: a steel piece 4 m above the road along the top, light steel pieces going up and down, and cables going across.',
  heavy: 'Cables stretch too much under this giant truck. Build short triangles, 3 m tall, out of light steel on top of the road.',
  downhill: 'Like Step up, but going down: short triangles on top of the road, about 3 m tall.',
  rush: 'Use the bridge from Creek, just wider: two light steel posts, a sagging cable, and thin cables down to the road.',
  pier: 'Stand two steel pieces on the rock, leaning in to meet at one road dot. Then build short triangles on top of the road on each side.',
  'long-span': 'There is nothing to stand on, so hang it: tall posts, about 16 m above the road, and a cable that sags a lot in the middle.',
  viaduct: 'Three bridges in a row, each with short triangles on top. Stand two leaning steel pieces on each rock, under the dots where the bridges meet.',
  gorge: "Push instead of pull: build an arch of light steel from the low rocks up to the middle of the road. Join the arch to every road dot, and add crossing pieces so it can't fold.",
  grand: 'Two long rows of triangles, about 7 m tall, meeting over two leaning steel pieces on the rock in the middle.',
  'branch-line': 'Trains need Rail instead of Road. The hanging bridge from Creek works here too: posts, a sagging cable, and thin cables down to the track.',
  freight: 'Cables stretch too much under this heavy train. Build triangles about 6 m tall, out of light steel, on top of the track.',
  drawbridge: 'Stand a light steel post, 14 m tall, on the middle dot, with a thin cable from its top to the dot behind. Lay one road piece from the middle dot to the far edge, without joining it to the other side. Then a Winch from the top of the post to the end of the road.',
  mountain: 'Like River pier: two rows of triangles on the track, meeting over two leaning steel pieces on the rock.',
};

/**
 * @param {string} levelId
 * @returns {string | undefined}
 */
export function levelHint(levelId) {
  const english = LEVEL_HINTS[levelId];
  return english === undefined ? undefined : t(`hint.${levelId}`, {}, english);
}
