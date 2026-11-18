/**
 * Decorative scenery: sky, distant hills, clouds, water, ground, abutments, trees and the
 * finish flag. None of it affects the simulation.
 *
 * World coordinates are metres with y up; the render context's transform maps them to the
 * screen. Background layers are drawn in screen space with a parallax factor `p` (0 = at
 * infinity, 1 = in the plane of the bridge): a layer point (x, y) appears where a world point
 * would, scaled by p about the view centre, so far layers move and scale less as you pan
 * and zoom.
 */

import { THEMES } from "./themes.mjs";

/** Ground blocks this far out are "infinite"; their outer edges are never drawn. */
const FAR_EDGE = 1000;

/**
 * @typedef {import("./render-ctx.mjs").RenderCtx} RenderCtx
 * @typedef {import("./themes.mjs").Theme} Theme
 * @typedef {{ x0: number, x1: number, y0: number, y1: number }} Bounds
 */

/**
 * The world rectangle on screen.
 * @param {RenderCtx} ctx
 * @returns {Bounds}
 */
export function visibleBounds(ctx) {
  const bl = ctx.clientToGlobal({ x: 0, y: ctx.height, z: 0 });
  const tr = ctx.clientToGlobal({ x: ctx.width, y: 0, z: 0 });
  return { x0: bl.x, x1: tr.x, y0: bl.y, y1: tr.y };
}

/** Seconds since the page loaded, for gently moving decorations. */
function now() {
  return (globalThis.performance?.now() ?? 0) / 1000;
}

/**
 * Smooth pseudo-random hills: a sum of sines, 0..1.
 * @param {number} x
 * @param {number} seed
 */
function ridge(x, seed) {
  return 0.5
    + 0.28 * Math.sin(x / 47 + seed)
    + 0.14 * Math.sin(x / 19 + seed * 2.3)
    + 0.06 * Math.sin(x / 7.3 + seed * 5.1);
}

/**
 * Deterministic 0..1 noise for placing trees and clouds.
 * @param {number} n
 */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Sky, sun (or moon and stars), clouds and two layers of hills behind everything, in
 * screen space.
 * @param {RenderCtx} ctx
 * @param {number} groundY - typical ground height, where the hills stand
 * @param {Theme} [theme]
 */
