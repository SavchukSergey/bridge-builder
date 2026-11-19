import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { solutions } from "./solutions.mjs";
import { levels } from "../src/js/level.mjs";
import { DAILY_KEY, dailyFor, dailyMet, dayOf, daysDone, markDone, streak, twistsFor } from "../src/js/daily.mjs";
import { CHALLENGE_KINDS } from "../src/js/challenges.mjs";

describe("the daily challenge", () => {
  test("days are the player's local dates", () => {
    assert.equal(dayOf(new Date(2026, 10, 9, 23, 59)), "2026-11-09");
    assert.equal(dayOf(new Date(2027, 0, 1, 0, 1)), "2027-01-01");
  });

  test("the same all day, only among open levels, and it changes from day to day", () => {
    const open = levels.slice(0, 5);
    assert.deepEqual(dailyFor("2026-11-19", open), dailyFor("2026-11-19", open));
    const month = Array.from({ length: 30 }, (_, i) => dailyFor(`2026-11-${String(i + 1).padStart(2, "0")}`, open));
    assert.ok(month.every(d => d && open.some(l => l.id === d.level) && d.kind in CHALLENGE_KINDS));
    assert.ok(new Set(month.map(d => `${d?.level} ${d?.kind}`)).size > 5, "varied");
    assert.equal(dailyFor("2026-11-19", [])?.level, undefined);
    assert.equal(dailyFor("2026-11-19", [levels[0]])?.level, "brook", "just the first level open");
  });

  test("every twist on every level is met by its reference bridge", () => {
    for (const level of levels) {
      const game = createGame(level.id);
      game.importStructure(solutions[level.id](level));
      game.setSimulationRunning(true);
      for (let f = 0; f < 120 * 60 && !game.result; f++) game.tick();
      assert.equal(game.result?.kind, "success", level.id);
      for (const [kind, param] of twistsFor(level)) {
        assert.ok(dailyMet({ date: "", level: level.id, kind, param }, game.bridgeStats), `${level.id}: ${kind} ${param}`);
      }
    }
  });

  test("days done make a streak, up to today or, before today's is done, yesterday", () => {
    localStorage.clear();
    assert.equal(streak("2026-11-19"), 0);
    for (const day of ["2026-11-15", "2026-11-17", "2026-11-18"]) markDone(day);
    assert.equal(streak("2026-11-19"), 2, "yesterday and the day before; today still to do");
    markDone("2026-11-19");
    markDone("2026-11-19");
    assert.equal(streak("2026-11-19"), 3);
    assert.equal(daysDone().length, 4);
    assert.equal(streak("2026-11-21"), 0, "a day missed");
    markDone("2026-12-01");
    assert.equal(streak("2026-12-01"), 1, "across a month");
    localStorage.setItem(DAILY_KEY, "{oops");
    assert.deepEqual(daysDone(), []);
  });

  test("resetting progress forgets the streak", () => {
    const game = createGame("brook");
    markDone("2026-11-19");
    game.resetProgress();
    assert.equal(localStorage.getItem(DAILY_KEY), null);
  });
});
