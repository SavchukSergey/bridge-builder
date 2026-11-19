import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, buildLink, createGame, key, rightClick } from "./helpers.mjs";

import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

// A small A-frame on Creek: two anchors and a free apex joint.
const APEX = [-14, 14];
function aFrame(extra = {}) {
  const game = createGame("creek");
  game.importStructure({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: -20, y: 10, fixed: true }, { x: APEX[0], y: APEX[1] }, { x: -8, y: 10, fixed: true }, ...(extra.joints ?? [])],
    links: [{ a: 0, b: 1, material: "steel" }, { a: 1, b: 2, material: "steel" }, ...(extra.links ?? [])],
  });
  game.__undoStack = [];
  return game;
}

/** Presses at a world point, drags to another, and releases. */
function drag(game, [x0, y0], [x1, y1], { alt = false, release = true } = {}) {
  const start = at(game, x0, y0);
  game.__handleMouseDown({ ...start, button: 0 });
  const end = at(game, x1, y1);
  game.__handleMouseMove({ ...end, altKey: alt });
  if (release) {
    game.__handleMouseUp();
    game.__handleClick({ ...end, altKey: alt }); // the click a real release fires
  }
}

const near = (a, b) => Math.abs(a - b) < 1e-9;
const linksOf = (game, joint) => game.scene.links.filter(l => l.a === joint || l.b === joint);
const jointAt = (game, x, y) => game.scene.findJoint({ x, y, z: 0 }, 1e-6);

describe("dragging joints", () => {
  test("moves a free joint to the grid, and its links take their new lengths", () => {
    const game = aFrame();
    const joint = jointAt(game, ...APEX);
    const costBefore = game.cost;

    drag(game, APEX, [-14.3, 15.2]);
    assert.deepEqual([joint.position.x, joint.position.y], [-14, 15]);
    for (const link of linksOf(game, joint)) {
      const length = Math.hypot(link.b.position.x - link.a.position.x, link.b.position.y - link.a.position.y);
      assert.ok(near(link.length, length), "rest length matches the new geometry");
      assert.ok(near(link.strain, 0), "unstressed in its new place");
    }
    assert.notEqual(game.cost, costBefore);
    assert.equal(game.__clickState, undefined, "the release did not start a link");
  });

  test("is one undo step", () => {
    const game = aFrame();
    const joint = () => game.scene.joints[1];
    const cost = game.cost;
    drag(game, APEX, [-14, 16]);
    assert.ok(game.canUndo);
    game.undo();
    assert.equal(joint().position.y, 14);
    assert.ok(near(game.cost, cost));
    game.redo();
    assert.equal(joint().position.y, 16);
  });

  test("Alt places it off the grid", () => {
    const game = aFrame();
    const joint = jointAt(game, ...APEX);
    drag(game, APEX, [-14.3, 15.2], { alt: true });
    assert.ok(Math.abs(joint.position.x + 14.3) < 0.01 && Math.abs(joint.position.y - 15.2) < 0.01);
  });

  test("anchors can't be dragged: the drag pans instead", () => {
    const game = aFrame();
    const anchor = jointAt(game, -20, 10);
    drag(game, [-20, 10], [-17, 10]);
    assert.deepEqual([anchor.position.x, anchor.position.y], [-20, 10]);
    assert.notEqual(game.ctx.shift.x, 0, "panned");
    assert.ok(!game.canUndo);
  });

  test("won't stretch a link past 25 m or drop onto another joint", () => {
    const game = aFrame();
    const joint = jointAt(game, ...APEX);
    drag(game, APEX, [-14, 45]); // both legs would be ~35 m
    assert.equal(joint.position.y, 14);
    drag(game, APEX, [-8, 10]); // onto the right anchor
    assert.equal(joint.position.y, 14);
    assert.ok(!game.canUndo, "nothing changed, nothing to undo");
  });

  test("stays at the last allowed spot when the pointer goes too far", () => {
    const game = aFrame();
    const joint = jointAt(game, ...APEX);
    game.__handleMouseDown({ ...at(game, ...APEX), button: 0 });
    game.__handleMouseMove(at(game, -14, 16));
    game.__handleMouseMove(at(game, -14, 40));
    game.__handleMouseUp();
    assert.equal(joint.position.y, 16);
  });

  test("Esc puts it back, and the release does nothing", () => {
    const game = aFrame();
    const joint = jointAt(game, ...APEX);
    drag(game, APEX, [-14, 16], { release: false });
    assert.equal(joint.position.y, 16);
    key(game, "Escape");
    assert.equal(joint.position.y, 14);
    game.__handleMouseMove(at(game, -14, 17));
    assert.equal(joint.position.y, 14, "ignored until released");
    game.__handleMouseUp();
    game.__handleClick(at(game, -14, 17));
    assert.equal(game.__clickState, undefined);
    assert.ok(!game.canUndo);
  });

  test("a click without moving still starts a link", () => {
    const game = aFrame();
    const start = at(game, ...APEX);
    game.__handleMouseDown({ ...start, button: 0 });
    game.__handleMouseUp();
    game.__handleClick(start);
    assert.equal(game.__clickState?.jointA, jointAt(game, ...APEX));
  });

  test("not while simulating: the drag pans", () => {
    const game = aFrame();
    game.setSimulationRunning(true);
    const joint = jointAt(game, ...APEX);
    drag(game, APEX, [-14, 17]);
    assert.ok(Math.abs(joint.position.y - 14) < 0.5, "only sags under gravity");
    assert.notEqual(game.ctx.shift.y, 0, "panned");
  });

  test("a link already longer than 25 m (as in an example bridge) may shorten, not grow", () => {
    const game = aFrame({ joints: [{ x: -21, y: 41 }], links: [{ a: 1, b: 3, material: "cable" }] });
    const tip = jointAt(game, -21, 41); // on a 27.9 m cable from the apex
    const apexToTip = () => Math.hypot(tip.position.x - APEX[0], tip.position.y - APEX[1]);
    assert.ok(apexToTip() > 27);
    drag(game, [-21, 41], [-21, 40]);
    assert.deepEqual([tip.position.x, tip.position.y], [-21, 40], "shorter is fine, though still over 25 m");
    drag(game, [-21, 40], [-23, 43]);
    assert.deepEqual([tip.position.x, tip.position.y], [-21, 40], "longer than it was is not");
  });

  test("the joint under the pointer is highlighted only when it can be dragged", () => {
    const game = aFrame();
    game.__handleMouseMove(at(game, ...APEX));
    assert.equal(game.hoveredJoint, jointAt(game, ...APEX));
    game.__handleMouseMove(at(game, -20, 10));
    assert.equal(game.hoveredJoint, undefined, "anchor");
    game.__handleMouseMove(at(game, 0, 40));
    assert.equal(game.hoveredJoint, undefined, "empty space");
  });
});

