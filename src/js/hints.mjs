/**
 * Advice shown after a load test.
 */

/**
 * Advice for a failed test: what the first member to break tells you, or what was missing.
 * @param {import('./game.js').TestResult} result
 * @param {'road' | 'rail'} [track] - what the level's traffic runs on
 * @returns {string}
 */
export function failureTip(result, track = 'road') {
  const f = result.failure;
  if (!f) {
    if (result.roadAcross === false) {
      return track === 'rail'
        ? 'There is a gap in the track. Trains run only on Rail, all the way from bank to bank.'
        : 'There is a gap in the road. Vehicles need road (the deck) all the way from bank to bank.';
    }
    if (result.reason === 'crashed') return 'The road ends below the far bank, so it ran into the cliff. Bring the road up to the top of the bank.';
    if (result.reason === 'hard landing') return 'The road drops too steeply. Keep it level with the banks where it meets them.';
    return 'Nothing broke, but the road sagged too far. Hold it up from above or below.';
  }
  const what = f.label.toLowerCase();
  if (f.kind === 'deck') {
    const deck = f.material === 'rail' ? 'The rail deck' : 'The road';
    return f.mode === 'tension'
      ? `${deck} was stretched until it snapped: it sagged under the load. Hold it up from above (towers and cables, or a truss) or prop it from below.`
      : `${deck} was crushed end to end. Brace it with triangles so the deck isn\u2019t pushed along its length.`;
  }
  if (f.kind === 'cable') {
    return f.material === 'cable-thin'
      ? 'A thin cable snapped. Use full cable there, or more cables to share the load.'
      : 'A cable snapped. Add more cables to share the load, or a deeper sag so each pulls less.';
  }
  if (f.mode === 'compression') {
    return f.material === 'steel-light'
      ? 'A light steel member was crushed. Use full steel there, or shorten it with a brace.'
      : `A ${what} member was crushed. Shorten it or brace it, so the push is shared by more members.`;
  }
  return f.material === 'steel-light'
    ? 'A light steel member was pulled apart. Use full steel there, or a cable alongside it.'
    : `A ${what} member was pulled apart. Share the load with more members, or make the truss deeper.`;
}

/**
 * A nudge towards a design that works on each level, for a player who is stuck. Each one
 * describes the level's reference bridge (src/js/solutions.mjs), which the outline shows.
 * @type {Record<string, string>}
 */
const LEVEL_HINTS = {
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
  return LEVEL_HINTS[levelId];
}
