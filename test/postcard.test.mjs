import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel } from "../src/js/level.mjs";
import { CARD, postcardFileName, postcardView } from "../src/js/postcard.mjs";

describe("a picture of the bridge", () => {
  test("frames the whole bridge, with a little room round it", () => {
    for (const id of ["brook", "creek", "grand", "mountain"]) {
      const level = /** @type {import("../src/js/level.mjs").Level} */ (findLevel(id));
      const game = createGame(id);
      game.importStructure(solutions[id](level));
      const view = postcardView(game.scene, level);
      const photo = { width: CARD.width - 32, height: 350 };
      for (const { position: p } of game.scene.joints) {
        assert.ok(Math.abs(p.x - view.x) * view.zoom < photo.width / 2, `${id}: x ${p.x} in`);
        assert.ok(Math.abs(p.y - view.y) * view.zoom < photo.height / 2, `${id}: y ${p.y} in`);
      }
      assert.ok(view.zoom > 2 && view.zoom <= 32, `${id}: zoom ${view.zoom}`);
    }
  });

  test("an empty level is framed on its anchors", () => {
    const level = /** @type {import("../src/js/level.mjs").Level} */ (findLevel("creek"));
    const view = postcardView(createGame("creek").scene, level);
    assert.ok(Number.isFinite(view.x) && Number.isFinite(view.zoom));
  });

  test("the file is named after the bridge, else the level", () => {
    const level = /** @type {import("../src/js/level.mjs").Level} */ (findLevel("creek"));
    const info = (name) => /** @type {any} */ ({ level, name });
    assert.equal(postcardFileName(info("The Red Runner!")), "the-red-runner.png");
    assert.equal(postcardFileName(info("Мост Сони")), "мост-сони.png");
    assert.equal(postcardFileName(info("")), "creek.png");
    assert.equal(postcardFileName(info("???")), "bridge.png");
  });
});
