import { test } from "node:test";
import assert from "node:assert/strict";
import { createVec3F, lerpColor, vec3fadd, vec3flen, vec3flen2, vec3fmul, vec3fnorm, vec3fsub } from "../src/js/math.js";

test("vector arithmetic", () => {
  const a = createVec3F(1, 2, 3), b = createVec3F(4, 6, 3);
  assert.deepEqual(vec3fadd(a, b), { x: 5, y: 8, z: 6 });
  assert.deepEqual(vec3fsub(b, a), { x: 3, y: 4, z: 0 });
  assert.deepEqual(vec3fmul(a, 2), { x: 2, y: 4, z: 6 });
  assert.equal(vec3flen2(vec3fsub(b, a)), 25);
  assert.equal(vec3flen(vec3fsub(b, a)), 5);
});

test("vec3fnorm returns a unit vector and leaves the input unchanged", () => {
  const v = createVec3F(3, 0, 4);
  const n = vec3fnorm(v);
  assert.ok(Math.abs(vec3flen(n) - 1) < 1e-12);
  assert.deepEqual(v, { x: 3, y: 0, z: 4 });
});

test("lerpColor interpolates and clamps k to [0, 1]", () => {
  const black = { r: 0, g: 0, b: 0 }, white = { r: 1, g: 1, b: 1 };
  assert.deepEqual(lerpColor(black, white, 0.25), { r: 0.25, g: 0.25, b: 0.25 });
  assert.deepEqual(lerpColor(black, white, -3), black);
  assert.deepEqual(lerpColor(black, white, 7), white);
});
