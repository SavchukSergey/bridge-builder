// What every window (settings, result, levels, ...) shares, whoever opens it: the keyboard
// stays in the window on top, and goes back to where it was when the window closes. Each
// window is a hidden overlay holding an element with role="dialog" and aria-modal="true".

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** @returns {HTMLElement[]} the open windows, in page order: the last one is on top */
function openDialogs() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return []; // no page (the tests)
  return /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[aria-modal="true"]')])
    .filter(d => !d.closest("[hidden]"));
}

/** Whether a window is open, so keys for the bridge behind it should do nothing. */
export const dialogOpen = () => openDialogs().length > 0;

/** @param {HTMLElement} root @returns {HTMLElement[]} what Tab can reach in it */
function focusables(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)])
    // tabindex -1: one of a group with a single stop, like the level cards
    .filter(el => el.tabIndex >= 0 && !el.closest("[hidden]") && !(/** @type {any} */ (el).disabled) && el.getClientRects().length > 0);
}

/**
 * Starts watching the windows: call once, after the page is built.
 * @param {HTMLElement[]} overlays - the hidden containers the windows are in
 */
export function watchDialogs(overlays) {
  /** @type {Element | null} */
  let current = document.activeElement;
  /** @type {Element | null} */
  let previous = null;
  document.addEventListener("focusin", (ev) => {
    if (ev.target === current) return;
    previous = current;
    current = /** @type {Element} */ (ev.target);
  });

  /** @type {Map<HTMLElement, Element | null>} where the focus was when each window opened */
  const openers = new Map();
  const observer = new MutationObserver((records) => {
    for (const overlay of new Set(records.map(r => /** @type {HTMLElement} */ (r.target)))) {
      if (!overlay.hidden && !openers.has(overlay)) {
        // its code may already have moved the focus in: then it was on the one before
        openers.set(overlay, current && overlay.contains(current) ? previous : current);
      } else if (overlay.hidden && openers.has(overlay)) {
        const opener = openers.get(overlay);
        openers.delete(overlay);
        const lost = document.activeElement === document.body || overlay.contains(document.activeElement);
        if (lost && opener instanceof HTMLElement && opener !== document.body && opener.isConnected && !opener.closest("[hidden]")) {
          opener.focus({ preventScroll: true });
        }
      }
    }
  });
  for (const overlay of overlays) observer.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });

  // Tab goes round the window on top, never to the page behind it
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab") return;
    const top = openDialogs().at(-1);
    if (!top) return;
    const items = focusables(top);
    if (!items.length) {
      ev.preventDefault();
      return;
    }
    const first = items[0], last = /** @type {HTMLElement} */ (items.at(-1));
    const active = document.activeElement;
    if (!top.contains(active)) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    } else if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  });
}
