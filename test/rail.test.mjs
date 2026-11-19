import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { bareDeck, solutions } from "./solutions.mjs";
import { brookLevel, findLevel, levels } from "../src/js/level.mjs";
import { VEHICLE_TYPES } from "../src/js/vehicle-types.mjs";
import { rail, road } from "../src/js/materials/road.mjs";
import { failureTip } from "../src/js/hints.mjs";

function play(levelId, structure) {
  const game = createGame(levelId);
  game.importStructure(structure);
  game.setSimulationRunning(true);
  for (let f = 0; f < 120 * 60 && !game.testFinished; f++) game.tick();
  return game;
}

describe("rail", () => {
  test("cars can't drive on rail: Brook with a rail deck loses", () => {
    const game = play("brook", bareDeck(brookLevel, -10, 10, 10, 10, "rail"));
    assert.equal(game.testState, "fell");
  });

  test("the same bridge in road wins Brook", () => {
    assert.equal(play("brook", bareDeck(brookLevel, -10, 10, 10, 10)).testState, "crossed");
  });

  test("a rail deck is lighter than road and stronger in tension, but dearer", () => {
    const perMetre = (m) => m.density * m.crossSectionalArea;
    assert.ok(perMetre(rail) < perMetre(road));
    assert.ok(rail.tensileStrength * rail.crossSectionalArea > road.tensileStrength * road.crossSectionalArea);
    assert.ok(rail.costPerMeter > road.costPerMeter);
    assert.equal(rail.carries, "rail");
    assert.equal(road.carries, "road");
    assert.equal(rail.look.kind, "deck");
  });

  test("road levels carry road vehicles and railway levels trains, and nothing mixes", () => {
    for (const level of levels) {
      const tracks = new Set(level.convoy.map(id => VEHICLE_TYPES[id].track));
      assert.equal(tracks.size, 1, level.id);
      assert.equal(level.track, [...tracks][0]);
    }
    assert.deepEqual(levels.slice(-3).map(l => l.track), ["rail", "rail", "rail"], "the railway comes last");
  });

  test("a train is a locomotive in front, coupled close, all at one speed", () => {
    const level = findLevel("freight");
    const train = level.createConvoy();
    assert.equal(train[0].type.id, "locomotive");
    assert.ok(train.slice(1).every(v => v.type.id === "wagon"));
    for (let i = 1; i < train.length; i++) {
      const gap = (train[i - 1].x - train[i - 1].length / 2) - (train[i].x + train[i].length / 2);
      assert.ok(Math.abs(gap - 1) < 1e-9, `gap ${gap}`);
      assert.equal(train[i].speed, train[0].speed);
    }
  });

  test("trains are spoken of as one train", () => {
    const level = findLevel("freight");
    assert.equal(level.convoySummary, "380 t train: locomotive + 4 wagons");
    assert.equal(findLevel("branch-line").convoySummary, "240 t train: locomotive + 2 wagons");
    assert.equal(level.vehicleNoun.one, "train");
  });

  test("the whole train makes it across the reference bridge", () => {
    const level = findLevel("mountain");
    const game = play("mountain", solutions.mountain(level));
    assert.equal(game.testState, "crossed");
    assert.ok(game.vehicles.every(v => v.state === "crossed"));
  });

  test("a gap in the track: the tip says trains need rail", () => {
    const game = createGame("branch-line");
    assert.equal(game.roadAcross, false);
    game.importStructure(bareDeck(findLevel("branch-line"), -20, 10, 20, 10)); // road, not rail
    assert.equal(game.roadAcross, false, "road doesn't count as track");
    game.importStructure(bareDeck(findLevel("branch-line"), -20, 10, 20, 10, "rail"));
    assert.equal(game.roadAcross, true);
    assert.match(failureTip({ kind: "failed", roadAcross: false }, "rail"), /Trains need Rail/);
    assert.match(failureTip({ kind: "failed", failure: { material: "rail", label: "Rail", kind: "deck", mode: "tension" } }, "rail"), /^The track/);
  });
});
