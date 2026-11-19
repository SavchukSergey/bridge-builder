/**
 * Second layer: switching levels, undo and redo, saving each level's bridge, import and
 * export, and resetting progress.
 */

import { GameCore } from "./game-core.mjs";
import { MAX_UNDO } from "./game-config.mjs";
import { AUTOSAVE_KEY, LEVEL_KEY, TRIES_KEY, CHALLENGES_KEY, COMPLETED_KEY, BEST_KEY, storageGet, storageSet } from "./storage.mjs";
import { findLevel, levels } from "./level.mjs";
import { Scene } from "./scene.js";
import { LOOKS_KEY } from "./looks.mjs";
import { DAILY_KEY, DAILY_PICK_KEY } from "./daily.mjs";
import { FRIEND_KEY } from "./friend.mjs";
import { PLAYER_KEY, SCORES_KEY } from "./scoreboard.mjs";

export class GameLevels extends GameCore {
  /** @type {import("./scene.js").SavedStructure[]} */
  __undoStack = [];
  /** @type {import("./scene.js").SavedStructure[]} */
  __redoStack = [];

  get canUndo() {
    return this.isBuildMode && this.__undoStack.length > 0;
  }

  get canRedo() {
    return this.isBuildMode && this.__redoStack.length > 0;
  }

  undo() {
    this.__stepHistory(this.__undoStack, this.__redoStack);
  }

  redo() {
    this.__stepHistory(this.__redoStack, this.__undoStack);
  }

  /**
   * @param {import("./scene.js").SavedStructure[]} from
   * @param {import("./scene.js").SavedStructure[]} to
   */
  __stepHistory(from, to) {
    if (!this.isBuildMode) return;
    const state = from.pop();
    if (!state) return;
    this.__cancelLink();
    to.push(this.scene.serialize());
    this.scene.load(state);
    this.__afterChange();
  }

  /**
   * Applies a change to the built structure as one undoable step.
   * @param {() => boolean | void} change - return false if nothing changed
   */
  __edit(change) {
    const before = this.scene.serialize();
    if (change() === false) return;
    this.__undoStack.push(before);
    if (this.__undoStack.length > MAX_UNDO) this.__undoStack.shift();
    this.__redoStack = [];
    this.__afterChange();
  }

  __afterChange() {
    this.failedLink = undefined;
    this.idleLink = undefined;
    this.__saveAutosave();
    this.onChange();
  }

  /**
   * Switches to a level: stops any simulation, clears undo history, and loads that level's
   * autosaved structure (or its starting structure). Unknown ids fall back to the first level.
   * @param {string} id
   */
  selectLevel(id) {
    this.reset();
    this.__cancelLink();
    this.level = findLevel(id) ?? levels[0];
    this.showOutline = false;
    this.effects.level = this.level;
    this.failedLink = undefined;
    this.idleLink = undefined;
    this.__undoStack = [];
    this.__redoStack = [];
    this.__convoyPreviewCache = undefined;
    if (!this.__loadAutosave()) {
      this.scene.load(this.level.initialStructure());
    }
    storageSet(LEVEL_KEY, this.level.id);
    this.fitView();
    this.onChange();
  }

  /**
   * Forgets every level won, every best and every saved bridge, and goes back to the first
   * level.
   */
  resetProgress() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === COMPLETED_KEY || key === BEST_KEY || key === LEVEL_KEY || key === TRIES_KEY || key === CHALLENGES_KEY || key === LOOKS_KEY || key === DAILY_KEY || key === DAILY_PICK_KEY || key === FRIEND_KEY || key === SCORES_KEY || key === PLAYER_KEY || key?.startsWith(`${AUTOSAVE_KEY}:`)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      // storage blocked: nothing was saved either
    }
    this.selectLevel(levels[0].id);
  }

  /**
   * The structure as built (pre-simulation positions), as plain JSON, tagged with the level.
   * @returns {import("./scene.js").SavedStructure & { level: string }}
   */
  exportStructure() {
    return { ...this.scene.serialize(this.__snapshot), level: this.level.id };
  }

  /**
   * Replaces the structure (undoable). Resets any running simulation first. A structure
   * exported from another level switches to that level first.
   * @param {unknown} data
   * @throws {Error} if data is not a valid structure; the scene is left unchanged
   */
  importStructure(data) {
    const levelId = /** @type {any} */ (data)?.level;
    const target = findLevel(levelId);
    if (target && target !== this.level) {
      // Validate before switching, so a bad file doesn't change the level either.
      new Scene().load(data);
      this.selectLevel(target.id);
    }
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.load(data));
  }

  /** Starts the current level over from its starting structure (undoable). */
  restartLevel() {
    this.reset();
    this.__cancelLink();
    this.__edit(() => this.scene.load(this.level.initialStructure()));
  }

  get __autosaveKey() {
    return `${AUTOSAVE_KEY}:${this.level.id}`;
  }

  __saveAutosave() {
    storageSet(this.__autosaveKey, JSON.stringify(this.scene.serialize(this.__snapshot)));
  }

  /** @returns {boolean} whether a saved structure was loaded */
  __loadAutosave() {
    const raw = storageGet(this.__autosaveKey);
    if (!raw) return false;
    try {
      this.scene.load(JSON.parse(raw));
      return true;
    } catch (err) {
      console.warn("Ignoring unreadable autosave:", err);
      return false;
    }
  }
}
