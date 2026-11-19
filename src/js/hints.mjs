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
