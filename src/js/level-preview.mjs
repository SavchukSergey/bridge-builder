/**
 * A small picture of a level for the level-select screen: sky, terrain, water, anchors and
 * the finish flag, fitted to the level's view. Flat colours only, so twelve of them are
 * cheap to draw whenever the screen opens.
 */

const SKY_TOP = "#7fb0dc";
const SKY_BOTTOM = "#d3e6f3";
const EARTH = "#7d5d40";
const GRASS = "#5d9a3f";
const ROCK = "#6f6a63";
const WATER = "rgba(52, 118, 168, 0.88)";
const VALLEY = "#5b5348";
const ANCHOR = "#2a3038";

/**
 * @param {CanvasRenderingContext2D} g
 * @param {import("./level.mjs").Level} level
 * @param {number} width - px
 * @param {number} height - px
 */
export function renderLevelPreview(g, level, width, height) {
  const { x0, x1, y } = level.view;
  const scale = width / (x1 - x0); // px per m
  const top = y + height / scale / 2; // world y at the top edge
  const px = (/** @type {number} */ wx) => (wx - x0) * scale;
  const py = (/** @type {number} */ wy) => (top - wy) * scale;

  const sky = g.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOTTOM);
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  const { water } = level;
  const lowest = Math.min(...level.terrain.map(t => t.y));
  if (water === undefined) {
    // a dry valley: its floor somewhat below the lowest ground
    g.fillStyle = VALLEY;
    g.fillRect(0, py(lowest - 12), width, height);
  }

  /** @param {import("./level.mjs").TerrainBlock} block */
  const drawBlock = (block) => {
    const left = Math.max(0, px(block.x0)), right = Math.min(width, px(block.x1));
    if (right <= left) return;
    const surface = py(block.y);
    const submerged = water !== undefined && block.y < water;
    g.fillStyle = submerged ? ROCK : EARTH;
    g.fillRect(left, surface, right - left, height - surface);
    if (!submerged) {
      g.fillStyle = GRASS;
      g.fillRect(left, surface, right - left, Math.max(2, 0.8 * scale));
    }
  };

  // rocks under the river first, so the water covers them
  const under = water === undefined ? [] : level.terrain.filter(t => t.y < water);
  under.forEach(drawBlock);
  if (water !== undefined) {
    g.fillStyle = WATER;
    g.fillRect(0, py(water), width, height - py(water));
  }
  level.terrain.filter(t => !under.includes(t)).forEach(drawBlock);

  g.fillStyle = ANCHOR;
  const r = Math.max(1.5, 0.7 * scale);
  for (const anchor of level.anchors) {
    g.beginPath();
    g.arc(px(anchor.x), py(anchor.y), r, 0, Math.PI * 2);
    g.fill();
  }

  // the finish flag
  const flagX = px(level.finishX), flagY = py(level.groundAt(level.finishX) ?? 0);
  const pole = Math.max(8, 5 * scale);
  g.fillStyle = "#e8e8e8";
  g.fillRect(flagX - 0.5, flagY - pole, 1, pole);
  g.fillStyle = "#222";
  g.fillRect(flagX + 0.5, flagY - pole, pole * 0.5, pole * 0.3);
}
