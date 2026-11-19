import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, buildLink, createGame, key, positionsOf, rightClick, runFrames, ui } from "./helpers.mjs";
import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

// Demo bridge landmarks: anchor AI (-40,10) fixed, tower top AH (-40,25), deck joints every 10 m at y=10,
// main cable joints above them on a parabola: (-30,20.625) (-20,17.5) (-10,15.625) (0,15) ...
// The hanger at x = 10 runs from (10,15.625) down to (10,10); HANGER_10 is a point on it.
const HANGER_10 = [10, 12.8];

describe("building links", () => {
  test("clicking a joint then a point creates a link split into <= 25 m segments", () => {
    const game = createGame();
    const { joints, links } = game.scene;
    const [j, l] = [joints.length, links.length];
    buildLink(game, -40, 25, -40, 85);
    assert.equal(game.scene.links.length, l + 3);
    assert.equal(game.scene.joints.length, j + 3);
    assert.ok(game.scene.links.slice(-3).every(link => Math.abs(link.length - 20) < 1e-9));
  });

  test("clicking empty space does not start a link", () => {
    const game = createGame();
    game.__handleClick(at(game, 0, 60));
    assert.equal(game.__clickState, undefined);
  });

  test("the selected material is used", () => {
    const game = createGame();
    ui.material = "cable";
    buildLink(game, -40, 25, -40, 30);
    assert.equal(game.scene.links.at(-1).material.name, "cable");
  });

  test("clicking the start joint again cancels without adding anything", () => {
    const game = createGame();
    const before = game.scene.serialize();
    buildLink(game, -40, 25, -40, 25);
    assert.equal(game.__clickState, undefined);
    assert.deepEqual(game.scene.serialize(), before);
    assert.equal(game.canUndo, false, "no empty undo step");
  });

  test("a link that already exists is not duplicated", () => {
    const game = createGame();
    const before = game.scene.links.length;
    buildLink(game, -30, 10, -20, 10); // two deck joints, already linked by a 10 m road link
    assert.equal(game.scene.links.length, before);
  });

  test("ending on an existing joint connects to it instead of adding a joint", () => {
    const game = createGame();
    const joints = game.scene.joints.length;
    buildLink(game, -30, 20.625, -20, 10); // diagonal brace between two existing joints, 14.6 m
    assert.equal(game.scene.joints.length, joints, "no new joint");
    const end = game.scene.findJoint({ x: -20, y: 10, z: 0 }, 0.1);
    assert.equal(game.scene.links.at(-1).b, end);
  });

  test("new joints snap to the 1 m grid; Alt places them freely", () => {
    const game = createGame();
    buildLink(game, -40, 25, -40.3, 31.6);
    assert.deepEqual(game.scene.joints.at(-1).position, { x: -40, y: 32, z: 0 });

    buildLink(game, -40, 25, -45.3, 31.6, { altKey: true });
    const free = game.scene.joints.at(-1).position;
    assert.ok(Math.abs(free.x + 45.3) < 1e-9 && Math.abs(free.y - 31.6) < 1e-9);

    game.snapToGrid = false;
    buildLink(game, -40, 25, -35.3, 31.6);
    assert.ok(Math.abs(game.scene.joints.at(-1).position.x + 35.3) < 1e-9);
  });

  test("snapping onto an existing joint reuses it", () => {
    const game = createGame();
    buildLink(game, -40, 25, -33, 28);
    const joints = game.scene.joints.length;
    const target = game.scene.joints.at(-1);
    // zoomed in so (-33.3, 28.3) is outside the pick radius but snaps to (-33, 28)
    game.ctx.zoom = 100;
    buildLink(game, -30, 20.625, -33.3, 28.3);
    assert.equal(game.scene.joints.length, joints);
    assert.equal(game.scene.links.at(-1).b, target);
  });

  test("the pick radius is constant in screen pixels", () => {
    const game = createGame();
    game.ctx.zoom = 8; // 12 px = 1.5 m
    game.__handleClick(at(game, -40 + 1, 25));
    assert.ok(game.__clickState, "1 m away is a hit at low zoom");
    key(game, "Escape");
    game.ctx.zoom = 80; // 12 px = 0.15 m
    game.__handleClick(at(game, -40 + 1, 25));
    assert.equal(game.__clickState, undefined, "1 m away is a miss at high zoom");
  });

  test("the preview follows the cursor and is discarded on cancel", () => {
    const game = createGame();
    game.__handleClick(at(game, -40, 25));
    game.__handleMouseMove(at(game, -40, 70)); // 45 m: two segments
    assert.equal(game.scene.preview.links.length, 2);
    key(game, "Escape");
    assert.equal(game.__clickState, undefined);
    assert.equal(game.scene.preview.links.length, 0);
  });
});

