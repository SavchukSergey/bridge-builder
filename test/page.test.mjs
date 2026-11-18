import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/js/main.js", import.meta.url), "utf8");

/** Element classes the page looks up, and the tags they match. */
const TAGS = {
  HTMLElement: null, // any element
  HTMLDivElement: "div",
  HTMLSpanElement: "span",
  HTMLButtonElement: "button",
  HTMLInputElement: "input",
  HTMLSelectElement: "select",
  HTMLCanvasElement: "canvas",
  HTMLDetailsElement: "details",
  HTMLParagraphElement: "p",
  HTMLLabelElement: "label",
};

test("every element main.js looks up exists in index.html with the expected tag", () => {
  const lookups = [...main.matchAll(/byId\('([\w-]+)', (HTML\w+)\)/g)];
  assert.ok(lookups.length > 20, "found the lookups");
  for (const [, id, type] of lookups) {
    assert.ok(type in TAGS, `${type} isn't one this test knows`);
    const tag = html.match(new RegExp(`<(\\w+)[^>]*\\bid="${id}"`))?.[1];
    assert.ok(tag, `#${id} is missing from index.html`);
    const expected = TAGS[type];
    if (expected) assert.equal(tag, expected, `#${id} is a <${tag}>, but main.js expects ${type}`);
  }
});

test("ids in index.html are unique", () => {
  const ids = [...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, []);
});
