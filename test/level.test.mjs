import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { alternatives, solutions } from "./solutions.mjs";
import { canyonLevel, creekLevel, findLevel, levels, pierLevel, stepLevel } from "../src/js/level.mjs";
import { SAVE_FORMAT_VERSION, Scene } from "../src/js/scene.js";

/** Runs a level's load test on a structure until won or lost. */
function play(level, structure) {
  const game = createGame(level.id);
  if (structure) game.importStructure(structure);
  game.setSimulationRunning(true);
  for (let f = 0; f < 90 * 60 && !game.testFinished; f++) game.tick();
  return game;
}

describe("level definitions", () => {
  test("ids are unique and findLevel looks them up", () => {
    assert.equal(new Set(levels.map(l => l.id)).size, levels.length);
    for (const level of levels) assert.equal(findLevel(level.id), level);
    assert.equal(findLevel("nope"), undefined);
  });

  test("anchors, start and finish sit on the terrain", () => {
    for (const level of levels) {
      for (const { x, y } of level.anchors) {
        assert.equal(level.groundAt(x), y, `${level.id}: anchor (${x}, ${y}) is on the ground`);
      }
      assert.notEqual(level.groundAt(level.startX), undefined, `${level.id}: start on ground`);
      assert.notEqual(level.groundAt(level.finishX), undefined, `${level.id}: finish on ground`);
      const queueEnd = level.startX - (level.vehicleCount - 1) * level.vehicleSpacing;
      assert.notEqual(level.groundAt(queueEnd), undefined, `${level.id}: the whole convoy starts on ground`);
    }
  });

  test("groundAt returns the highest block under x, and undefined over the gap", () => {
    assert.equal(stepLevel.groundAt(-35), 10);
    assert.equal(stepLevel.groundAt(35), 18);
    assert.equal(stepLevel.groundAt(0), undefined);
    assert.equal(pierLevel.groundAt(0), -6, "the rock in the river");
    assert.equal(pierLevel.groundAt(10), undefined);
  });

  test("a level starts from its bare anchors, unless it has an example", () => {
    const start = new Scene();
    start.load(creekLevel.initialStructure());
    assert.equal(start.links.length, 0);
    assert.deepEqual(start.joints.map(j => j.fixed), creekLevel.anchors.map(() => true));

    assert.deepEqual(canyonLevel.initialStructure(), new Scene().serialize(), "the canyon starts from the demo bridge");
  });
});

describe("level balance", () => {
  for (const level of levels) {
    test(`${level.name}: the reference bridge carries the convoy within budget`, () => {
      const game = play(level, solutions[level.id](level));
      assert.equal(game.testState, "crossed");
      assert.equal(game.overBudget, false, `cost ${game.cost} vs budget ${level.budget}`);
      assert.equal(game.scene.links.filter(l => l.broken).length, 0);
    });

    test(`${level.name}: bare anchors lose`, () => {
      const anchorsOnly = { version: SAVE_FORMAT_VERSION, joints: level.anchors.map(a => ({ ...a, fixed: true })), links: [] };
      assert.equal(play(level, anchorsOnly).testState, "fell");
    });
  }

  for (const [levelId, design] of [["creek", "bare deck"], ["step", "bare ramp"], ["pier", "bare deck + A-frame"]]) {
    test(`${levelId}: a ${design} is not enough`, () => {
      const level = findLevel(levelId);
      assert.equal(play(level, alternatives[levelId][design](level)).testState, "fell");
    });
  }

  test("canyon: the example bridge carries the convoy but is over budget", () => {
    const game = play(canyonLevel);
    assert.equal(game.testState, "crossed");
    assert.equal(game.overBudget, true);
  });
});

describe("terrain hazards", () => {
  test("a truck driving into a cliff face is lost", () => {
    // Step level: a flat road at the lower height runs straight into the higher far cliff.
    const s = stepLevel.initialStructure();
    s.joints.push({ x: 30, y: 10, fixed: true });
    const anchorIndex = (x, y) => s.joints.findIndex(j => j.x === x && j.y === y);
    const deck = [anchorIndex(-30, 10)];
    for (let x = -20; x <= 20; x += 10) { s.joints.push({ x, y: 10, fixed: true }); deck.push(s.joints.length - 1); }
    deck.push(anchorIndex(30, 10));
    deck.slice(1).forEach((b, i) => s.links.push({ a: deck[i], b, material: "road" }));
    const game = play(stepLevel, s);
    assert.equal(game.testState, "fell");
    assert.equal(game.vehicles[0].lostReason, "crashed");
  });

  test("a fall of more than 4 m onto a road is a hard landing", () => {
    // Canyon: an upper road ends at x = -30; a road 6 m lower continues (all anchored).
    const s = { version: SAVE_FORMAT_VERSION, joints: [], links: [] };
    const j = (x, y) => (s.joints.push({ x, y, fixed: true }), s.joints.length - 1);
    s.links.push({ a: j(-40, 10), b: j(-30, 10), material: "road" });
    s.links.push({ a: j(-40, 4), b: j(-30, 4), material: "road" }, { a: s.joints.length - 1, b: j(-20, 4), material: "road" });
    const game = play(canyonLevel, s);
    assert.equal(game.vehicles[0].lostReason, "hard landing");
  });
});

