import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { at, createGame, ui } from "./helpers.mjs";

/** A touch pointer event for finger `id` at world (x, y). */
const finger = (game, id, x, y) => at(game, x, y, { pointerType: "touch", pointerId: id, button: 0 });

/** A finger tapping at (x, y): down, up, then the click the browser sends for a tap. */
function tap(game, x, y, id = 1) {
  game.__handleMouseDown(finger(game, id, x, y));
  game.__handleMouseUp(finger(game, id, x, y));
  game.__handleClick(finger(game, id, x, y));
  game.__handlePointerLeave();
}

describe("touch", () => {
  test("tap an anchor, then tap the far bank: a road", () => {
    const game = createGame("brook");
    ui.material = "road";
    tap(game, -10, 10);
    assert.equal(game.isPlacing, true);
    tap(game, 10, 10);
    assert.equal(game.isPlacing, false);
    assert.equal(game.roadAcross, true);
    assert.equal(game.pointerType, "touch");
  });

  test("tap an anchor, then slide a finger to aim and lift it to place", () => {
    const game = createGame("brook");
    ui.material = "road";
    tap(game, -10, 10);
    game.__handleMouseDown(finger(game, 1, -5, 20)); // anywhere: the finger aims, it doesn't pan
    const shift = { ...game.ctx.shift };
    game.__handleMouseMove(finger(game, 1, 0, 15));
    game.__handleMouseMove(finger(game, 1, 0, 10));
    assert.ok(game.placementInfo, "the readout follows the finger");
    assert.ok(Math.abs(game.placementInfo.length - 10) < 1e-9);
    game.__handleMouseUp(finger(game, 1, 0, 10));
    game.__handleClick(finger(game, 1, 0, 10)); // if the browser sends one anyway, it is ignored
    assert.deepEqual(game.ctx.shift, shift, "no pan");
    assert.equal(game.isPlacing, false);
    assert.equal(game.scene.links.length, 1);
    assert.equal(game.scene.links[0].length, 10);
  });

  test("tapping the start anchor again cancels", () => {
    const game = createGame("brook");
    tap(game, -10, 10);
    tap(game, -10, 10);
    assert.equal(game.isPlacing, false);
    assert.equal(game.scene.links.length, 0);
  });

  test("touch picks joints from further away than a mouse", () => {
    const game = createGame("brook"); // zoom 8: 12 px = 1.5 m, 24 px = 3 m
    game.__handleClick(at(game, -12.2, 10));
    assert.equal(game.isPlacing, false, "a mouse 2.2 m away misses");
    tap(game, -12.2, 10);
    assert.equal(game.isPlacing, true, "a finger 2.2 m away hits");
  });

  test("holding a finger still deletes, and lifting it is not a tap", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const game = createGame("brook");
      ui.material = "road";
      tap(game, -10, 10);
      tap(game, 0, 10);
      assert.equal(game.scene.links.length, 1);
      game.__handleMouseDown(finger(game, 1, -5, 10));
      mock.timers.tick(499);
      assert.equal(game.scene.links.length, 1, "not yet");
      mock.timers.tick(1);
      assert.equal(game.scene.links.length, 0, "deleted");
      game.__handleMouseUp(finger(game, 1, -5, 10));
      game.__handleClick(finger(game, 1, -5, 10));
      assert.equal(game.isPlacing, false, "the release did not start a link");
      assert.equal(game.canUndo, true);
    } finally {
      mock.timers.reset();
    }
  });

  test("lifting the finger after a long press near a dot doesn't start a piece from it", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const game = createGame("brook");
      ui.material = "road";
      tap(game, -10, 10);
      tap(game, -10, 14); // a post up from the anchor
      game.__handleMouseDown(finger(game, 1, -10, 12.5)); // nearest its top, and the anchor within reach
      mock.timers.tick(500);
      assert.equal(game.scene.links.length, 0, "deleted");
      game.__handleMouseUp(finger(game, 1, -10, 12.5));
      game.__handleClick(finger(game, 1, -10, 12.5));
      assert.equal(game.isPlacing, false, "the anchor nearby was not picked up");
      tap(game, -10, 10);
      assert.equal(game.isPlacing, true, "the next tap is a tap");
    } finally {
      mock.timers.reset();
    }
  });

  test("a long press the browser sends no click for doesn't swallow the next tap", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const game = createGame("brook");
      ui.material = "road";
      tap(game, -10, 10);
      tap(game, 0, 10);
      game.__handleMouseDown(finger(game, 1, -5, 10));
      mock.timers.tick(500);
      game.__handleMouseUp(finger(game, 1, -5, 10)); // and no click
      tap(game, -10, 10);
      assert.equal(game.isPlacing, true);
    } finally {
      mock.timers.reset();
    }
  });

  test("moving the finger, lifting it or a second finger stops the long press", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const game = createGame("brook");
      ui.material = "road";
      tap(game, -10, 10);
      tap(game, 0, 10);
      game.__handleMouseDown(finger(game, 1, -5, 10));
      game.__handleMouseMove(finger(game, 1, -5, 14)); // a pan
      mock.timers.tick(1000);
      game.__handleMouseUp(finger(game, 1, -5, 14));
      game.__handleMouseDown(finger(game, 1, -5, 10));
      game.__handleMouseUp(finger(game, 1, -5, 10));
      mock.timers.tick(1000);
      game.__handleMouseDown(finger(game, 1, -5, 10));
      game.__handleMouseDown(finger(game, 2, 5, 10));
      mock.timers.tick(1000);
      assert.equal(game.scene.links.length, 1);
    } finally {
      mock.timers.reset();
    }
  });

  test("the browser's own long-press menu is ignored", () => {
    const game = createGame("brook");
    ui.material = "road";
    tap(game, -10, 10);
    tap(game, 0, 10);
    let prevented = false;
    game.__handleContextMenu(at(game, -5, 10, { pointerType: "touch", preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(game.scene.links.length, 1);
  });

  test("pinching zooms about the fingers' midpoint and spreading further zooms in more", () => {
    const game = createGame("brook");
    const zoom = game.ctx.zoom;
    game.__handleMouseDown(finger(game, 1, -4, 0));
    game.__handleMouseDown(finger(game, 2, 4, 0));
    const a = { ...finger(game, 1, -4, 0) }, b = { ...finger(game, 2, 4, 0) };
    const mid = game.ctx.clientToGlobal({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, z: 0 });
    // spread to twice the distance, in client pixels
    game.__handleMouseMove({ ...a, clientX: a.clientX - (b.clientX - a.clientX) / 2 });
    game.__handleMouseMove({ ...b, clientX: b.clientX + (b.clientX - a.clientX) / 2 });
    assert.ok(Math.abs(game.ctx.zoom - 2 * zoom) < 1e-9);
    const after = game.ctx.clientToGlobal({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, z: 0 });
    assert.ok(Math.abs(after.x - mid.x) < 1e-9 && Math.abs(after.y - mid.y) < 1e-9, "the point between the fingers stays put");

    // lifting the fingers is not a tap
    game.__handleMouseUp(a);
    game.__handleMouseUp(b);
    game.__handleClick(a);
    assert.equal(game.isPlacing, false);
    assert.equal(game.__touches.size, 0);
  });

  test("a second finger while dragging a joint puts the joint back and pinches", () => {
    const game = createGame("brook");
    ui.material = "steel";
    tap(game, -10, 10);
    tap(game, -5, 15);
    const joint = game.scene.joints.find(j => j.position.x === -5);
    game.__handleMouseDown(finger(game, 1, -5, 15));
    game.__handleMouseMove(finger(game, 1, -4, 17));
    assert.equal(joint.position.x, -4);
    game.__handleMouseDown(finger(game, 2, 5, 15));
    assert.equal(joint.position.x, -5);
    assert.equal(joint.position.y, 15);
  });

  test("zoom stays within limits", () => {
    const game = createGame("brook");
    game.__handleMouseDown(finger(game, 1, -1, 0));
    game.__handleMouseDown(finger(game, 2, 1, 0));
    const b = finger(game, 2, 1, 0);
    game.__handleMouseMove({ ...b, clientX: b.clientX + 5000 });
    assert.equal(game.ctx.zoom, 80);
    game.__handleMouseMove({ ...b, clientX: b.clientX - 15 });
    assert.equal(game.ctx.zoom, 1);
  });

  test("the browser taking the touch cancels a joint drag", () => {
    const game = createGame("brook");
    ui.material = "steel";
    tap(game, -10, 10);
    tap(game, -5, 15);
    const joint = game.scene.joints.find(j => j.position.x === -5);
    game.__handleMouseDown(finger(game, 1, -5, 15));
    game.__handleMouseMove(finger(game, 1, -3, 15));
    game.__handlePointerCancel(finger(game, 1, -3, 15));
    assert.equal(joint.position.x, -5);
    assert.equal(game.__touches.size, 0);
  });

  test("the view fits above a sheet along the bottom", () => {
    const game = createGame("brook");
    game.viewInsets = { top: 50, right: 0, bottom: 200 };
    game.fitView();
    const { y } = game.level.view;
    // the level's centre line sits midway between the toolbar and the sheet
    const clientY = game.ctx.height / 2 - (y - game.ctx.shift.y) * game.ctx.zoom;
    assert.ok(Math.abs(clientY - (50 + (game.ctx.height - 200)) / 2) < 1e-6);
  });
});
