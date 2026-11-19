import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICTIONARIES, LANGUAGES, LANGUAGE_KEY, detectLanguage, formatMoney, formatNumber, setLanguage, t, translatePage } from "../src/js/i18n.mjs";
import { findLevel, levels } from "../src/js/level.mjs";
import { LEVEL_HINTS, failureTip, levelHint } from "../src/js/hints.mjs";
import { materials } from "../src/js/materials/index.mjs";
import { CHALLENGE_KINDS } from "../src/js/challenges.mjs";
import { SANDBOX_DEFAULT, findSandboxLevel, sandboxId } from "../src/js/sandbox.mjs";
import { createGame } from "./helpers.mjs";

const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
const en = DICTIONARIES.en;

/** The page's keys, each with its English and whether it is markup (data-i18n-html). */
function pageKeys() {
  /** @type {Map<string, { english: string, markup: boolean }>} */
  const keys = new Map();
  for (const m of html.matchAll(/<(\w+)[^>]*?\sdata-i18n(-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    keys.set(m[3], { english: m[4].trim(), markup: m[2] === "-html" });
  }
  for (const m of html.matchAll(/(?:title|aria-label)="([^"]*)" data-i18n-(?:title|aria)="([^"]+)"/g)) {
    if (!keys.has(m[2])) keys.set(m[2], { english: m[1], markup: false });
  }
  return keys;
}

/** English that lives with the data, by key. */
function dataKeys() {
  /** @type {Map<string, string>} */
  const keys = new Map();
  for (const level of levels) {
    keys.set(`level.${level.id}.name`, level.__name);
    keys.set(`level.${level.id}.description`, level.__description);
  }
  for (const [id, text] of Object.entries(LEVEL_HINTS)) keys.set(`hint.${id}`, text);
  for (const m of Object.values(materials)) keys.set(`material.${m.name}`, m.__label);
  return keys;
}

/** Every key a translation must have. */
function allKeys() {
  return new Set([...Object.keys(en), ...pageKeys().keys(), ...dataKeys().keys()]);
}

/** @param {import("../src/js/i18n.mjs").Message} message */
const placeholders = (message) => new Set((typeof message === "string" ? [message] : Object.values(message))
  .flatMap(text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1].charAt(0).toLowerCase() + m[1].slice(1))));

/** @param {string} text */
const tags = (text) => [...text.matchAll(/<\/?(\w+)[^>]*>/g)].map(m => m[0]);

afterEach(() => setLanguage("en"));

describe("translations", () => {
  test("three languages, each named in itself", () => {
    assert.deepEqual(Object.keys(LANGUAGES), ["en", "ru", "uk"]);
    assert.deepEqual(Object.keys(DICTIONARIES), Object.keys(LANGUAGES));
  });

  test("the page's text is tagged: keys found, and English for each", () => {
    const page = pageKeys();
    assert.ok(page.size > 100, `${page.size} keys`);
    for (const [key, { english }] of page) assert.ok(english.length > 0, key);
  });

  for (const lang of ["ru", "uk"]) {
    const dict = DICTIONARIES[lang];

    test(`${lang}: has every key, and nothing that isn't one`, () => {
      const want = allKeys();
      assert.deepEqual([...want].filter(k => !(k in dict)), [], "missing");
      assert.deepEqual(Object.keys(dict).filter(k => !want.has(k)), [], "not used anywhere");
    });

    test(`${lang}: placeholders are ones the English has, and counted messages have every form`, () => {
      for (const [key, english] of Object.entries(en)) {
        const message = dict[key];
        if (message === undefined) continue;
        const extra = [...placeholders(message)].filter(p => !placeholders(english).has(p));
        assert.deepEqual(extra, [], `${key}: placeholders the code doesn't fill`);
        assert.equal(typeof message, typeof english, `${key}: counted in one language and not the other`);
        if (typeof message === "object") {
          for (const form of ["one", "few", "many"]) assert.ok(message[form], `${key}: no "${form}" form`);
        }
      }
    });

    test(`${lang}: the page's markup is kept, and plain text stays plain`, () => {
      for (const [key, { english, markup }] of pageKeys()) {
        const text = dict[key];
        assert.equal(typeof text, "string", key);
        if (markup) assert.deepEqual(tags(text), tags(english), `${key}: the same tags`);
        else assert.ok(!/[<>]/.test(text), `${key}: no markup`);
      }
      for (const key of dataKeys().keys()) assert.equal(typeof dict[key], "string", key);
    });

    test(`${lang}: every message is translated (none is left in English)`, () => {
      // short ones that read the same in both: units, numbers, symbols and key names
      const same = new Set(["mode.replay", "tooltip.title", "place.what", "convoy.item", "sandbox.metres", "time"]);
      for (const key of allKeys()) {
        const english = en[key] ?? dataKeys().get(key) ?? pageKeys().get(key)?.english;
        if (same.has(key) || typeof english !== "string" || !/[a-z]{3}/i.test(english.replace(/<[^>]*>|\{\w+\}/g, ""))) continue;
        assert.notEqual(dict[key], english, key);
      }
    });
  }
});