describe("level selection", () => {
  test("a new game starts on the first level, or the last one played", () => {
    localStorage.clear();
    const fresh = createGame(levels[0].id);
    assert.equal(fresh.level, levels[0]);

    fresh.selectLevel("step");
    const reopened = createGame("step");
    assert.equal(reopened.level, stepLevel);
    assert.equal(localStorage.getItem("bridge-builder:level"), "step");
  });

  test("selecting a level loads its starting structure, clears undo and fits the view", () => {
    const game = createGame("canyon");
    game.restartLevel(); // something to undo
    game.selectLevel("pier");
    assert.equal(game.level, pierLevel);
    const expected = new Scene();
    expected.load(pierLevel.initialStructure());
    assert.deepEqual(game.scene.serialize(), expected.serialize());
    assert.equal(game.canUndo, false);
    assert.equal(game.ctx.shift.x, 0);
    assert.equal(game.ctx.shift.y, pierLevel.view.y);
    assert.ok(Math.abs(game.ctx.zoom - 800 / (pierLevel.view.x1 - pierLevel.view.x0)) < 1e-9);
  });

  test("unknown level ids fall back to the first level", () => {
    const game = createGame("canyon");
    game.selectLevel("does-not-exist");
    assert.equal(game.level, levels[0]);
  });

  test("selecting a level stops the simulation", () => {
    const game = createGame("canyon");
    game.setSimulationRunning(true);
    game.tick();
    game.selectLevel("creek");
    assert.ok(game.isBuildMode);
    assert.equal(game.evalCtx.simulation, false);
    assert.deepEqual(game.vehicles, []);
  });

  test("each level keeps its own autosave", () => {
    const game = createGame("creek");
    game.importStructure(solutions.creek(creekLevel));
    const creekBuild = game.scene.serialize();
    game.selectLevel("step");
    assert.equal(game.scene.links.length, 0, "step starts from bare anchors");
    game.selectLevel("creek");
    assert.deepEqual(game.scene.serialize(), creekBuild);
  });

  test("winning within budget marks the level completed; over budget does not", () => {
    const over = play(canyonLevel);
    assert.equal(over.testState, "crossed");
    assert.equal(over.isCompleted("canyon"), false);

    const won = play(creekLevel, solutions.creek(creekLevel));
    assert.equal(won.isCompleted("creek"), true);
    assert.equal(won.isCompleted("step"), false);
  });

  test("progress survives corrupt storage", () => {
    const game = createGame("creek");
    localStorage.setItem("bridge-builder:completed", "{oops");
    assert.equal(game.isCompleted("creek"), false);
  });

  test("exports carry the level; importing one from another level switches to it", () => {
    const game = createGame("creek");
    game.importStructure(solutions.creek(creekLevel));
    const file = JSON.parse(JSON.stringify(game.exportStructure()));
    assert.equal(file.level, "creek");

    game.selectLevel("step");
    game.importStructure(file);
    assert.equal(game.level, creekLevel);
    assert.equal(game.scene.links.length, file.links.length);
  });

  test("an invalid file from another level does not switch levels", () => {
    const game = createGame("step");
    assert.throws(() => game.importStructure({ version: SAVE_FORMAT_VERSION, level: "creek", joints: [], links: [{ a: 0, b: 1, material: "road" }] }));
    assert.equal(game.level, stepLevel);
  });
});

test("fitView centres the level in the area not covered by panels", () => {
  const game = createGame("creek");
  game.viewInsets = { top: 60, right: 200 };
  game.fitView();
  const { x0, x1, y } = creekLevel.view;
  const zoom = game.ctx.zoom;
  assert.ok(Math.abs(zoom - 600 / (x1 - x0)) < 1e-9, "fits the 600 px left visible");
  // the view's left and right edges land at the visible area's edges (0 and 600 px)
  const left = game.ctx.clientToGlobal({ x: 0, y: 330, z: 0 });
  const right = game.ctx.clientToGlobal({ x: 600, y: 330, z: 0 });
  assert.ok(Math.abs(left.x - x0) < 1e-9 && Math.abs(right.x - x1) < 1e-9);
  assert.ok(Math.abs(left.y - y) < 1e-9, "the view's centre height is mid-way down the visible area");
});
