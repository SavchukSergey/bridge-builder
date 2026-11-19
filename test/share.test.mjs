import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame, buildLink, ui } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import { bridgeInHash, bridgeUrl, decodeBridge, encodeBridge, SHARE_HASH_PREFIX } from "../src/js/share.mjs";

/** The level's reference bridge, exported as the game would. */
function exported(level) {
  const game = createGame(level.id);
  game.importStructure(solutions[level.id](level));
  return game.exportStructure();
}

describe("bridges in links", () => {
  for (const level of levels) {
    test(`${level.id}: the reference bridge survives a round trip, in a short link`, () => {
      const original = exported(level);
      const text = encodeBridge(original);
      assert.match(text, /^[0-9A-Za-z~_,!-]+$/, "only characters that need no escaping");
      assert.ok(text.length < 2000, `${text.length} characters`);
      const back = decodeBridge(text);
      assert.equal(back.level, level.id);
      assert.equal(back.version, original.version);
      assert.deepEqual(back.links, original.links);
      assert.equal(back.joints.length, original.joints.length);
      back.joints.forEach((j, i) => {
        const o = original.joints[i];
        assert.ok(Math.abs(j.x - o.x) <= 0.0005 && Math.abs(j.y - o.y) <= 0.0005, `joint ${i} within half a millimetre`);
        assert.equal(j.fixed, o.fixed);
      });
    });
  }

  test("opening a link loads the level and the bridge, as one undo step", () => {
    const original = exported(findLevel("creek"));
    const game = createGame("brook");
    ui.material = "road";
    buildLink(game, -10, 10, 10, 10);
    game.importStructure(decodeBridge(encodeBridge(original)));
    assert.equal(game.level.id, "creek");
    assert.equal(game.scene.links.length, original.links.length);
    const result = (() => {
      game.setSimulationRunning(true);
      for (let f = 0; f < 90 * 60 && !game.result; f++) game.tick();
      return game.result;
    })();
    assert.equal(result.kind, "success", "the shared bridge still holds");
    game.reset();
    game.undo();
    assert.equal(game.scene.links.length, 0, "undo brings back the creek as it was");
  });

  test("an empty bridge (just the anchors) packs too", () => {
    const game = createGame("brook");
    const back = decodeBridge(encodeBridge(game.exportStructure()));
    assert.equal(back.links.length, 0);
    assert.equal(back.joints.length, game.scene.joints.length);
  });

  test("joints off the grid and below zero keep their place to the millimetre", () => {
    const structure = {
      version: 1, level: "brook",
      joints: [{ x: -10, y: 10, fixed: true }, { x: -3.14159, y: -0.0004 }, { x: 123.4567, y: 2.71828 }],
      links: [{ a: 0, b: 1, material: "steel-light" }, { a: 1, b: 2, material: "cable-thin" }],
    };
    const back = decodeBridge(encodeBridge(structure));
    assert.deepEqual(back.joints, [{ x: -10, y: 10, fixed: true }, { x: -3.142, y: 0 }, { x: 123.457, y: 2.718 }]);
    assert.deepEqual(back.links, structure.links);
  });

  test("damaged links are refused", () => {
    const good = encodeBridge(exported(findLevel("brook")));
    for (const bad of ["", "nonsense", good.replace(/^1/, "2"), good + "~x", good.replace("R", "Q"),
      good.replace(",", ";"), "1~Brook!~0,0~", "1~brook~zzzzzzzzzz,0~"]) {
      assert.throws(() => decodeBridge(bad), Error, JSON.stringify(bad));
    }
  });

  test("unknown materials can't be packed", () => {
    assert.throws(() => encodeBridge({ version: 1, level: "brook", joints: [{ x: 0, y: 0 }, { x: 1, y: 0 }], links: [{ a: 0, b: 1, material: "marble" }] }));
  });

  test("the address: a #bridge= hash on the page's own address", () => {
    const structure = exported(findLevel("brook"));
    const url = bridgeUrl("https://example.com/game/", structure);
    assert.ok(url.startsWith("https://example.com/game/" + SHARE_HASH_PREFIX));
    const hash = url.slice(url.indexOf("#"));
    assert.deepEqual(decodeBridge(bridgeInHash(hash)).links, structure.links);
    assert.equal(bridgeInHash(""), undefined);
    assert.equal(bridgeInHash("#other"), undefined);
    // a hash some app percent-encoded on the way
    assert.deepEqual(decodeBridge(bridgeInHash(encodeURI(hash).replace(/~/g, "%7E"))).links, structure.links);
  });
});
