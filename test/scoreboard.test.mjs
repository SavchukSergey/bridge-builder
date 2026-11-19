import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { PLAYER_KEY, PLAYER_MAX, SCORES_KEY, addScore, lastPlayer, players, scoresFor, undoScore } from "../src/js/scoreboard.mjs";

/** The place an added score got. @param {ReturnType<typeof addScore>} r */
const place = (r) => r && { place: r.place, of: r.of, better: r.better };

describe("the family scoreboard", () => {
  test("each player keeps their cheapest win on a level, cheapest first", () => {
    localStorage.clear();
    assert.deepEqual(place(addScore("creek", "Mum", 18000, 1)), { place: 1, of: 1, better: false });
    assert.deepEqual(place(addScore("creek", "Sam", 16400, 3)), { place: 1, of: 2, better: false });
    assert.deepEqual(place(addScore("creek", "mum", 19000, 1)), { place: 2, of: 2, better: false }, "not better: her $18,000 stays");
    assert.deepEqual(place(addScore("creek", "Mum", 16000, 3)), { place: 1, of: 2, better: true });
    assert.deepEqual(scoresFor("creek").map(s => [s.name, s.cost]), [["Mum", 16000], ["Sam", 16400]]);
    assert.equal(lastPlayer(), "Mum");
  });

  test("a score just added can be taken back: an earlier one comes back, or the name goes", () => {
    localStorage.clear();
    addScore("creek", "Mum", 18000, 1);
    const better = addScore("creek", "Mum", 16000, 3);
    assert.deepEqual(better?.before, { name: "Mum", cost: 18000, stars: 1 });
    undoScore("creek", "mum", better?.before);
    assert.deepEqual(scoresFor("creek"), [{ name: "Mum", cost: 18000, stars: 1 }]);
    const first = addScore("creek", "Sam", 16400, 3);
    assert.equal(first?.before, undefined);
    undoScore("creek", "Sam", first?.before);
    assert.deepEqual(scoresFor("creek").map(s => s.name), ["Mum"]);
  });

  test("names are tidied; an empty one isn't added", () => {
    localStorage.clear();
    assert.equal(addScore("brook", "   ", 6000, 3), undefined);
    addScore("brook", "  Grand   Dad  ", 6000, 3);
    addScore("brook", "x".repeat(40), 6000, 3);
    assert.deepEqual(scoresFor("brook").map(s => s.name), ["Grand Dad", "x".repeat(PLAYER_MAX)]);
  });

  test("players are ranked by stars, then levels; cheapest counts the levels they lead", () => {
    localStorage.clear();
    addScore("brook", "Sam", 6000, 3);
    addScore("brook", "Mum", 6500, 2);
    addScore("creek", "Mum", 16000, 3);
    addScore("canyon", "Mum", 40000, 1);
    addScore("nope", "Dad", 1, 3);
    assert.deepEqual(players(["brook", "creek", "canyon"]), [
      { name: "Mum", levels: 3, stars: 6, cheapest: 2 },
      { name: "Sam", levels: 1, stars: 3, cheapest: 1 },
    ], "only the levels that count");
    localStorage.setItem(SCORES_KEY, JSON.stringify({ brook: [{ name: "Ok", cost: 1, stars: 1 }, { name: 5 }], creek: "bad" }));
    assert.deepEqual(players(["brook", "creek"]).map(p => p.name), ["Ok"]);
    localStorage.setItem(SCORES_KEY, "{oops");
    assert.deepEqual(scoresFor("brook"), []);
  });

  test("resetting progress forgets the scoreboard", () => {
    const game = createGame("brook");
    addScore("brook", "Sam", 6000, 3);
    game.resetProgress();
    assert.equal(localStorage.getItem(SCORES_KEY), null);
    assert.equal(localStorage.getItem(PLAYER_KEY), null);
  });
});
