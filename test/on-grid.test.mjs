import { test } from "node:test";
import assert from "node:assert/strict";
import { solutions } from "./solutions.mjs";
import { levels } from "../src/js/level.mjs";
import { SNAP_STEP } from "../src/js/game-config.mjs";

/** @param {number} v */
const onGrid = (v) => Math.abs(v / SNAP_STEP - Math.round(v / SNAP_STEP)) < 1e-9;

test("every hint bridge and every starting bridge is on the building grid, so a player can copy it", () => {
  for (const level of levels) {
    for (const [what, make] of /** @type {const} */ ([["hint bridge", solutions[level.id]], ["starting bridge", level.example]])) {
      if (!make) continue;
      for (const j of make(level).joints) {
        assert.ok(onGrid(j.x) && onGrid(j.y), `${level.id} ${what}: joint at (${j.x}, ${j.y})`);
      }
    }
  }
});
