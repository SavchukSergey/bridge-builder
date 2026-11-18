/**
 * Visual effects that don't affect the simulation: pieces of broken members tumbling down,
 * dust, sparks and splashes, and a small camera shake. They are stepped with simulated time,
 * so they freeze when the simulation is paused.
 */

const GRAVITY = 9.81;
/** Most particles alive at once; the oldest are dropped first. */
const MAX_PARTICLES = 700;
/** Broken pieces rest this long (s) before fading out. */
const DEBRIS_REST = 4;
const DEBRIS_FADE = 1.5;

/**
 * @typedef {import("./engine/link.mjs").Link} Link
 * @typedef {import("./materials/material.types.mjs").MaterialLook} MaterialLook
 */

/**
 * @typedef {Object} Particle
 * @property {"dust" | "spark" | "drop"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} age
 * @property {number} life - seconds
 * @property {number} size - m
 * @property {string} color
 */

/**
 * A falling half of a broken member.
 * @typedef {Object} Debris
 * @property {number} x - centre
 * @property {number} y
 * @property {number} half - half length, m
 * @property {number} angle
 * @property {number} vx
 * @property {number} vy
 * @property {number} spin - rad/s
 * @property {MaterialLook} look
 * @property {number} rest - seconds since it came to rest (or sank), -1 while moving
 * @property {boolean} wet - has hit the water
 */

/**
 * Something that happened that is worth a sound.
 * @typedef {{ type: "break", kind: MaterialLook["kind"], size: number }
 *   | { type: "splash", size: number }
 *   | { type: "thud", size: number }
 *   | { type: "crossed" }} EffectEvent
 */

export class Effects {
  /** @type {Particle[]} */
  particles = [];
  /** @type {Debris[]} */
  debris = [];
  /** Camera shake amplitude, m; decays quickly. */
  shake = 0;
  /**
   * Events since the last {@link drainEvents}, for sound.
   * @type {EffectEvent[]}
   */
  events = [];

  /**
   * @param {import("./level.mjs").Level} level - for the ground and water
   */
  constructor(level) {
    this.level = level;
  }

  clear() {
    this.particles = [];
    this.debris = [];
    this.shake = 0;
    this.events = [];
  }

  /** @returns {EffectEvent[]} */
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  /**
   * A member snapped: two halves fall away from the break, with dust and, for steel, sparks.
   * @param {Link} link
   */
  breakLink(link) {
    const { a, b } = link;
    const look = link.material.look;
    const mx = (a.position.x + b.position.x) / 2, my = (a.position.y + b.position.y) / 2;
    const angle = Math.atan2(b.position.y - a.position.y, b.position.x - a.position.x);
    const half = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y) / 4;

    for (const [end, sign] of /** @type {const} */ ([[a, -1], [b, 1]])) {
      this.debris.push({
        x: (end.position.x + mx) / 2,
        y: (end.position.y + my) / 2,
        half,
        angle,
        vx: end.velocity.x + sign * Math.cos(angle) * 1.5,
        vy: end.velocity.y + sign * Math.sin(angle) * 1.5 + 1,
        spin: (Math.random() - 0.5) * 4 + sign * 1.5,
        look,
        rest: -1,
        wet: false,
      });
    }

    const heavy = look.kind === "deck" ? 1.6 : look.kind === "beam" ? 1 : 0.5;
    this.__burst(mx, my, Math.round(14 * heavy), "dust", { speed: 3, life: 1.4, size: 0.5 * heavy, up: 0.8 });
    if (look.kind === "beam") this.__burst(mx, my, 16, "spark", { speed: 9, life: 0.45, size: 0.12 });
    if (look.kind === "cable") this.__burst(mx, my, 8, "spark", { speed: 6, life: 0.3, size: 0.08 });