describe("panning", () => {
  test("dragging empty space pans the view and the click that ends the drag is ignored", () => {
    const game = createGame();
    const start = at(game, -40, 40); // sky above the tower
    game.__handleMouseDown(start);
    game.__handleMouseMove({ ...start, clientX: start.clientX + 80 });
    game.__handleMouseUp();
    game.__handleClick({ ...start, clientX: start.clientX + 80 });
    assert.equal(game.ctx.shift.x, -10);
    assert.equal(game.__clickState, undefined);
  });

  test("small jitter during a click does not pan", () => {
    const game = createGame();
    const start = at(game, -40, 25);
    game.__handleMouseDown(start);
    game.__handleMouseMove({ ...start, clientX: start.clientX + 3 });
    game.__handleMouseUp();
    game.__handleClick(start);
    assert.equal(game.ctx.shift.x, 0);
    assert.ok(game.__clickState);
  });
});

describe("deleting", () => {
  test("right-click deletes a joint with its links", () => {
    const game = createGame();
    const [j, l] = [game.scene.joints.length, game.scene.links.length];
    rightClick(game, 0, 15); // middle rope joint: 2 rope links + hanger
    assert.equal(game.scene.joints.length, j - 1);
    assert.equal(game.scene.links.length, l - 3);
  });

  test("right-click on a link deletes just that link", () => {
    const game = createGame();
    const l = game.scene.links.length;
    rightClick(game, ...HANGER_10);
    assert.equal(game.scene.links.length, l - 1);
  });

  test("anchors survive right-click, and so do the links attached to them", () => {
    const game = createGame();
    const before = game.scene.serialize();
    rightClick(game, -50, 10);
    assert.deepEqual(game.scene.serialize(), before);
    assert.equal(game.canUndo, false);
  });

  test("right-click cancels a link in progress instead of deleting", () => {
    const game = createGame();
    const before = game.scene.serialize();
    game.__handleClick(at(game, -40, 25));
    rightClick(game, -40, 25);
    assert.equal(game.__clickState, undefined);
    assert.deepEqual(game.scene.serialize(), before);
  });

  test("releasing a right-button pan does not delete", () => {
    const game = createGame();
    const before = game.scene.serialize();
    const start = at(game, ...HANGER_10);
    game.__handleMouseDown(start);
    game.__handleMouseMove({ ...start, clientX: start.clientX + 50 });
    game.__handleMouseUp();
    game.__handleContextMenu(at(game, ...HANGER_10));
    assert.deepEqual(game.scene.serialize(), before);
  });
});

describe("build and simulate modes", () => {
  test("starts in build mode with the simulation stopped", () => {
    const game = createGame();
    assert.ok(game.isBuildMode);
    game.tick();
    assert.equal(game.evalCtx.time, 0);
  });

  test("editing is locked once the simulation has run, even when paused", () => {
    const game = createGame();
    runFrames(game, 10);
    game.setSimulationRunning(false);
    assert.ok(!game.isBuildMode);
    const before = game.scene.links.length;
    buildLink(game, -40, 25, -40, 35);
    rightClick(game, ...HANGER_10);
    assert.equal(game.scene.links.length, before);
  });

  test("starting the simulation cancels a link in progress", () => {
    const game = createGame();
    game.__handleClick(at(game, -40, 25));
    game.setSimulationRunning(true);
    assert.equal(game.__clickState, undefined);
  });

  test("pausing keeps the deformed state; resuming continues from it", () => {
    const game = createGame();
    runFrames(game, 30);
    game.setSimulationRunning(false);
    const paused = positionsOf(game.scene);
    const t = game.evalCtx.time;
    game.tick();
    assert.deepEqual(positionsOf(game.scene), paused);
    runFrames(game, 1);
    assert.ok(game.evalCtx.time > t);
  });

  test("reset restores the structure as built and returns to build mode", () => {
    const game = createGame();
    const built = game.scene.serialize();
    runFrames(game, 60);
    game.scene.links[0].broken = true;
    game.reset();
    assert.ok(game.isBuildMode);
    assert.equal(game.evalCtx.time, 0);
    assert.deepEqual(game.scene.serialize(), built);
    assert.ok(game.scene.joints.every(j => j.velocity.x === 0 && j.velocity.y === 0));
    assert.ok(game.scene.links.every(link => !link.broken));
  });
});

