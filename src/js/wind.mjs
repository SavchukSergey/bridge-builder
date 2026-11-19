// Wind, for sandbox levels: a breeze or a storm blowing from the left. It pushes on whatever
// stands up into it (towers and posts far more than a flat deck), in gusts, so tall parts
// need bracing or cables back to the ground.

/** @typedef {"calm" | "breeze" | "storm"} WindId */

/** @type {WindId[]} */
export const WINDS = ["calm", "breeze", "storm"];

// Far stronger than real wind, which hardly troubles steel: here a storm can bring down a tall
// bridge that isn't braced for it.
/** Push at full gust, in N per metre a member stands up into the wind. */
export const WIND_PUSH = { calm: 0, breeze: 10000, storm: 30000 };

/** How much of a member catches the wind: a deck is deep, a cable is thin. */
const WINDAGE = { deck: 1.5, beam: 1, cable: 0.3 };

/** A flat member still catches a little: this share of its length counts as height. */
const FLAT = 0.15;

/**
 * How hard it blows at a moment of the test, 0 to 1: nothing while gravity warms up, then it
 * builds over a few seconds and gusts. The same every run, so replays break the same way.
 * @param {number} t - seconds since the test started
 */
export function windGust(t) {
  const build = Math.min(1, Math.max(0, t - 1.5) / 3);
  return build * (0.72 + 0.18 * Math.sin(1.1 * t) + 0.1 * Math.sin(2.9 * t + 1));
}

/**
 * The push now, in N per metre of member standing up into the wind.
 * @param {WindId | undefined} wind @param {number} t
 */
export const windAt = (wind, t) => (wind ? WIND_PUSH[wind] ?? 0 : 0) * windGust(t);

/**
 * Pushes each unbroken link sideways, half on each end.
 * @param {import("./engine/link.mjs").Link[]} links
 * @param {number} push - N per metre, from {@link windAt}
 */
export function applyWind(links, push) {
  for (const link of links) {
    if (link.broken) continue;
    const { a, b } = link;
    const dx = Math.abs(b.position.x - a.position.x);
    const dy = Math.abs(b.position.y - a.position.y);
    const kind = /** @type {keyof typeof WINDAGE} */ (link.material.look?.kind);
    const f = push * (dy + FLAT * dx) * (WINDAGE[kind] ?? 1) / 2;
    a.force.x += f;
    b.force.x += f;
  }
}

/**
 * Wind streaks blowing across the view.
 * @param {import("./render-ctx.mjs").RenderCtx} ctx
 * @param {WindId | undefined} wind
 * @param {number} clock - seconds, any steady clock
 */
export function renderWind(ctx, wind, clock) {
  if (!wind || wind === "calm") return;
  const storm = wind === "storm";
  const topLeft = ctx.clientToGlobal({ x: 0, y: 0, z: 0 });
  const bottomRight = ctx.clientToGlobal({ x: ctx.width, y: ctx.height, z: 0 });
  const x0 = topLeft.x, w = bottomRight.x - topLeft.x;
  const y0 = bottomRight.y, h = topLeft.y - bottomRight.y;
  const g = ctx.ctx;
  g.save();
  g.strokeStyle = storm ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.35)";
  g.lineWidth = 1.5 / ctx.zoom;
  g.lineCap = "round";
  const n = storm ? 26 : 12;
  for (let i = 0; i < n; i++) {
    // fixed, scattered rows and speeds per streak
    const r1 = fract(Math.sin(i * 12.9898) * 43758.5453);
    const r2 = fract(Math.sin(i * 78.233) * 12345.678);
    const speed = (storm ? 0.9 : 0.45) * (0.7 + 0.6 * r2);
    const x = x0 + fract(r1 + clock * speed * 40 / w) * (w + 20) - 10;
    const y = y0 + h * (0.15 + 0.8 * r2);
    const len = (storm ? 7 : 4) * (0.6 + 0.8 * r1);
    const wave = Math.sin(clock * 3 + i) * 0.4;
    g.beginPath();
    g.moveTo(x - len, y);
    g.quadraticCurveTo(x - len / 2, y + wave, x, y);
    g.stroke();
  }
  g.restore();
}

/** @param {number} v */
const fract = (v) => v - Math.floor(v);
