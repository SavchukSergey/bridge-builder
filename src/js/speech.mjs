// Reading text aloud with the browser's own voices, for players who'd rather listen than read.
//
// A button with data-speak="#a, #b" reads the visible text of those elements, in order, in the
// game's language. Buttons are hidden when the device has no voice for that language. A second
// click (or reading something else) stops what is being read.

/**
 * The best voice for a language: one made for it, a local one before one from the network.
 * @template {{ lang: string, localService?: boolean, default?: boolean }} V
 * @param {string} lang e.g. "uk"
 * @param {readonly V[]} voices
 * @returns {V | undefined}
 */
export function voiceFor(lang, voices) {
  const want = lang.toLowerCase();
  const matching = voices.filter(v => v.lang.toLowerCase().replace("_", "-").split("-")[0] === want);
  return matching.find(v => v.localService && v.default)
    ?? matching.find(v => v.localService)
    ?? matching[0];
}

/**
 * The text to read for a list of selectors: each visible element's text, joined into sentences.
 * @param {ParentNode} root
 * @param {string} selectors
 */
export function textToRead(root, selectors) {
  const parts = [];
  for (const sel of selectors.split(",")) {
    const el = root.querySelector(sel.trim());
    if (!el || el.closest("[hidden]")) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) parts.push(/[.!?…:]$/.test(text) ? text : `${text}.`);
  }
  return parts.join(" ");
}

/**
 * Wires up every [data-speak] button in the page.
 * @param {Document} doc
 * @param {string} lang
 */
export function setUpReading(doc, lang) {
  const synth = doc.defaultView?.speechSynthesis;
  const buttons = () => /** @type {HTMLElement[]} */ ([...doc.querySelectorAll("[data-speak]")]);
  /** @type {SpeechSynthesisVoice | undefined} */
  let voice;
  const refresh = () => {
    voice = synth ? voiceFor(lang, synth.getVoices()) : undefined;
    for (const b of buttons()) b.classList.toggle("no-voice", !voice);
  };
  refresh();
  if (!synth) return;
  synth.addEventListener?.("voiceschanged", refresh);

  /** @type {HTMLElement | undefined} */
  let reading;
  const stop = () => {
    synth.cancel();
    reading?.classList.remove("reading");
    reading = undefined;
  };
  doc.addEventListener("click", (ev) => {
    const button = /** @type {Element} */ (ev.target)?.closest?.("[data-speak]");
    if (!(button instanceof HTMLElement)) return;
    const again = reading === button;
    stop();
    button.blur();
    if (again || !voice) return;
    const text = textToRead(doc, button.dataset.speak ?? "");
    if (!text) return;
    const say = new SpeechSynthesisUtterance(text);
    say.voice = voice;
    say.lang = voice.lang;
    say.rate = 0.95;
    const done = () => {
      if (reading === button) stop();
    };
    say.addEventListener("end", done);
    say.addEventListener("error", done);
    reading = button;
    button.classList.add("reading");
    synth.speak(say);
  });
  // what was being read is gone: stop
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) stop(); });
  return stop;
}
