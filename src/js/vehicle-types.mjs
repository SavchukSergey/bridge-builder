/**
 * The kinds of vehicle a level's convoy can contain: their weight, size, speed and axles,
 * and how each is drawn.
 *
 * Drawing is in the vehicle's own frame: metres, x forward (to the right), y up, origin on
 * the road under the vehicle's centre. The caller has already tilted it to the road.
 */

/**
 * @typedef {"car" | "bus" | "truck" | "hauler" | "locomotive" | "wagon" | "fire" | "icecream" | "schoolbus"} VehicleTypeId
 */

/**
 * @typedef {Object} Axle
 * @property {number} dx - offset from the vehicle's centre (m), forward positive
 * @property {number} share - fraction of the weight on this axle; a type's shares sum to 1
 */

/**
 * @typedef {Object} DrawOpts
 * @property {boolean} lost - fell or crashed: drawn greyed out
 * @property {number} paint - index into the paint colours, so a convoy looks varied
 * @property {number} spin - wheel rotation (rad)
 * @property {boolean} lights - headlights on (at night): the lamps glow brighter
 */

/**
 * @typedef {Object} VehicleType
 * @property {VehicleTypeId} id
 * @property {string} label - singular, e.g. "truck"
 * @property {string} plural
 * @property {number} mass - kg
 * @property {number} length - m, bumper to bumper
 * @property {number} height - m
 * @property {number} speed - m/s, when driving alone
 * @property {number} wheelRadius - m
 * @property {"road" | "rail"} track - what it drives on: road, or rail for trains
 * @property {Axle[]} axles
 * @property {[number, number]} lamp - headlight position in the vehicle's frame
 * @property {(g: CanvasRenderingContext2D, opts: DrawOpts) => void} draw
 */

/** Body paints, picked per vehicle in a convoy. */
const PAINTS = ["#c0392b", "#1f6fb2", "#e08e0b", "#1e8449", "#7d3c98"];
const LOST_PAINT = "#5e5e5e";
const GLASS = "#a9cde2";
const LOST_GLASS = "#3d4247";

/**
 * @param {CanvasRenderingContext2D} g
 * @param {[number, number][]} pts
 * @param {string} fill
 */
function poly(g, pts, fill) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

/**
 * A wheel touching the road at x, with spokes so its turning shows.
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} r
 * @param {number} spin
 */
function wheel(g, x, r, spin) {
  g.beginPath();
  g.arc(x, r, r, 0, 2 * Math.PI);
  g.fillStyle = "#1b1c1e";
  g.fill();
  g.beginPath();
  g.arc(x, r, r * 0.48, 0, 2 * Math.PI);
  g.fillStyle = "#8e959c";
  g.fill();
  g.strokeStyle = "#4b5056";
  g.lineWidth = Math.max(0.03, r * 0.12);
  g.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = spin + k * Math.PI / 3;
    g.moveTo(x + Math.cos(a) * r * 0.45, r + Math.sin(a) * r * 0.45);
    g.lineTo(x - Math.cos(a) * r * 0.45, r - Math.sin(a) * r * 0.45);
  }
  g.stroke();
}

/**
 * A headlight beam ahead of a vehicle, from its lamp at (x, y) in the vehicle's frame.
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y
 */
export function drawHeadlight(g, x, y) {
  const reach = 14;
  const beam = g.createLinearGradient(x, y, x + reach, y);
  beam.addColorStop(0, "rgba(255, 236, 170, 0.55)");
  beam.addColorStop(1, "rgba(255, 236, 170, 0)");
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(x, y + 0.15);
  g.lineTo(x + reach, y + 1.6);
  g.lineTo(x + reach, y - 1.6);
  g.lineTo(x, y - 0.15);
  g.closePath();
  g.fill();
}

