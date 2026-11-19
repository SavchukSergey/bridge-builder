/**
 * Bridges in links: a structure packed into a short, URL-safe text for the address's
 * #hash, so a design can be sent to someone and opened with one click.
 *
 * Format (version 1): `1~<level>~<joints>~<links>`
 * - joints, joined by `_`: x and y in whole millimetres, base 36, separated by `,` for a
 *   free joint or `!` for an anchor
 * - links, joined by `_`: the two joint indices in base 36, separated by a capital letter
 *   naming the material
 */

const VERSION = "1";

/** Material name → its letter in a link (capitals never appear in base 36 digits). */
const MATERIAL_CODES = {
  road: "R",
  steel: "S",
  "steel-light": "L",
  cable: "C",
  "cable-thin": "T",
  rail: "W",
  winch: "H",
};
const MATERIAL_NAMES = Object.fromEntries(Object.entries(MATERIAL_CODES).map(([name, code]) => [code, name]));

/** Prefix of the #hash that carries a bridge. */
export const SHARE_HASH_PREFIX = "#bridge=";

/** @param {number} metres */
const packNumber = (metres) => Math.round(metres * 1000).toString(36);

/** @param {string} text */
function unpackNumber(text) {
  if (!/^-?[0-9a-z]{1,8}$/.test(text)) throw new Error(`bad number "${text}"`);
  return parseInt(text, 36) / 1000;
}

/**
 * @param {import("./scene.js").SavedStructure & { level: string }} structure
 * @returns {string}
 */
export function encodeBridge(structure) {
  const joints = structure.joints
    .map(j => packNumber(j.x) + (j.fixed ? "!" : ",") + packNumber(j.y))
    .join("_");
  const links = structure.links
    .map(l => {
      const code = /** @type {Record<string, string>} */ (MATERIAL_CODES)[l.material];
      if (!code) throw new Error(`unknown material "${l.material}"`);
      return l.a.toString(36) + code + l.b.toString(36);
    })
    .join("_");
  return [VERSION, structure.level, joints, links].join("~");
}

/**
 * The structure in a packed bridge. Only the format is checked here; whether it makes a
 * valid structure is up to {@link import("./scene.js").Scene.load}.
 * @param {string} text
 * @returns {import("./scene.js").SavedStructure & { level: string }}
 * @throws {Error} if the text is not a packed bridge
 */
export function decodeBridge(text) {
  const parts = text.split("~");
  if (parts.length !== 4) throw new Error("not a bridge link");
  const [version, level, jointText, linkText] = parts;
  if (version !== VERSION) throw new Error(`unsupported link version ${version}`);
  if (!/^[a-z0-9-]+$/.test(level)) throw new Error("bad level");
  const joints = jointText ? jointText.split("_").map(j => {
    const m = /^([^,!]+)([,!])([^,!]+)$/.exec(j);
    if (!m) throw new Error(`bad joint "${j}"`);
    /** @type {import("./scene.js").SavedJoint} */
    const joint = { x: unpackNumber(m[1]), y: unpackNumber(m[3]) };
    if (m[2] === "!") joint.fixed = true;
    return joint;
  }) : [];
  const links = linkText ? linkText.split("_").map(l => {
    const m = /^([0-9a-z]{1,4})([A-Z])([0-9a-z]{1,4})$/.exec(l);
    const material = m && MATERIAL_NAMES[m[2]];
    if (!m || !material) throw new Error(`bad link "${l}"`);
    return { a: parseInt(m[1], 36), b: parseInt(m[3], 36), material };
  }) : [];
  return { version: 1, level, joints, links };
}

/**
 * A link that opens `structure`, on the page at `base` (the address without its #hash).
 * @param {string} base
 * @param {import("./scene.js").SavedStructure & { level: string }} structure
 */
export function bridgeUrl(base, structure) {
  return base + SHARE_HASH_PREFIX + encodeBridge(structure);
}

/**
 * The packed bridge in an address's #hash, if it has one.
 * @param {string} hash - e.g. `location.hash`
 * @returns {string | undefined}
 */
export function bridgeInHash(hash) {
  return hash.startsWith(SHARE_HASH_PREFIX) ? decodeURIComponent(hash.slice(SHARE_HASH_PREFIX.length)) : undefined;
}
