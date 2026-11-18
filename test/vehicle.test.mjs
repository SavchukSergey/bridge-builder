import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { EvalCtx } from "../src/js/eval-ctx.mjs";
import { demoLevel } from "../src/js/level.mjs";
import { SAVE_FORMAT_VERSION, Scene } from "../src/js/scene.js";
import { findRoad, Vehicle, VEHICLE_START_DELAY } from "../src/js/vehicle.mjs";

/** A straight deck from (-40,10) to (40,10) in 10 m segments, both ends anchored. */
function deck(material = "road", { skip = -1 } = {}) {
  const joints = [{ x: -40, y: 10, fixed: true }];
  for (let x = -30; x <= 30; x += 10) joints.push({ x, y: 10 });
  joints.push({ x: 40, y: 10, fixed: true });
  const links = joints.slice(1).map((_, i) => ({ a: i, b: i + 1, material })).filter((_, i) => i !== skip);
  return { version: SAVE_FORMAT_VERSION, joints, links };
}

/** Runs the load test until it finishes (or `seconds` pass). */
function runTest(game, seconds = 40) {
  game.setSimulationRunning(true);
  for (let f = 0; f < seconds * 60 && !game.vehicle.finished; f++) game.tick();
  return game.vehicle;
}

describe("findRoad", () => {
  const scene = new Scene();
  scene.load({
    version: SAVE_FORMAT_VERSION,
    joints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: -5 }, { x: 20, y: 20 }, { x: 20, y: 2 }, { x: 30, y: 2 }],
    links: [
      { a: 0, b: 1, material: "road" },  // diagonal road, y = x for x in [0, 10]
      { a: 2, b: 3, material: "road" },  // flat road at y = 5 for x in [0, 10]
      { a: 4, b: 5, material: "road" },  // vertical at x = 20: nothing to drive on
      { a: 6, b: 7, material: "steel" }, // flat steel at y = 2 for x in [20, 30]
    ],
  });

  test("returns the highest road at or below maxY, with the position along it", () => {
    const hit = findRoad(scene, 8, 100);
    assert.equal(hit.link, scene.links[0]);
    assert.ok(Math.abs(hit.y - 8) < 1e-12 && Math.abs(hit.t - 0.8) < 1e-12);

    assert.equal(findRoad(scene, 8, 6).link, scene.links[1], "the diagonal (y=8) is above maxY");
    assert.equal(findRoad(scene, 3, 100).link, scene.links[1], "flat road (y=5) is above the diagonal (y=3)");
    assert.equal(findRoad(scene, 3, 4).link, scene.links[0]);
    assert.equal(findRoad(scene, 3, 2), undefined, "nothing at or below y=2");
  });

  test("ignores x outside every road, vertical links and non-road materials", () => {
    assert.equal(findRoad(scene, -1, 100), undefined);
    assert.equal(findRoad(scene, 20, 100), undefined, "vertical road link");
    assert.equal(findRoad(scene, 25, 100), undefined, "steel is not drivable");
  });

  test("ignores broken links", () => {
    const s = new Scene();
    s.load(deck());
    s.links[3].broken = true; // -10 .. 0
    assert.equal(findRoad(s, -5, 100), undefined);
    assert.ok(findRoad(s, 5, 100));
  });
});

describe("vehicle loads", () => {
  test("the vehicle's weight is split between the link's joints by position", () => {
    const scene = new Scene();
    scene.load(deck());
    const vehicle = new Vehicle(demoLevel);
    const evalCtx = new EvalCtx();
    evalCtx.time = 5;
    const link = scene.links[2]; // -20 .. -10
    vehicle.contact = { link, t: 0.25, y: 10 };

    const loads = vehicle.loads(evalCtx);
    const weight = demoLevel.vehicleMass * evalCtx.gravity.y;
    assert.deepEqual(loads.map(l => l.joint), [link.a, link.b]);
    assert.ok(Math.abs(loads[0].fy - weight * 0.75) < 1e-6);
    assert.ok(Math.abs(loads[1].fy - weight * 0.25) < 1e-6);
  });

  test("no load while on solid ground or once the link has broken", () => {
    const scene = new Scene();
    scene.load(deck());
    const vehicle = new Vehicle(demoLevel);
    const evalCtx = new EvalCtx();
    assert.deepEqual(vehicle.loads(evalCtx), []);
    vehicle.contact = { link: scene.links[0], t: 0.5, y: 10 };
    scene.links[0].broken = true;
    assert.deepEqual(vehicle.loads(evalCtx), []);
  });

  test("external loads are added on top of gravity in Scene.tick", () => {
    const scene = new Scene();
    scene.load(deck());
    const joint = scene.joints[4];
    const evalCtx = new EvalCtx();
    evalCtx.time = 5;
    scene.tick(evalCtx, [{ joint, fy: -1e6 }]);
    const other = scene.joints[3];
    assert.ok(joint.velocity.y < other.velocity.y * 10, "the loaded joint is pushed down much harder");
  });
});

