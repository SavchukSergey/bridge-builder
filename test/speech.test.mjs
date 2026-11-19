import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { textToRead, voiceFor } from "../src/js/speech.mjs";

describe("read aloud", () => {
  const voices = [
    { name: "net en", lang: "en-US", localService: false },
    { name: "local en", lang: "en-GB", localService: true },
    { name: "ru", lang: "ru_RU", localService: false },
    { name: "fr", lang: "fr-FR", localService: true, default: true },
  ];

  test("a voice in the game's language, a local one first", () => {
    assert.equal(voiceFor("en", voices)?.name, "local en");
    assert.equal(voiceFor("ru", voices)?.name, "ru", "an underscore in the tag is fine");
    assert.equal(voiceFor("uk", voices), undefined, "no Ukrainian voice: nothing to read with");
  });

  /** A tiny stand-in for the page: elements by id, some inside something hidden. */
  function page(elements) {
    return {
      querySelector: (sel) => {
        const e = elements[sel.replace("#", "")];
        return e && { textContent: e.text, closest: () => (e.hidden ? {} : null) };
      },
    };
  }

  test("reads the visible text of each element, as sentences", () => {
    const root = page({
      title: { text: "Oh no!" },
      text: { text: "  A truck   fell in." },
      tip: { text: "Hidden tip", hidden: true },
      hint: { text: "Stuck? A hint can help" },
      empty: { text: " " },
    });
    assert.equal(textToRead(root, "#title, #text, #tip, #empty, #hint, #missing"),
      "Oh no! A truck fell in. Stuck? A hint can help.");
  });
});
