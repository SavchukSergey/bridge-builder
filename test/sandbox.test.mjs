import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import {
  SANDBOX_DEFAULT, SANDBOX_TRAFFIC, findSandboxLevel, isSandboxId, normalizeSandbox, parseSandboxId, sandboxId,
} from "../src/js/sandbox.mjs";
import { decodeBridge, encodeBridge } from "../src/js/share.mjs";
import { BEST_KEY, COMPLETED_KEY, LEVEL_KEY, TRIES_KEY } from "../src/js/storage.mjs";

/** Runs a load test on the game's current structure to the end. */
function runTest(game) {
  game.setSimulationRunning(true);
  for (let i = 0; i < 60 * 180 && !game.result; i++) game.tick();
  assert.ok(game.result, "the test finished");
  return game.result;
}

describe("sandbox ids", () => {
  test("spell out the whole design, and read back", () => {
    for (const spec of [
      SANDBOX_DEFAULT,
      { gap: 20, far: -12, rock: false, traffic: "cars", budget: 1000, theme: "night" },
      { gap: 200, far: 12, rock: true, traffic: "train6", budget: 1000000, theme: "snow" },
    ]) {
      const id = sandboxId(spec);
      assert.match(id, /^[a-z0-9-]+$/, "fits in a share link");
      assert.ok(isSandboxId(id));
      assert.deepEqual(parseSandboxId(id), spec);
    }
    assert.equal(sandboxId({ gap: 60, far: 4 }), "sandbox-g60-fu4-r0-ttrucks2-b40000-summer");
  });

  test("values are moved into range and onto their steps; a rock needs 60 m", () => {
    assert.deepEqual(normalizeSandbox({ gap: 5, far: 99, budget: 1234, traffic: "spaceships", theme: /** @type {any} */ ("mars") }),
      { ...SANDBOX_DEFAULT, gap: 20, far: 12, budget: 1000 });
    assert.equal(normalizeSandbox({ gap: 50, rock: true }).rock, false);
    assert.equal(normalizeSandbox({ gap: 60, rock: true }).rock, true);
    assert.equal(normalizeSandbox({ gap: 63 }).gap, 60);
  });

  test("only ids it would make itself are accepted", () => {
    for (const bad of [
      "sandbox-", "sandbox-g60", "creek", "", undefined, null,
      "sandbox-g65-fu0-r0-ttrucks2-b40000-summer", // off-step gap
      "sandbox-g60-fu0-r0-ttrucks2-b40000-mars", // no such scenery
      "sandbox-g60-fu0-r0-tspaceships-b40000-summer", // no such traffic
      "sandbox-g40-fu0-r1-ttrucks2-b40000-summer", // a rock in a 40 m gap
      "sandbox-g60-fd0-r0-ttrucks2-b40000-summer", // "minus zero": not how it's written
      "sandbox-g60-fu0-r0-ttrucks2-b040000-summer", // leading zero
    ]) assert.equal(parseSandboxId(bad), undefined, String(bad));
    assert.equal(findLevel("sandbox-g65-fu0-r0-ttrucks2-b40000-summer"), undefined);
  });
});

describe("sandbox levels", () => {
  test("are built from the design, and found again as the same level", () => {
    const id = sandboxId({ gap: 80, far: -6, rock: true, traffic: "trucks4", budget: 50000, theme: "desert" });
    const level = findLevel(id);
    assert.ok(level?.sandbox);
    assert.equal(findLevel(id), level, "the same object");
    assert.equal(findSandboxLevel(id), level);
    assert.equal(level.groundAt(-40), 10, "near bank");
    assert.equal(level.groundAt(40), 4, "far bank 6 m lower");
    assert.equal(level.groundAt(-20), undefined, "the gap");
    assert.ok(level.groundAt(0) > level.water, "a rock that stands out of the river");
    assert.equal(level.anchors.length, 6, "two per bank and two on the rock");
    assert.deepEqual(level.convoy, SANDBOX_TRAFFIC.trucks4.convoy);
    assert.equal(level.budget, 50000);
    assert.ok(level.stars.three < level.stars.two && level.stars.two < level.budget);
    assert.equal(level.theme.id, "desert");
    assert.match(level.description, /80 m gap, the far bank 6 m lower, a rock in the middle\. Four 40 t trucks/);
    assert.ok(!levels.includes(level), "not one of the levels");
  });

  test("are always open, and a win records nothing and leads nowhere", () => {
    const game = createGame("brook");
    const id = sandboxId({ gap: 40, traffic: "trucks2", budget: 18000 });
    assert.ok(game.isUnlocked(id));
    game.selectLevel(id);
    assert.equal(game.level.id, id);
    game.importStructure(solutions.creek(game.level)); // the creek's bridge fits a 40 m sandbox
    const result = runTest(game);
    assert.equal(result.kind, "success");
    assert.ok(result.stars >= 1);
    assert.equal(result.nextLevel, undefined);
    assert.equal(localStorage.getItem(COMPLETED_KEY), null, "no level won");
    assert.equal(localStorage.getItem(BEST_KEY), null, "no best recorded");
    assert.equal(game.isUnlocked("creek"), false, "and nothing unlocked");
  });

  test("a failure there counts no tries, and offers no hint", () => {
    const game = createGame(sandboxId({ gap: 40 }));
    assert.equal(runTest(game).kind, "failed");
    assert.equal(localStorage.getItem(TRIES_KEY), null);
    assert.equal(game.outline, undefined);
    assert.equal(game.hintAvailable, false);
  });

  test("trains run on them too", () => {
    const game = createGame(sandboxId({ gap: 40, traffic: "train2", budget: 22000 }));
    assert.equal(game.level.track, "rail");
    game.importStructure(solutions["branch-line"](game.level));
    assert.equal(runTest(game).kind, "success");
  });

  test("the game reopens the last sandbox played, with its bridge", () => {
    const id = sandboxId({ gap: 100, far: 8, theme: "snow" });
    const game = createGame(id);
    game.importStructure(solutions.creek(findLevel("creek"))); // anything: it is just saved
    assert.equal(localStorage.getItem(LEVEL_KEY), id);
    const links = game.scene.links.length;
    const again = createGame(null, { keepStorage: true });
    assert.equal(again.level.id, id);
    assert.equal(again.scene.links.length, links);
  });

  test("a sandbox bridge goes through a share link", () => {
    const game = createGame(sandboxId({ gap: 120, rock: true, traffic: "hauler", budget: 90000, theme: "night" }));
    const data = game.exportStructure();
    const back = decodeBridge(encodeBridge(data));
    assert.equal(back.level, game.level.id);
    assert.ok(findLevel(back.level)?.sandbox);
  });
});
