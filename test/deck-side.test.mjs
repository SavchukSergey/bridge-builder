import { test } from "node:test";
import assert from "node:assert/strict";
import { Link } from "../src/js/engine/link.mjs";
import { Joint } from "../src/js/engine/joint.mjs";
import { road } from "../src/js/materials/road.mjs";
import { createVec3F } from "../src/js/math.js";

const deck = (ax, bx) => new Link(new Joint(createVec3F(ax, 10, 0)), new Joint(createVec3F(bx, 10, 0)), road);

test("a deck's top is up as built, whichever way it was drawn", () => {
  assert.equal(deck(0, 10).side, 1);
  assert.equal(deck(10, 0).side, -1);
});

test("a broken deck swinging past upright keeps its top on the same side", () => {
  const link = deck(0, 10);
  // it hangs from its far end and swings through: a ends up to the right of b, upside down
  link.a.position.x = 12;
  link.a.position.y = 0;
  assert.equal(link.side, 1, "the side is the one it was built with, not recomputed from where it is now");
  link.rest(); // only moving it while building gives it a new rest shape
  assert.equal(link.side, -1);
});