export function renderBackground(ctx, groundY, theme = THEMES.summer) {
  const g = ctx.ctx;
  const { width: w, height: h, zoom, shift } = ctx;
  g.save();
  ctx.screenSpace();

  /** Screen y of a layer point at height y with parallax p. */
  const sy = (/** @type {number} */ y, /** @type {number} */ p) => h / 2 - (y - shift.y) * zoom * p;

  // sky: deep blue overhead to a pale haze at the horizon
  const horizon = Math.min(h, Math.max(0, sy(groundY, 0.25)));
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.65, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const lightX = w * 0.68 - shift.x * zoom * 0.02, lightY = Math.max(40, horizon * 0.3);
  if (theme.light === "moon") {
    // stars, fixed to the sky, fainter towards the horizon
    for (let i = 0; i < 140; i++) {
      const x = hash(i * 1.7) * w, y = hash(i * 2.9 + 4) * horizon * 0.9;
      g.fillStyle = `rgba(255, 255, 255, ${(0.25 + 0.6 * hash(i + 0.3)) * (1 - y / horizon)})`;
      const r = 0.6 + 1.1 * hash(i * 5.3);
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    const glow = g.createRadialGradient(lightX, lightY, 0, lightX, lightY, 110);
    glow.addColorStop(0, "rgba(235, 240, 255, 0.95)");
    glow.addColorStop(0.16, "rgba(225, 232, 250, 0.9)");
    glow.addColorStop(0.2, "rgba(200, 215, 245, 0.2)");
    glow.addColorStop(1, "rgba(200, 215, 245, 0)");
    g.fillStyle = glow;
    g.fillRect(lightX - 110, lightY - 110, 220, 220);
  } else {
    // sun with a soft glow
    const glow = g.createRadialGradient(lightX, lightY, 0, lightX, lightY, 160);
    glow.addColorStop(0, "rgba(255, 250, 225, 0.95)");
    glow.addColorStop(0.12, "rgba(255, 246, 210, 0.9)");
    glow.addColorStop(0.3, "rgba(255, 240, 200, 0.25)");
    glow.addColorStop(1, "rgba(255, 240, 200, 0)");
    g.fillStyle = glow;
    g.fillRect(lightX - 160, lightY - 160, 320, 320);
  }

  // clouds drifting slowly to the right
  const span = w + 600;
  const scale = Math.min(1.6, Math.max(0.6, zoom / 8));
  for (let i = 0; i < 7; i++) {
    const speed = 4 + 6 * hash(i + 0.5); // px/s
    const x = ((hash(i) * span + now() * speed - shift.x * zoom * 0.08) % span + span) % span - 300;
    const y = (0.08 + 0.3 * hash(i + 9)) * horizon;
    renderCloud(g, x, y, (0.6 + 0.6 * hash(i + 3)) * scale, theme.cloud);
  }

  // hills: a hazy far range and nearer wooded slopes
  /** @type {[number, number, number, string, string][]} */
  const layers = [
    [0.22, 70, 1.7, ...theme.hills[0]],
    [0.45, 28, 4.2, ...theme.hills[1]],
  ];
  for (const [p, amplitude, seed, base, top] of layers) {
    let minY = h;
    const points = [];
    for (let x = -8; x <= w + 8; x += 8) {
      const lx = shift.x + (x - w / 2) / (zoom * p); // layer coordinate under this pixel
      const y = sy(groundY + amplitude * ridge(lx, seed), p);
      points.push([x, y]);
      minY = Math.min(minY, y);
    }
    const fill = g.createLinearGradient(0, minY, 0, h);
    fill.addColorStop(0, top);
    fill.addColorStop(1, base);
    g.beginPath();
    g.moveTo(-8, h);
    for (const [x, y] of points) g.lineTo(x, y);
    g.lineTo(w + 8, h);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  g.restore();
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y
 * @param {number} s - scale
 * @param {string} color
 */
function renderCloud(g, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 32], [60, 0, 24], [30, 8, 24], [-24, 6, 18], [84, 6, 16]]) {
    g.moveTo(x + dx * s + r * s, y + dy * s);
    g.arc(x + dx * s, y + dy * s, r * s, 0, 2 * Math.PI);
  }
  g.fill();
}

/**
 * The far wall of the valley, seen through the gap below road level: hazy rock that gets
 * darker with depth, with a grassy rim.
 * @param {RenderCtx} ctx
 * @param {number} rimY - height of the far rim
 * @param {Theme} [theme]
 */
export function renderValley(ctx, rimY, theme = THEMES.summer) {
  const g = ctx.ctx;
  const b = visibleBounds(ctx);
  if (b.y0 > rimY) return;
  const bottom = Math.min(b.y0, rimY - 1) - 1;
  const wall = g.createLinearGradient(0, rimY, 0, rimY - 35);
  wall.addColorStop(0, theme.valley[0]);
  wall.addColorStop(0.4, theme.valley[1]);
  wall.addColorStop(1, theme.valley[2]);
  g.fillStyle = wall;
  g.fillRect(b.x0 - 1, bottom, b.x1 - b.x0 + 2, rimY - bottom);

  // weathered ledges, irregular so they read as distant rock
  g.strokeStyle = "rgba(70, 60, 50, 0.25)";
  g.lineWidth = Math.max(0.1, 1.2 / ctx.zoom);
  g.beginPath();
  for (let d = 2.5, i = 0; rimY - d > bottom; d += 3 + 2 * hash(i), i++) {
    const y = rimY - d;
    g.moveTo(b.x0, y);
    for (let x = Math.floor(b.x0 / 5) * 5; x <= b.x1 + 5; x += 5) g.lineTo(x, y + 0.6 * (hash(x * 0.13 + i) - 0.5));
  }
  g.stroke();
  g.fillStyle = theme.valleyRim;
  g.fillRect(b.x0 - 1, rimY - 0.5, b.x1 - b.x0 + 2, 0.5);
}

/**
 * A river (or lake) filling the gaps up to `level`, drawn before the ground.
 * @param {RenderCtx} ctx
 * @param {number} level - water surface height
 * @param {Theme} [theme]
 */