describe("mirror mode", () => {
  /** Creek with bare anchors at x = ±20 and ±30; the axis is x = 0. */
  function mirrored() {
    const game = createGame("creek");
    game.mirror = true;
    return game;
  }
  const hasLinkBetween = (game, [ax, ay], [bx, by]) => {
    const a = jointAt(game, ax, ay), b = jointAt(game, bx, by);
    return !!a && !!b && game.scene.hasLink(a, b);
  };

  test("the axis is the middle of the anchors", () => {
    assert.equal(createGame("creek").level.mirrorAxis, 0);
  });

  test("building a link also builds its mirror image, in one undo step", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -12, 16);
    assert.ok(hasLinkBetween(game, [-20, 10], [-12, 16]));
    assert.ok(hasLinkBetween(game, [20, 10], [12, 16]), "mirror image from the right anchor");
    assert.equal(game.scene.links.length, 2);
    game.undo();
    assert.equal(game.scene.links.length, 0);
  });

  test("the image joins existing joints, and long links are split the same way", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -20, 40); // 30 m: two segments
    assert.equal(game.scene.links.length, 4);
    assert.ok(jointAt(game, 20, 25), "mirrored mid joint");
    buildLink(game, -20, 40, -15, 40);
    assert.ok(hasLinkBetween(game, [20, 40], [15, 40]), "starts from the existing mirrored joint");
    assert.equal(game.scene.joints.filter(j => j.position.x === 20 && j.position.y === 40).length, 1);
  });

  test("a link that is its own mirror image isn't doubled", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -14, 14);
    const before = game.scene.links.length;
    buildLink(game, -14, 14, 14, 14); // across the axis, symmetric
    assert.equal(game.scene.links.length, before + 2, "28 m: two segments, once");
    buildLink(game, 0, 14, 0, 20); // on the axis
    assert.equal(game.scene.links.length, before + 3);
  });

  test("an asymmetric link across the axis gets a crossing image", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -6, 14);
    buildLink(game, -6, 14, 2, 18);
    assert.ok(hasLinkBetween(game, [6, 14], [-2, 18]));
  });

  test("the link being placed previews its image", () => {
    const game = mirrored();
    game.__handleClick(at(game, -20, 10));
    game.__handleMouseMove(at(game, -12, 16));
    const preview = game.scene.preview.links;
    assert.equal(preview.length, 2);
    assert.ok(preview.some(l => l.a.position.x === 20 && l.b.position.x === 12));
  });

  test("deleting a link or joint deletes its image too", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -12, 16);
    buildLink(game, -12, 16, -12, 10);
    rightClick(game, -12, 13); // the vertical
    assert.ok(!hasLinkBetween(game, [12, 16], [12, 10]));
    assert.ok(hasLinkBetween(game, [20, 10], [12, 16]), "the rest stays");
    rightClick(game, -12, 16);
    assert.equal(game.scene.links.length, 0);
    assert.equal(jointAt(game, 12, 16), undefined);
  });

  test("dragging a joint drags its image; a joint on the axis stays on it", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -12, 16);
    buildLink(game, -12, 16, 0, 18);
    drag(game, [-12, 16], [-13, 16]);
    assert.ok(jointAt(game, -13, 16) && jointAt(game, 13, 16), "both moved");
    drag(game, [0, 18], [2, 19]);
    assert.ok(jointAt(game, 0, 19), "kept on the axis");
    game.undo();
    assert.ok(jointAt(game, 0, 18));
  });

  test("a joint can't be dragged onto its own image", () => {
    const game = mirrored();
    buildLink(game, -20, 10, -6, 14);
    drag(game, [-6, 14], [0, 14]);
    assert.ok(jointAt(game, -6, 14) && jointAt(game, 6, 14));
  });

  test("M toggles it; it is off by default", () => {
    const game = createGame("creek");
    assert.equal(game.mirror, false);
    key(game, "m");
    assert.equal(game.mirror, true);
    key(game, "m", { ctrlKey: true });
    assert.equal(game.mirror, true, "Ctrl+M is not the shortcut");
    key(game, "M");
    assert.equal(game.mirror, false);
  });
});
