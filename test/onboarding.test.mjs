import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, createGame, ui } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { creekLevel, findLevel } from "../src/js/level.mjs";
import { failureTip } from "../src/js/hints.mjs";

/** Runs the load test until it is won or lost. */
function runTest(game) {
  game.setSimulationRunning(true);
  for (let f = 0; f < 90 * 60 && !game.result; f++) game.tick();
  return game.result;
}

describe("first failure", () => {
  test("a bare deck fails in tension in the road; the result says so and reset marks it", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["bare deck"](creekLevel));
    const result = runTest(game);
    assert.equal(result.kind, "failed");
    const { time, x, y, ...how } = result.failure;
    assert.deepEqual(how, { material: "road", label: "Road", kind: "deck", mode: "tension" });
    assert.ok(time > 0 && Number.isFinite(x) && Number.isFinite(y), "when and where it broke");
    assert.equal(result.roadAcross, true);
    const first = game.scene.firstFailure.link;

    game.reset();
    assert.equal(game.failedLink, first, "marked on the rebuilt bridge");
    assert.equal(first.broken, false, "and the bridge is whole again");

    game.__handleClick(at(game, -30, 10)); // any edit clears it
    game.__handleClick(at(game, -30, 14));
    assert.equal(game.failedLink, undefined);
  });

  test("a new test, or another level, clears the mark", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["bare deck"](creekLevel));
    runTest(game);
    game.reset();
    assert.ok(game.failedLink);
    game.setSimulationRunning(true);
    assert.equal(game.failedLink, undefined);
    game.reset();
    game.selectLevel("brook");
    assert.equal(game.failedLink, undefined);
  });

  test("with no road across, nothing breaks and the result says the road has a gap", () => {
    const game = createGame("creek"); // bare anchors
    const result = runTest(game);
    assert.equal(result.failure, undefined);
    assert.equal(result.roadAcross, false);
    assert.match(failureTip(result), /road has a hole/);
  });

  test("a win records no failure", () => {
    const game = createGame("brook");
    game.importStructure(solutions.brook(findLevel("brook")));
    const result = runTest(game);
    assert.equal(result.kind, "success");
    assert.equal(result.failure, undefined);
    game.reset();
    assert.equal(game.failedLink, undefined);
  });
});

describe("failure tips", () => {
  const base = { kind: "failed", reason: "fell", roadAcross: true };
  const tip = (failure, extra = {}) => failureTip({ ...base, ...extra, failure });
  test("name what to do for each way a member breaks", () => {
    assert.match(tip({ material: "road", label: "Road", kind: "deck", mode: "tension" }), /bent down and snapped/);
    assert.match(tip({ material: "road", label: "Road", kind: "deck", mode: "compression" }), /got squashed\. Add triangles/);
    assert.match(tip({ material: "cable-thin", label: "Thin cable", kind: "cable", mode: "tension" }), /normal cable/);
    assert.match(tip({ material: "cable", label: "Cable", kind: "cable", mode: "tension" }), /^A cable snapped\. Add more cables/);
    assert.match(tip({ material: "steel-light", label: "Light steel", kind: "beam", mode: "compression" }), /Use normal steel/);
    assert.match(tip({ material: "steel", label: "Steel", kind: "beam", mode: "compression" }), /A steel piece got squashed/);
    assert.match(tip({ material: "steel", label: "Steel", kind: "beam", mode: "tension" }), /pulled apart/);
  });

  test("explain crashes and hard landings when nothing broke", () => {
    assert.match(tip(undefined, { reason: "crashed" }), /cliff/);
    assert.match(tip(undefined, { reason: "hard landing" }), /steeply/);
    assert.match(tip(undefined), /bent down too far/);
  });
});

describe("placing a link", () => {
  test("the readout shows length, cost and the budget left; nothing when not placing", () => {
    const game = createGame("brook");
    ui.material = "road";
    assert.equal(game.placementInfo, undefined);
    assert.equal(game.isPlacing, false);

    game.__handleClick(at(game, -10, 10));
    assert.equal(game.isPlacing, true);
    game.__handleMouseMove(at(game, 0, 10));
    const info = game.placementInfo;
    assert.equal(info.label, "Road");
    assert.ok(Math.abs(info.length - 10) < 1e-9);
    assert.ok(Math.abs(info.cost - 3000) < 1e-6);
    assert.ok(Math.abs(info.remaining - (game.level.budget - 3000)) < 1e-6);
    assert.equal(info.mirrored, false);

    game.__handleMouseMove(at(game, 10, 10)); // 20 m: split in two 10 m links
    assert.ok(Math.abs(game.placementInfo.cost - 6000) < 1e-6);
    game.__handleKeyDown({ key: "Escape", preventDefault() { } });
    assert.equal(game.placementInfo, undefined);
  });

  test("with mirror on it counts both sides, and the length of one", () => {
    const game = createGame("brook");
    ui.material = "road";
    game.mirror = true;
    game.__handleClick(at(game, -10, 10));
    game.__handleMouseMove(at(game, -4, 10));
    const info = game.placementInfo;
    assert.ok(Math.abs(info.length - 6) < 1e-9);
    assert.ok(Math.abs(info.cost - 2 * 6 * 300) < 1e-6);
    assert.equal(info.mirrored, true);
  });

  test("going over the budget shows as negative remaining", () => {
    const game = createGame("brook");
    ui.material = "steel";
    game.__handleClick(at(game, -20, 10));
    game.__handleMouseMove(at(game, 10, 10)); // 30 m of steel: $6,000 + the existing nothing
    assert.ok(game.placementInfo.remaining < 6600);
    game.__handleMouseMove(at(game, 20, 30));
    assert.ok(game.placementInfo.remaining < 0, "a long steel link is over the $6,600 budget");
  });
});

describe("road across", () => {
  test("is false with a gap in the road and true once it spans the brook", () => {
    const game = createGame("brook");
    assert.equal(game.roadAcross, false);
    ui.material = "road";
    game.__handleClick(at(game, -10, 10));
    game.__handleClick(at(game, 0, 10));
    assert.equal(game.roadAcross, false, "half way");
    game.__handleClick(at(game, 0, 10));
    game.__handleClick(at(game, 10, 10));
    assert.equal(game.roadAcross, true);
  });
});
