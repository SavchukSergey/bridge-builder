import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { endingSummary, isFinished } from "../src/js/ending.mjs";
import { BADGES, earnedBadges } from "../src/js/badges.mjs";
import { setLanguage, t } from "../src/js/i18n.mjs";

const progress = (over = {}) => ({ stars: 40, maxStars: 54, wins: 18, levels: 18, goals: 20, maxGoals: 30, train: true, ...over });

describe("the ending", () => {
  test("the game is finished once every level is won, not before", () => {
    assert.equal(isFinished(progress()), true);
    assert.equal(isFinished(progress({ wins: 17 })), false);
    assert.equal(isFinished(progress({ wins: 0, levels: 0 })), false);
  });

  test("winning the last level earns the badge that brings the ending", () => {
    assert.ok(earnedBadges(progress()).includes("allLevels"));
    assert.ok(!earnedBadges(progress({ wins: 17 })).includes("allLevels"));
  });

  test("it counts what's done and what's still to win", () => {
    const p = progress();
    const s = endingSummary(p, earnedBadges(p), BADGES.length);
    assert.deepEqual([s.levels, s.stars, s.maxStars, s.starsLeft, s.goals, s.maxGoals], [18, 40, 54, 14, 20, 30]);
    assert.equal(s.badges, earnedBadges(p).length);
    assert.equal(s.everything, false);
  });

  test("everything: every star, goal and badge", () => {
    const p = progress({ stars: 54, goals: 30 });
    const s = endingSummary(p, earnedBadges(p), BADGES.length);
    assert.equal(s.starsLeft, 0);
    assert.equal(s.everything, true);
  });

  test("the stars still waiting are counted the way each language counts", () => {
    setLanguage("en");
    assert.match(t("ending.moreStars", { n: 1 }), /^1 more star is/);
    assert.match(t("ending.moreStars", { n: 14 }), /^14 more stars are/);
    setLanguage("ru");
    assert.match(t("ending.moreStars", { n: 1 }), /1 звезда ждёт/);
    assert.match(t("ending.moreStars", { n: 3 }), /3 звезды ждут/);
    assert.match(t("ending.moreStars", { n: 14 }), /14 звёзд ждут/);
    setLanguage("uk");
    assert.match(t("ending.moreStars", { n: 21 }), /21 зірка чекає/);
    setLanguage("en");
  });
});
