import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import { renderLevelPreview } from "../src/js/level-preview.mjs";

/** Wins a level with its reference bridge (three stars). */
function win(game, levelId) {
  game.selectLevel(levelId);
  game.importStructure(solutions[levelId](findLevel(levelId)));
  game.setSimulationRunning(true);
  for (let f = 0; f < 120 * 60 && !game.result; f++) game.tick();
  assert.equal(game.result?.kind, "success", `won ${levelId}`);
}

describe("progression", () => {
  test("levels are numbered in play order", () => {
    assert.deepEqual(levels.map(l => l.number), levels.map((_, i) => i + 1));
    assert.equal(levels.length, 13);
  });

  test("only the first level is open at the start; winning one opens the next", () => {
    const game = createGame("brook");
    assert.deepEqual(levels.filter(l => game.isUnlocked(l.id)).map(l => l.id), ["brook"]);
    assert.deepEqual(game.totalStars, { earned: 0, max: 39 });

    win(game, "brook");
    assert.deepEqual(levels.filter(l => game.isUnlocked(l.id)).map(l => l.id), ["brook", "creek"]);
    assert.deepEqual(game.totalStars, { earned: 3, max: 39 });
    assert.equal(game.isUnlocked("nope"), false);
  });

  test("an over-budget crossing does not unlock the next level", () => {
    const game = createGame("canyon"); // the example bridge crosses, but over budget
    game.setSimulationRunning(true);
    for (let f = 0; f < 90 * 60 && !game.result; f++) game.tick();
    assert.equal(game.result?.kind, "over-budget");
    assert.equal(game.isUnlocked("step"), false);
  });

  test("a level won before stays open, even if the one before it is not won (e.g. a level added later)", () => {
    createGame("brook");
    localStorage.setItem("bridge-builder:completed", JSON.stringify(["canyon"]));
    const game = createGame("brook", { keepStorage: true });
    assert.equal(game.isUnlocked("canyon"), true, "won");
    assert.equal(game.isUnlocked("step"), true, "after a won level");
    assert.equal(game.isUnlocked("ledges"), false, "the level before canyon was never won");
  });

  test("the game starts on the last level played, unless it is locked", () => {
    createGame("brook");
    localStorage.setItem("bridge-builder:completed", JSON.stringify(["brook"]));
    localStorage.setItem("bridge-builder:level", "creek");
    assert.equal(createGame(null, { keepStorage: true }).level.id, "creek");

    localStorage.setItem("bridge-builder:level", "grand");
    assert.equal(createGame(null, { keepStorage: true }).level.id, "brook", "locked: back to the first level");
  });
});

describe("level previews", () => {
  /** A 2D context that records the fills, in order. */
  function recorder() {
    const fills = [];
    let style = "";
    const g = new Proxy({
      createLinearGradient: () => ({ addColorStop() { } }),
      fillRect: (x, y, w, h) => fills.push({ style, x, y, w, h }),
    }, {
      get: (t, k) => t[k] ?? (() => { }),
      set: (t, k, v) => { if (k === "fillStyle") style = v; return true; },
    });
    return { g, fills };
  }

  for (const level of levels) {
    test(`${level.name}: draws finite shapes, the flag on the ground`, () => {
      const { g, fills } = recorder();
      renderLevelPreview(/** @type {any} */(g), level, 216, 108);
      assert.ok(fills.length >= 4);
      for (const f of fills) for (const v of [f.x, f.y, f.w, f.h]) assert.ok(Number.isFinite(v), `${level.id}: ${JSON.stringify(f)}`);
    });
  }

  test("rocks under the river are drawn before the water, so it covers them", () => {
    const { g, fills } = recorder();
    const pier = findLevel("pier");
    renderLevelPreview(/** @type {any} */(g), pier, 216, 108);
    const water = fills.findIndex(f => f.style === pier.theme.water[0]);
    const rock = fills.findIndex(f => f.style === "#6f6a63");
    assert.ok(rock >= 0 && water > rock, `rock at ${rock}, water at ${water}`);
    assert.ok(fills.slice(water + 1).some(f => f.style === pier.theme.valleyRim), "the banks' grass is drawn over the water");
  });
});
