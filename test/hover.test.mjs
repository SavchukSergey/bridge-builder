import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, createGame, runFrames } from "./helpers.mjs";
import { Joint } from "../src/js/engine/joint.mjs";
import { Link } from "../src/js/engine/link.mjs";
import { cable } from "../src/js/materials/cable.mjs";
import { steel } from "../src/js/materials/steel.mjs";
import { createVec3F } from "../src/js/math.js";

// Demo bridge (Canyon): the hanger at x = 10 runs from (10, 15.625) to (10, 10).
const HANGER_10 = [10, 12.8];

const hover = (game, x, y) => game.__handleMouseMove(at(game, x, y));

describe("link utilization", () => {
  test("is stress over the strength for the direction it is loaded in", () => {
    const a = new Joint(createVec3F(0, 0, 0)), b = new Joint(createVec3F(10, 0, 0));
    const l = new Link(a, b, steel);
    b.position.x = 10 * (1 + 0.001); // 200 MPa tension: half of steel's 400 MPa
    l.preEval();
    assert.ok(Math.abs(l.utilization - 0.5) < 1e-9);
    b.position.x = 10 * (1 - 0.001); // 200 MPa compression: 80% of steel's 250 MPa
    l.preEval();
    assert.ok(Math.abs(l.utilization - 0.8) < 1e-9);
  });

  test("a slack cable carries nothing", () => {
    const a = new Joint(createVec3F(0, 0, 0)), b = new Joint(createVec3F(10, 0, 0));
    const l = new Link(a, b, cable);
    b.position.x = 9;
    l.preEval();
    assert.equal(l.utilization, 0);
  });

  test("the peak is tracked while simulating and cleared by reset", () => {
    const game = createGame();
    runFrames(game, 300);
    const peaks = game.scene.links.map(l => l.peakUtilization);
    assert.ok(peaks.every(p => p > 0), "every link has carried load");
    assert.ok(game.scene.links.every(l => l.peakUtilization >= l.utilization - 1e-12));
    game.reset();
    assert.ok(game.scene.links.every(l => l.peakUtilization === 0));
  });
});

describe("hovering", () => {
  test("pointing at a link reports it, with material, length, cost and load", () => {
    const game = createGame();
    hover(game, ...HANGER_10);
    const link = game.hoveredLink;
    assert.ok(link);
    assert.equal(link.material.name, "cable");
    assert.ok(link.a.position.x === 10 && link.b.position.x === 10);

    const info = game.hoverInfo;
    assert.equal(info.material, "cable");
    assert.ok(Math.abs(info.length - 5.625) < 1e-9);
    assert.ok(Math.abs(info.cost - 5.625 * 60) < 1e-9);
    assert.equal(info.state, "unloaded", "nothing is loaded before the simulation runs");
    assert.equal(info.peakUtilization, undefined, "no peak in build mode");
  });

  test("during a simulation the hanger is in tension, with a peak", () => {
    const game = createGame();
    runFrames(game, 240);
    hover(game, 10, 12.5);
    const info = game.hoverInfo;
    assert.equal(info.state, "tension");
    assert.ok(info.forceKN > 10, `force ${info.forceKN} kN`);
    assert.ok(info.utilization > 0 && info.utilization < 1);
    assert.ok(info.peakUtilization >= info.utilization);
  });

  test("the main cable is never shown as in compression", () => {
    const game = createGame();
    runFrames(game, 240);
    for (const link of game.scene.links.filter(l => l.material.name === "cable")) {
      const mid = { x: (link.a.position.x + link.b.position.x) / 2, y: (link.a.position.y + link.b.position.y) / 2 };
      game.__handleMouseMove(at(game, mid.x, mid.y));
      const info = game.hoverInfo;
      if (info?.material === "cable") assert.notEqual(info.state, "compression");
    }
  });

  test("empty space, leaving the canvas, panning and placing a link hide it", () => {
    const game = createGame();
    hover(game, 0, 60);
    assert.equal(game.hoverInfo, undefined, "empty space");

    hover(game, ...HANGER_10);
    assert.ok(game.hoverInfo);
    game.__handlePointerLeave();
    assert.equal(game.hoverInfo, undefined, "left the canvas");

    const start = at(game, ...HANGER_10);
    game.__handleMouseDown(start);
    game.__handleMouseMove({ ...start, clientX: start.clientX + 40 });
    assert.equal(game.hoverInfo, undefined, "while panning");
    game.__handleMouseUp();

    const placing = createGame(); // (the click ending a pan is ignored, so use a fresh game)
    placing.__handleClick(at(placing, -40, 25)); // start placing a link from the tower top
    hover(placing, ...HANGER_10);
    assert.ok(placing.__clickState);
    assert.equal(placing.hoverInfo, undefined, "while placing a link");
  });

  test("a cable pushed shorter than its length shows as slack", () => {
    const game = createGame();
    hover(game, ...HANGER_10);
    const link = game.hoveredLink;
    link.b.position.y += 0.5; // squeeze the hanger
    link.preEval();
    assert.equal(game.hoverInfo.state, "slack");
    assert.equal(game.hoverInfo.forceKN, 0);
  });

  test("broken links can't be hovered", () => {
    const game = createGame();
    hover(game, ...HANGER_10);
    game.hoveredLink.broken = true;
    assert.equal(game.hoveredLink, undefined);
  });
});
