import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import { applyWind, windAt, windGust } from "../src/js/wind.mjs";
import { findSandboxLevel, parseSandboxId, sandboxId } from "../src/js/sandbox.mjs";
import { steel } from "../src/js/materials/steel.mjs";
import { road } from "../src/js/materials/road.mjs";

/** Tests a level's hint bridge with a wind; whether it gets across, and the game. */
function blow(levelId, wind) {
  const level = /** @type {import("../src/js/level.mjs").Level} */ (findLevel(levelId));
  const game = createGame(levelId);
  game.importStructure(solutions[levelId](level));
  level.wind = wind;
  try {
    game.setSimulationRunning(true);
    for (let f = 0; f < 120 * 60 && !game.result; f++) game.tick();
  } finally {
    level.wind = "calm";
  }
  return game;
}

describe("wind", () => {
  test("still while gravity warms up, then building into gusts", () => {
    assert.equal(windGust(0), 0);
    assert.equal(windGust(1.5), 0);
    for (let t = 5; t < 60; t += 0.37) assert.ok(windGust(t) > 0.4 && windGust(t) <= 1, `t ${t}`);
    assert.equal(windAt("calm", 10), 0);
    assert.equal(windAt(undefined, 10), 0);
    assert.ok(windAt("storm", 10) > windAt("breeze", 10));
  });

  test("pushes what stands up into it far more than a flat deck, half on each end", () => {
    const joint = (x, y) => ({ position: { x, y }, force: { x: 0, y: 0 } });
    const post = { a: joint(0, 0), b: joint(0, 10), material: steel, broken: false };
    const deck = { a: joint(0, 0), b: joint(10, 0), material: road, broken: false };
    const gone = { a: joint(0, 0), b: joint(0, 10), material: steel, broken: true };
    applyWind(/** @type {any} */ ([post, deck, gone]), 100);
    assert.equal(post.a.force.x, 500);
    assert.equal(post.b.force.x, 500);
    assert.ok(deck.a.force.x > 0 && deck.a.force.x < post.a.force.x / 3);
    assert.equal(gone.a.force.x, 0);
  });

  test("a breeze troubles no hint bridge", () => {
    for (const level of levels) assert.equal(blow(level.id, "breeze").result?.kind, "success", level.id);
  });

  test("a storm brings down a tall bridge that stands in calm, the same way every time", () => {
    assert.equal(blow("grand", "calm").result?.kind, "success");
    const a = blow("grand", "storm").result, b = blow("grand", "storm").result;
    assert.notEqual(a?.kind, "success");
    assert.equal(a?.failure?.time, b?.failure?.time);
    assert.equal(blow("brook", "storm").result?.kind, "success", "a short flat one is fine");
  });

  test("sandbox levels carry their wind in the id; ids from before wind are calm", () => {
    const old = "sandbox-g60-fu4-r0-ttrucks2-b40000-summer";
    assert.equal(parseSandboxId(old)?.wind, "calm");
    assert.equal(sandboxId({ gap: 60, far: 4, wind: "storm" }), `${old}-w2`);
    assert.equal(findSandboxLevel(`${old}-w1`)?.wind, "breeze");
    for (const bad of [`${old}-w0`, `${old}-w3`, `${old}-wx`]) assert.equal(parseSandboxId(bad), undefined, bad);
    assert.match(findSandboxLevel(`${old}-w2`)?.description ?? "", /storm/);
  });
});
