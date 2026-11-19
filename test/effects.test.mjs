import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { alternatives } from "./solutions.mjs";
import { Effects } from "../src/js/effects.mjs";
import { creekLevel, pierLevel } from "../src/js/level.mjs";
import { renderWaterFront } from "../src/js/scenery.mjs";
import { BREAK_SOUNDS, PLACE_SOUNDS, Sound } from "../src/js/audio.mjs";
import { materials } from "../src/js/materials/index.mjs";
import { buildLink, ui } from "./helpers.mjs";
import { RenderCtx } from "../src/js/render-ctx.mjs";

/** Runs the test until a result, collecting every event. */
function runCollecting(game, seconds = 30) {
  const events = [];
  game.setSimulationRunning(true);
  for (let f = 0; f < seconds * 60; f++) {
    game.tick();
    events.push(...game.drainEvents());
  }
  return events;
}

describe("effects", () => {
  test("a bare deck snapping throws debris and dust, and shakes the camera", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["bare deck"](creekLevel));
    game.setSimulationRunning(true);
    let broke = false, shook = false, debris = 0;
    const events = [];
    for (let f = 0; f < 60 * 20 && !broke; f++) {
      game.tick();
      events.push(...game.drainEvents());
      broke = events.some(e => e.type === "break");
      debris = Math.max(debris, game.effects.debris.length);
      shook ||= game.effects.shake > 0.1;
    }
    assert.ok(broke, "the deck broke");
    const breaks = events.filter(e => e.type === "break");
    assert.ok(breaks.every(e => e.kind === "deck" && e.material === "road"), "and says which material broke");
    assert.equal(debris, 2 * breaks.length, "two halves per broken member");
    assert.ok(game.effects.particles.some(p => p.kind === "dust"));
    assert.ok(shook);

    game.reset();
    assert.equal(game.effects.active, false, "reset clears the effects");
    assert.deepEqual(game.drainEvents(), []);
  });

  test("trucks driving off bare anchors splash into the creek, then the result comes", () => {
    const game = createGame("creek");
    const events = runCollecting(game, 15);
    const splashes = events.filter(e => e.type === "splash" && e.size === 1);
    assert.ok(splashes.length >= 1, "at least the first truck splashes");
    assert.ok(!events.some(e => e.type === "thud"), "no landing on solid ground");
    assert.equal(game.result?.kind, "failed");
  });

  test("a crossing convoy sounds a horn per truck", () => {
    const game = createGame("creek");
    game.importStructure(alternatives.creek["suspension top 14 sag 3"](creekLevel));
    const events = runCollecting(game, 40);
    assert.equal(events.filter(e => e.type === "crossed").length, creekLevel.vehicleCount);
    assert.ok(!events.some(e => e.type === "break"));
  });

  test("debris bounces to rest on the ground and fades; in the river it splashes and sinks", () => {
    const fx = new Effects(creekLevel); // banks at y = 10, water at 4 in the gap
    const piece = (x, y) => ({ x, y, half: 2, angle: 0.3, vx: 0, vy: 0, spin: 1, look: { kind: "beam", color: "#555", width: 0.4, minPx: 2 }, rest: -1, wet: false });
    fx.debris.push(piece(-30, 14), piece(0, 9));
    for (let i = 0; i < 60 * 3; i++) fx.step(1 / 60);
    const [onBank, inRiver] = fx.debris;
    assert.ok(onBank.rest >= 0 && Math.abs(onBank.y - 10) < 0.6, `rests on the bank at ${onBank.y}`);
    assert.ok(inRiver.wet && inRiver.y < 4, "sank below the surface");
    assert.equal(fx.drainEvents().filter(e => e.type === "splash").length, 1, "one splash for the river piece");
    for (let i = 0; i < 60 * 8; i++) fx.step(1 / 60);
    assert.equal(fx.debris.length, 0, "faded away");
    assert.equal(fx.particles.length, 0, "particles expire");
  });

  test("particles are capped", () => {
    const fx = new Effects(creekLevel);
    for (let i = 0; i < 40; i++) fx.splash(0, 1);
    assert.ok(fx.particles.length <= 700);
  });

  test("the water front covers the gap and the submerged rock, not the banks", () => {
    const rects = [];
    const g = new Proxy({ createLinearGradient: () => ({ addColorStop() { } }), fillRect: (...r) => rects.push(r) }, {
      get: (t, k) => t[k] ?? (() => { }),
    });
    const ctx = Object.assign(new RenderCtx(/** @type {any} */(g)), { width: 1600, height: 600, zoom: 8, shift: { x: 0, y: 0, z: 0 } });
    renderWaterFront(ctx, pierLevel, pierLevel.water);
    const spans = rects.map(([x, , w]) => [Math.round(x), Math.round(x + w)]);
    // the river from -60 to 60 is split at the rock's edges; the rock (top -6) is under water
    assert.deepEqual(spans, [[-60, -4], [-4, 4], [4, 60]]);
  });
});