describe("t", () => {
  test("English by default, with placeholders filled", () => {
    assert.equal(t("card.locked", { name: "Brook" }), "Win Brook to open");
    assert.equal(t("mode.members", { n: 1 }), "1 piece");
    assert.equal(t("mode.members", { n: 3 }), "3 pieces");
  });

  test("Russian and Ukrainian counting: one, few, many", () => {
    setLanguage("ru");
    assert.deepEqual([1, 3, 5, 21, 22, 25].map(n => t("mode.members", { n })),
      ["1 деталь", "3 детали", "5 деталей", "21 деталь", "22 детали", "25 деталей"]);
    setLanguage("uk");
    assert.deepEqual([1, 3, 5, 11].map(n => t("mode.joints", { n })), ["1 точка", "3 точки", "5 точок", "11 точок"]);
  });

  test("{One} capitalises the param", () => {
    setLanguage("ru");
    assert.equal(t("mode.falling", { one: "грузовик" }), "Грузовик падает!");
  });

  test("a key a language lacks falls back to English, then to the key", () => {
    setLanguage("ru");
    assert.equal(t("no.such.key", {}, "Fallback"), "Fallback");
    assert.equal(t("no.such.key"), "no.such.key");
  });

  test("numbers and money are written the language's way", () => {
    assert.equal(formatMoney(16376.4), "$16,376");
    assert.equal(formatNumber(10.25, 1), "10.3");
    setLanguage("ru");
    assert.match(formatMoney(16376), /^\$16\s376$/);
    assert.equal(formatNumber(10.25, 1), "10,3");
  });

  test("setLanguage refuses a language it doesn't have", () => {
    assert.throws(() => setLanguage("fr"), /unknown language/);
  });
});

