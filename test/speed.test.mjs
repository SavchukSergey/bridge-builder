import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, createGame, key } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { creekLevel, findLevel } from "../src/js/level.mjs";
import { SPEEDS } from "../src/js/game.js";

/** Runs a load test to the end at `speed`; returns the result and how many frames it took. */
function run(levelId, structure, speed) {
  const game = createGame(levelId);
  game.importStructure(structure);
  game.speed = speed;
  game.setSimulationRunning(true);
  let frames = 0;
  while (!game.result && frames < 120 * 60) { game.tick(); frames++; }
  const peaks = game.scene.links.map(l => l.peakUtilization);
  return { game, result: game.result, frames, peaks };
}

describe("test speed", () => {
  test("4× gets there in a quarter of the frames, with exactly the same physics", () => {
    const level = findLevel("canyon");
    const slow = run("canyon", solutions.canyon(level), 1);
    const fast = run("canyon", solutions.canyon(level), 4);
    assert.equal(fast.result.kind, slow.result.kind);
    assert.equal(fast.result.stars, slow.result.stars);
    assert.ok(Math.abs(fast.frames - slow.frames / 4) <= 2, `${fast.frames} vs ${slow.frames}`);
    assert.deepEqual(fast.peaks, slow.peaks, "every member saw the same peak load");
  });

  test("a failing bridge fails the same way at half speed", () => {
    const structure = alternatives.creek["bare deck"](creekLevel);
    const normal = run("creek", structure, 1);
    const slow = run("creek", alternatives.creek["bare deck"](creekLevel), 0.5);
    assert.equal(slow.result.kind, "failed");
    assert.deepEqual(slow.result.failure, normal.result.failure);
    assert.equal(slow.result.broken, normal.result.broken);
    assert.ok(Math.abs(slow.frames - normal.frames * 2) <= 2);
  });

  test("[ and ] step through the speeds and stop at the ends", () => {
    const game = createGame("brook");
    assert.equal(game.speed, 1);
    key(game, "]");
    assert.equal(game.speed, 2);
    key(game, "]");
    key(game, "]");
    assert.equal(game.speed, SPEEDS.at(-1));
    for (let i = 0; i < 6; i++) key(game, "[");
    assert.equal(game.speed, SPEEDS[0]);
  });
});

describe("follow camera", () => {
  /** Canyon, zoomed in so the traffic leaves the view without following. */
  function zoomedIn() {
    const level = findLevel("canyon");
    const game = createGame("canyon");
    game.importStructure(solutions.canyon(level));
    game.ctx.zoom = 30;
    game.ctx.shift = { x: level.startX, y: level.startY, z: 0 };
    return game;
  }

  test("keeps the traffic in view, and reset puts the view back", () => {
    const game = zoomedIn();
    game.follow = true;
    const start = { ...game.ctx.shift };
    game.setSimulationRunning(true);
    const halfWidth = game.ctx.width / 2 / game.ctx.zoom;
    for (let f = 0; f < 60 * 12; f++) {
      game.tick();
      if (f > 60 * 3) {
        const lead = Math.max(...game.vehicles.filter(v => v.state === "driving").map(v => v.x));
        if (Number.isFinite(lead)) assert.ok(Math.abs(lead - game.ctx.shift.x) < halfWidth, `frame ${f}: the lead vehicle is on screen`);
      }
    }
    assert.ok(game.ctx.shift.x > start.x + 10, "the view moved along with the traffic");
    game.reset();
    assert.deepEqual({ x: game.ctx.shift.x, y: game.ctx.shift.y }, { x: start.x, y: start.y });
  });

  test("off, the view stays put", () => {
    const game = zoomedIn();
    const start = { ...game.ctx.shift };
    game.setSimulationRunning(true);
    for (let f = 0; f < 60 * 5; f++) game.tick();
    assert.deepEqual(game.ctx.shift, start);
  });

  test("panning by hand during the test turns it off; F turns it back on", () => {
    const game = zoomedIn();
    game.follow = true;
    game.setSimulationRunning(true);
    for (let f = 0; f < 60; f++) game.tick();
    game.__handleMouseDown(at(game, 0, 0));
    game.__handleMouseMove(at(game, 5, 0));
    game.__handleMouseUp(at(game, 5, 0));
    assert.equal(game.follow, false);
    const after = { ...game.ctx.shift };
    for (let f = 0; f < 60; f++) game.tick();
    assert.deepEqual(game.ctx.shift, after, "and the camera no longer moves");
    key(game, "f");
    assert.equal(game.follow, true);
  });

  test("panning in build mode leaves it on", () => {
    const game = createGame("brook");
    game.follow = true;
    game.__handleMouseDown(at(game, 0, 0));
    game.__handleMouseMove(at(game, 5, 0));
    game.__handleMouseUp(at(game, 5, 0));
    assert.equal(game.follow, true);
  });
});
