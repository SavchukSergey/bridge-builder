/**
 * Translations: English, Russian and Ukrainian.
 *
 * `t(key, params)` looks the key up in the current language, then in English. Messages are
 * plain strings with `{name}` placeholders, or, for anything counted, an object of plural
 * forms (`one`, `few`, `many`, `other`, as Intl.PluralRules names them) chosen by `params.n`.
 * A placeholder written with a capital, `{One}`, is the param `one` with its first letter
 * capitalised. Numbers in params are formatted for the language (`10,5` in Russian).
 *
 * Where the English lives:
 * - text that main.js builds: locales/en.mjs
 * - the page's own text: index.html, each element tagged with data-i18n="key" (its text),
 *   data-i18n-html (its markup, for text with <kbd> in it), data-i18n-title or
 *   data-i18n-aria (those attributes); {@link translatePage} swaps them
 * - level names and descriptions, level hints and material names: next to their data, passed
 *   to `t` as the English fallback
 * test/i18n.test.mjs checks every other language has all of them.
 *
 * The language is chosen once, when the page loads ({@link detectLanguage}); changing it in
 * Settings reloads the page, so nothing is left in the old one.
 */

import en from "./locales/en.mjs";
import ru from "./locales/ru.mjs";
import uk from "./locales/uk.mjs";

/** @typedef {"en" | "ru" | "uk"} Language */
/** @typedef {string | Partial<Record<Intl.LDMLPluralRule, string>>} Message */

/** Each language by its own name, for the menu. */
export const LANGUAGES = /** @type {const} */ ({ en: "English", ru: "Русский", uk: "Українська" });

/** @type {Record<Language, Record<string, Message>>} */
export const DICTIONARIES = { en, ru, uk };

export const LANGUAGE_KEY = "bridge-builder:language";

/** @type {Language} */
let current = "en";

/** @param {unknown} lang @returns {lang is Language} */
export function isLanguage(lang) {
  return typeof lang === "string" && Object.hasOwn(LANGUAGES, lang);
}

/**
 * The language to show: the one chosen in Settings, else the first of the browser's
 * languages we have, else English.
 * @returns {Language}
 */
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch { /* storage blocked */ }
  const wanted = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of wanted) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isLanguage(base)) return base;
  }
  return "en";
}

/** @returns {Language} */
export function language() {
  return current;
}

/** @param {Language} lang */
export function setLanguage(lang) {
  if (!isLanguage(lang)) throw new Error(`unknown language "${lang}"`);
  current = lang;
}

/** Remembers the language chosen in Settings. @param {Language} lang */
export function saveLanguage(lang) {
  try { localStorage.setItem(LANGUAGE_KEY, lang); } catch { /* storage blocked */ }
}

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

/**
 * A number as the language writes it: `16,376` in English, `16 376` in Russian.
 * @param {number} value
 * @param {number} [digits] - fixed digits after the point
 */
export function formatNumber(value, digits) {
  const id = `${current}:${digits}`;
  let format = numberFormats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(current, digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(id, format);
  }
  return format.format(value);
}

/** Dollars, whole: `$16,376`; `$16 376` in Russian. @param {number} value */
export function formatMoney(value) {
  return "$" + formatNumber(Math.round(value));
}

/** @param {string} text */
export function capitalize(text) {
  return text.charAt(0).toLocaleUpperCase(current) + text.slice(1);
}

/** @type {Map<string, Intl.PluralRules>} */
const pluralRules = new Map();

/**
 * The form of a plural message for n.
 * @param {Partial<Record<Intl.LDMLPluralRule, string>>} forms
 * @param {number} n
 */
function pluralForm(forms, n) {
  let rules = pluralRules.get(current);
  if (!rules) pluralRules.set(current, rules = new Intl.PluralRules(current));
  return forms[rules.select(n)] ?? forms.other ?? forms.many ?? Object.values(forms)[0] ?? "";
}

/**
 * The message for a key, in the current language.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @param {Message} [english] - the English, for a key whose English lives with its data
 * @returns {string}
 */
export function t(key, params = {}, english) {
  const message = DICTIONARIES[current][key] ?? english ?? en[key];
  if (message === undefined) return key;
  const text = typeof message === "string" ? message : pluralForm(message, Number(params.n));
  return text.replace(/\{(\w+)\}/g, (whole, /** @type {string} */ name) => {
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    const upper = name !== lower && !(name in params);
    const value = params[upper ? lower : name];
    if (value === undefined) return whole;
    const out = typeof value === "number" ? formatNumber(value) : value;
    return upper ? capitalize(out) : out;
  });
}

/**
 * Puts the page's own text (the elements tagged data-i18n...) into the current language.
 * English is what the page is written in, so for English there is nothing to do.
 * @param {ParentNode} root
 */
export function translatePage(root) {
  if (current === "en") return;
  const dict = DICTIONARIES[current];
  /** @param {string} attr @param {(el: Element, text: string) => void} apply */
  const each = (attr, apply) => {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const text = dict[/** @type {string} */ (el.getAttribute(attr))];
      if (typeof text === "string") apply(el, text);
    }
  };
  each("data-i18n", (el, text) => { el.textContent = text; });
  each("data-i18n-html", (el, text) => { el.innerHTML = text; }); // our own dictionaries: trusted
  each("data-i18n-title", (el, text) => el.setAttribute("title", text));
  each("data-i18n-aria", (el, text) => el.setAttribute("aria-label", text));
}