describe("the game in Russian and Ukrainian", () => {
  test("levels, their traffic and their hints", () => {
    setLanguage("ru");
    const creek = findLevel("creek");
    assert.equal(creek.name, "Речка");
    assert.match(creek.description, /два больших грузовика/);
    assert.equal(creek.convoySummary, "2 грузовика по 40 т");
    assert.equal(findLevel("downhill").convoySummary, "5 грузовиков по 40 т");
    assert.equal(findLevel("brook").convoySummary, "1 машина · 1 автобус");
    assert.equal(findLevel("branch-line").convoySummary, "Поезд 240 т: локомотив + 2 вагона");
    assert.equal(findLevel("freight").convoySummary, "Поезд 380 т: локомотив + 4 вагона");
    assert.equal(findLevel("mountain").convoySummary, "Поезд 520 т: локомотив + 6 вагонов");
    assert.deepEqual(creek.vehicleNoun, { one: "грузовик", many: "грузовики" });
    assert.match(levelHint("creek"), /лёгкой стали/);
    setLanguage("uk");
    assert.equal(findLevel("creek").convoySummary, "2 вантажівки по 40 т");
    assert.equal(findLevel("downhill").convoySummary, "5 вантажівок по 40 т");
    assert.equal(findLevel("viaduct").name, "Віадук");
    setLanguage("en");
    assert.equal(findLevel("creek").name, "Creek", "and back");
    assert.equal(findLevel("creek").convoySummary, "2 × 40 t trucks");
  });

  test("materials, challenges and failure advice", () => {
    setLanguage("ru");
    assert.equal(materials["steel-light"].label, "Лёгкая сталь");
    assert.match(CHALLENGE_KINDS.cost.label(16400), /^Стоимость не больше \$16\s400$/);
    assert.equal(CHALLENGE_KINDS.members.label(7), "Не больше 7 деталей");
    assert.equal(CHALLENGE_KINDS.light.name, "Лёгкий как пёрышко");
    assert.match(failureTip({ kind: "failed", roadAcross: false }, "rail"), /нужны рельсы/);
    assert.match(failureTip({ kind: "failed", failure: { kind: "steel", material: "steel", label: materials.steel.label, mode: "compression" } }), /\(сталь\)/);
    setLanguage("uk");
    assert.equal(materials.cable.label, "Трос");
    assert.equal(CHALLENGE_KINDS.members.label(3), "Не більше 3 деталей");
  });

  test("a sandbox describes itself in the language", () => {
    const spec = { ...SANDBOX_DEFAULT, gap: 80, far: -6, rock: true, traffic: "trucks4" };
    const level = findSandboxLevel(sandboxId(spec));
    setLanguage("uk");
    assert.equal(level.name, "Пісочниця");
    assert.equal(level.description, "Твій власний рівень: проліт 80 м, інший берег на 6 м нижчий, скеля посередині. Чотири вантажівки по 40 т.");
  });

  test("what the game reports while you build is in the language", () => {
    setLanguage("uk");
    const game = createGame("creek");
    const press = (key) => game.__handleKeyDown({ key, target: null, preventDefault() { } });
    press("j");
    press("j"); // the anchor at the edge of the gap
    press("Enter");
    for (let i = 0; i < 4; i++) press("ArrowRight");
    press("ArrowUp");
    assert.match(game.placementInfo.label, /^[А-ЯІЇЄҐ]/u, "the material's name");
  });
});

describe("choosing the language", () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const withBrowser = (languages, fn) => {
    Object.defineProperty(globalThis, "navigator", { value: { languages, language: languages[0] }, configurable: true });
    try { fn(); } finally {
      if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
      else delete globalThis.navigator;
      localStorage.clear();
    }
  };

  test("the browser's first language we have, else English", () => {
    withBrowser(["uk-UA", "en"], () => assert.equal(detectLanguage(), "uk"));
    withBrowser(["fr-FR", "ru"], () => assert.equal(detectLanguage(), "ru"));
    withBrowser(["de-DE", "fr"], () => assert.equal(detectLanguage(), "en"));
  });

  test("the one chosen in Settings wins", () => {
    withBrowser(["ru-RU"], () => {
      localStorage.setItem(LANGUAGE_KEY, "en");
      assert.equal(detectLanguage(), "en");
      localStorage.setItem(LANGUAGE_KEY, "klingon");
      assert.equal(detectLanguage(), "ru", "something unknown is ignored");
    });
  });
});

describe("translatePage", () => {
  /** A stand-in for the page: elements with the given attributes. */
  function page(elements) {
    return {
      elements,
      querySelectorAll(selector) {
        const attr = selector.slice(1, -1);
        return elements.filter(el => attr in el.attrs);
      },
    };
  }
  const element = (attrs) => ({
    attrs, textContent: "English", innerHTML: "English",
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; },
  });

  test("swaps text, markup and attributes; English is left as written", () => {
    const text = element({ "data-i18n": "ui.test" });
    const markup = element({ "data-i18n-html": "ui.mouse6" });
    const titled = element({ "data-i18n-title": "ui.undoTitle", "data-i18n-aria": "ui.undo" });
    const unknown = element({ "data-i18n": "no.such.key" });
    const root = page([text, markup, titled, unknown]);
    translatePage(root);
    assert.equal(text.textContent, "English", "English: nothing to do");
    setLanguage("ru");
    translatePage(root);
    assert.equal(text.textContent, "Проверить");
    assert.equal(markup.innerHTML, "<kbd>Shift</kbd>+тащи");
    assert.equal(titled.attrs.title, "Отменить (Ctrl+Z)");
    assert.equal(titled.attrs["aria-label"], "Отменить");
    assert.equal(unknown.textContent, "English", "a key without a translation keeps its English");
  });
});
