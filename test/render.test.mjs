import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { at, createGame, runFrames } from "./helpers.mjs";
import { creekLevel, levels } from "../src/js/level.mjs";
import { alternatives } from "./solutions.mjs";
import { sandboxId } from "../src/js/sandbox.mjs";

/**
 * A stand-in for CanvasRenderingContext2D that accepts every call, checks the numbers it
 * is given are finite, and counts what was drawn.
 */
function recordingContext(real) {
  const counts = { fill: 0, stroke: 0, fillRect: 0, arc: 0 };
  const stack = [];
  const gradient = { addColorStop(offset, color) {
    assert.ok(offset >= 0 && offset <= 1, `colour stop ${offset}`);
    assert.equal(typeof color, "string");
  } };
  const target = {
    counts,
    setTransform: real.setTransform,
    getTransform: real.getTransform,
    save() { stack.push(real.getTransform()); },
    restore() {
      const m = stack.pop();
      assert.ok(m, "restore without save");
      real.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    },
    createLinearGradient: (...args) => { assertFinite(args); return gradient; },
    createRadialGradient: (...args) => { assertFinite(args); return gradient; },
    get stackDepth() { return stack.length; },
  };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      return (...args) => {
        assertFinite(args);
        if (key in counts) counts[key]++;
      };
    },
    set(t, key, value) {
      if (key === "lineWidth") assert.ok(Number.isFinite(value) && value > 0, `lineWidth ${value}`);
      t[key] = value;
      return true;
    },
  });
}

function assertFinite(args) {
  for (const a of args) if (typeof a === "number") assert.ok(Number.isFinite(a), `non-finite argument ${a}`);
}

function withRecorder(game) {
  const rec = recordingContext(game.ctx.ctx);
  game.ctx.ctx = rec;
  return rec;
}

