import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildLink, createGame, ui } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel } from "../src/js/level.mjs";
import { Sound } from "../src/js/audio.mjs";

describe("reset progress", () => {
  test("forgets wins, bests and saved bridges on every level, and goes back to the first", () => {
    const game = createGame("brook");
    game.importStructure(solutions.brook(findLevel("brook")));
    game.setSimulationRunning(true);
    for (let f = 0; f < 60 * 60 && !game.result; f++) game.tick();
    assert.equal(game.result.kind, "success");
    game.reset();
    game.selectLevel("creek");
    ui.material = "steel";
    buildLink(game, -20, 10, -15, 15); // autosaved on the creek
    localStorage.setItem("bridge-builder:sound", "off"); // a preference, not progress

    game.resetProgress();
    assert.equal(game.level.id, "brook");
    assert.equal(game.isCompleted("brook"), false);
    assert.equal(game.isUnlocked("creek"), false);
    assert.equal(game.bestResult("brook"), undefined);
    assert.deepEqual(game.totalStars.earned, 0);
    assert.equal(game.scene.links.length, 0, "Brook from bare anchors");
    assert.equal(localStorage.getItem("bridge-builder:structure:creek"), null);
    assert.equal(localStorage.getItem("bridge-builder:sound"), "off", "preferences stay");
  });
});

describe("volume", () => {
  test("is kept between 0 and 1, and muting doesn't lose it", () => {
    const sound = new Sound(); // no audio context in Node: only the numbers
    sound.setVolume(1.5);
    assert.equal(sound.volume, 1);
    sound.setVolume(-1);
    assert.equal(sound.volume, 0);
    sound.setVolume(0.4);
    sound.setMuted(true);
    sound.setMuted(false);
    assert.equal(sound.volume, 0.4);
  });
});
