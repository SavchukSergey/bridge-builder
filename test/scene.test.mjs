import { test } from "node:test";
import assert from "node:assert/strict";
import { EvalCtx } from "../src/js/eval-ctx.mjs";
import { Joint } from "../src/js/engine/joint.mjs";
import { Link } from "../src/js/engine/link.mjs";
import { steel } from "../src/js/materials/steel.mjs";
import { createVec3F } from "../src/js/math.js";
import { AIR_DRAG, Scene, SAVE_FORMAT_VERSION } from "../src/js/scene.js";

const v = (x, y) => createVec3F(x, y, 0);

/** Scene with one fixed anchor A(0,0) linked to free joints B(10,0) and C(10,10), plus B-C. */
function triangle() {
  const scene = new Scene();
  scene.load({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: 0, y: 0, fixed: true }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    links: [
      { a: 0, b: 1, material: "steel" },
      { a: 1, b: 2, material: "steel" },
      { a: 0, b: 2, material: "cable" },
    ],
  });
  const [a, b, c] = scene.joints;
  return { scene, a, b, c };
}

test("the default scene is the demo suspension bridge", () => {
  const scene = new Scene();
  assert.equal(scene.joints.length, 20);
  assert.equal(scene.links.length, 27);
  assert.equal(scene.joints.filter(j => j.fixed).length, 4);
});

test("distributeMass gives each joint half the mass of every attached link", () => {
  const { scene, a, b } = triangle();
  const [ab, bc] = scene.links;
  assert.equal(b.mass, ab.mass / 2 + bc.mass / 2);
  const ac = scene.links[2];
  assert.equal(a.mass, ab.mass / 2 + ac.mass / 2);
});

test("findJoint returns the nearest joint within the radius", () => {
  const { scene, b } = triangle();
  assert.equal(scene.findJoint(v(10.5, 0.5), 1), b);
  assert.equal(scene.findJoint(v(12, 0), 1), undefined);
});

test("findLink measures distance to the segment, not just its endpoints", () => {
  const { scene } = triangle();
  const [ab, bc] = scene.links;
  assert.equal(scene.findLink(v(5, 0.3), 1), ab);
  assert.equal(scene.findLink(v(10.4, 5), 1), bc);
  assert.equal(scene.findLink(v(-3, 0), 1), undefined, "beyond the end of the segment");
});

test("hasLink is direction-independent", () => {
  const { scene, a, b, c } = triangle();
  assert.ok(scene.hasLink(a, b));
  assert.ok(scene.hasLink(b, a));
  scene.removeLink(scene.links[0]);
  assert.ok(!scene.hasLink(a, b));
  assert.ok(scene.hasLink(b, c));
});

test("removeLink drops non-fixed joints left without links, but keeps anchors", () => {
  const scene = new Scene();
  scene.load({ version: SAVE_FORMAT_VERSION, joints: [{ x: 0, y: 0, fixed: true }, { x: 5, y: 0 }], links: [{ a: 0, b: 1, material: "steel" }] });
  scene.removeLink(scene.links[0]);
  assert.equal(scene.links.length, 0);
  assert.equal(scene.joints.length, 1);
  assert.ok(scene.joints[0].fixed);
});

test("removeJoint removes its links and refuses fixed anchors", () => {
  const { scene, a, b, c } = triangle();
  assert.equal(scene.removeJoint(a), false);
  assert.equal(scene.joints.length, 3);

  assert.equal(scene.removeJoint(b), true);
  assert.deepEqual(scene.joints, [a, c]);
  assert.equal(scene.links.length, 1);
  assert.ok(scene.hasLink(a, c));
  assert.equal(c.mass, scene.links[0].mass / 2, "mass redistributed");
});

test("snapshot/restore brings back positions, velocities and broken links", () => {
  const { scene, b } = triangle();
  const snap = scene.snapshot();
  b.position.x = 99;
  b.velocity.y = 5;
  scene.links[0].broken = true;

  scene.restore(snap);
  assert.deepEqual(b.position, v(10, 0));
  assert.deepEqual(b.velocity, v(0, 0));
  assert.equal(scene.links[0].broken, false);
  assert.equal(scene.links[0].strain, 0, "derived link state is refreshed");
});

