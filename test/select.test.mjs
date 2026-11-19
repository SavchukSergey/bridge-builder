import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, buildLink, createGame, key } from "./helpers.mjs";

/**
 * Creek (anchors at ±20 and ±30, y 10) with a little triangle of steel off the left anchor:
 * (-20, 10) → (-14, 16) → (-10, 10) → (-20, 10), every side 10 m or less (one member each).
 */
function withTriangle() {
  const game = createGame("creek");
  buildLink(game, -20, 10, -14, 16);
  buildLink(game, -14, 16, -10, 10);
  buildLink(game, -10, 10, -20, 10);
  assert.equal(game.scene.links.length, 3);
  return game;
}

/** Shift+drags a selection box between two world points. */
function box(game, x0, y0, x1, y1) {
  const shift = { shiftKey: true, button: 0, pointerType: "mouse" };
  game.__handleMouseDown(at(game, x0, y0, shift));
  game.__handleMouseMove(at(game, (x0 + x1) / 2, (y0 + y1) / 2, shift));
  game.__handleMouseMove(at(game, x1, y1, shift));
  game.__handleMouseUp(at(game, x1, y1, shift));
  game.__handleClick(at(game, x1, y1, shift)); // the browser's click after the drag
}

const pos = (j) => [Math.round(j.position.x * 1e6) / 1e6, Math.round(j.position.y * 1e6) / 1e6];
const byX = (a, b) => a[0] - b[0];

describe("selecting several members", () => {
  test("Shift+drag picks the joints in the box, and the links between them", () => {
    const game = withTriangle();
    box(game, -22, 8, -6, 18);
    assert.equal(game.selectedJoints.length, 3, "the anchor and two free joints");
    assert.equal(game.selectedLinks.length, 3);
    assert.deepEqual(game.selectionInfo, { joints: 2, links: 3 });
    assert.equal(game.scene.links.length, 3, "a box builds nothing");
    assert.equal(game.isPlacing, false);
  });

  test("Shift+click adds or drops one joint; a plain click on empty space lets go", () => {
    const game = withTriangle();
    game.__handleClick(at(game, -14, 16, { shiftKey: true }));
    game.__handleClick(at(game, -10, 10, { shiftKey: true }));
    assert.equal(game.selectedJoints.length, 2);
    assert.equal(game.selectedLinks.length, 1, "the link between them");
    assert.equal(game.isPlacing, false, "no link started");
    game.__handleClick(at(game, -10, 10, { shiftKey: true }));
    assert.equal(game.selectedJoints.length, 1);
    game.__handleClick(at(game, 0, 30));
    assert.equal(game.selectionInfo, undefined);
  });

  test("Delete removes the selection as one undoable step", () => {
    const game = withTriangle();
    box(game, -22, 8, -6, 18);
    key(game, "Delete");
    assert.equal(game.scene.links.length, 0);
    assert.equal(game.scene.joints.filter(j => !j.fixed).length, 0);
    assert.equal(game.scene.joints.filter(j => j.fixed).length, 4, "anchors stay");
    assert.equal(game.selectionInfo, undefined);
    game.undo();
    assert.equal(game.scene.links.length, 3, "one undo brings it all back");
  });

  test("dragging one selected joint moves them all, as one undo", () => {
    const game = withTriangle();
    game.__handleClick(at(game, -14, 16, { shiftKey: true }));
    game.__handleClick(at(game, -10, 10, { shiftKey: true }));
    game.__handleMouseDown(at(game, -14, 16, { button: 0 }));
    // (-1, +1): every member stays within 10 m
    game.__handleMouseMove(at(game, -14.5, 16.5));
    game.__handleMouseMove(at(game, -15, 17));
    game.__handleMouseUp(at(game, -15, 17));
    const free = game.scene.joints.filter(j => !j.fixed).map(pos).sort(byX);
    assert.deepEqual(free, [[-15, 17], [-11, 11]], "both moved by (-1, 1)");
    game.undo();
    assert.deepEqual(game.scene.joints.filter(j => !j.fixed).map(pos).sort(byX), [[-14, 16], [-10, 10]]);
  });

  test("Ctrl+C and Ctrl+V copy members to where the pointer is, on the grid", () => {
    const game = withTriangle();
    box(game, -22, 8, -6, 18);
    key(game, "c", { ctrlKey: true });
    game.__handleMouseMove(at(game, 0.3, 20.2));
    key(game, "v", { ctrlKey: true });
    assert.equal(game.scene.links.length, 6, "a second triangle");
    // copied around its middle (-15, 13): lands with its middle on the grid point (0, 20)
    const pasted = game.selectedJoints.map(pos).sort(byX);
    assert.deepEqual(pasted, [[-5, 17], [1, 23], [5, 17]]);
    assert.ok(game.selectedJoints.every(j => !j.fixed), "the copied anchor became a free joint");
    assert.equal(game.selectedLinks.length, 3, "the paste is selected, ready to drag");
    game.undo();
    assert.equal(game.scene.links.length, 3, "one undo");
  });

  test("a pasted joint that lands on an existing one joins it", () => {
    const game = createGame("creek");
    buildLink(game, -20, 10, -14, 16);
    box(game, -23, 7, -13, 17); // the anchor (-20, 10) and the joint (-14, 16)
    key(game, "c", { ctrlKey: true });
    // copied around its middle (-17, 13): pasted with the middle at (23, 13), its left end
    // lands on the right-hand anchor (20, 10)
    game.__handleMouseMove(at(game, 23, 13));
    key(game, "v", { ctrlKey: true });
    // the pasted link runs (20, 10) → (26, 16): it starts on the right-hand anchor
    const anchor = game.scene.joints.find(j => j.fixed && j.position.x === 20);
    assert.ok(game.scene.links.some(l => l.a === anchor || l.b === anchor), "joined to the anchor");
    assert.equal(game.scene.joints.filter(j => Math.abs(j.position.x - 20) < 1e-6 && Math.abs(j.position.y - 10) < 1e-6).length, 1, "no second joint there");
  });

  test("Ctrl+A selects everything; Esc lets go; nothing is selectable during a test", () => {
    const game = withTriangle();
    key(game, "a", { ctrlKey: true });
    assert.equal(game.selectedLinks.length, 3);
    key(game, "Escape");
    assert.equal(game.selectionInfo, undefined);
    key(game, "a", { ctrlKey: true });
    game.setSimulationRunning(true);
    assert.equal(game.selectionInfo, undefined, "not shown during a test");
    key(game, "Delete");
    assert.equal(game.scene.links.length, 3, "and not deleted");
  });

  test("undo forgets a selection whose joints are gone", () => {
    const game = withTriangle();
    key(game, "a", { ctrlKey: true });
    game.undo();
    assert.ok(game.selectedJoints.every(j => game.scene.joints.includes(j)));
  });
});
