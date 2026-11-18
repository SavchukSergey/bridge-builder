import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, runFrames } from "./helpers.mjs";
import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

const maxSpeed = (scene) => Math.max(...scene.joints.map(j => Math.hypot(j.velocity.x, j.velocity.y)));

/** Highest joint speed seen over the next `seconds` of simulation (60 fps frames). */
function peakSpeedOver(game, seconds) {
  let peak = 0;
  for (let f = 0; f < seconds * 60; f++) {
    game.tick();
    peak = Math.max(peak, maxSpeed(game.scene));
  }
  return peak;
}

test("the demo bridge survives 15 s, stays finite and settles", () => {
  const game = createGame();
  game.setSimulationRunning(true);
  game.vehicle = undefined; // the structure on its own, without the load test
  const early = peakSpeedOver(game, 3);   // 0-3 s: gravity ramps up, deck drops and bounces
  peakSpeedOver(game, 9);
  const late = peakSpeedOver(game, 3);    // 12-15 s

  assert.ok(Math.abs(game.evalCtx.time - 15) < 0.01, `simulates in real time (t = ${game.evalCtx.time})`);
  assert.ok(game.scene.joints.every(j => Number.isFinite(j.position.x) && Number.isFinite(j.position.y)));
  assert.equal(game.scene.links.filter(l => l.broken).length, 0);
  assert.ok(late < early / 5, `motion decays (peak ${early.toFixed(3)} -> ${late.toFixed(3)} m/s)`);
  assert.ok(late < 0.3, `nearly at rest (peak ${late.toFixed(3)} m/s)`);

  const midDeck = game.scene.joints.find(j => !j.fixed && Math.abs(j.position.x) < 1 && j.position.y < 15);
  assert.ok(midDeck.position.y < 10 && midDeck.position.y > 8, `deck sags a little under gravity (y = ${midDeck.position.y})`);
});

test("a very short steel link does not blow up the simulation", () => {
  const game = createGame();
  game.importStructure({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: 0, y: 0, fixed: true }, { x: 0, y: -0.2 }, { x: 0, y: -10.2 }],
    links: [{ a: 0, b: 1, material: "steel" }, { a: 1, b: 2, material: "steel" }],
  });
  runFrames(game, 120);
  assert.ok(game.scene.joints.every(j => Number.isFinite(j.position.y)));
  assert.ok(maxSpeed(game.scene) < 1);
  const bottom = game.scene.joints[2];
  assert.ok(Math.abs(bottom.position.x) < 1e-6 && Math.abs(bottom.position.y + 10.2) < 0.01, "hangs straight down");
});

test("a hanging rod stretches by about m*g/k, the static deflection", () => {
  // A 10 m steel rod hanging from an anchor: its free end carries half the rod's weight.
  const game = createGame();
  game.importStructure({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: 0, y: 0, fixed: true }, { x: 0, y: -10 }],
    links: [{ a: 0, b: 1, material: "steel" }],
  });
  runFrames(game, 600);
  const link = game.scene.links[0];
  const k = link.material.youngModulus * link.crossSectionalArea / link.length;
  const expected = (link.mass / 2) * 9.81 / k;
  const actual = -10 - game.scene.joints[1].position.y;
  assert.ok(Math.abs(actual - expected) / expected < 0.25, `extension ${actual} vs expected ${expected}`);
});

test("cables can sag but never push", () => {
  // A cable 'post' standing on an anchor has nothing holding it up and must fall.
  const game = createGame();
  game.importStructure({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: 0, y: 0, fixed: true }, { x: 0, y: 10 }],
    links: [{ a: 0, b: 1, material: "cable" }],
  });
  runFrames(game, 120);
  assert.ok(game.scene.joints[1].position.y < 9, "the top of a cable post falls");
});

test("simulated time follows real elapsed time at any frame rate, capped per frame", () => {
  const at60 = createGame();
  at60.setSimulationRunning(true);
  for (let i = 0; i < 60; i++) at60.tick(1 / 60);

  const at10 = createGame();
  at10.setSimulationRunning(true);
  for (let i = 0; i < 10; i++) at10.tick(1 / 10);

  assert.ok(Math.abs(at60.evalCtx.time - 1) < 0.01, `60 fps: ${at60.evalCtx.time}`);
  assert.ok(Math.abs(at10.evalCtx.time - 1) < 0.01, `10 fps: ${at10.evalCtx.time}`);

  const stalled = createGame();
  stalled.setSimulationRunning(true);
  stalled.tick(30); // tab was in the background for 30 s
  assert.ok(stalled.evalCtx.time < 0.11, "long gaps are not caught up");
  stalled.tick(-1);
  assert.ok(stalled.evalCtx.time < 0.11, "negative elapsed is ignored");
});