export function renderWater(ctx, level, theme = THEMES.summer) {
  const g = ctx.ctx;
  const b = visibleBounds(ctx);
  if (b.y0 > level) return;
  const water = g.createLinearGradient(0, level, 0, level - 25);
  water.addColorStop(0, theme.water[0]);
  water.addColorStop(1, theme.water[1]);
  g.fillStyle = water;
  g.fillRect(b.x0 - 1, Math.min(b.y0, level - 1) - 1, b.x1 - b.x0 + 2, level - Math.min(b.y0, level - 1) + 1);

  // ripples on the surface
  g.strokeStyle = theme.ripple;
  g.lineWidth = 1.2 / ctx.zoom;
  const t = now();
  g.beginPath();
  for (let x = Math.floor(b.x0 / 6) * 6; x < b.x1; x += 6) {
    const dx = 1.5 * Math.sin(t * 0.8 + x);
    g.moveTo(x + dx, level - 0.05);
    g.lineTo(x + dx + 2.2, level - 0.05);
  }
  for (let x = Math.floor(b.x0 / 9) * 9; x < b.x1; x += 9) {
    const dx = 2 * Math.sin(t * 0.6 + x * 0.7);
    g.moveTo(x + 3 + dx, level - 0.9);
    g.lineTo(x + 4.5 + dx, level - 0.9);
  }
  g.stroke();
}

/**
 * Translucent water in front of everything in the river (a submerged rock, sunken trucks
 * and debris), so it reads as under water but stays visible. Only over the gaps: the banks
 * are solid in front of it.
 * @param {RenderCtx} ctx
 * @param {import("./level.mjs").Level} level
 * @param {number} water
 * @param {Theme} [theme]
 */
export function renderWaterFront(ctx, level, water, theme = THEMES.summer) {
  const g = ctx.ctx;
  const b = visibleBounds(ctx);
  if (b.y0 > water) return;
  const edges = [b.x0 - 1, b.x1 + 1];
  for (const { x0, x1 } of level.terrain) {
    if (x0 > b.x0 && x0 < b.x1) edges.push(x0);
    if (x1 > b.x0 && x1 < b.x1) edges.push(x1);
  }
  edges.sort((p, q) => p - q);
  const front = g.createLinearGradient(0, water, 0, water - 12);
  front.addColorStop(0, theme.waterFront[0]);
  front.addColorStop(1, theme.waterFront[1]);
  g.fillStyle = front;
  const bottom = Math.min(b.y0, water - 1) - 1;
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i], x1 = edges[i + 1];
    if (x1 - x0 < 1e-6) continue;
    const ground = level.groundAt((x0 + x1) / 2);
    if (ground !== undefined && ground >= water) continue;
    g.fillRect(x0, bottom, x1 - x0, water - bottom);
  }
  // bright surface line
  g.strokeStyle = "rgba(215, 238, 248, 0.7)";
  g.lineWidth = 1.5 / ctx.zoom;
  g.beginPath();
  for (let i = 0; i + 1 < edges.length; i++) {
    const ground = level.groundAt((edges[i] + edges[i + 1]) / 2);
    if (ground !== undefined && ground >= water) continue;
    g.moveTo(edges[i], water);
    g.lineTo(edges[i + 1], water);
  }
  g.stroke();
}

/**
 * A block of ground: an embankment with a road on top, or bare rock if it is under water.
 * @param {RenderCtx} ctx
 * @param {import("./level.mjs").TerrainBlock} block
 * @param {boolean} submerged
 * @param {Theme} [theme]
 */
