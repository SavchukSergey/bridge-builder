/**
 * Sandbox levels: a gap the player designs (its width, the far bank's height, a rock for a
 * pier, the traffic, the budget and the scenery). A sandbox level's id spells out its whole
 * design, so a saved bridge, the last level played and a shared link all bring it back.
 */

import { Level } from "./level.mjs";
import { THEMES } from "./themes.mjs";
import { t } from "./i18n.mjs";
import { WINDS } from "./wind.mjs";

/** @typedef {import("./themes.mjs").ThemeId} ThemeId */
/** @typedef {import("./vehicle-types.mjs").VehicleTypeId} VehicleTypeId */

/**
 * @typedef {Object} SandboxSpec
 * @property {number} gap - m between the banks
 * @property {number} far - m the far bank is above (or, negative, below) the near one
 * @property {boolean} rock - a rock in the middle to stand a pier on (gaps of 60 m or more)
 * @property {string} traffic - a key of {@link SANDBOX_TRAFFIC}
 * @property {number} budget
 * @property {ThemeId} theme
 * @property {import("./wind.mjs").WindId} wind
 */

/** @type {SandboxSpec} */
export const SANDBOX_DEFAULT = { gap: 60, far: 0, rock: false, traffic: "trucks2", budget: 40000, theme: "summer", wind: "calm" };

/** Allowed values: ranges with their steps. */
export const SANDBOX_LIMITS = {
  gap: { min: 20, max: 200, step: 10 },
  far: { min: -12, max: 12, step: 2 },
  budget: { min: 1000, max: 1000000, step: 500 },
  /** A rock needs room around it for the spans either side. */
  rockMinGap: 60,
};

/** @param {number} n */
const trucks = (n) => /** @type {VehicleTypeId[]} */ (Array(n).fill("truck"));
/** @param {number} wagons */
const train = (wagons) => /** @type {VehicleTypeId[]} */ (["locomotive", ...Array(wagons).fill("wagon")]);

/**
 * The traffic a sandbox can be tested with.
 * Their names are traffic.<key> in locales/.
 * @type {Record<string, { convoy: VehicleTypeId[], vehicleGap?: number }>}
 */
export const SANDBOX_TRAFFIC = {
  cars: { convoy: ["car", "bus", "car"] },
  trucks2: { convoy: trucks(2) },
  trucks4: { convoy: trucks(4) },
  trucks6: { convoy: trucks(6) },
  rush: { convoy: ["car", "truck", "bus", "car", "truck", "car", "bus", "truck", "car"], vehicleGap: 4 },
  town: { convoy: ["icecream", "car", "schoolbus", "fire", "car"], vehicleGap: 5 },
  hauler: { convoy: ["hauler"] },
  train2: { convoy: train(2), vehicleGap: 1 },
  train4: { convoy: train(4), vehicleGap: 1 },
  train6: { convoy: train(6), vehicleGap: 1 },
};

const PREFIX = "sandbox-";
// a windy one ends -w1 (a breeze) or -w2 (a storm); calm ones have no ending, as before wind
const ID_PATTERN = /^sandbox-g(\d+)-f([ud])(\d+)-r([01])-t([a-z0-9]+)-b(\d+)-([a-z]+)(?:-w([12]))?$/;

/** Whether an id names a sandbox level (well-formed or not). */
export function isSandboxId(/** @type {string | null | undefined} */ id) {
  return typeof id === "string" && id.startsWith(PREFIX);
}

/**
 * A spec with every value moved into range and onto its step, and a rock only where it fits.
 * @param {Partial<SandboxSpec>} spec
 * @returns {SandboxSpec}
 */
export function normalizeSandbox(spec) {
  const s = { ...SANDBOX_DEFAULT, ...spec };
  /** @param {number} v @param {{ min: number, max: number, step: number }} r */
  const fit = (v, r) => Math.min(r.max, Math.max(r.min, Math.round((Number.isFinite(v) ? v : r.min) / r.step) * r.step));
  const gap = fit(s.gap, SANDBOX_LIMITS.gap);
  return {
    gap,
    far: fit(s.far, SANDBOX_LIMITS.far),
    rock: Boolean(s.rock) && gap >= SANDBOX_LIMITS.rockMinGap,
    traffic: Object.hasOwn(SANDBOX_TRAFFIC, s.traffic) ? s.traffic : SANDBOX_DEFAULT.traffic,
    budget: fit(s.budget, SANDBOX_LIMITS.budget),
    theme: Object.hasOwn(THEMES, s.theme) ? s.theme : SANDBOX_DEFAULT.theme,
    wind: WINDS.includes(s.wind) ? s.wind : "calm",
  };
}

