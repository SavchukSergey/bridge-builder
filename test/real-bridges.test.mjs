import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { REAL_BRIDGES, bridgeDrawing, realBridgeFor } from "../src/js/real-bridges.mjs";
import { levels } from "../src/js/level.mjs";
import { DICTIONARIES } from "../src/js/i18n.mjs";

describe("real bridges", () => {
  test("each belongs to a level, one per level, in the levels' order", () => {
    const order = REAL_BRIDGES.map(b => levels.findIndex(l => l.id === b.level));
    assert.ok(order.every(i => i >= 0), "every level exists");
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "in order");
    assert.equal(new Set(REAL_BRIDGES.map(b => b.level)).size, REAL_BRIDGES.length);
    assert.equal(realBridgeFor("hang")?.id, "golden");
    assert.equal(realBridgeFor("canyon"), undefined);
  });

  test("each has a name, a place and a fact in every language", () => {
    for (const [lang, words] of Object.entries(DICTIONARIES)) {
      for (const { id } of REAL_BRIDGES) {
        for (const part of ["name", "place", "fact"]) {
          assert.ok(typeof words[`realBridge.${id}.${part}`] === "string" && words[`realBridge.${id}.${part}`].length > 0, `${lang}: ${id}.${part}`);
        }
      }
    }
  });

  test("every kind has a drawing; named for a screen reader only when asked", () => {
    for (const { kind } of REAL_BRIDGES) {
      const svg = bridgeDrawing(kind);
      assert.match(svg, /^<svg class="real-drawing" viewBox="0 0 200 80" aria-hidden="true">/);
      assert.ok(!svg.includes("NaN") && !svg.includes("undefined"), kind);
    }
    assert.match(bridgeDrawing("lifting", 'Tower "Bridge" & <co>'), /aria-label="Tower &#34;Bridge&#34; &#38; &#60;co&#62;"/);
  });
});
