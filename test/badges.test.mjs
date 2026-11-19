import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, earnedBadges, newBadges } from "../src/js/badges.mjs";
import { levels } from "../src/js/level.mjs";
import { challengesFor } from "../src/js/challenges.mjs";
import en from "../src/js/locales/en.mjs";

const none = { stars: 0, maxStars: 54, wins: 0, levels: 18, goals: 0, maxGoals: 30, train: false };

describe("badges", () => {
  test("none at the start, the first after one win", () => {
    assert.deepEqual(earnedBadges(none), []);
    assert.deepEqual(earnedBadges({ ...none, wins: 1, stars: 3 }), ["first"]);
  });

  test("everything done earns every badge", () => {
    const all = { stars: 54, maxStars: 54, wins: 18, levels: 18, goals: 30, maxGoals: 30, train: true };
    assert.deepEqual(earnedBadges(all), BADGES.map(b => b.id));
  });

  test("only the ones not told about yet are new", () => {
    assert.deepEqual(newBadges(["first", "stars10"], ["first"]), ["stars10"]);
    assert.deepEqual(newBadges(["first"], ["first"]), []);
  });

  test("every badge can be earned in the game as it is, and has a name and a how", () => {
    const real = levels.filter(level => !level.sandbox);
    const goals = real.reduce((n, level) => n + challengesFor(level.id).length, 0);
    assert.ok(goals >= 5, "enough extra goals for Goal getter");
    assert.ok(real.length * 3 >= 30, "enough stars for 30 stars");
    assert.ok(real.some(level => level.track === "rail"), "a railway level");
    for (const b of BADGES) {
      assert.equal(typeof en[`badge.${b.id}.name`], "string", b.id);
      assert.equal(typeof en[`badge.${b.id}.how`], "string", b.id);
    }
  });
});