/**
 * The level id for a spec, e.g. `sandbox-g60-fu4-r0-ttrucks2-b40000-summer`. It uses only
 * a-z, 0-9 and "-", like every level id (share links rely on it).
 * @param {Partial<SandboxSpec>} spec
 */
export function sandboxId(spec) {
  const s = normalizeSandbox(spec);
  const far = s.far < 0 ? `d${-s.far}` : `u${s.far}`;
  const wind = s.wind === "calm" ? "" : `-w${WINDS.indexOf(s.wind)}`;
  return `${PREFIX}g${s.gap}-f${far}-r${s.rock ? 1 : 0}-t${s.traffic}-b${s.budget}-${s.theme}${wind}`;
}

/**
 * The spec an id spells out, or undefined if it isn't a valid sandbox id (including one
 * whose values are out of range: only ids that {@link sandboxId} would make are accepted).
 * @param {string | null | undefined} id
 * @returns {SandboxSpec | undefined}
 */
export function parseSandboxId(id) {
  const m = typeof id === "string" ? ID_PATTERN.exec(id) : null;
  if (!m) return undefined;
  const [, gap, dir, far, rock, traffic, budget, theme, wind] = m;
  const spec = {
    gap: Number(gap), far: (dir === "d" ? -1 : 1) * Number(far), rock: rock === "1", traffic,
    budget: Number(budget), theme: /** @type {ThemeId} */ (theme), wind: WINDS[Number(wind ?? 0)],
  };
  return sandboxId(spec) === id ? normalizeSandbox(spec) : undefined;
}

/** @type {Map<string, Level>} */
const cache = new Map();

/**
 * The level for a sandbox id: the same Level object every time for the same id.
 * @param {string | null | undefined} id
 * @returns {Level | undefined}
 */
export function findSandboxLevel(id) {
  const spec = parseSandboxId(id);
  if (!spec) return undefined;
  const key = /** @type {string} */ (id);
  let level = cache.get(key);
  if (!level) {
    level = sandboxLevel(spec);
    cache.set(key, level);
  }
  return level;
}

/** Far away, for the ends of the banks. */
const FAR = 10000;

/**
 * @param {SandboxSpec} spec - normalized
 * @returns {Level}
 */
function sandboxLevel(spec) {
  const { gap, far, rock, traffic, budget, theme, wind } = spec;
  const half = gap / 2;
  const nearY = 10, farY = 10 + far;
  const low = Math.min(nearY, farY);
  const rockY = low - 16;
  const water = rock ? rockY - 2 : low - 7;
  const terrain = [{ x0: -FAR, x1: -half, y: nearY }, { x0: half, x1: FAR, y: farY }];
  const anchors = [{ x: -half - 10, y: nearY }, { x: -half, y: nearY }, { x: half, y: farY }, { x: half + 10, y: farY }];
  if (rock) {
    terrain.push({ x0: -4, x1: 4, y: rockY });
    anchors.push({ x: -4, y: rockY }, { x: 4, y: rockY });
  }
  const { convoy, vehicleGap } = SANDBOX_TRAFFIC[traffic];
  const round = (/** @type {number} */ v) => Math.round(v / 100) * 100;
  return new Level({
    id: sandboxId(spec),
    name: "Sandbox",
    description: () => t("sandbox.description", {
      gap,
      bank: far === 0 ? "" : t(far > 0 ? "sandbox.bankHigher" : "sandbox.bankLower", { m: Math.abs(far) }),
      rock: rock ? t("sandbox.rockInMiddle") : "",
      traffic: t(`traffic.${traffic}`),
    }) + (wind === "calm" ? "" : ` ${t(`sandbox.wind.${wind}`)}`),
    terrain,
    anchors,
    startX: -half - 6,
    finishX: half + 8,
    convoy,
    vehicleGap,
    budget,
    stars: { two: round(budget * 0.93), three: round(budget * 0.86) },
    view: { x0: -half - 25, x1: half + 25, y: (nearY + farY) / 2 + Math.max(0, 5 - gap / 30) },
    water,
    theme,
    wind,
    sandbox: spec,
  });
}