export function renderGround(ctx, block, submerged, theme = THEMES.summer) {
  const g = ctx.ctx;
  const b = visibleBounds(ctx);
  const x0 = Math.max(block.x0, b.x0 - 1), x1 = Math.min(block.x1, b.x1 + 1);
  const bottom = Math.min(b.y0 - 1, block.y - 1);
  if (x0 >= x1 || block.y < b.y0) return;
  const { y } = block;

  const rock = g.createLinearGradient(0, y, 0, y - 40);
  if (submerged) {
    rock.addColorStop(0, "#77736d");
    rock.addColorStop(1, "#45423e");
  } else {
    rock.addColorStop(0, theme.earth[0]);
    rock.addColorStop(0.5, theme.earth[1]);
    rock.addColorStop(1, theme.earth[2]);
  }
  g.fillStyle = rock;
  g.fillRect(x0, bottom, x1 - x0, y - bottom);

  // rock strata
  g.strokeStyle = submerged ? "rgba(40, 38, 35, 0.35)" : theme.strata;
  g.lineWidth = Math.max(0.08, 1 / ctx.zoom);
  g.beginPath();
  for (let d = 3.2, i = 0; y - d > bottom; d += 2.6 + 1.8 * hash(i + block.x0), i++) {
    const wobble = 0.4 * (hash(i * 3 + block.y) - 0.5);
    g.moveTo(x0, y - d);
    g.lineTo(x1, y - d + wobble);
  }
  g.stroke();

  // cliff faces: darker where the ground drops away into the gap
  for (const [edge, dir] of [[block.x0, 1], [block.x1, -1]]) {
    if (Math.abs(edge) >= FAR_EDGE || edge < b.x0 - 3 || edge > b.x1 + 3) continue;
    const face = g.createLinearGradient(edge, 0, edge + 2.5 * dir, 0);
    face.addColorStop(0, "rgba(25, 18, 12, 0.55)");
    face.addColorStop(1, "rgba(25, 18, 12, 0)");
    g.fillStyle = face;
    g.fillRect(Math.min(edge, edge + 2.5 * dir), bottom, 2.5, y - bottom);
  }

  if (submerged) return;
  // embankment: soil, then gravel, then the road surface on top
  g.fillStyle = theme.soil;
  g.fillRect(x0, y - 1.4, x1 - x0, 1.4);
  g.fillStyle = "#958b7c";
  g.fillRect(x0, y - 0.45, x1 - x0, 0.25);
  g.fillStyle = "#43464b";
  g.fillRect(x0, y - 0.22, x1 - x0, 0.22);
}

/**
 * Trees on the ground away from where the bridge is built, behind the road.
 * @param {RenderCtx} ctx
 * @param {import("./level.mjs").Level} level
 * @param {{ x0: number, x1: number }} keepClear
 * @param {number | undefined} water
 * @param {Theme} [theme]
 */
