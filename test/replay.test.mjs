import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame, key } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { creekLevel, findLevel } from "../src/js/level.mjs";
import { REPLAY_LEAD, REPLAY_SPEED } from "../src/js/game-config.mjs";

/** Creek with a bare deck, tested until it fails. */
function failedCreek() {
  const game = createGame("creek");
  game.importStructure(alternatives.creek["bare deck"](creekLevel));
  game.speed = 2;
  game.follow = true;
  game.setSimulationRunning(true);
  for (let i = 0; i < 60 * 60 && !game.result; i++) game.tick();
  assert.equal(game.result?.kind, "failed");
  return game;
}

/** Ticks until the replay has fast-forwarded to its start. */
function seek(game) {
  let frames = 0;
  while (game.replay?.seeking && frames < 2000) { game.tick(); frames++; }
  assert.equal(game.replay?.seeking, false, "the fast-forward finished");
  return frames;
}

describe("failure replay", () => {
  test("re-runs the test and breaks the same member at the same moment", () => {
    const game = failedCreek();
    const original = game.result.failure;
    assert.ok(game.canReplay);
    assert.equal(game.replayFailure(), true);
    assert.equal(game.result, undefined, "the old result is gone while it replays");
    seek(game);
    const t = game.evalCtx.time;
    assert.ok(t >= original.time - REPLAY_LEAD && t < original.time, `starts just before the break (${t} vs ${original.time})`);
    assert.ok(game.scene.links.every(l => !l.broken), "nothing has broken yet");
    assert.deepEqual(game.drainEvents(), [], "the fast-forward makes no sound");
    for (let i = 0; i < 60 * 120 && !game.result; i++) game.tick();
    assert.deepEqual(game.result?.failure, original);
  });

  test("plays slowly with the view on the member that broke", () => {
    const game = failedCreek();
    const { x } = game.result.failure;
    const zoom = game.ctx.zoom;
    game.replayFailure();
    assert.equal(game.speed, REPLAY_SPEED);
    assert.equal(game.follow, false, "the follow camera would pull away");
    assert.ok(game.ctx.zoom >= zoom, "zoomed in, never out");
    assert.ok(Math.abs(game.ctx.shift.x - x) < 1, "centred on the break");
    seek(game);
    const t0 = game.evalCtx.time;
    for (let i = 0; i < 60; i++) game.tick(1 / 60);
    assert.ok(Math.abs(game.evalCtx.time - t0 - REPLAY_SPEED) < 0.02, "a quarter of real time");
  });

  test("reset puts back the speed, the follow camera and the view", () => {
    const game = failedCreek();
    const before = { speed: game.speed, follow: game.follow, zoom: game.ctx.zoom };
    assert.ok(game.__followMoved, "the follow camera moved the view during the test");
    const view = { ...game.__viewBeforeTest };
    game.replayFailure();
    seek(game);
    game.replayFailure(); // a second replay remembers the settings from before the first
    game.reset();
    assert.equal(game.replay, undefined);
    assert.deepEqual({ speed: game.speed, follow: game.follow, zoom: game.ctx.zoom }, before);
    assert.deepEqual({ x: game.ctx.shift.x, y: game.ctx.shift.y }, { x: view.x, y: view.y }, "the view from before the test");
    assert.ok(game.isBuildMode);
  });

  test("only a failure with a break can be replayed", () => {
    const game = createGame("canyon");
    assert.equal(game.canReplay, false);
    assert.equal(game.replayFailure(), false);
    game.importStructure(solutions.canyon(findLevel("canyon")));
    game.setSimulationRunning(true);
    for (let i = 0; i < 60 * 120 && !game.result; i++) game.tick();
    assert.equal(game.result?.kind, "success");
    assert.equal(game.canReplay, false);
    assert.equal(game.replayFailure(), false);
    assert.equal(game.result?.kind, "success", "left alone");
  });

  test("[ and ] step on from the replay's speed, which is not one of the usual ones", () => {
    const game = createGame("brook");
    game.speed = REPLAY_SPEED;
    key(game, "[");
    assert.equal(game.speed, REPLAY_SPEED, "already slower than any of them");
    key(game, "]");
    assert.equal(game.speed, 0.5);
  });
});
