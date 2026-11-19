import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { levels } from "../src/js/level.mjs";

test("three stars leave room: each hint bridge is at least $250 under the line, a few metres of light steel", () => {
  for (const level of levels) {
    if (level.id === "brook") continue; // the plain road is the answer: nothing to spare
    const game = createGame(level.id);
    game.importStructure(solutions[level.id](level));
    assert.ok(level.stars.three - game.scene.cost >= 250,
      `${level.id}: hint bridge $${Math.round(game.scene.cost)}, three stars at $${level.stars.three}`);
  }
});