/** @param {VehicleType} type @param {CanvasRenderingContext2D} g @param {DrawOpts} o */
function wheels(type, g, o) {
  for (const { dx } of type.axles) wheel(g, dx, type.wheelRadius, o.spin);
}

/** @type {VehicleType} */
const car = {
  id: "car",
  label: "car",
  plural: "cars",
  mass: 1500,
  length: 4.4,
  height: 1.45,
  speed: 7,
  wheelRadius: 0.32,
  track: "road",
  axles: [{ dx: 1.35, share: 0.55 }, { dx: -1.35, share: 0.45 }],
  lamp: [2.22, 0.68],
  draw(g, o) {
    const paint = o.lost ? LOST_PAINT : PAINTS[(o.paint + 1) % PAINTS.length];
    const glass = o.lost ? LOST_GLASS : GLASS;
    // body: a hatchback with a sloped bonnet
    poly(g, [[-2.2, 0.3], [2.2, 0.3], [2.2, 0.75], [1.9, 0.85], [0.8, 0.9], [-2.2, 0.95]], paint);
    poly(g, [[-2.05, 0.92], [0.75, 0.88], [0.15, 1.42], [-1.75, 1.45]], paint); // cabin
    poly(g, [[0.6, 0.92], [0.1, 1.34], [-0.65, 1.36], [-0.65, 0.92]], glass);
    poly(g, [[-0.8, 0.92], [-0.8, 1.36], [-1.65, 1.38], [-1.9, 0.94]], glass);
    poly(g, [[-2.25, 0.28], [2.25, 0.28], [2.25, 0.42], [-2.25, 0.42]], "#2b2d30"); // bumpers
    poly(g, [[2.1, 0.62], [2.22, 0.62], [2.22, 0.74], [2.1, 0.74]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    wheels(car, g, o);
  },
};

/** @type {VehicleType} */
const bus = {
  id: "bus",
  label: "bus",
  plural: "buses",
  mass: 18000,
  length: 12,
  height: 3.2,
  speed: 5,
  wheelRadius: 0.5,
  track: "road",
  axles: [{ dx: 3.6, share: 0.35 }, { dx: -2.9, share: 0.65 }],
  lamp: [6.04, 1.3],
  draw(g, o) {
    const paint = o.lost ? LOST_PAINT : PAINTS[(o.paint + 2) % PAINTS.length];
    const glass = o.lost ? LOST_GLASS : GLASS;
    const body = o.lost ? "#8a8a8a" : "#eef0f1";
    poly(g, [[-6, 0.5], [5.8, 0.5], [6, 0.8], [6, 2.9], [5.7, 3.2], [-5.8, 3.2], [-6, 3.0]], body);
    poly(g, [[-6, 0.5], [6, 0.5], [6, 1.1], [-6, 1.1]], paint); // skirt stripe
    poly(g, [[-5.8, 3.0], [5.7, 3.0], [5.7, 3.2], [-5.8, 3.2]], paint); // roof stripe
    // side windows, then the windscreen and the door
    for (let x = -5.5; x < 3.6; x += 1.55) poly(g, [[x, 1.75], [x + 1.35, 1.75], [x + 1.35, 2.75], [x, 2.75]], glass);
    poly(g, [[5.15, 1.6], [5.95, 1.6], [5.95, 2.85], [5.15, 2.85]], glass);
    poly(g, [[4.1, 0.7], [4.95, 0.7], [4.95, 2.85], [4.1, 2.85]], "rgba(0, 0, 0, 0.18)");
    poly(g, [[5.92, 1.2], [6.04, 1.2], [6.04, 1.4], [5.92, 1.4]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    wheels(bus, g, o);
  },
};

/** A semi-trailer truck: tractor unit in front, box trailer behind. */
/** @type {VehicleType} */
const truck = {
  id: "truck",
  label: "truck",
  plural: "trucks",
  mass: 40000,
  length: 12,
  height: 3.5,
  speed: 5,
  wheelRadius: 0.5,
  track: "road",
  // steer axle, two drive axles under the fifth wheel, two trailer axles
  axles: [
    { dx: 4.8, share: 0.14 }, { dx: 3.1, share: 0.18 }, { dx: 2.05, share: 0.18 },
    { dx: -3.6, share: 0.25 }, { dx: -4.7, share: 0.25 },
  ],
  lamp: [6.06, 1.61],
  draw(g, o) {
    const cab = o.lost ? LOST_PAINT : PAINTS[o.paint % PAINTS.length];
    const half = 6, top = 3.5;
    poly(g, [[-half + 0.2, 0.75], [half - 0.1, 0.75], [half - 0.1, 1.15], [-half + 0.2, 1.15]], "#26282b"); // chassis

    // trailer box with panel seams and a stripe
    const t0 = -half, t1 = half - 2.9;
    poly(g, [[t0, 1.2], [t1, 1.2], [t1, top], [t0, top]], o.lost ? "#8a8a8a" : "#eceeef");
    g.strokeStyle = "rgba(0, 0, 0, 0.12)";
    g.lineWidth = 0.05;
    g.beginPath();
    for (let x = t0 + 1.2; x < t1 - 0.2; x += 1.2) {
      g.moveTo(x, 1.25);
      g.lineTo(x, top - 0.05);
    }
    g.stroke();
    poly(g, [[t0, 1.65], [t1, 1.65], [t1, 1.95], [t0, 1.95]], cab);
    poly(g, [[t0, top - 0.12], [t1, top - 0.12], [t1, top], [t0, top]], "rgba(0, 0, 0, 0.15)");

    // tractor: cab with a sloped front, window, bumper, headlight and fuel tank
    const c0 = half - 2.7;
    poly(g, [[c0, 1.0], [half, 1.0], [half, 2.3], [half - 0.3, 3.25], [c0, 3.3]], cab);
    poly(g, [[c0, 3.3], [half - 1.6, 3.3], [half - 1.9, 3.75], [c0, 3.75]], cab); // roof fairing
    poly(g, [[half - 1.15, 2.25], [half - 0.12, 2.25], [half - 0.36, 3.05], [half - 1.15, 3.05]], o.lost ? LOST_GLASS : GLASS);
    poly(g, [[c0 + 0.25, 1.35], [half - 1.4, 1.35], [half - 1.4, 3.0], [c0 + 0.25, 3.0]], "rgba(0, 0, 0, 0.12)"); // door
    poly(g, [[half - 0.15, 0.85], [half + 0.12, 0.85], [half + 0.12, 1.35], [half - 0.15, 1.35]], "#9aa0a6");
    poly(g, [[half - 0.05, 1.5], [half + 0.06, 1.5], [half + 0.06, 1.72], [half - 0.05, 1.72]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    poly(g, [[c0 + 0.2, 0.8], [c0 + 1.3, 0.8], [c0 + 1.3, 1.25], [c0 + 0.2, 1.25]], "#c3c8cc");
    wheels(truck, g, o);
  },
};

/**
 * Heavy haulage (200 t): a three-axle tractor pulling a six-axle low-loader with a transformer on
 * it. Its weight is spread along 22 m, so no single short member takes all of it.
 */
/** @type {VehicleType} */
const hauler = {
  id: "hauler",
  label: "heavy hauler",
  plural: "heavy haulers",
  mass: 200000,
  length: 22,
  height: 4.2,
  speed: 3.5,
  wheelRadius: 0.45,
  track: "road",
  axles: [
    { dx: 9.6, share: 0.06 }, { dx: 7.7, share: 0.1 }, { dx: 6.6, share: 0.1 },
    ...[-0.8, -2.0, -3.2, -4.4, -5.6, -6.8].map(dx => ({ dx, share: 0.74 / 6 })),
  ],
  lamp: [11.05, 1.72],
  draw(g, o) {
    const cab = o.lost ? LOST_PAINT : "#e08e0b";
    // low-loader deck with a gooseneck up to the tractor
    poly(g, [[-11, 0.75], [4.2, 0.75], [4.6, 1.5], [7.6, 1.5], [7.6, 1.9], [4.3, 1.9], [3.9, 1.15], [-11, 1.15]], "#2c2f33");
    // the load: a ribbed transformer, chained down
    const load = o.lost ? "#7d7d7d" : "#7f8c99";
    poly(g, [[-8.6, 1.15], [1.6, 1.15], [1.6, 3.9], [-8.6, 3.9]], load);
    g.strokeStyle = "rgba(0, 0, 0, 0.18)";
    g.lineWidth = 0.1;
    g.beginPath();
    for (let x = -8.1; x < 1.3; x += 0.7) {
      g.moveTo(x, 1.4);
      g.lineTo(x, 3.6);
    }
    g.stroke();
    poly(g, [[-7.2, 3.9], [-6.4, 3.9], [-6.4, 4.2], [-7.2, 4.2]], "#59636d"); // bushings
    poly(g, [[-0.6, 3.9], [0.2, 3.9], [0.2, 4.2], [-0.6, 4.2]], "#59636d");
    g.strokeStyle = "#c8a23a";
    g.lineWidth = 0.08;
    g.beginPath();
    g.moveTo(-9.3, 1.15); g.lineTo(-8.2, 3.9);
    g.moveTo(2.3, 1.15); g.lineTo(1.2, 3.9);
    g.stroke();
    // tractor: a long-nosed heavy unit
    poly(g, [[5.4, 1.0], [11, 1.0], [11, 2.3], [9.6, 2.45], [9.4, 3.6], [6.0, 3.6], [5.4, 3.3]], cab);
    poly(g, [[8.1, 2.5], [9.25, 2.5], [9.1, 3.35], [8.1, 3.35]], o.lost ? LOST_GLASS : GLASS);
    poly(g, [[10.85, 0.85], [11.15, 0.85], [11.15, 1.4], [10.85, 1.4]], "#9aa0a6");
    poly(g, [[10.9, 1.6], [11.05, 1.6], [11.05, 1.85], [10.9, 1.85]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    poly(g, [[6.3, 3.6], [6.6, 3.6], [6.6, 4.4], [6.3, 4.4]], "#3b3d40"); // exhaust stack
    wheels(hauler, g, o);
  },
};

/** A fire engine: a red truck with a ladder on top and a blue light that flashes as it drives. */
/** @type {VehicleType} */
const fire = {
  id: "fire",
  label: "fire engine",
  plural: "fire engines",
  mass: 16000,
  length: 9.6,
  height: 3.6,
  speed: 6,
  wheelRadius: 0.5,
  track: "road",
  axles: [{ dx: 3.3, share: 0.32 }, { dx: -1.9, share: 0.34 }, { dx: -3.2, share: 0.34 }],
  lamp: [4.85, 1.2],
  draw(g, o) {
    const red = o.lost ? LOST_PAINT : "#d0281f";
    const glass = o.lost ? LOST_GLASS : GLASS;
    poly(g, [[-4.8, 0.55], [4.8, 0.55], [4.8, 0.95], [-4.8, 0.95]], "#26282b"); // chassis
    poly(g, [[-4.8, 0.95], [2.3, 0.95], [2.3, 2.95], [-4.8, 2.95]], red); // body with lockers
    poly(g, [[2.3, 0.95], [4.8, 0.95], [4.8, 2.1], [4.5, 3.1], [2.3, 3.1]], red); // cab
    poly(g, [[3.55, 2.05], [4.68, 2.05], [4.42, 2.9], [3.55, 2.9]], glass);
    poly(g, [[2.5, 2.05], [3.4, 2.05], [3.4, 2.9], [2.5, 2.9]], glass);
    poly(g, [[-4.8, 1.45], [4.8, 1.45], [4.8, 1.62], [-4.8, 1.62]], o.lost ? "#999" : "#f4f1e8"); // stripe
    g.strokeStyle = "rgba(0, 0, 0, 0.2)";
    g.lineWidth = 0.05;
    g.beginPath();
    for (let x = -3.9; x < 2.2; x += 1.5) { // locker doors
      g.moveTo(x, 1.0);
      g.lineTo(x, 2.9);
    }
    g.stroke();
    // the ladder along the roof
    const rail = o.lost ? "#777" : "#c9ced3";
    poly(g, [[-4.7, 3.05], [3.0, 3.05], [3.0, 3.14], [-4.7, 3.14]], rail);
    poly(g, [[-4.7, 3.38], [3.0, 3.38], [3.0, 3.47], [-4.7, 3.47]], rail);
    g.strokeStyle = rail;
    g.lineWidth = 0.07;
    g.beginPath();
    for (let x = -4.5; x < 3.0; x += 0.5) {
      g.moveTo(x, 3.1);
      g.lineTo(x, 3.42);
    }
    g.stroke();
    // the light bar on the cab: flashes with the wheels' turning, so it's still when parked
    const on = !o.lost && Math.sin(o.spin * 2.5) > 0;
    poly(g, [[3.0, 3.1], [4.2, 3.1], [4.2, 3.32], [3.0, 3.32]], o.lost ? "#666" : on ? "#5fb8ff" : "#1d4f86");
    if (on) {
      g.fillStyle = "rgba(95, 184, 255, 0.35)";
      g.beginPath();
      g.arc(3.6, 3.22, 0.5, 0, 2 * Math.PI);
      g.fill();
    }
    poly(g, [[4.72, 1.1], [4.85, 1.1], [4.85, 1.32], [4.72, 1.32]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    wheels(fire, g, o);
  },
};

/** Ice-cream van paints, by paint index. */
const ICE_CREAM_PAINTS = ["#ffd6e7", "#cdeeff", "#fff1b8"];

/** An ice-cream van: light, with a serving window and a big cone on the roof. */
/** @type {VehicleType} */
const icecream = {
  id: "icecream",
  label: "ice-cream van",
  plural: "ice-cream vans",
  mass: 3500,
  length: 6,
  height: 3.65,
  speed: 6,
  wheelRadius: 0.36,
  track: "road",
  axles: [{ dx: 1.9, share: 0.45 }, { dx: -1.8, share: 0.55 }],
  lamp: [3.0, 0.75],
  draw(g, o) {
    const body = o.lost ? LOST_PAINT : ICE_CREAM_PAINTS[o.paint % ICE_CREAM_PAINTS.length];
    const glass = o.lost ? LOST_GLASS : GLASS;
    poly(g, [[-3, 0.35], [3, 0.35], [3, 1.1], [2.6, 2.3], [-3, 2.4]], body);
    poly(g, [[1.75, 1.35], [2.72, 1.35], [2.45, 2.15], [1.75, 2.18]], glass); // windscreen
    poly(g, [[-2.3, 1.15], [0.9, 1.15], [0.9, 2.05], [-2.3, 2.05]], o.lost ? "#4a4a4a" : "#5a3b2e"); // serving window
    poly(g, [[-2.45, 2.05], [1.05, 2.05], [0.85, 2.3], [-2.25, 2.3]], o.lost ? "#888" : "#ef5b8c"); // awning
    poly(g, [[-3, 0.6], [3, 0.6], [3, 0.82], [-3, 0.82]], o.lost ? "#888" : "#ef5b8c"); // stripe
    // a giant cone standing on the roof: point down, two scoops on top
    poly(g, [[-0.75, 2.4], [-0.38, 2.95], [-1.12, 2.95]], o.lost ? "#777" : "#d9a35b");
    g.fillStyle = o.lost ? "#999" : "#fff7f0";
    g.beginPath();
    g.arc(-0.75, 3.05, 0.4, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = o.lost ? "#999" : "#f48fb1";
    g.beginPath();
    g.arc(-0.75, 3.38, 0.27, 0, 2 * Math.PI);
    g.fill();
    poly(g, [[2.9, 0.62], [3.0, 0.62], [3.0, 0.82], [2.9, 0.82]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    wheels(icecream, g, o);
  },
};

/** A yellow school bus with a long nose. */
/** @type {VehicleType} */
const schoolbus = {
  id: "schoolbus",
  label: "school bus",
  plural: "school buses",
  mass: 14000,
  length: 11,
  height: 3.1,
  speed: 5,
  wheelRadius: 0.5,
  track: "road",
  axles: [{ dx: 4.3, share: 0.35 }, { dx: -2.9, share: 0.65 }],
  lamp: [5.55, 1.3],
  draw(g, o) {
    const yellow = o.lost ? LOST_PAINT : "#f4c20d";
    const glass = o.lost ? LOST_GLASS : GLASS;
    poly(g, [[-5.5, 0.5], [3.7, 0.5], [3.7, 3.1], [-5.4, 3.1], [-5.5, 2.9]], yellow); // body
    poly(g, [[3.7, 0.5], [5.5, 0.5], [5.5, 1.8], [5.1, 2.0], [3.7, 2.1]], yellow); // the nose
    poly(g, [[-5.5, 0.5], [5.5, 0.5], [5.5, 0.72], [-5.5, 0.72]], "#2b2d30"); // bumper line
    poly(g, [[-5.5, 1.48], [3.7, 1.48], [3.7, 1.6], [-5.5, 1.6]], "#2b2d30"); // black rub rails
    poly(g, [[-5.5, 1.1], [3.7, 1.1], [3.7, 1.2], [-5.5, 1.2]], "#2b2d30");
    for (let x = -5.15; x < 1.5; x += 1.25) poly(g, [[x, 1.95], [x + 1.05, 1.95], [x + 1.05, 2.8], [x, 2.8]], glass);
    poly(g, [[2.7, 1.75], [3.6, 1.75], [3.6, 2.85], [2.7, 2.85]], glass); // windscreen side
    poly(g, [[5.42, 1.2], [5.55, 1.2], [5.55, 1.42], [5.42, 1.42]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    wheels(schoolbus, g, o);
  },
};

/**
 * A rail bogie: two small wheels close together, under a frame.
 * @param {CanvasRenderingContext2D} g
 * @param {number} x - bogie centre
 * @param {number} r - wheel radius
 * @param {number} spin
 */
function bogie(g, x, r, spin) {
  poly(g, [[x - 1.55, r * 0.9], [x + 1.55, r * 0.9], [x + 1.4, r * 1.9], [x - 1.4, r * 1.9]], "#2b2d30");
  wheel(g, x - 0.9, r, spin);
  wheel(g, x + 0.9, r, spin);
}

/** Locomotive liveries, by paint index. */
const LIVERIES = [["#b8322a", "#f1c40f"], ["#1f5f99", "#e9eef2"], ["#1e7a4a", "#f0d58c"]];

/** @type {VehicleType} */
const locomotive = {
  id: "locomotive",
  label: "locomotive",
  plural: "locomotives",
  mass: 100000,
  length: 20,
  height: 4.3,
  speed: 6,
  wheelRadius: 0.5,
  track: "rail",
  // two bogies of two axles
  axles: [7.4, 5.6, -5.6, -7.4].map(dx => ({ dx, share: 0.25 })),
  lamp: [10.0, 1.9],
  draw(g, o) {
    const [body, stripe] = o.lost ? [LOST_PAINT, "#888"] : LIVERIES[o.paint % LIVERIES.length];
    const glass = o.lost ? LOST_GLASS : GLASS;
    poly(g, [[-10, 1.0], [10, 1.0], [10, 1.35], [-10, 1.35]], "#26282b"); // frame
    // body with a sloped cab front
    poly(g, [[-9.8, 1.35], [9.0, 1.35], [10, 2.0], [10, 3.0], [8.6, 4.2], [-9.8, 4.2]], body);
    poly(g, [[-9.8, 1.9], [9.6, 1.9], [9.85, 2.3], [-9.8, 2.3]], stripe);
    poly(g, [[8.2, 3.0], [9.75, 3.0], [8.55, 3.95], [8.2, 3.95]], glass); // windscreen
    poly(g, [[6.6, 2.75], [7.8, 2.75], [7.8, 3.75], [6.6, 3.75]], glass); // cab side window
    poly(g, [[-9.8, 4.2], [8.4, 4.2], [8.1, 4.45], [-9.6, 4.45]], "rgba(0, 0, 0, 0.25)"); // roof
    g.strokeStyle = "rgba(0, 0, 0, 0.18)";
    g.lineWidth = 0.06;
    g.beginPath();
    for (let x = -8.6; x < 5.5; x += 1.4) { // engine-room louvres
      g.moveTo(x, 2.7);
      g.lineTo(x, 3.8);
    }
    g.stroke();
    poly(g, [[9.85, 1.55], [10.15, 1.55], [10.15, 1.85], [9.85, 1.85]], o.lost ? "#777" : o.lights ? "#fff6d0" : "#ffe08a");
    bogie(g, 6.5, locomotive.wheelRadius, o.spin);
    bogie(g, -6.5, locomotive.wheelRadius, o.spin);
  },
};

/** Wagon load colours, by paint index: grain, coal, gravel... */
const LOADS = ["#c9a227", "#2e2f33", "#9a8f80", "#b5651d"];

/** @type {VehicleType} */
const wagon = {
  id: "wagon",
  label: "wagon",
  plural: "wagons",
  mass: 70000,
  length: 15,
  height: 3.6,
  speed: 6,
  wheelRadius: 0.45,
  track: "rail",
  axles: [6.1, 4.5, -4.5, -6.1].map(dx => ({ dx, share: 0.25 })),
  lamp: [7.5, 1.6], // (a wagon has no headlight; see renderLights)
  draw(g, o) {
    const side = o.lost ? LOST_PAINT : "#6b4a33";
    poly(g, [[-7.5, 0.95], [7.5, 0.95], [7.5, 1.25], [-7.5, 1.25]], "#26282b"); // frame
    // an open hopper, heaped with its load
    poly(g, [[-7.2, 3.0], [-6.4, 3.75], [6.4, 3.75], [7.2, 3.0]], o.lost ? "#777" : LOADS[o.paint % LOADS.length]);
    poly(g, [[-7.3, 1.25], [7.3, 1.25], [7.3, 3.25], [-7.3, 3.25]], side);
    g.strokeStyle = "rgba(0, 0, 0, 0.25)";
    g.lineWidth = 0.08;
    g.beginPath();
    for (let x = -5.4; x < 6; x += 1.8) { // ribs
      g.moveTo(x, 1.3);
      g.lineTo(x, 3.2);
    }
    g.stroke();
    poly(g, [[-7.6, 1.05], [-7.3, 1.05], [-7.3, 1.35], [-7.6, 1.35]], "#1b1c1e"); // couplers
    poly(g, [[7.3, 1.05], [7.6, 1.05], [7.6, 1.35], [7.3, 1.35]], "#1b1c1e");
    bogie(g, 5.3, wagon.wheelRadius, o.spin);
    bogie(g, -5.3, wagon.wheelRadius, o.spin);
  },
};

/** @type {Record<VehicleTypeId, VehicleType>} */
export const VEHICLE_TYPES = { car, bus, truck, hauler, locomotive, wagon, fire, icecream, schoolbus };
