import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, runFrames } from "./helpers.mjs";
import { SAVE_FORMAT_VERSION } from "../src/js/scene.js";

const maxSpeed = (scene) => Math.max(...scene.joints.map(j => Math.hypot(j.velocity.x, j.velocity.y)));

test("the demo bridge survives 10 s, stays finite and settles", () => {
  const game = createGame();
  runFrames(game, 300);
  const speedAt5s = maxSpeed(game.scene);
  runFrames(game, 300);

  assert.ok(Math.abs(game.evalCtx.time - 10) < 0.5, `simulates in real time (t = ${game.evalCtx.time})`);
  assert.ok(game.scene.joints.every(j => Number.isFinite(j.position.x) && Number.isFinite(j.position.y)));
  assert.equal(game.scene.links.filter(l => l.broken).length, 0);
  assert.ok(maxSpeed(game.scene) < speedAt5s, "motion decays");
  assert.ok(maxSpeed(game.scene) < 1, `nearly at rest (max speed ${maxSpeed(game.scene)} m/s)`);

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