describe("load test", () => {
  test("the vehicle waits for gravity to ramp up, then drives at its speed", () => {
    const game = createGame();
    game.setSimulationRunning(true);
    while (game.evalCtx.time < VEHICLE_START_DELAY - 0.1) game.tick();
    assert.equal(game.vehicle.state, "waiting");
    assert.equal(game.vehicle.x, demoLevel.startX);
    for (let i = 0; i < 60 * 2; i++) game.tick();
    assert.equal(game.vehicle.state, "driving");
    const expected = demoLevel.startX + game.vehicle.speed * (game.evalCtx.time - VEHICLE_START_DELAY);
    assert.ok(Math.abs(game.vehicle.x - expected) < 0.05, `x ${game.vehicle.x} vs ${expected}`);
  });

  test("the demo bridge carries the vehicle across without breaking", () => {
    const game = createGame();
    let lowest = Infinity;
    game.setSimulationRunning(true);
    while (!game.vehicle.finished && game.evalCtx.time < 40) {
      game.tick();
      lowest = Math.min(lowest, game.vehicle.y);
    }
    assert.equal(game.vehicle.state, "crossed");
    assert.equal(game.testState, "crossed");
    assert.equal(game.vehicle.x, demoLevel.finishX);
    assert.equal(game.scene.links.filter(l => l.broken).length, 0);
    assert.ok(lowest < demoLevel.groundY - 0.5, `the deck visibly sags under the vehicle (lowest y ${lowest})`);
  });

  test("with no road across the gap the vehicle falls", () => {
    const game = createGame();
    game.importStructure({ version: SAVE_FORMAT_VERSION, joints: [{ x: -40, y: 10, fixed: true }], links: [] });
    game.setSimulationRunning(true);
    let fallStartX;
    while (!game.vehicle.finished && game.evalCtx.time < 40) {
      game.tick();
      if (game.vehicle.state === "falling") fallStartX ??= game.vehicle.x;
    }
    assert.equal(game.vehicle.state, "fell");
    assert.ok(Math.abs(fallStartX - demoLevel.gapLeftX) < 0.2, `starts falling at the cliff edge (x = ${fallStartX})`);
    assert.ok(game.vehicle.y < demoLevel.groundY - 19);
  });

  test("a missing deck section makes the vehicle fall", () => {
    const game = createGame();
    game.importStructure(deck("road", { skip: 4 }));
    assert.equal(runTest(game).state, "fell");
  });

  test("steel is not a road: a steel deck does not carry the vehicle", () => {
    const game = createGame();
    game.importStructure(deck("steel"));
    assert.equal(runTest(game).state, "fell");
  });

  test("a vehicle that falls onto a road below lands and keeps driving", () => {
    const game = createGame();
    // upper road ends at x = -30; a lower road 3 m down continues across the gap
    const s = deck();
    s.joints.push({ x: -40, y: 7, fixed: true }, { x: -30, y: 7, fixed: true }, { x: -25, y: 7, fixed: true });
    const n = s.joints.length;
    s.links = [s.links[0], { a: n - 3, b: n - 2, material: "road" }, { a: n - 2, b: n - 1, material: "road" }];
    game.importStructure(s);
    game.setSimulationRunning(true);
    const states = new Set();
    while (game.vehicle.x < -26 && game.evalCtx.time < 20) {
      game.tick();
      states.add(game.vehicle.state);
    }
    assert.ok(states.has("falling"), "it fell off the end of the upper road");
    assert.equal(game.vehicle.state, "driving");
    assert.ok(Math.abs(game.vehicle.y - 7) < 0.2, `landed on the lower road (y = ${game.vehicle.y})`);
  });

  test("the vehicle exists only while simulating; reset removes it", () => {
    const game = createGame();
    assert.equal(game.vehicle, undefined);
    assert.equal(game.testState, "building");
    game.setSimulationRunning(true);
    for (let i = 0; i < 200; i++) game.tick();
    game.setSimulationRunning(false);
    assert.ok(game.vehicle, "still there while paused");
    const x = game.vehicle.x;
    game.tick();
    assert.equal(game.vehicle.x, x, "does not move while paused");
    game.reset();
    assert.equal(game.vehicle, undefined);
  });
});

describe("budget", () => {
  test("cost is the sum of link length times material price", () => {
    const game = createGame();
    game.importStructure(deck()); // 80 m of road
    assert.equal(game.cost, 80 * 300);
  });

  test("the demo bridge is within the demo level budget", () => {
    const game = createGame();
    assert.ok(Math.abs(game.cost - 42657) < 1, `cost ${game.cost}`);
    assert.equal(game.overBudget, false);
  });

  test("going over budget is reported, and cost uses rest lengths during simulation", () => {
    const game = createGame();
    const s = deck(); // 80 m road = 24000
    const n = s.joints.length;
    s.joints.push({ x: -40, y: 110 }, { x: 40, y: 110 }); // two 100 m steel masts = 40000
    s.links.push({ a: 0, b: n, material: "steel" }, { a: n - 1, b: n + 1, material: "steel" });
    game.importStructure(s);
    assert.equal(game.cost, 64000);
    assert.ok(game.cost > demoLevel.budget);
    assert.equal(game.overBudget, true);

    game.setSimulationRunning(true);
    for (let i = 0; i < 120; i++) game.tick();
    assert.equal(game.cost, 64000, "deformation doesn't change the cost");
  });
});
