import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { Scene } from "../src/js/scene.js";
import { creekLevel, levels } from "../src/js/level.mjs";

/** Runs the load test until it is won or lost (or a minute of simulated time passes). */
function runTest(game) {
  game.setSimulationRunning(true);
  for (let f = 0; f < 120 * 60 && !game.result; f++) game.tick();
  return game.result;
}

describe("stars", () => {
  test("cost to stars: three, two, one within budget, none over it", () => {
    const { budget, stars } = creekLevel;
    assert.equal(creekLevel.starsFor(stars.three), 3);
    assert.equal(creekLevel.starsFor(stars.three + 1), 2);
    assert.equal(creekLevel.starsFor(stars.two), 2);
    assert.equal(creekLevel.starsFor(stars.two + 1), 1);
    assert.equal(creekLevel.starsFor(budget), 1);
    assert.equal(creekLevel.starsFor(budget + 1), 0);
  });

  for (const level of levels) {
    test(`${level.name}: thresholds are ordered, and the cheapest known bridge earns three stars`, () => {
      assert.ok(level.stars.three < level.stars.two && level.stars.two < level.budget);
      const scene = new Scene();
      scene.load(solutions[level.id](level));
      assert.equal(level.starsFor(scene.cost), 3, `$${Math.round(scene.cost)} vs $${level.stars.three}`);
      assert.ok(level.stars.three - scene.cost < 0.05 * level.budget, "but only just: it is a challenge");
    });
  }
});

describe("test results", () => {
  test("a win reports its stars once and is remembered as the best", () => {
    const game = createGame("creek");
    game.importStructure(solutions.creek(creekLevel));
    const reported = [];
    game.onResult = r => reported.push(r);

    const result = runTest(game);
    assert.equal(result.kind, "success");
    assert.equal(result.stars, 3);
    assert.equal(result.newBest, true);
    assert.equal(result.previousBest, undefined);
    assert.equal(result.nextLevel, "canyon");
    assert.deepEqual(game.bestResult("creek"), { cost: game.cost, stars: 3 });
    assert.ok(game.isCompleted("creek"));

    for (let f = 0; f < 60; f++) game.tick();
    assert.equal(reported.length, 1, "reported once");
  });

  test("a dearer win doesn't replace the best; a cheaper one does", () => {
    const game = createGame("creek");
    game.importStructure(solutions.creek(creekLevel));
    runTest(game);
    const best = game.bestResult();

    game.reset();
    assert.equal(game.result, undefined, "reset clears the result");
    // make it dearer: swap the thin hangers for full cables
    const dearer = solutions.creek(creekLevel);
    for (const l of dearer.links) if (l.material === "cable-thin") l.material = "cable";
    game.importStructure(dearer);
    const second = runTest(game);
    assert.equal(second.kind, "success");
    assert.ok(second.cost > best.cost);
    assert.equal(second.newBest, false);
    assert.deepEqual(second.best, best);
    assert.deepEqual(game.bestResult(), best);
  });

  test("losing a truck fails, with the reason, no stars and no best", () => {
    const game = createGame("creek"); // bare anchors
    const result = runTest(game);
    assert.equal(result.kind, "failed");
    assert.equal(result.stars, 0);
    assert.equal(result.reason, "fell");
    assert.equal(game.bestResult(), undefined);
    assert.equal(game.isCompleted(), false);
  });

  test("crossing over budget earns nothing", () => {
    const game = createGame("canyon"); // the example bridge is over budget
    const result = runTest(game);
    assert.equal(result.kind, "over-budget");
    assert.equal(result.stars, 0);
    assert.equal(game.bestResult(), undefined);
  });

  test("the last level has no next level", () => {
    const game = createGame("mountain");
    const result = runTest(game);
    assert.equal(result.nextLevel, undefined);
  });

  test("unreadable or bogus saved bests are ignored", () => {
    const game = createGame("creek");
    localStorage.setItem("bridge-builder:best", "{not json");
    assert.equal(game.bestResult(), undefined);
    localStorage.setItem("bridge-builder:best", JSON.stringify({ creek: { cost: "cheap", stars: 7 } }));
    assert.equal(game.bestResult(), undefined);
  });
});

describe("money saver", () => {
  test("after a win, the biggest saving from a cheaper piece is named and marked, until the next edit", () => {
    const game = createGame("brook");
    const s = solutions.brook(levels[0]);
    // a steel piece between two anchors: it never carries anything
    s.links.push({ a: 0, b: 1, material: "steel" });
    game.importStructure(s);
    const result = runTest(game);
    assert.equal(result?.kind, "success");
    assert.equal(result?.idle?.label, "Steel");
    assert.equal(result.idle.to, "Wood", "the cheapest piece that would still hold");
    assert.ok(result.idle.load < 0.01 && Math.abs(result.idle.saving - 1700) < 1);
    assert.equal(game.idleLink?.material.name, "steel");
    game.reset();
    assert.ok(game.idleLink, "still marked on the rebuilt bridge");
    game.restartLevel();
    assert.equal(game.idleLink, undefined, "an edit clears it");
  });

  test("a bridge where every piece works hard has none", () => {
    const game = createGame("brook");
    game.importStructure(solutions.brook(levels[0]));
    const result = runTest(game);
    assert.equal(result?.kind, "success");
    assert.equal(result?.idle, undefined, "the road itself is never pointed out");
  });

  test("on every reference bridge, the swap it suggests still wins", () => {
    const names = { Wood: "wood", "Light steel": "steel-light", "Thin cable": "cable-thin" };
    let suggested = 0;
    for (const level of levels) {
      const game = createGame(level.id);
      game.importStructure(solutions[level.id](level));
      const idle = runTest(game)?.idle;
      if (!idle) continue;
      suggested++;
      const index = game.scene.links.indexOf(/** @type {any} */ (game.idleLink));
      game.reset();
      const swapped = game.scene.serialize();
      swapped.links[index].material = names[idle.to];
      const again = createGame(level.id);
      again.importStructure(swapped);
      const result = runTest(again);
      assert.equal(result?.kind, "success", `${level.id}: ${idle.label} to ${idle.to}`);
      assert.equal(result.broken, 0, level.id);
    }
    assert.ok(suggested > 0);
  });
});
