import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildLink, createGame, rightClick, ui } from "./helpers.mjs";
import { guideProgress, piecesOf, planGuide } from "../src/js/guide.mjs";
import { levels } from "../src/js/level.mjs";
import { solutions } from "../src/js/solutions.mjs";
import { materials } from "../src/js/materials/index.mjs";
import { MAX_LINK_LENGTH } from "../src/js/game-config.mjs";

const isDeck = (m) => materials[m]?.look.kind === "deck";

/** The material id a link was built with (the scene keeps the material object). */
function materialId(material) {
  return Object.keys(materials).find(id => materials[id] === material);
}

/** Where the guide is, worked out as the game does it (with the reference bridge's pieces). */
function progressOf(game, steps) {
  const pieces = game.scene.links.map(l => ({ a: l.a.position, b: l.b.position, material: materialId(l.material) }));
  const dots = game.scene.joints.map(j => j.position);
  return guideProgress(steps, pieces, dots, piecesOf(solutions[game.level.id](game.level)));
}

describe("build it with me", () => {
  test("every reference bridge is built from pieces the editor builds in one go", () => {
    for (const level of levels) {
      const { joints, links } = solutions[level.id](level);
      for (const { a, b } of links) {
        const length = Math.hypot(joints[b].x - joints[a].x, joints[b].y - joints[a].y);
        assert.ok(length <= MAX_LINK_LENGTH + 1e-9, `${level.id}: a ${length.toFixed(1)} m piece`);
      }
    }
  });

  test("a piece the reference bridge doesn't have comes first, and isn't counted", () => {
    const level = levels.find(l => l.id === "brook");
    const reference = solutions.brook(level);
    const steps = planGuide(reference, level.initialStructure(), isDeck);
    const stray = { a: { x: -10, y: 10 }, b: { x: -10, y: 14 }, material: "steel" };
    const dots = level.initialStructure().joints.map(j => ({ x: j.x, y: j.y })).concat([stray.b]);
    const now = guideProgress(steps, [stray], dots, piecesOf(reference));
    assert.deepEqual(now.step, { kind: "remove", ...stray });
    assert.equal(now.done, 0);
    assert.equal(now.total, steps.length);
    assert.equal(guideProgress(steps, [], dots, piecesOf(reference)).step, steps[0], "without it, the plan");
  });

  test("the road comes first, and every piece starts from a dot already there", () => {
    for (const level of levels) {
      const steps = planGuide(solutions[level.id](level), level.initialStructure(), isDeck).filter(s => s.kind === "build");
      const decks = steps.map(s => isDeck(s.material));
      assert.ok(decks.indexOf(false) === -1 || decks.lastIndexOf(true) < decks.indexOf(false), `${level.id}: road first`);
      const known = level.initialStructure().joints.map(j => ({ x: j.x, y: j.y }));
      for (const s of steps) {
        assert.ok(known.some(k => Math.hypot(k.x - s.a.x, k.y - s.a.y) < 0.01), `${level.id}: starts at a dot that's there`);
        known.push(s.b);
      }
    }
  });

  test("Canyon starts by taking away what its reference bridge doesn't use", () => {
    const level = levels.find(l => l.id === "canyon");
    const steps = planGuide(solutions.canyon(level), level.initialStructure(), isDeck);
    assert.ok(steps[0].kind === "remove");
    assert.ok(steps.some(s => s.kind === "build"));
  });

  for (const level of levels) {
    test(`${level.name}: following the guide, clicking a little off each dot, builds the bridge that wins`, () => {
      const game = createGame(level.id);
      const steps = planGuide(solutions[level.id](level), level.initialStructure(), isDeck);
      for (let guard = 0; guard < steps.length + 5; guard++) {
        const { step } = progressOf(game, steps);
        if (!step) break;
        game.guideStep = step;
        if (step.kind === "remove") {
          rightClick(game, (step.a.x + step.b.x) / 2, (step.a.y + step.b.y) / 2);
        } else {
          ui.material = step.material;
          buildLink(game, step.a.x + 0.4, step.a.y - 0.3, step.b.x - 0.3, step.b.y + 0.4);
        }
      }
      const end = progressOf(game, steps);
      assert.equal(end.step, undefined, `${level.id}: every step done (${end.done} of ${end.total})`);
      game.guideStep = undefined;
      assert.ok(game.cost <= level.budget, `${level.id}: within budget`);
      game.setSimulationRunning(true);
      for (let f = 0; f < 90 * 60 && !game.testFinished; f++) game.tick();
      assert.equal(game.testState, "crossed", `${level.id}: the convoy gets across`);
    });
  }

  test("a piece of the wrong material is named, and the next step waits for it", () => {
    const level = levels.find(l => l.id === "brook");
    const game = createGame("brook");
    const steps = planGuide(solutions.brook(level), level.initialStructure(), isDeck);
    const first = steps[0];
    game.guideStep = first;
    ui.material = "steel";
    buildLink(game, first.a.x, first.a.y, first.b.x, first.b.y);
    const now = progressOf(game, steps);
    assert.equal(now.done, 0);
    assert.equal(now.wrong, "steel");
  });

  test("without the guide, clicks snap to the grid as before", () => {
    const game = createGame("brook");
    ui.material = "road";
    buildLink(game, -10, 10, -4.6, 10.3);
    const ends = game.scene.joints.map(j => j.position).filter(p => !Number.isInteger(p.x) || !Number.isInteger(p.y));
    assert.deepEqual(ends, []);
  });
});