    this.shake = Math.min(1.2, this.shake + 0.25 * heavy);
    this.events.push({ type: "break", kind: look.kind, size: heavy });
  }

  /**
   * Something hit the water at x: a spray of drops.
   * @param {number} x
   * @param {number} size - 1 for a truck
   */
  splash(x, size) {
    const water = this.level.water;
    if (water === undefined) return;
    this.__burst(x, water, Math.round(40 * size), "drop", { speed: 7 * Math.sqrt(size), life: 1.6, size: 0.18 + 0.12 * size, up: 1.6, spread: 0.55 });
    this.__burst(x, water + 0.3, Math.round(10 * size), "dust", { speed: 1.5, life: 1.2, size: 1.2 * size, up: 0.5, color: "rgba(235, 245, 250, 0.7)" });
    this.shake = Math.min(1.2, this.shake + 0.15 * size);
    this.events.push({ type: "splash", size });
  }

  /**
   * A truck came down on solid ground.
   * @param {number} x
   * @param {number} y
   * @param {number} size
   */
  thud(x, y, size) {
    this.__burst(x, y, Math.round(18 * size), "dust", { speed: 3.5, life: 1.6, size: 0.8, up: 0.5 });
    this.shake = Math.min(1.2, this.shake + 0.3 * size);
    this.events.push({ type: "thud", size });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} count
   * @param {Particle["kind"]} kind
   * @param {{ speed: number, life: number, size: number, up?: number, spread?: number, color?: string }} opts
   */
  __burst(x, y, count, kind, { speed, life, size, up = 0, spread = 1, color }) {
    for (let i = 0; i < count; i++) {
      // a fan pointing up, narrower with a smaller spread
      const angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 2 * spread;
      const v = speed * (0.3 + 0.7 * Math.random());
      this.particles.push({
        kind,
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v + up,
        age: 0,
        life: life * (0.6 + 0.6 * Math.random()),
        size: size * (0.6 + 0.8 * Math.random()),
        color: color ?? PARTICLE_COLORS[kind][i % PARTICLE_COLORS[kind].length],
      });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  /** True while anything is still moving or visible. */
  get active() {
    return this.particles.length > 0 || this.debris.length > 0 || this.shake > 0.01;
  }

  /**
   * @param {number} dt - simulated seconds
   */
  step(dt) {
    if (dt <= 0) return;
    const { water } = this.level;
    this.shake *= Math.exp(-6 * dt);

    for (const p of this.particles) {
      p.age += dt;
      if (p.kind === "dust") {
        // drifts, slows down and spreads out
        const drag = Math.exp(-2.5 * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + 0.3 * dt;
        p.size += 0.8 * dt;
      } else {
        p.vy -= GRAVITY * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "drop" && water !== undefined && p.y < water && p.vy < 0) p.age = p.life;
    }
    this.particles = this.particles.filter(p => p.age < p.life);

    for (const d of this.debris) {
      if (d.rest >= 0) {
        d.rest += dt;
        if (d.wet) d.y -= 0.6 * dt; // keeps sinking
        continue;
      }
      d.vy -= GRAVITY * dt;
      if (d.wet) {
        const drag = Math.exp(-3 * dt);
        d.vx *= drag;
        d.vy *= drag;
        d.spin *= drag;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;

      const low = d.y - Math.abs(Math.sin(d.angle)) * d.half; // lowest end
      const ground = this.level.groundAt(d.x);
      if (water !== undefined && !d.wet && low < water && (ground === undefined || ground < water)) {
        d.wet = true;
        this.splash(d.x, Math.min(0.6, 0.15 + d.half * 0.08));
      }
      if (ground !== undefined && low < ground) {
        d.y += ground - low;
        if (Math.abs(d.vy) < 1.5) {
          d.rest = 0;
          d.angle = Math.round(d.angle / Math.PI) * Math.PI; // settle flat, on the ground
          d.y = ground + d.look.width / 2;
        } else {
          d.vy = -d.vy * 0.3;
          d.vx *= 0.6;
          d.spin *= -0.5;
          this.__burst(d.x, ground, 4, "dust", { speed: 1.5, life: 0.9, size: 0.4, up: 0.3 });
        }
      }
      // a metre under: from here it just sinks slowly and fades
      if (d.wet && water !== undefined && d.y < water - 1) d.rest = 0;
    }
    this.debris = this.debris.filter(d => d.rest < DEBRIS_REST + DEBRIS_FADE && d.y > -200);
  }

  /**
   * Debris and particles, in world coordinates. Debris goes behind the water front, so
   * sunken pieces look submerged; call {@link renderParticles} after the water.
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  renderDebris(ctx) {
    const g = ctx.ctx;
    for (const d of this.debris) {
      const fade = d.rest < DEBRIS_REST ? 1 : 1 - (d.rest - DEBRIS_REST) / DEBRIS_FADE;
      if (fade <= 0) continue;
      const width = Math.max(d.look.width, d.look.minPx / ctx.zoom);
      const dx = Math.cos(d.angle) * d.half, dy = Math.sin(d.angle) * d.half;
      g.save();
      g.globalAlpha = fade;
      g.lineCap = "butt";
      g.lineWidth = width;
      g.strokeStyle = d.look.color;
      g.beginPath();
      g.moveTo(d.x - dx, d.y - dy);
      g.lineTo(d.x + dx, d.y + dy);
      g.stroke();
      if (d.look.kind === "deck" && d.look.surface) {
        g.lineWidth = width * 0.25;
        g.strokeStyle = d.look.surface;
        g.stroke();
      }
      g.restore();
    }
  }

  /**
   * @param {import("./render-ctx.mjs").RenderCtx} ctx
   */
  renderParticles(ctx) {
    const g = ctx.ctx;
    const px = 1 / ctx.zoom;
    for (const p of this.particles) {
      const t = p.age / p.life;
      g.globalAlpha = p.kind === "dust" ? 0.55 * (1 - t) : 1 - t * t;
      g.fillStyle = p.color;
      if (p.kind === "spark") {
        g.strokeStyle = p.color;
        g.lineWidth = Math.max(p.size, 1.5 * px);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, Math.max(p.size, 1.5 * px), 0, 2 * Math.PI);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}

/** @type {Record<Particle["kind"], string[]>} */
const PARTICLE_COLORS = {
  dust: ["#a89a86", "#bcae98", "#8f8372"],
  spark: ["#ffd27a", "#ffb43b", "#fff1c2"],
  drop: ["#d9eef7", "#a9d3e8", "#ffffff"],
};
