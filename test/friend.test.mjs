import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers.mjs";
import { FRIEND_KEY, clearFriendGoal, friendGoal, friendInHash, friendUrl, judgeFriend, setFriendGoal } from "../src/js/friend.mjs";

describe("challenge a friend", () => {
  test("the link holds the level and the price, not the bridge, and reads back", () => {
    const url = friendUrl("https://example.com/game/", "long-span", 46412.7);
    assert.equal(url, "https://example.com/game/#beat=long-span~46413");
    assert.deepEqual(friendInHash(url.slice(url.indexOf("#"))), { level: "long-span", cost: 46413 });
  });

  test("damaged links are not challenges", () => {
    for (const hash of ["#beat=", "#beat=creek", "#beat=creek~", "#beat=creek~-5", "#beat=creek~0", "#beat=creek~1e9", "#beat=%E0%A4%A~100", "#bridge=abc"]) {
      assert.equal(friendInHash(hash), undefined, hash);
    }
  });

  test("a friend's price is a goal on the level until it is beaten, then marked beaten", () => {
    localStorage.clear();
    assert.equal(judgeFriend("creek", 10000), undefined, "no friend, nothing to judge");
    setFriendGoal("creek", 16400);
    assert.deepEqual(friendGoal("creek"), { cost: 16400, beaten: false });
    assert.deepEqual(judgeFriend("creek", 16400), { goal: { cost: 16400, beaten: false }, beat: false, isNew: false }, "the same price doesn't beat it");
    assert.equal(judgeFriend("creek", 16000)?.isNew, true);
    assert.deepEqual(friendGoal("creek"), { cost: 16400, beaten: true });
    assert.equal(judgeFriend("creek", 15000)?.isNew, false, "beaten once");
    setFriendGoal("creek", 14000);
    assert.deepEqual(friendGoal("creek"), { cost: 14000, beaten: false }, "a new dare replaces it");
    clearFriendGoal("creek");
    assert.equal(friendGoal("creek"), undefined);
    localStorage.setItem(FRIEND_KEY, "[1, 2]");
    assert.equal(friendGoal("creek"), undefined);
  });

  test("resetting progress forgets friends' prices", () => {
    const game = createGame("brook");
    setFriendGoal("brook", 7000);
    game.resetProgress();
    assert.equal(localStorage.getItem(FRIEND_KEY), null);
  });
});