export function renderTrees(ctx, level, keepClear, water, theme = THEMES.summer) {
  const g = ctx.ctx;
  const b = visibleBounds(ctx);
  const STEP = 7;
  for (let i = Math.floor(b.x0 / STEP) - 1; i * STEP < b.x1 + STEP; i++) {
    if (hash(i * 0.37) < 0.35) continue; // gaps between clumps
    const x = i * STEP + STEP * (hash(i) - 0.5);
    if (x > keepClear.x0 && x < keepClear.x1) continue;
    const ground = level.groundAt(x);
    if (ground === undefined || (water !== undefined && ground < water)) continue;
    // stay on the block, not overhanging a cliff
    if (level.groundAt(x - 2.5) !== ground || level.groundAt(x + 2.5) !== ground) continue;
    const height = 4 + 4 * hash(i + 17), variety = hash(i + 5);
    if (theme.flora === "cacti") {
      renderCactus(g, x, ground, 2.5 + 3 * hash(i + 23), variety);
    } else if (theme.flora === "snowy forest") {
      renderTree(g, x, ground, height, variety * 0.4, true); // all conifers
    } else {
      renderTree(g, x, ground, height, variety);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y - ground
 * @param {number} height
 * @param {number} variety - 0..1: conifer below 0.4, broadleaf above
 * @param {boolean} [snowy] - snow on the branches
 */
function renderTree(g, x, y, height, variety, snowy = false) {
  const trunk = height * 0.35;
  g.fillStyle = "#5a3f2b";
  g.fillRect(x - 0.18, y, 0.36, trunk + 0.5);
  if (variety < 0.4) {
    g.fillStyle = "#2f5d3a";
    g.beginPath();
    g.moveTo(x - height * 0.28, y + trunk * 0.6);
    g.lineTo(x + height * 0.28, y + trunk * 0.6);
    g.lineTo(x, y + height * 1.15);
    g.closePath();
    g.fill();
    if (snowy) {
      // snow lying on the upper branches
      const top = y + height * 1.15, base = y + trunk * 0.6, w = height * 0.28;
      const at = (/** @type {number} */ f) => top - (top - base) * f;
      g.fillStyle = "#f3f7fa";
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + w * 0.55, at(0.55));
      g.lineTo(x + w * 0.2, at(0.48));
      g.lineTo(x - w * 0.15, at(0.58));
      g.lineTo(x - w * 0.55, at(0.55));
      g.closePath();
      g.fill();
    }
  } else {
    const r = height * 0.3;
    g.fillStyle = variety < 0.7 ? "#3f7a3a" : "#4f8a3c";
    g.beginPath();
    for (const [dx, dy, k] of [[0, 0.75, 1], [-0.55, 0.5, 0.75], [0.55, 0.55, 0.8], [0.1, 1.05, 0.7]]) {
      g.moveTo(x + dx * r + k * r, y + trunk + dy * r);
      g.arc(x + dx * r, y + trunk + dy * r, k * r, 0, 2 * Math.PI);
    }
    g.fill();
    g.fillStyle = "rgba(255, 255, 255, 0.08)";
    g.beginPath();
    g.arc(x - 0.3 * r, y + trunk + 1.0 * r, 0.5 * r, 0, 2 * Math.PI);
    g.fill();
  }
}

/**
 * A saguaro-style cactus: a column, sometimes with an arm or two.
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y - ground
 * @param {number} height
 * @param {number} variety - 0..1: how many arms
 */
function renderCactus(g, x, y, height, variety) {
  const w = 0.32 + height * 0.05;
  g.fillStyle = "#5c8a48";
  /** A column with a rounded top, from (cx, y0) up to y1. */
  const column = (/** @type {number} */ cx, /** @type {number} */ y0, /** @type {number} */ y1, /** @type {number} */ r) => {
    g.fillRect(cx - r, y0, 2 * r, y1 - y0);
    g.beginPath();
    g.arc(cx, y1, r, 0, Math.PI * 2);
    g.fill();
  };
  column(x, y, y + height, w);
  if (variety > 0.3) { // an arm to the right
    const at = y + height * 0.45;
    g.fillRect(x, at - w * 0.6, w * 2.4, w * 1.2);
    column(x + w * 2.4, at - w * 0.6, at + height * 0.3, w * 0.7);
  }
  if (variety > 0.7) { // and one to the left
    const at = y + height * 0.6;
    g.fillRect(x - w * 2.1, at - w * 0.5, w * 2.1, w);
    column(x - w * 2.1, at - w * 0.5, at + height * 0.22, w * 0.6);
  }
  g.fillStyle = "rgba(255, 255, 255, 0.1)";
  g.fillRect(x - w * 0.15, y + 0.3, w * 0.3, height - 0.3);
}

/**
 * A concrete abutment (or pier footing) under an anchor joint.
 * @param {RenderCtx} ctx
 * @param {number} x
 * @param {number} y
 */
export function renderAbutment(ctx, x, y) {
  const g = ctx.ctx;
  const W = 2.6, H = 3;
  const concrete = g.createLinearGradient(x - W / 2, 0, x + W / 2, 0);
  concrete.addColorStop(0, "#c9c4b9");
  concrete.addColorStop(1, "#a29d92");
  g.fillStyle = concrete;
  g.fillRect(x - W / 2, y - H, W, H);
  g.strokeStyle = "rgba(60, 55, 50, 0.6)";
  g.lineWidth = Math.max(0.05, 1 / ctx.zoom);
  g.strokeRect(x - W / 2, y - H, W, H);
  // bearing plate
  g.fillStyle = "#3b4047";
  g.fillRect(x - 0.7, y - 0.12, 1.4, 0.24);
}

/**
 * A chequered flag on a pole.
 * @param {RenderCtx} ctx
 * @param {number} x
 * @param {number} y - ground
 */
export function renderFlag(ctx, x, y) {
  const g = ctx.ctx;
  const top = y + 5;
  g.strokeStyle = "#d9d9d9";
  g.lineWidth = 0.14;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, top);
  g.stroke();

  const W = 2.2, H = 1.4, COLS = 5, ROWS = 3;
  const t = now();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const wave = (/** @type {number} */ u) => 0.15 * Math.sin(t * 3 + u * 4) * u;
      const u0 = c / COLS, u1 = (c + 1) / COLS;
      const yTop = top - r * H / ROWS, yBot = top - (r + 1) * H / ROWS;
      g.fillStyle = (c + r) % 2 ? "#1d1d1d" : "#f4f4f4";
      g.beginPath();
      g.moveTo(x + u0 * W, yTop + wave(u0));
      g.lineTo(x + u1 * W, yTop + wave(u1));
      g.lineTo(x + u1 * W, yBot + wave(u1));
      g.lineTo(x + u0 * W, yBot + wave(u0));
      g.closePath();
      g.fill();
    }
  }
}
