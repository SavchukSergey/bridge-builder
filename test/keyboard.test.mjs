import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, buildLink, createGame, key } from "./helpers.mjs";

/** Presses a key `times` times. */
function press(game, k, times = 1, mods = {}) {
  for (let i = 0; i < times; i++) key(game, k, mods);
}

const xy = (p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6];

describe("building with the keyboard", () => {
  test("J and Shift+J step through the joints from left to right", () => {
    const game = createGame("creek"); // anchors at x -30, -20, 20, 30 (y 10)
    assert.equal(game.keyCursor, undefined, "no cursor until a key asks for it");
    press(game, "j");
    assert.deepEqual(xy(game.keyCursor), [-30, 10]);
    press(game, "j");
    assert.deepEqual(xy(game.keyCursor), [-20, 10]);
    press(game, "j", 1, { shiftKey: true });
    assert.deepEqual(xy(game.keyCursor), [-30, 10]);
    press(game, "j", 1, { shiftKey: true });
    assert.deepEqual(xy(game.keyCursor), [30, 10], "and round");
  });

  test("Enter on a joint, the arrows, Enter again: a link", () => {
    const game = createGame("creek");
    press(game, "j", 2); // (-20, 10)
    press(game, "Enter");
    assert.ok(game.isPlacing);
    press(game, "ArrowRight", 4);
    press(game, "ArrowUp", 3);
    press(game, "ArrowRight", 1, { shiftKey: true }); // 5 m
    assert.deepEqual(xy(game.keyCursor), [-11, 13]);
    assert.ok(game.placementInfo, "the readout follows the cursor");
    assert.equal(game.scene.preview.links.length, 1, "and so does the preview");
    press(game, "Enter");
    assert.equal(game.isPlacing, false);
    assert.equal(game.scene.links.length, 1);
    const link = game.scene.links[0];
    assert.deepEqual([xy(link.a.position), xy(link.b.position)], [[-20, 10], [-11, 13]]);
    game.undo();
    assert.equal(game.scene.links.length, 0, "an ordinary undoable edit");
  });

  test("Space works like Enter; Enter on empty space does nothing", () => {
    const game = createGame("creek");
    press(game, "j", 2);
    press(game, "ArrowUp", 4);
    press(game, " ");
    assert.equal(game.isPlacing, false, "no joint there");
    press(game, "ArrowDown", 4);
    press(game, " ");
    assert.ok(game.isPlacing);
    press(game, "Escape");
    assert.equal(game.isPlacing, false);
  });

  test("G picks up a joint, the arrows carry it, G puts it down (one undo); Esc puts it back", () => {
    const game = createGame("creek");
    buildLink(game, -20, 10, -14, 16);
    press(game, "j", 3); // -30, -20, then the free joint (-14, 16)
    assert.deepEqual(xy(game.keyCursor), [-14, 16]);
    press(game, "g");
    press(game, "ArrowLeft", 2);
    const joint = game.scene.joints.find(j => !j.fixed);
    assert.deepEqual(xy(joint.position), [-16, 16], "it moves with the cursor");
    press(game, "g");
    game.undo();
    assert.deepEqual(xy(game.scene.joints.find(j => !j.fixed).position), [-14, 16], "one undo");
    game.redo();
    press(game, "j"); // round to the next joint after the cursor
    while (xy(game.keyCursor)[0] !== -16) press(game, "j");
    press(game, "g");
    press(game, "ArrowUp", 3);
    press(game, "Escape");
    assert.deepEqual(xy(game.scene.joints.find(j => !j.fixed).position), [-16, 16], "back where it was");
  });

  test("anchors can't be picked up, and a joint can't be carried too far", () => {
    const game = createGame("creek");
    buildLink(game, -20, 10, -14, 16);
    press(game, "j", 2); // the anchor (-20, 10)
    press(game, "g");
    press(game, "ArrowUp");
    assert.equal(game.scene.joints.filter(j => j.fixed).every(j => j.position.y === 10), true);
    press(game, "j"); // (-14, 16)
    press(game, "g");
    press(game, "ArrowRight", 8); // a 14 m link would be too long: it stops at 10 m
    const free = game.scene.joints.find(j => !j.fixed);
    const length = Math.hypot(free.position.x + 20, free.position.y - 10);
    assert.ok(length <= 10 + 1e-9, `${length}`);
  });

  test("Del deletes what is under the cursor", () => {
    const game = createGame("creek");
    buildLink(game, -20, 10, -14, 16);
    press(game, "j", 3);
    press(game, "Delete");
    assert.equal(game.scene.links.length, 0);
  });

  test("the view follows the cursor", () => {
    const game = createGame("creek");
    press(game, "j");
    const x0 = game.ctx.shift.x;
    press(game, "ArrowRight", 80, { shiftKey: true }); // 400 m to the right
    assert.ok(game.ctx.shift.x > x0 + 300, "panned along");
    const c = game.ctx.globalToClient(game.keyCursor);
    assert.ok(c.x > 0 && c.x < game.ctx.width && c.y > 0 && c.y < game.ctx.height, "the cursor stays on screen");
  });

  test("the mouse takes over; a test hides the cursor and drops a carried joint", () => {
    const game = createGame("creek");
    buildLink(game, -20, 10, -14, 16);
    press(game, "j", 3);
    game.__handleMouseMove(at(game, 0, 0, { pointerType: "mouse" }));
    assert.equal(game.keyCursor, undefined);
    press(game, "j", 3);
    press(game, "g");
    press(game, "ArrowUp", 2);
    game.setSimulationRunning(true);
    assert.equal(game.keyCursor, undefined);
    game.reset();
    assert.deepEqual(xy(game.scene.joints.find(j => !j.fixed).position), [-14, 16], "not moved");
  });

  test("keys meant for a focused button, menu or slider are left alone", () => {
    const game = createGame("creek");
    const button = { closest: (sel) => (sel.includes("button") ? {} : null) };
    key(game, "ArrowRight", { target: button });
    key(game, "j", { target: button });
    assert.equal(game.keyCursor, undefined);
  });
});
