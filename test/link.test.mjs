import { test } from "node:test";
import assert from "node:assert/strict";
import { Joint } from "../src/js/engine/joint.mjs";
import { Link } from "../src/js/engine/link.mjs";
import { cable } from "../src/js/materials/cable.mjs";
import { steel } from "../src/js/materials/steel.mjs";
import { createVec3F } from "../src/js/math.js";

/** Link of rest length 10 along x, with b moved to x = stretchedTo. */
function link(material, stretchedTo) {
  const a = new Joint(createVec3F(0, 0, 0));
  const b = new Joint(createVec3F(10, 0, 0));
  const l = new Link(a, b, material);
  b.position.x = stretchedTo;
  l.preEval();
  return l;
}

test("rest length, mass and unit direction come from the initial positions", () => {
  const l = link(steel, 10);
  assert.equal(l.length, 10);
  assert.equal(l.mass, steel.density * steel.crossSectionalArea * 10);
  assert.deepEqual(l.directionN, { x: 1, y: 0, z: 0 });
  assert.equal(l.strain, 0);
  assert.equal(l.stressForce, 0);
});

test("steel pulls when stretched and pushes when compressed (Hooke's law)", () => {
  const stretched = link(steel, 10.001);
  assert.ok(Math.abs(stretched.strain - 1e-4) < 1e-12);
  const expected = 1e-4 * steel.youngModulus * steel.crossSectionalArea;
  assert.ok(Math.abs(stretched.stressForce - expected) / expected < 1e-9);

  assert.ok(link(steel, 9.999).stressForce < 0);
});

test("cable pulls when stretched but goes slack when compressed", () => {
  assert.ok(link(cable, 10.001).stressForce > 0);
  const slack = link(cable, 5);
  assert.equal(slack.stressForce, 0);
  assert.equal(slack.stressPressure, 0);
  assert.equal(slack.overStressed, false, "a slack cable never breaks from compression");
});

test("overStressed uses tensile and compressive limits separately", () => {
  // steel: tensile 400 MPa, compressive 250 MPa, E = 200 GPa -> strain limits 0.002 / 0.00125
  assert.equal(link(steel, 10 * (1 + 0.0019)).overStressed, false);
  assert.equal(link(steel, 10 * (1 + 0.0021)).overStressed, true);
  assert.equal(link(steel, 10 * (1 - 0.0012)).overStressed, false);
  assert.equal(link(steel, 10 * (1 - 0.0013)).overStressed, true);
});

test("stress colour is green at rest, red in compression, blue in tension", () => {
  assert.deepEqual(link(steel, 10).stressColor, { r: 0, g: 1, b: 0 });
  assert.deepEqual(link(steel, 9).stressColor, { r: 1, g: 0, b: 0 });
  assert.deepEqual(link(steel, 11).stressColor, { r: 0, g: 0, b: 1 });
});

test("damping is a fixed fraction of critical damping for every link", async () => {
  const { DAMPING_RATIO } = await import("../src/js/engine/link.mjs");
  const anchor = new Joint(createVec3F(0, 0, 0), true);
  for (const length of [1, 10]) {
    const end = new Joint(createVec3F(length, 0, 0));
    const l = new Link(anchor, end, steel);
    end.mass = l.mass / 2;
    // anchor is fixed, so the reduced mass is just the free end's mass
    const critical = 2 * Math.sqrt(l.stiffness * end.mass);
    assert.ok(Math.abs(l.dampingCoefficient / critical - DAMPING_RATIO) < 1e-12);
  }
  const loose = new Link(new Joint(createVec3F(0, 0, 0), true), new Joint(createVec3F(1, 0, 0), true), steel);
  assert.equal(loose.dampingCoefficient, 0, "no damping between two fixed joints");
});
