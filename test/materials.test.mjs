import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildLink, createGame, ui } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { Scene, SAVE_FORMAT_VERSION } from "../src/js/scene.js";
import { levels } from "../src/js/level.mjs";
import { materials } from "../src/js/materials/index.mjs";
import { cable, thinCable } from "../src/js/materials/cable.mjs";
import { lightSteel, steel } from "../src/js/materials/steel.mjs";
import { wood } from "../src/js/materials/wood.mjs";

describe("member sizes", () => {
  test("wood is the cheapest beam per metre, but no cheaper than light steel for the strength", () => {
    const beams = Object.values(materials).filter(m => m.canCompress && !m.drivable);
    const cheapest = Math.min(...beams.map(m => m.costPerMeter));
    assert.equal(wood.costPerMeter, cheapest);
    const perNewton = (m, strength) => m.costPerMeter / (m[strength] * m.crossSectionalArea);
    for (const strength of ["tensileStrength", "compressionStrength"]) {
      assert.ok(perNewton(wood, strength) > perNewton(lightSteel, strength), strength);
    }
    assert.ok(wood.label === "Wood" && wood.canCompress);
  });

  test("every material has an id, a label and a price", () => {
    for (const [id, m] of Object.entries(materials)) {
      assert.equal(m.name, id);
      assert.ok(typeof m.label === "string" && m.label.length > 0);
      assert.ok(m.costPerMeter > 0);
    }
    assert.equal(lightSteel.label, "Light steel");
    assert.equal(thinCable.label, "Thin cable");
  });

  for (const [heavy, light] of [[steel, lightSteel], [cable, thinCable]]) {
    test(`${light.label} is ${heavy.label.toLowerCase()} with a smaller section: weaker, lighter and cheaper per metre`, () => {
      for (const key of ["youngModulus", "tensileStrength", "compressionStrength", "density", "canCompress", "drivable", "carries"]) {
        assert.equal(light[key], heavy[key], key);
      }
      const ratio = light.crossSectionalArea / heavy.crossSectionalArea;
      assert.ok(ratio < 1);
      // force it can carry before breaking scales with the section
      assert.equal(light.tensileStrength * light.crossSectionalArea, heavy.tensileStrength * heavy.crossSectionalArea * ratio);
      assert.ok(light.costPerMeter < heavy.costPerMeter);
      assert.ok(light.costPerMeter > heavy.costPerMeter * ratio, "but not proportionally cheaper: some fixed cost per metre");
    });
  }

  test("structures with the new sizes save and load", () => {
    const s = { version: SAVE_FORMAT_VERSION, joints: [{ x: 0, y: 0, fixed: true }, { x: 5, y: 0 }, { x: 5, y: 5 }], links: [
      { a: 0, b: 1, material: "steel-light" },
      { a: 1, b: 2, material: "cable-thin" },
    ] };
    const scene = new Scene();
    scene.load(s);
    assert.deepEqual(scene.links.map(l => l.material), [lightSteel, thinCable]);
    assert.deepEqual(scene.serialize().links, s.links);
  });

  test("the selected size is used when building, and shown by its label on hover", () => {
    const game = createGame();
    ui.material = "steel-light";
    buildLink(game, -40, 25, -40, 30);
    const link = game.scene.links.at(-1);
    assert.equal(link.material, lightSteel);
    assert.equal(game.cost - new Scene().cost, 5 * lightSteel.costPerMeter);

    game.__handleMouseMove({ clientX: 400 + (-40) * 8, clientY: 300 - 27.5 * 8 });
    assert.equal(game.hoverInfo.label, "Light steel");
  });
});

describe("budgets leave room for a first bridge", () => {
  // Getting across should be easy for a young player; being cheap is what the stars are for.
  // Canyon is tighter: its example bridge works, and must cost a little too much.
  for (const level of levels) {
    const high = level.id === "canyon" ? 0.82 : 0.72;
    test(`${level.name}: the cheapest known bridge uses 60-${high * 100}% of the budget`, () => {
      const scene = new Scene();
      scene.load(solutions[level.id](level));
      const share = scene.cost / level.budget;
      assert.ok(share >= 0.6 && share <= high, `reference $${Math.round(scene.cost)} is ${Math.round(share * 100)}% of $${level.budget}`);
    });
  }
});
