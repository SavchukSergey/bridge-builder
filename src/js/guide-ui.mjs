// "Build it with me" on screen: when the guide runs, and what it says for the game as it is.
//
// The plan and the progress come from guide.mjs; this decides when the guide is on (by itself on
// the teaching levels until they're won, or when asked for), remembers where the player said
// stop, and turns the next step into the words, the card to pick and the dot to ring.

import { guideProgress, piecesOf, planGuide, samePoint } from "./guide.mjs";
import { materials } from "./materials/index.mjs";
import { t } from "./i18n.mjs";

/** Levels where the player stopped the guide: it doesn't start there by itself again. */
export const GUIDE_OFF_KEY = "bridge-builder:guide-off";
/** The levels that teach one idea: the guide starts there by itself, until they're won. */
export const GUIDED_LEVELS = ["triangles", "ledges", "hang", "creek"];

/**
 * What the guide shows now.
 * @typedef {{ n: number, of: number, text: string, why?: string, focus?: Element,
 *   target?: { x: number, y: number } }} GuideView
 */

/** A level's material id from the material itself. @param {unknown} material */
const materialId = (material) => Object.keys(materials).find(id => materials[id] === material) ?? "";
const isDeck = (/** @type {string} */ m) => materials[m]?.look.kind === "deck";

export class Guide {
  /**
   * @param {object} options
   * @param {import("./game.js").Game} options.game
   * @param {Pick<Storage, "getItem" | "setItem">} [options.storage]
   * @param {() => boolean} [options.isTouch] whether to say "tap" rather than "click"
   * @param {() => string | undefined} [options.pickedMaterial] the material the player has picked
   * @param {(material: string) => Element | undefined} [options.materialCard] that material's card
   * @param {Element} [options.testButton]
   * @param {() => void} [options.onChange] the guide turned on or off
   */
  constructor({ game, storage = globalThis.localStorage, isTouch = () => false, pickedMaterial, materialCard, testButton, onChange = () => {} }) {
    this.game = game;
    this.storage = storage;
    this.isTouch = isTouch;
    this.pickedMaterial = pickedMaterial ?? (() => {
      const input = /** @type {HTMLInputElement | null | undefined} */ (globalThis.document?.querySelector('input[name="material"]:checked'));
      return input?.value;
    });
    this.materialCard = materialCard ?? ((id) =>
      globalThis.document?.querySelector(`input[name="material"][value="${id}"]`)?.closest("label") ?? undefined);
    this.testButton = testButton;
    this.onChange = onChange;
  }

  /** The level being guided ('' for none), and the level last looked at. */
  __guiding = "";
  __seen = "";
  /** @type {{ level: string, steps: import("./guide.mjs").GuideStep[], wanted: import("./guide.mjs").Piece[] }} */
  __plan = { level: "", steps: [], wanted: [] };

  /** Whether the guide is on for the level being played. */
  get active() {
    return this.__guiding !== "" && this.__guiding === this.game.level.id;
  }

  /** @returns {string[]} */
  __off() {
    try {
      const list = JSON.parse(this.storage?.getItem(GUIDE_OFF_KEY) ?? "[]");
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  /** @param {string[]} list */
  __saveOff(list) {
    try { this.storage?.setItem(GUIDE_OFF_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  }

  /** The player asked for it: on for this level. */
  start() {
    this.__seen = this.game.level.id;
    this.__guiding = this.game.level.id;
    this.__saveOff(this.__off().filter(id => id !== this.__guiding));
    this.game.showOutline = true;
    this.onChange();
  }

  /** The bridge is built and won: the guide is done here. */
  end() {
    this.__guiding = "";
    this.game.guideStep = undefined;
    this.game.showOutline = false;
  }

  /** The player said stop: off, and not started by itself on this level again. */
  stop() {
    const id = this.__guiding;
    this.end();
    if (id && !this.__off().includes(id)) this.__saveOff([...this.__off(), id]);
    this.onChange();
  }

  /**
   * The guide's step for the game as it is now (call it every frame); it also sets the piece
   * the game draws glowing. Undefined while the guide is off or the bridge is being tested.
   * @returns {GuideView | undefined}
   */
  view() {
    const { game } = this;
    if (game.level.id !== this.__seen) {
      // a new level: the guide starts by itself on a teaching level not yet won
      this.__seen = game.level.id;
      const id = game.level.id;
      this.__guiding = GUIDED_LEVELS.includes(id) && !game.isCompleted(id) && !this.__off().includes(id) ? id : "";
      this.onChange();
    }
    if (!this.active || !game.isBuildMode || !game.outline) {
      game.guideStep = undefined;
      return undefined;
    }
    game.showOutline = true;
    if (this.__plan.level !== game.level.id) {
      const reference = game.outline.structure;
      this.__plan = { level: game.level.id, steps: planGuide(reference, game.level.initialStructure(), isDeck), wanted: piecesOf(reference) };
    }
    const pieces = game.scene.links.map(l => ({ a: l.a.position, b: l.b.position, material: materialId(l.material) }));
    const dots = game.scene.joints.map(j => j.position);
    const { step, done, total, wrong } = guideProgress(this.__plan.steps, pieces, dots, this.__plan.wanted);
    game.guideStep = step;
    const n = Math.min(done + 1, total);
    if (!step) return { n: total, of: total, text: t("guide.test"), focus: this.testButton };
    const how = this.isTouch() || game.pointerType === "touch" ? "tap" : "click";
    const middle = { x: (step.a.x + step.b.x) / 2, y: (step.a.y + step.b.y) / 2 };
    if (step.kind === "remove") return { n, of: total, text: t(`guide.remove.${how}`), why: t("guide.why.remove"), target: middle };
    const name = materials[step.material]?.label ?? step.material;
    if (wrong) return { n, of: total, text: t(`guide.wrong.${how}`, { material: name }), target: middle };
    const why = t(`guide.why.${step.material}`);
    if (this.pickedMaterial() !== step.material) {
      return { n, of: total, text: t("guide.pick", { material: name }), why, focus: this.materialCard(step.material) };
    }
    if (!game.isPlacing) return { n, of: total, text: t(`guide.first.${how}`), why, target: step.a };
    const from = game.placingFrom;
    if (from && !samePoint(from, step.a) && !samePoint(from, step.b)) {
      // started from a dot that isn't glowing: let go of it first
      return { n, of: total, text: t(`guide.otherDot.${how}`), target: from };
    }
    const end = from && samePoint(from, step.b) ? step.a : step.b;
    return { n, of: total, text: t(`guide.second.${how}`), why, target: end };
  }
}
