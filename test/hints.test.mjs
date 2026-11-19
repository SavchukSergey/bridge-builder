import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { creekLevel, levels } from "../src/js/level.mjs";
import { levelHint } from "../src/js/hints.mjs";
import { HINT_AFTER } from "../src/js/game-config.mjs";
import { TRIES_KEY } from "../src/js/storage.mjs";

/** Runs a load test on the game's current structure to the end. */
function runTest(game) {
  game.setSimulationRunning(true);
  for (let i = 0; i < 60 * 120 && !game.result; i++) game.tick();
  assert.ok(game.result, "the test finished");
  return game.result;
}

/** Creek with a bare deck: fails every time. */
function failOnce(game) {
  game.reset();
  game.importStructure(alternatives.creek["bare deck"](creekLevel));
  assert.equal(runTest(game).kind, "failed");
}

describe("hints when stuck", () => {
  test(`offered after ${HINT_AFTER} tests end without a win, and remembered`, () => {
    const game = createGame("creek");
    for (let i = 0; i < HINT_AFTER; i++) {
      assert.equal(game.hintAvailable, false, `not after ${i}`);
      failOnce(game);
    }
    assert.equal(game.triesWithoutWin(), HINT_AFTER);
    assert.equal(game.hintAvailable, true);
    assert.equal(game.triesWithoutWin("canyon"), 0, "counted per level");
  });

  test("an over-budget crossing counts as a try; watching a replay doesn't", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["truss h6 steel"](creekLevel));
    const result = runTest(game);
    assert.equal(result.kind, "over-budget");
    assert.equal(game.triesWithoutWin(), 1);
    failOnce(game);
    assert.equal(game.triesWithoutWin(), 2);
    game.replayFailure();
    for (let i = 0; i < 60 * 240 && !game.result; i++) game.tick();
    assert.equal(game.result?.kind, "failed");
    assert.equal(game.triesWithoutWin(), 2);
  });

  test("resetting progress forgets the tries", () => {
    const game = createGame("creek");
    failOnce(game);
    game.resetProgress();
    assert.equal(localStorage.getItem(TRIES_KEY), null);
    assert.equal(game.triesWithoutWin("creek"), 0);
  });

  test("every level has words and an outline that wins within budget", () => {
    const game = createGame();
    for (const level of levels) {
      assert.ok(levelHint(level.id)?.length > 40, `${level.id}: a hint`);
      game.selectLevel(level.id);
      const outline = game.outline;
      assert.ok(outline, `${level.id}: an outline`);
      assert.deepEqual(outline.structure, solutions[level.id](level), "the reference bridge");
      assert.ok(outline.cost <= level.budget, `${level.id}: ${outline.cost} within ${level.budget}`);
    }
  });

  test("the outline goes away on another level", () => {
    const game = createGame("canyon");
    game.showOutline = true;
    game.selectLevel("creek");
    assert.equal(game.showOutline, false);
  });
});
