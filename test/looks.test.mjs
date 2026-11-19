import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { LOOKS_KEY, NAME_MAX, PAINTS, loadLooks, saveLooks } from "../src/js/looks.mjs";

describe("paint and name your bridge", () => {
  test("each level keeps its own name and paint", () => {
    localStorage.clear();
    assert.deepEqual(loadLooks("brook"), { name: "", paint: "plain" });
    saveLooks("brook", { name: "Sunny Bridge" });
    saveLooks("brook", { paint: "red" });
    saveLooks("creek", { paint: "blue" });
    assert.deepEqual(loadLooks("brook"), { name: "Sunny Bridge", paint: "red" });
    assert.deepEqual(loadLooks("creek"), { name: "", paint: "blue" });
  });

  test("names are tidied and kept short; unknown paints are plain; plain and unnamed is forgotten", () => {
    localStorage.clear();
    assert.equal(saveLooks("brook", { name: "  Big   red\tbridge  " }).name, "Big red bridge");
    assert.equal(saveLooks("brook", { name: "x".repeat(50) }).name.length, NAME_MAX);
    assert.equal(saveLooks("brook", { paint: "tartan" }).paint, "plain");
    saveLooks("brook", { name: "" });
    assert.equal(JSON.parse(localStorage.getItem(LOOKS_KEY) ?? "{}").brook, undefined);
    localStorage.setItem(LOOKS_KEY, "{oops");
    assert.deepEqual(loadLooks("brook"), { name: "", paint: "plain" });
  });

  test("every paint colours a beam and its centre line; resetting progress forgets them all", () => {
    for (const [id, paint] of Object.entries(PAINTS)) {
      if (id === "plain") assert.equal(paint, undefined);
      else assert.match(`${paint?.color} ${paint?.highlight}`, /^#[0-9a-f]{6} #[0-9a-f]{6}$/);
    }
    const game = createGame("brook");
    saveLooks("brook", { name: "Mine", paint: "green" });
    game.resetProgress();
    assert.equal(localStorage.getItem(LOOKS_KEY), null);
  });
});
