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

test("stress colour is pale at rest, orange in compression, blue in tension", async () => {
  const { STRESS_COLORS } = await import("../src/js/engine/link.mjs");
  assert.deepEqual(link(steel, 10).stressColor, STRESS_COLORS.relaxed);
  assert.deepEqual(link(steel, 9).stressColor, STRESS_COLORS.compression, "at or past the limit");
  assert.deepEqual(link(steel, 11).stressColor, STRESS_COLORS.tension);
  const half = link(steel, 10 * (1 + 0.001)).stressColor; // half the tensile limit
  assert.ok(half.b > STRESS_COLORS.tension.b && half.b < STRESS_COLORS.relaxed.b, "in between");
});

test("the stress colours stay apart with the common kinds of colour blindness", async () => {
  const { STRESS_COLORS } = await import("../src/js/engine/link.mjs");
  // Machado et al. (2009) simulation matrices, full severity, on linear RGB; differences as
  // CIELAB delta E (about 2.3 is just noticeable; 20+ is clearly different)
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const views = {
    normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };
  const lab = ([r, g, b]) => {
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const seen = (m, { r, g, b }) => {
    const v = [lin(r), lin(g), lin(b)];
    return lab(m.map(row => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))));
  };
  const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
  const { relaxed, tension, compression } = STRESS_COLORS;
  for (const [name, m] of Object.entries(views)) {
    for (const t of [0.3, 0.6, 1]) {
      const ten = seen(m, mix(relaxed, tension, t)), com = seen(m, mix(relaxed, compression, t));
      assert.ok(dE(ten, com) > 30, `${name}, ${t * 100}% load: tension vs compression, dE ${dE(ten, com).toFixed(0)}`);
    }
    // a member about to break must never look relaxed
    const rel = seen(m, relaxed);
    for (const end of [tension, compression]) {
      assert.ok(dE(rel, seen(m, end)) > 50, `${name}: relaxed vs at the limit, dE ${dE(rel, seen(m, end)).toFixed(0)}`);
    }
  }
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