describe("undo and redo", () => {
  test("undo/redo step through builds and deletes", () => {
    const game = createGame();
    const s0 = game.scene.serialize();
    buildLink(game, -40, 25, -40, 35);
    const s1 = game.scene.serialize();
    rightClick(game, ...HANGER_10);
    const s2 = game.scene.serialize();

    game.undo();
    assert.deepEqual(game.scene.serialize(), s1);
    game.undo();
    assert.deepEqual(game.scene.serialize(), s0);
    assert.equal(game.canUndo, false);
    game.undo(); // no-op
    assert.deepEqual(game.scene.serialize(), s0);

    game.redo();
    game.redo();
    assert.deepEqual(game.scene.serialize(), s2);
    assert.equal(game.canRedo, false);
  });

  test("a new edit clears the redo stack", () => {
    const game = createGame();
    buildLink(game, -40, 25, -40, 35);
    game.undo();
    assert.ok(game.canRedo);
    rightClick(game, ...HANGER_10);
    assert.equal(game.canRedo, false);
  });

  test("keyboard shortcuts: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z", () => {
    const game = createGame();
    const s0 = game.scene.serialize();
    buildLink(game, -40, 25, -40, 35);
    const s1 = game.scene.serialize();
    key(game, "z", { ctrlKey: true });
    assert.deepEqual(game.scene.serialize(), s0);
    key(game, "y", { ctrlKey: true });
    assert.deepEqual(game.scene.serialize(), s1);
    key(game, "z", { ctrlKey: true });
    key(game, "Z", { ctrlKey: true, shiftKey: true });
    assert.deepEqual(game.scene.serialize(), s1);
  });

  test("undo is disabled outside build mode", () => {
    const game = createGame();
    buildLink(game, -40, 25, -40, 35);
    runFrames(game, 5);
    assert.equal(game.canUndo, false);
    const links = game.scene.links.length;
    game.undo();
    assert.equal(game.scene.links.length, links);
    game.reset();
    assert.ok(game.canUndo);
  });

  test("undo history is capped", () => {
    const game = createGame();
    for (let i = 0; i < 105; i++) {
      buildLink(game, -40, 25, -40 + 3 * (i % 5), 30 + 3 * Math.floor(i / 5)); // each to a new point
    }
    let steps = 0;
    while (game.canUndo) { game.undo(); steps++; }
    assert.equal(steps, 100);
  });
});

describe("saving and loading", () => {
  test("every edit is autosaved and restored by a new game", () => {
    const game = createGame();
    buildLink(game, -40, 25, -40, 35);
    const saved = game.scene.serialize();

    // simulate a page reload: new Game, same storage
    const raw = localStorage.getItem("bridge-builder:structure:canyon");
    const reloaded = createGame();
    localStorage.setItem("bridge-builder:structure:canyon", raw);
    reloaded.__loadAutosave();
    assert.deepEqual(reloaded.scene.serialize(), saved);
  });

  test("a corrupt autosave is ignored and the demo bridge loads", (t) => {
    t.mock.method(console, "warn", () => { });
    const game = createGame();
    localStorage.setItem("bridge-builder:structure:canyon", "{not json");
    game.__loadAutosave();
    assert.equal(game.scene.links.length, 27);
  });

  test("storage failures do not break editing", (t) => {
    const game = createGame();
    t.mock.method(localStorage, "setItem", () => { throw new Error("QuotaExceededError"); });
    buildLink(game, -40, 25, -40, 35);
    assert.equal(game.scene.links.length, 28);
  });

  test("export during a simulation returns the structure as built", () => {
    const game = createGame();
    const built = game.scene.serialize();
    runFrames(game, 60);
    assert.notDeepEqual(game.scene.serialize(), built);
    assert.deepEqual(game.exportStructure(), { ...built, level: "canyon" });
  });

  test("import replaces the structure, resets the simulation and is undoable", () => {
    const game = createGame();
    const demo = game.scene.serialize();
    runFrames(game, 10);
    game.importStructure({
      version: SAVE_FORMAT_VERSION,
      joints: [{ x: 0, y: 0, fixed: true }, { x: 5, y: 0 }],
      links: [{ a: 0, b: 1, material: "cable" }],
    });
    assert.ok(game.isBuildMode);
    assert.equal(game.scene.links.length, 1);
    game.undo();
    assert.deepEqual(game.scene.serialize(), demo);
  });

  test("an invalid import throws and changes nothing", () => {
    const game = createGame();
    const before = game.scene.serialize();
    assert.throws(() => game.importStructure({ version: 1, joints: "nope", links: [] }), /Invalid structure/);
    assert.deepEqual(game.scene.serialize(), before);
    assert.equal(game.canUndo, false);
  });

  test("restartLevel brings back the level's starting structure (undoably)", () => {
    const game = createGame();
    const demo = game.scene.serialize();
    rightClick(game, 0, 15);
    const edited = game.scene.serialize();
    game.restartLevel();
    assert.deepEqual(game.scene.serialize(), demo);
    game.undo();
    assert.deepEqual(game.scene.serialize(), edited);
  });

  test("onChange fires after edits, undo and imports", () => {
    const game = createGame();
    let calls = 0;
    game.onChange = () => calls++;
    buildLink(game, -40, 25, -40, 35);
    game.undo();
    game.restartLevel();
    assert.equal(calls, 3);
  });
});
