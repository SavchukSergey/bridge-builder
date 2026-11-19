import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildLink, createGame, rightClick, ui } from "./helpers.mjs";
import { GUIDE_OFF_KEY, Guide } from "../src/js/guide-ui.mjs";
import { t } from "../src/js/i18n.mjs";

/** A guide on a fresh game, as main.js makes it (the material is the test's picked one). */
function guided(levelId, { completed = [] } = {}) {
  localStorage.clear();
  if (completed.length) localStorage.setItem("bridge-builder:completed", JSON.stringify(completed));
  const game = createGame(levelId, { keepStorage: true });
  let changes = 0;
  const guide = new Guide({
    game,
    storage: localStorage,
    pickedMaterial: () => ui.material,
    materialCard: (id) => /** @type {any} */ ({ card: id }),
    onChange: () => changes++,
  });
  return { game, guide, changes: () => changes };
}

describe("build it with me, on screen", () => {
  test("starts by itself on a teaching level not yet won", () => {
    const { guide } = guided("triangles");
    const view = guide.view();
    assert.equal(guide.active, true);
    assert.equal(view.n, 1);
    assert.equal(view.text, t("guide.pick", { material: t("material.road", {}, "Road") }));
    assert.deepEqual(view.focus, { card: "road" });
  });

  test("not by itself once the level is won, nor on other levels", () => {
    assert.equal(guided("triangles", { completed: ["brook", "triangles"] }).guide.view(), undefined);
    assert.equal(guided("canyon").guide.view(), undefined);
  });

  test("asked for, it runs on any level, and starts by taking pieces away on Canyon", () => {
    const { guide, game } = guided("canyon");
    guide.start();
    const view = guide.view();
    assert.equal(view.text, t("guide.remove.click"));
    assert.equal(game.guideStep.kind, "remove");
    assert.equal(game.showOutline, true);
  });

  test("Stop is remembered for that level; asking for it again lifts that", () => {
    const { guide, game, changes } = guided("triangles");
    guide.view();
    guide.stop();
    assert.equal(guide.active, false);
    assert.equal(game.guideStep, undefined);
    assert.ok(changes() >= 2);
    assert.deepEqual(JSON.parse(localStorage.getItem(GUIDE_OFF_KEY)), ["triangles"]);
    // a new guide (as after a reload) doesn't start by itself there
    const again = new Guide({ game, storage: localStorage, pickedMaterial: () => ui.material });
    assert.equal(again.view(), undefined);
    again.start();
    assert.equal(again.active, true);
    assert.deepEqual(JSON.parse(localStorage.getItem(GUIDE_OFF_KEY)), []);
  });

  test("click, then the other end; tap words for a finger", () => {
    const { guide, game } = guided("triangles");
    ui.material = "road";
    const first = guide.view();
    assert.equal(first.text, t("guide.first.click"));
    game.__handleClick(at(game, first.target));
    const second = guide.view();
    assert.equal(second.text, t("guide.second.click"));
    assert.notDeepEqual(second.target, first.target);
    game.pointerType = "touch";
    assert.equal(guide.view().text, t("guide.second.tap"));
  });

  test("a piece started from a dot that isn't glowing: let go of it first", () => {
    const { guide, game } = guided("triangles");
    ui.material = "road";
    guide.view();
    game.__handleClick(at(game, { x: 15, y: 10 })); // the far bank; the road starts on the left
    const view = guide.view();
    assert.equal(view.text, t("guide.otherDot.click"));
    assert.deepEqual({ x: view.target.x, y: view.target.y }, { x: 15, y: 10 });
  });

  test("a piece the bridge doesn't have is taken away first, and then it's ready again", () => {
    const { guide, game } = guided("triangles");
    guide.start();
    ui.material = "steel";
    buildLink(game, -15, 10, -15, 14); // a post the reference bridge does not have
    const view = guide.view();
    assert.equal(view.text, t("guide.remove.click"));
    assert.equal(view.n, 1, "not counted as a step");
    assert.deepEqual(view.target, { x: -15, y: 12 });
    rightClick(game, -15, 12);
    assert.equal(guide.view().text, t("guide.pick", { material: t("material.road", {}, "Road") }));
  });

  test("the bridge built: press Test; a win ends the guide", () => {
    const { guide, game } = guided("brook", { completed: ["brook"] });
    guide.start();
    for (let i = 0; i < 20; i++) {
      guide.view();
      const step = game.guideStep;
      if (!step) break;
      ui.material = step.material;
      buildLink(game, step.a.x, step.a.y, step.b.x, step.b.y);
    }
    assert.equal(guide.view().text, t("guide.test"));
    guide.end();
    assert.equal(guide.active, false);
    assert.equal(game.showOutline, false);
  });
});

/** A click event at a world point. */
function at(game, p) {
  const c = game.ctx.globalToClient({ x: p.x, y: p.y, z: 0 });
  return { clientX: c.x, clientY: c.y, button: 0 };
}
