import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { creekLevel, findLevel, levels } from "../src/js/level.mjs";
import { CHALLENGE_KINDS, challengesFor } from "../src/js/challenges.mjs";
import { sandboxId } from "../src/js/sandbox.mjs";
import { CHALLENGES_KEY } from "../src/js/storage.mjs";

/** Builds `structure` on a level and runs the load test to the end. */
function run(levelId, structure, game = createGame(levelId)) {
  game.reset();
  game.importStructure(structure);
  game.setSimulationRunning(true);
  for (let i = 0; i < 60 * 150 && !game.result; i++) game.tick();
  assert.ok(game.result, "the test finished");
  return { game, result: game.result };
}

describe("challenges", () => {
  for (const level of levels) {
    test(`${level.name}: every challenge can be done (the reference bridge does them all)`, () => {
      const challenges = challengesFor(level.id);
      assert.ok(challenges.length >= 1, "has some");
      const { result } = run(level.id, solutions[level.id](level));
      assert.equal(result.kind, "success");
      assert.deepEqual(result.challenges.map(c => [c.id, c.met]), challenges.map(c => [c.id, true]));
    });
  }

  test("each is harder than just winning: some winning bridge misses one", () => {
    // the creek's suspension bridge with full-size steel towers wins, but isn't a featherweight
    const { result } = run("creek", alternatives.creek["suspension top 14 sag 3"](creekLevel));
    assert.equal(result.kind, "success");
    const light = result.challenges.find(c => c.id === "light");
    assert.equal(light?.met, false);
    const cost = result.challenges.find(c => c.id === "cost");
    assert.equal(cost?.met, false, "and it costs more than $16,400");
  });

  test("met challenges are kept, marked new only the first time", () => {
    const level = findLevel("ledges");
    const first = run("ledges", solutions.ledges(level));
    assert.ok(first.result.challenges.every(c => c.met && c.isNew && c.earned));
    assert.deepEqual(first.game.challengesEarned().sort(), ["members", "noCables"]);
    const again = run("ledges", solutions.ledges(level), first.game);
    assert.ok(again.result.challenges.every(c => c.met && !c.isNew));
    // a cheaper-looking but bigger win still keeps the earned ones
    const more = run("ledges", alternatives.ledges["two struts per side"](level), first.game);
    assert.equal(more.result.kind, "success");
    const members = more.result.challenges.find(c => c.id === "members");
    assert.deepEqual([members?.met, members?.earned, members?.isNew], [false, true, false]);
    assert.deepEqual(first.game.challengesEarned().sort(), ["members", "noCables"]);
  });

  test("a failed or over-budget test meets none", () => {
    const failed = run("creek", alternatives.creek["bare deck"](creekLevel)).result;
    assert.equal(failed.kind, "failed");
    assert.ok(failed.challenges.length > 0 && failed.challenges.every(c => !c.met));
    const over = run("creek", alternatives.creek["truss h6 steel"](creekLevel)).result;
    assert.equal(over.kind, "over-budget");
    assert.ok(over.challenges.every(c => !c.met), "no cables or not, it's over budget");
    assert.equal(localStorage.getItem(CHALLENGES_KEY), null);
  });

  test("resetting progress forgets them; a sandbox has none", () => {
    const { game } = run("brook", solutions.brook(findLevel("brook")));
    assert.deepEqual(game.challengesEarned(), ["members"]);
    game.resetProgress();
    assert.deepEqual(game.challengesEarned("brook"), []);
    assert.deepEqual(challengesFor(sandboxId({ gap: 40 })), []);
  });

  test("every kind reads as a short sentence", () => {
    for (const [id, kind] of Object.entries(CHALLENGE_KINDS)) {
      assert.ok(kind.name.length > 3, id);
      assert.match(kind.label(12300), /^[A-Z0-9$]/, id);
    }
    assert.equal(CHALLENGE_KINDS.cost.label(16400), "Cost $16,400 or less");
  });
});
