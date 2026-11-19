import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import { QUAKE_LENGTH, QUAKE_START, applyQuake, quakeAt, quakeEnvelope, quakeShift, quakeUpAt } from "../src/js/quake.mjs";
import { findSandboxLevel, parseSandboxId, sandboxId } from "../src/js/sandbox.mjs";

/** Tests a level's hint bridge in an earthquake; the game after. */
function shake(levelId, quake) {
  const level = /** @type {import("../src/js/level.mjs").Level} */ (findLevel(levelId));
  const game = createGame(levelId);
  game.importStructure(solutions[levelId](level));
  level.quake = quake;
  try {
    game.setSimulationRunning(true);
    for (let f = 0; f < 120 * 60 && !game.result; f++) game.tick();
  } finally {
    level.quake = "none";
  }
  return game;
}

describe("earthquakes", () => {
  test("still at first, then it rumbles up, holds and dies away", () => {
    assert.equal(quakeEnvelope(QUAKE_START), 0);
    assert.equal(quakeEnvelope(QUAKE_START + QUAKE_LENGTH / 2), 1);
    assert.equal(quakeEnvelope(QUAKE_START + QUAKE_LENGTH), 0);
    for (const t of [0, 2, QUAKE_START, QUAKE_START + QUAKE_LENGTH, 30]) {
      assert.equal(Math.abs(quakeAt("big", t)), 0, `t ${t}`);
      assert.equal(Math.abs(quakeUpAt("big", t)), 0, `t ${t}`);
      assert.equal(Math.abs(quakeShift("big", t)), 0, `t ${t}`);
    }
    const during = Array.from({ length: 200 }, (_, i) => QUAKE_START + 2 + i * 0.02);
    assert.ok(during.some(t => quakeAt("big", t) > 1) && during.some(t => quakeAt("big", t) < -1), "back and forth");
    assert.ok(during.some(t => quakeUpAt("big", t) > 1) && during.some(t => quakeUpAt("big", t) < -1), "up and down");
    assert.ok(Math.max(...during.map(t => Math.abs(quakeAt("big", t)))) > Math.max(...during.map(t => Math.abs(quakeAt("small", t)))));
    assert.equal(quakeAt("none", QUAKE_START + 4), 0);
    assert.equal(quakeAt(undefined, QUAKE_START + 4), 0);
  });

  test("pushes each free joint by its own weight; anchors stay put", () => {
    const free = { mass: 100, fixed: false, force: { x: 0, y: 0 } };
    const anchor = { mass: 100, fixed: true, force: { x: 0, y: 0 } };
    applyQuake(/** @type {any} */ ([free, anchor]), 2);
    assert.equal(free.force.x, -200);
    assert.equal(anchor.force.x, 0);
  });

  test("a small one troubles no hint bridge", () => {
    for (const level of levels) assert.equal(shake(level.id, "small").result?.kind, "success", level.id);
  });

  test("a big one breaks a bridge built right at its limit, the same way every time", () => {
    assert.equal(shake("creek", "none").result?.kind, "success");
    const a = shake("creek", "big").result, b = shake("creek", "big").result;
    assert.notEqual(a?.kind, "success");
    assert.equal(a?.failure?.time, b?.failure?.time);
    assert.ok((a?.failure?.time ?? 0) > QUAKE_START, "only once it shakes");
  });

  test("the shaking stops when the test is reset", () => {
    const game = shake("creek", "big");
    game.reset();
    assert.equal(game.evalCtx.quakeUp, 0);
    assert.equal(game.evalCtx.gravity.y, 0, "gravity warms up again from nothing");
  });

  test("sandbox levels carry the earthquake in the id, after any wind", () => {
    const calm = "sandbox-g60-fu4-r0-ttrucks2-b40000-summer";
    assert.equal(parseSandboxId(calm)?.quake, "none");
    assert.equal(sandboxId({ gap: 60, far: 4, quake: "big" }), `${calm}-q2`);
    assert.equal(sandboxId({ gap: 60, far: 4, wind: "breeze", quake: "small" }), `${calm}-w1-q1`);
    assert.equal(findSandboxLevel(`${calm}-w2-q2`)?.quake, "big");
    for (const bad of [`${calm}-q0`, `${calm}-q3`, `${calm}-q1-w1`]) assert.equal(parseSandboxId(bad), undefined, bad);
    assert.match(findSandboxLevel(`${calm}-q2`)?.description ?? "", /earthquake/);
  });
});
