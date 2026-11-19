// A picture of the bridge to keep: a framed postcard of the bridge in its scenery, with its
// name, the level, what it cost, its stars, who built it and when.

import { RenderCtx } from "./render-ctx.mjs";
import { renderBackground } from "./scenery.mjs";
import { formatMoney, language, t } from "./i18n.mjs";
import { createVec3F } from "./math.js";

/** The card's size in CSS pixels; drawn at {@link SCALE} times that. */
export const CARD = { width: 640, height: 470 };
const SCALE = 2;
const FRAME = 16;
const PHOTO = { width: CARD.width - 2 * FRAME, height: 350 };
const PAPER = "#fbf7ee";
const INK = "#2b2a28";
const FAINT = "#8a8478";
const GOLD = "#f2b233";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * @typedef {Object} PostcardInfo
 * @property {import("./level.mjs").Level} level
 * @property {import("./scene.js").Scene} scene
 * @property {{ color: string, highlight: string } | undefined} paint
 * @property {string} name - the bridge's name; may be empty
 * @property {number | undefined} cost - of a win; undefined if not won yet
 * @property {number} stars - 0 to 3
 * @property {string} player - who built it; may be empty
 * @property {Date} date
 */

/**
 * The view that shows the whole bridge and a little of the banks.
 * @param {import("./scene.js").Scene} scene @param {import("./level.mjs").Level} level
 * @returns {{ x: number, y: number, zoom: number }}
 */
export function postcardView(scene, level) {
  const points = scene.joints.length ? scene.joints.map(j => j.position) : level.anchors;
  let x0 = Math.min(...points.map(p => p.x)), x1 = Math.max(...points.map(p => p.x));
  let y0 = Math.min(...points.map(p => p.y)), y1 = Math.max(...points.map(p => p.y));
  // room for the banks, and for the sky above
  x0 -= 5; x1 += 5; y0 -= 7; y1 += 5;
  const zoom = Math.min(32, PHOTO.width / (x1 - x0), PHOTO.height / (y1 - y0));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom };
}

/**
 * Draws the postcard on a new canvas.
 * @param {PostcardInfo} info
 * @returns {HTMLCanvasElement}
 */
export function drawPostcard(info) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD.width * SCALE;
  canvas.height = CARD.height * SCALE;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  // the paper, with a soft edge
  g.scale(SCALE, SCALE);
  g.fillStyle = PAPER;
  roundRect(g, 0, 0, CARD.width, CARD.height, 14);
  g.fill();

  // the photo: the bridge in its scenery, drawn by the game's own renderers
  const photo = document.createElement("canvas");
  photo.width = PHOTO.width * SCALE;
  photo.height = PHOTO.height * SCALE;
  const pg = /** @type {CanvasRenderingContext2D} */ (photo.getContext("2d"));
  const ctx = new RenderCtx(pg);
  const view = postcardView(info.scene, info.level);
  Object.assign(ctx, { width: PHOTO.width, height: PHOTO.height, pixelRatio: SCALE, zoom: view.zoom, shift: createVec3F(view.x, view.y, 0) });
  ctx.clear();
  renderBackground(ctx, info.level.startY, info.level.theme);
  info.level.render(ctx);
  info.scene.content.render(ctx, { paint: info.paint });
  g.save();
  roundRect(g, FRAME, FRAME, PHOTO.width, PHOTO.height, 8);
  g.clip();
  g.drawImage(photo, FRAME, FRAME, PHOTO.width, PHOTO.height);
  g.restore();
  g.strokeStyle = "rgba(0, 0, 0, 0.12)";
  g.lineWidth = 1;
  roundRect(g, FRAME + 0.5, FRAME + 0.5, PHOTO.width - 1, PHOTO.height - 1, 8);
  g.stroke();

  // the caption
  const left = FRAME + 4, right = CARD.width - FRAME - 4;
  const top = FRAME + PHOTO.height;
  const level = info.level;
  const title = info.name || t("postcard.untitled", { level: level.name });
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  g.font = `700 24px ${FONT}`;
  g.fillText(fit(g, title, right - left - 110), left, top + 38);

  g.font = `500 15px ${FONT}`;
  g.fillStyle = INK;
  const where = level.sandbox ? level.name : `${level.number}. ${level.name}`;
  g.fillText(fit(g, info.cost === undefined ? where : `${where} · ${formatMoney(info.cost)}`, right - left - 110), left, top + 62);

  g.font = `400 13px ${FONT}`;
  g.fillStyle = FAINT;
  const day = new Intl.DateTimeFormat(language(), { day: "numeric", month: "long", year: "numeric" }).format(info.date);
  const by = info.player ? t("postcard.by", { name: info.player, date: day }) : day;
  g.fillText(fit(g, by, right - left - 130), left, top + 86);

  // stars, and the game's name, on the right
  for (let i = 0; i < 3; i++) star(g, right - 86 + i * 32, top + 30, 13, i < info.stars ? GOLD : "rgba(0, 0, 0, 0.12)");
  g.font = `700 12px ${FONT}`;
  g.fillStyle = FAINT;
  g.textAlign = "right";
  g.fillText("Bridge Builder", right, top + 86);
  g.textAlign = "left";
  return canvas;
}

/** A file name for the picture: the bridge's name, else the level's. @param {PostcardInfo} info */
export function postcardFileName(info) {
  const base = (info.name || info.level.name).normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${base || "bridge"}.png`;
}

/**
 * Text cut short with an ellipsis to fit a width.
 * @param {CanvasRenderingContext2D} g @param {string} text @param {number} width
 */
function fit(g, text, width) {
  if (g.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A five-pointed star. @param {CanvasRenderingContext2D} g @param {number} cx @param {number} cy @param {number} r @param {string} color */
function star(g, cx, cy, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + d * Math.cos(a), cy + d * Math.sin(a));
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
