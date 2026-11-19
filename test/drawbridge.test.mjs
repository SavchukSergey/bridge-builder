import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { Builder, solutions } from "./solutions.mjs";
import { findLevel } from "../src/js/level.mjs";
import { segmentHitsBox, trafficStart, winchPull } from "../src/js/drawbridge.mjs";
import { failureTip } from "../src/js/hints.mjs";
import { setLanguage } from "../src/js/i18n.mjs";

const level = findLevel("drawbridge");
const spec = /** @type {NonNullable<typeof level.drawbridge>} */ (level.drawbridge);

/** The reference bridge, with the winch swapped for another material. */
function withWinchAs(material) {
  const s = solutions.drawbridge(level);
  return { ...s, links: s.links.map(l => l.material === "winch" ? { ...l, material } : l) };
}

/** Runs the test until won or lost; returns the game. */
function play(structure, levelId = "drawbridge") {
  const game = createGame(levelId);
  game.importStructure(structure);
  game.setSimulationRunning(true);
  for (let f = 0; f < 90 * 60 && !game.result; f++) game.tick();
  return game;
}

describe("the drawbridge", () => {
  test("winches pull in for the boat and let out before the traffic sets off", () => {
    assert.equal(winchPull(spec, 0), 1);
    assert.equal(winchPull(spec, spec.lift[0]), 1);
    assert.ok(Math.abs(winchPull(spec, spec.pass[0]) - spec.pull) < 1e-9, "pulled in while the boat sails");
    assert.ok(Math.abs(winchPull(spec, spec.pass[1]) - spec.pull) < 1e-9);
    assert.equal(winchPull(spec, spec.lower[1]), 1);
    assert.ok(spec.lift[1] <= spec.pass[0] && spec.pass[1] <= spec.lower[0]);
    assert.ok(trafficStart(spec) > spec.lower[1]);
  });

  test("a piece is in the boat's way if any part of it is inside the space", () => {
    const box = { x0: -6, x1: 6, y0: 3, y1: 16 };
    assert.equal(segmentHitsBox({ x: -10, y: 10 }, { x: 10, y: 10 }, box), true, "a road across");
    assert.equal(segmentHitsBox({ x: 0, y: 5 }, { x: 1, y: 6 }, box), true, "inside");
    assert.equal(segmentHitsBox({ x: -10, y: 10 }, { x: -5, y: 29 }, box), false, "lifted");
    assert.equal(segmentHitsBox({ x: -10, y: 24 }, { x: 10, y: 24 }, box), false, "above");
    assert.equal(segmentHitsBox({ x: -10, y: 10 }, { x: -8, y: 20 }, box), false, "beside");
  });

  test("the reference bridge lifts, lets the boat through, comes down and carries the traffic", () => {
    const game = createGame("drawbridge");
    game.importStructure(solutions.drawbridge(level));
    game.setSimulationRunning(true);
    let highest = -Infinity;
    for (let f = 0; f < 90 * 60 && !game.result; f++) {
      game.tick();
      if (game.boat?.state === "sailing") highest = Math.max(highest, Math.min(...game.scene.joints.filter(j => !j.fixed).map(j => j.position.y)));
      if (game.vehicles.some(v => v.state === "driving")) assert.equal(game.boat?.state, "through", "no traffic before the boat is through");
    }
    assert.ok(highest > spec.top, `the road was up (${highest.toFixed(1)} m) while the boat sailed`);
    assert.equal(game.result?.kind, "success");
  });

  test("a bridge that can't lift is in the boat's way: the boat is the reason, with a tip", () => {
    const game = play(withWinchAs("cable"));
    assert.equal(game.boat?.state, "hit");
    assert.equal(game.result?.kind, "failed");
    assert.equal(game.result?.reason, "boat");
    assert.ok(game.vehicles.every(v => v.state === "waiting"), "the traffic never set off");
    setLanguage("en");
    assert.match(failureTip(/** @type {any} */ (game.result)), /Winch/);
  });

  test("off a drawbridge level a winch is just a cable, and a reset lets every winch out", () => {
    const creek = findLevel("creek");
    const b = new Builder(creek);
    const game = play(solutions.drawbridge(level));
    assert.ok(game.scene.links.filter(l => l.material.winch).every(l => Math.abs(l.pull - 1) < 1e-9), "let out at the end");
    game.reset();
    assert.ok(game.scene.links.every(l => l.pull === 1));

    const other = createGame("creek");
    other.importStructure({ ...b.build(), links: [{ a: 0, b: 1, material: "winch" }] });
    other.setSimulationRunning(true);
    for (let f = 0; f < 600; f++) other.tick();
    assert.equal(other.boat, undefined);
    assert.ok(other.scene.links.every(l => l.pull === 1));
  });
});