describe("sound", () => {
  test("does nothing without Web Audio", () => {
    const sound = new Sound();
    sound.unlock();
    sound.snap("beam", 1);
    sound.engines(3);
    sound.rumble(1);
    sound.creak(0.95);
    sound.horn();
    sound.splash(1);
    sound.thud(1);
    sound.jingle(true);
    sound.setMuted(true);
    assert.equal(sound.ctx, undefined);
  });

  test("builds valid audio graphs (checked against a strict fake AudioContext)", () => {
    const made = { oscillators: 0, sources: 0, started: 0 };
    class Param {
      value = 0;
      setValueAtTime(v, t) { check(v, t); return this; }
      linearRampToValueAtTime(v, t) { check(v, t); return this; }
      exponentialRampToValueAtTime(v, t) {
        check(v, t);
        assert.ok(v > 0, `exponential ramp to ${v} would throw`);
        return this;
      }
      setTargetAtTime(v, t, c) { check(v, t); assert.ok(c > 0); return this; }
    }
    const check = (...args) => args.forEach(a => assert.ok(Number.isFinite(a), `non-finite ${a}`));
    class Node {
      connect(target) { assert.ok(target, "connect to nothing"); return target; }
    }
    class Scheduled extends Node {
      start(t = 0) { check(t); made.started++; }
      stop(t = 0) { check(t); }
    }
    class FakeAudioContext {
      currentTime = 1;
      sampleRate = 8000;
      state = "running";
      destination = new Node();
      createGain() { return Object.assign(new Node(), { gain: new Param() }); }
      createBiquadFilter() { return Object.assign(new Node(), { type: "", frequency: new Param(), Q: new Param() }); }
      createOscillator() { made.oscillators++; return Object.assign(new Scheduled(), { type: "", frequency: new Param() }); }
      createBufferSource() { made.sources++; return Object.assign(new Scheduled(), { buffer: null, loop: false }); }
      createBuffer(channels, length) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      }
      resume() { }
    }
    globalThis.AudioContext = FakeAudioContext;
    try {
      const sound = new Sound();
      sound.unlock();
      assert.ok(sound.ctx, "created on unlock");
      sound.setWater(1);
      for (const kind of ["deck", "beam", "cable"]) sound.snap(kind, 1.6);
      sound.creak(0.5); // below the threshold: silent
      const before = made.oscillators;
      sound.creak(1);
      assert.equal(made.oscillators, before + 1);
      sound.creak(1);
      assert.equal(made.oscillators, before + 1, "rate-limited");
      sound.engines(2);
      sound.engines(4);
      sound.engines(0);
      sound.rumble(0.5);
      sound.rumble(1);
      sound.rumble(0);
      sound.horn();
      sound.splash(1);
      sound.splash(0.2);
      sound.thud(1.4);
      sound.jingle(true);
      sound.jingle(false);
      sound.setMuted(true);
      sound.setMuted(false);
      assert.ok(made.started > 20);
    } finally {
      delete globalThis.AudioContext;
    }
  });
});

describe("each material's sound", () => {
  test("every material has its own sound when placed, and the ones that break their own way exist", () => {
    for (const id of Object.keys(materials)) assert.ok(PLACE_SOUNDS[id]?.length, id);
    const sounds = Object.values(PLACE_SOUNDS).map(parts => JSON.stringify(parts));
    assert.equal(new Set(sounds).size, sounds.length, "no two sound the same");
    for (const id of Object.keys(BREAK_SOUNDS)) assert.ok(materials[id], id);
    for (const parts of [...Object.values(PLACE_SOUNDS), ...Object.values(BREAK_SOUNDS)]) {
      for (const p of parts) assert.ok(p.dur > 0 && p.dur < 1 && p.vol > 0 && p.vol <= 0.35);
    }
  });

  test("placing a piece asks for its material's sound; without Web Audio nothing plays", () => {
    const game = createGame("brook");
    game.drainEvents();
    ui.material = "wood";
    buildLink(game, -20, 10, -10, 10);
    ui.material = "steel";
    assert.deepEqual(game.drainEvents(), [{ type: "place", material: "wood" }]);
    const sound = new Sound();
    sound.place("wood");
    sound.snap("beam", 1, "wood");
  });
});