test("serialize/load round-trips the structure", () => {
  const original = new Scene();
  const saved = original.serialize();
  assert.equal(saved.version, SAVE_FORMAT_VERSION);

  const copy = new Scene();
  copy.load(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(copy.serialize(), saved);
  assert.equal(copy.joints.filter(j => j.fixed).length, 4);
});

test("serialize uses snapshot positions, i.e. the structure as built", () => {
  const { scene, b } = triangle();
  const snap = scene.snapshot();
  b.position.y = -3; // deformed by simulation
  assert.deepEqual(scene.serialize(snap).joints[1], { x: 10, y: 0 });
  assert.deepEqual(scene.serialize().joints[1], { x: 10, y: -3 });
});

test("load rejects invalid data and leaves the scene unchanged", () => {
  const ok = { x: 0, y: 0 };
  const cases = {
    "not an object": null,
    "unsupported version": { version: 999, joints: [], links: [] },
    "missing joints or links": { version: SAVE_FORMAT_VERSION, joints: [] },
    "bad coordinates": { version: SAVE_FORMAT_VERSION, joints: [{ x: "1", y: 0 }], links: [] },
    "missing joint": { version: SAVE_FORMAT_VERSION, joints: [ok], links: [{ a: 0, b: 1, material: "steel" }] },
    "to itself": { version: SAVE_FORMAT_VERSION, joints: [ok], links: [{ a: 0, b: 0, material: "steel" }] },
    "unknown material": { version: SAVE_FORMAT_VERSION, joints: [ok, { x: 1, y: 0 }], links: [{ a: 0, b: 1, material: "toString" }] },
    "zero length": { version: SAVE_FORMAT_VERSION, joints: [ok, { x: 0, y: 0 }], links: [{ a: 0, b: 1, material: "steel" }] },
  };
  for (const [message, data] of Object.entries(cases)) {
    const { scene } = triangle();
    const before = scene.serialize();
    assert.throws(() => scene.load(data), new RegExp(message), message);
    assert.deepEqual(scene.serialize(), before, `scene unchanged after: ${message}`);
  }
});

test("stableDt shrinks for short (stiff, light) links", () => {
  const long = new Scene();
  const short = new Scene();
  const anchor = new Joint(v(-40, 10), true);
  const stub = new Joint(v(-40, 10.3));
  short.joints.push(anchor, stub);
  short.links.push(new Link(anchor, stub, steel));
  short.distributeMass();
  assert.ok(short.stableDt() < long.stableDt() / 5);
});

test("tick breaks links stretched past their strength", () => {
  const { scene, b } = triangle();
  b.position.x = 10.5; // 5% strain on A-B, far beyond steel's 0.2%
  scene.tick(new EvalCtx());
  assert.equal(scene.links[0].broken, true);
  assert.equal(scene.links[1].broken, false);
});

test("tick integrates with semi-implicit Euler: v += a*dt, then x += v*dt", () => {
  const scene = new Scene();
  scene.load({ version: SAVE_FORMAT_VERSION, joints: [{ x: 0, y: 0, fixed: true }, { x: 0, y: -10 }], links: [{ a: 0, b: 1, material: "steel" }] });
  const evalCtx = new EvalCtx();
  evalCtx.time = 5; // gravity fully ramped up
  const joint = scene.joints[1];
  // starting at rest with an unstressed link, the only force is gravity
  const dt = scene.tick(evalCtx);
  const g = evalCtx.gravity.y;
  assert.ok(Math.abs(joint.velocity.y - g * dt * Math.exp(-AIR_DRAG * dt)) < 1e-12, "velocity");
  assert.ok(Math.abs(joint.position.y - (-10 + g * dt * dt)) < 1e-12, `position moved by v*dt (${joint.position.y + 10} vs ${g * dt * dt})`);
});
