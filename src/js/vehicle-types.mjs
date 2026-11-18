/**
 * The kinds of vehicle a level's convoy can contain: their weight, size, speed and axles,
 * and how each is drawn.
 *
 * Drawing is in the vehicle's own frame: metres, x forward (to the right), y up, origin on
 * the road under the vehicle's centre. The caller has already tilted it to the road.
 */

/**
 * @typedef {"car" | "bus" | "truck" | "hauler"} VehicleTypeId
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
 * @property {boolean} lights - headlights on (at night)
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
 * @property {Axle[]} axles
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
 * A headlight beam ahead of the vehicle, from a lamp at (x, y).
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y
 * @param {boolean} on
 */
function headlight(g, x, y, on) {
  if (!on) return;
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
  axles: [{ dx: 1.35, share: 0.55 }, { dx: -1.35, share: 0.45 }],
  draw(g, o) {
    const paint = o.lost ? LOST_PAINT : PAINTS[(o.paint + 1) % PAINTS.length];
    const glass = o.lost ? LOST_GLASS : GLASS;
    // body: a hatchback with a sloped bonnet
    poly(g, [[-2.2, 0.3], [2.2, 0.3], [2.2, 0.75], [1.9, 0.85], [0.8, 0.9], [-2.2, 0.95]], paint);
    poly(g, [[-2.05, 0.92], [0.75, 0.88], [0.15, 1.42], [-1.75, 1.45]], paint); // cabin
    poly(g, [[0.6, 0.92], [0.1, 1.34], [-0.65, 1.36], [-0.65, 0.92]], glass);
    poly(g, [[-0.8, 0.92], [-0.8, 1.36], [-1.65, 1.38], [-1.9, 0.94]], glass);
    poly(g, [[-2.25, 0.28], [2.25, 0.28], [2.25, 0.42], [-2.25, 0.42]], "#2b2d30"); // bumpers
    poly(g, [[2.1, 0.62], [2.22, 0.62], [2.22, 0.74], [2.1, 0.74]], o.lost ? "#777" : "#ffe08a");
    headlight(g, 2.22, 0.68, o.lights && !o.lost);
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
  axles: [{ dx: 3.6, share: 0.35 }, { dx: -2.9, share: 0.65 }],
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
    poly(g, [[5.92, 1.2], [6.04, 1.2], [6.04, 1.4], [5.92, 1.4]], o.lost ? "#777" : "#ffe08a");
    headlight(g, 6.04, 1.3, o.lights && !o.lost);
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
  // steer axle, two drive axles under the fifth wheel, two trailer axles
  axles: [
    { dx: 4.8, share: 0.14 }, { dx: 3.1, share: 0.18 }, { dx: 2.05, share: 0.18 },
    { dx: -3.6, share: 0.25 }, { dx: -4.7, share: 0.25 },
  ],
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
    poly(g, [[half - 0.05, 1.5], [half + 0.06, 1.5], [half + 0.06, 1.72], [half - 0.05, 1.72]], o.lost ? "#777" : "#ffe08a");
    poly(g, [[c0 + 0.2, 0.8], [c0 + 1.3, 0.8], [c0 + 1.3, 1.25], [c0 + 0.2, 1.25]], "#c3c8cc");
    headlight(g, half + 0.06, 1.61, o.lights && !o.lost);
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
  axles: [
    { dx: 9.6, share: 0.06 }, { dx: 7.7, share: 0.1 }, { dx: 6.6, share: 0.1 },
    ...[-0.8, -2.0, -3.2, -4.4, -5.6, -6.8].map(dx => ({ dx, share: 0.74 / 6 })),
  ],
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
    poly(g, [[10.9, 1.6], [11.05, 1.6], [11.05, 1.85], [10.9, 1.85]], o.lost ? "#777" : "#ffe08a");
    poly(g, [[6.3, 3.6], [6.6, 3.6], [6.6, 4.4], [6.3, 4.4]], "#3b3d40"); // exhaust stack
    headlight(g, 11.05, 1.72, o.lights && !o.lost);
    wheels(hauler, g, o);
  },
};

/** @type {Record<VehicleTypeId, VehicleType>} */
export const VEHICLE_TYPES = { car, bus, truck, hauler };