describe("rendering", () => {
  for (const level of levels) {
    test(`${level.name} draws in build mode, while trucks cross, and in stress view`, () => {
      const game = createGame(level.id);
      game.importStructure(level.initialStructure());
      const rec = withRecorder(game);

      game.render();
      assert.ok(rec.counts.fill > 20, "scenery, trucks and joints are filled");
      assert.ok(rec.counts.fillRect > 5, "sky, ground and water");
      assert.equal(rec.stackDepth, 0, "every save is restored");

      runFrames(game, 400);
      game.render();
      game.showStress = true;
      game.render();
      assert.equal(rec.stackDepth, 0);
    });
  }

  test("a crossing convoy, a falling truck, hover and a link preview all draw", () => {
    const game = createGame("creek"); // bare anchors: the trucks fall in
    const rec = withRecorder(game);
    game.__handleMouseMove(at(game, -20, 10));
    game.render();
    game.__handleClick(at(game, -20, 10));
    game.__handleMouseMove(at(game, -12, 10));
    game.render();
    game.__handleKeyDown({ key: "Escape", preventDefault() { } });

    runFrames(game, 60 * 12);
    assert.ok(game.vehicles.some(v => v.state === "falling" || v.state === "fell"));
    game.render();
    assert.equal(rec.stackDepth, 0);
  });

  test("on a high-DPI screen it draws at device resolution, with pointer maths unchanged", () => {
    const game = createGame();
    const before = game.ctx.clientToGlobal({ x: 123, y: 45, z: 0 });
    const zoom = game.ctx.zoom;

    game.ctx.pixelRatio = 2;
    game.canvas.width = 1600; // 800 CSS pixels at 2 device pixels each
    game.canvas.height = 1200;
    const rec = withRecorder(game);
    game.render();
    assert.equal(game.ctx.width, 800, "layout stays in CSS pixels");
    const m = rec.getTransform();
    assert.equal(m.a, zoom * 2, "world drawn at twice the scale in device pixels");
    assert.deepEqual(game.ctx.clientToGlobal({ x: 123, y: 45, z: 0 }), before);

    // a pan still follows the pointer one-to-one
    const start = at(game, 0, 30); // empty sky

    game.__handleMouseDown(start);
    game.__handleMouseMove({ clientX: start.clientX + 80, clientY: start.clientY });
    game.__handleMouseUp();
    const moved = game.ctx.clientToGlobal({ x: start.clientX + 80, y: start.clientY, z: 0 });
    assert.ok(Math.abs(moved.x - 0) < 1e-9 && Math.abs(moved.y - 30) < 1e-9, "the grabbed point stays under the pointer");
  });

  test("at night the scene is darkened and headlights shine through; by day neither", () => {
    for (const [levelId, night] of [["rush", true], ["creek", false]]) {
      const game = createGame(levelId);
      const rec = withRecorder(game);
      const composites = [];
      const fills = [];
      const real = rec.fillRect;
      rec.fillRect = (...args) => { fills.push(rec.fillStyle); real(...args); };
      Object.defineProperty(rec, "globalCompositeOperation", { set: v => { composites.push(v); }, get: () => "source-over", configurable: true });
      game.render();
      const shade = fills.some(f => String(f).startsWith("rgba(4, 10, 28"));
      assert.equal(shade, night, `${levelId}: darkened`);
      assert.equal(composites.filter(c => c === "lighter").length, night ? game.level.vehicleCount : 0, `${levelId}: one beam per vehicle`);
      assert.equal(rec.stackDepth, 0);
    }
  });

  test("the first member to break and the tutorial's next click are marked in build mode", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["bare deck"](creekLevel));
    runFrames(game, 60 * 20);
    game.reset();
    assert.ok(game.failedLink);
    game.tutorialTarget = { x: -20, y: 10 };
    const rec = withRecorder(game);
    const dashes = [];
    rec.setLineDash = (d) => dashes.push(d);
    const before = rec.counts.stroke;
    game.render();
    assert.ok(dashes.some(d => d.length), "the failed member's dashed mark");
    game.failedLink = undefined;
    game.tutorialTarget = undefined;
    const marked = rec.counts.stroke - before;
    game.render();
    assert.ok(rec.counts.stroke - before - marked < marked, "fewer strokes without the marks");
    assert.equal(rec.stackDepth, 0);
  });

  test("screen shake can be turned off", () => {
    const game = createGame("brook");
    withRecorder(game);
    const seen = [];
    const original = game.__render.bind(game);
    game.__render = () => { seen.push({ ...game.ctx.shift }); original(); };
    game.effects.shake = 1;
    game.screenShake = false;
    game.render();
    assert.deepEqual(seen[0], game.ctx.shift, "off: the view stays still");
    game.screenShake = true;
    game.render();
    assert.notDeepEqual(seen[1], game.ctx.shift, "on: it shakes");
    assert.deepEqual(seen[0], game.ctx.shift, "and the view itself never moves");
  });

  test("stress view dashes compressed members", () => {
    const game = createGame("canyon"); // the example bridge
    runFrames(game, 60 * 6);
    game.showStress = true;
    const rec = withRecorder(game);
    const dashes = [];
    rec.setLineDash = (d) => dashes.push(d);
    game.render();
    assert.ok(dashes.some(d => d.length === 2), "some compressed member drew dashed");
    assert.deepEqual(dashes.at(-1), [], "and the dash is cleared after");
  });

  test("the hint outline draws in build mode only, and builds nothing", () => {
    const game = createGame("canyon");
    const rec = withRecorder(game);
    const outlineDash = () => dashes.filter(d => d.length === 2 && Math.abs(d[0] * game.ctx.zoom - 7) < 1e-9).length;
    const dashes = [];
    rec.setLineDash = (d) => dashes.push(d);
    const links = game.scene.links.length;
    game.render();
    assert.equal(outlineDash(), 0, "off by default");
    game.showOutline = true;
    game.render();
    assert.ok(outlineDash() > 0, "drawn");
    assert.equal(rec.stackDepth, 0);
    assert.equal(game.scene.links.length, links, "nothing was built");
    dashes.length = 0;
    game.setSimulationRunning(true);
    game.render();
    assert.equal(outlineDash(), 0, "not during a test");
  });

  test("sandbox levels draw, from the narrowest to the widest with a rock", () => {
    for (const spec of [
      { gap: 20, far: -12, traffic: "cars", theme: "night" },
      { gap: 200, far: 12, rock: true, traffic: "train6", theme: "snow" },
      { gap: 90, rock: true, traffic: "rush", theme: "desert" },
    ]) {
      const game = createGame(sandboxId(spec));
      const rec = withRecorder(game);
      game.render();
      runFrames(game, 120);
      game.render();
      assert.equal(rec.stackDepth, 0);
    }
  });

  test("a selection and the box being drawn", () => {
    const game = createGame("canyon");
    const rec = withRecorder(game);
    game.selectAll();
    const shift = { shiftKey: true, button: 0, pointerType: "mouse" };
    game.__handleMouseDown(at(game, 0, 40, shift));
    game.__handleMouseMove(at(game, 10, 30, shift));
    const arcs = rec.counts.arc;
    game.render();
    assert.ok(rec.counts.arc - arcs > game.scene.joints.length, "a ring on every selected joint");
    assert.equal(rec.stackDepth, 0);
  });

  test("zoomed far out and far in", () => {
    const game = createGame();
    withRecorder(game);
    for (const zoom of [0.5, 2, 40, 200]) {
      game.ctx.zoom = zoom;
      game.render();
    }
  });
});
