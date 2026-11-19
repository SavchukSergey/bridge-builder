// Real bridges: after a level, a famous bridge built on the same idea, with a drawing and one
// fact. Their words are realBridge.<id>.name / .place / .fact in locales/; the drawings are
// simple pictures of each kind of bridge, drawn here, not likenesses.

/**
 * @typedef {"slabs" | "truss" | "suspension" | "arch" | "tall" | "arches" | "lifting"} BridgeKind
 * @typedef {{ id: string, level: string, kind: BridgeKind }} RealBridge
 */

/** In the order of their levels. @type {RealBridge[]} */
export const REAL_BRIDGES = [
  { id: "tarr", level: "brook", kind: "slabs" },
  { id: "forth", level: "triangles", kind: "truss" },
  { id: "golden", level: "hang", kind: "suspension" },
  { id: "brooklyn", level: "creek", kind: "suspension" },
  { id: "millau", level: "viaduct", kind: "tall" },
  { id: "sydney", level: "gorge", kind: "arch" },
  { id: "glenfinnan", level: "mountain", kind: "arches" },
];

/** The real bridge shown after a level, if it has one. @param {string} levelId */
export const realBridgeFor = (levelId) => REAL_BRIDGES.find(b => b.level === levelId);

/**
 * Points of a curve y = f(x) from x0 to x1, as an SVG path.
 * @param {(x: number) => number} f @param {number} x0 @param {number} x1
 */
function curve(f, x0, x1, steps = 24) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * i / steps;
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${f(x).toFixed(1)}`;
  }
  return d;
}

/** What each kind of bridge looks like: SVG shapes in a 200 x 80 box (the water is drawn for all). */
const DRAWINGS = {
  // flat stones on low stone piers
  slabs: () => {
    let s = "";
    for (let x = 20; x < 180; x += 32) s += `<rect class="stone" x="${x}" y="48" width="30" height="5" rx="1.5" />`;
    for (let x = 48; x < 180; x += 32) s += `<rect class="stone" x="${x - 3}" y="53" width="8" height="12" rx="1" />`;
    return `<path class="bank" d="M0 50h20v30H0zM200 50h-20v30h20z" />${s}`;
  },
  // three giant steel diamonds of triangles carrying a railway
  truss: () => {
    let s = `<path class="bank" d="M0 46h12v34H0zM200 46h-12v34h12z" /><path class="deck" d="M10 46h180" />`;
    for (const c of [40, 100, 160]) {
      s += `<path class="steel" d="M${c - 28} 46 L${c} 14 L${c + 28} 46 L${c} 60 Z M${c} 14 V60 M${c - 14} 30 L${c} 46 L${c + 14} 30 M${c - 14} 53 L${c} 46 L${c + 14} 53" />`;
      s += `<path class="stone" d="M${c - 5} 60h10v20h-10z" />`;
    }
    return s;
  },
  // a road hung from two cables over two tall towers
  suspension: () => {
    // (y grows downwards: the cable is high at the towers and sags to just above the road)
    const sag = (/** @type {number} */ x) => 40 - 0.0128 * (x - 100) ** 2;
    const cable = curve(sag, 50, 150);
    let hangers = "";
    for (let x = 58; x < 150; x += 8) hangers += `M${x} ${sag(x).toFixed(1)}V44`;
    return `<path class="bank" d="M0 44h14v36H0zM200 44h-14v36h14z" />`
      + `<path class="cable" d="M8 44 L50 8 ${cable.replace(/^M/, "L")} L192 44" /><path class="hanger" d="${hangers}" />`
      + `<path class="deck" d="M0 44h200" /><path class="tower" d="M50 6V64M150 6V64" />`;
  },
  // one huge steel arch with the road through it
  arch: () => {
    const top = curve(x => 66 - 52 * (1 - ((x - 100) / 75) ** 2), 25, 175);
    const low = curve(x => 66 - 40 * (1 - ((x - 100) / 75) ** 2), 25, 175);
    let posts = "";
    for (let x = 35; x < 170; x += 10) {
      const y = 66 - 40 * (1 - ((x - 100) / 75) ** 2);
      posts += `M${x} ${Math.min(y, 40).toFixed(1)}V${Math.max(y, 40).toFixed(1)}`;
    }
    return `<path class="bank" d="M0 40h25v40H0zM200 40h-25v40h25z" /><path class="steel" d="${top}${low.replace(/^M/, "M")}${posts}" />`
      + `<path class="deck" d="M0 40h200" /><path class="stone" d="M14 22h12v18H14zM174 22h12v18h-12z" />`;
  },
  // a road very high up on tall legs, with cables fanning from short masts
  tall: () => {
    let s = `<path class="bank" d="M0 24h10v56H0zM200 24h-10v56h10z" /><path class="deck" d="M0 24h200" />`;
    for (let x = 28; x < 180; x += 24) {
      s += `<path class="stone" d="M${x - 2.5} 24 L${x - 4} 80 H${x + 4} L${x + 2.5} 24 Z" />`;
      s += `<path class="tower" d="M${x} 24V8" /><path class="hanger" d="M${x} 9 L${x - 10} 24 M${x} 9 L${x + 10} 24 M${x} 12 L${x - 6} 24 M${x} 12 L${x + 6} 24" />`;
    }
    return s;
  },
  // a curving row of round stone arches carrying a railway
  arches: () => {
    let s = `<path class="bank" d="M0 30h12v50H0zM200 30h-12v50h12z" />`;
    let d = "M12 30H188V80";
    for (let x = 188; x > 12; x -= 16) d += `H${x - 2}V52a6 6 0 0 0-12 0V80`;
    s += `<path class="stone" d="${d}H12Z" fill-rule="evenodd" /><path class="deck" d="M10 30h180" />`;
    s += `<path class="train" d="M60 22h34v7H60zM96 23h26v6H96zM124 23h26v6h-26z" />`;
    return s;
  },
  // two towers, and the road between them split in two leaves lifted up for a ship
  lifting: () => `<path class="bank" d="M0 46h40v34H0zM200 46h-40v34h40z" />`
    + `<path class="stone" d="M52 12h16v52H52zM132 12h16v52h-16z" /><path class="tower" d="M50 12l10-8 10 8M130 12l10-8 10 8" />`
    + `<path class="deck" d="M0 46h60M140 46h60M60 18h80" /><path class="steel" d="M68 46 L86 14 M132 46 L114 14" />`
    + `<path class="ship" d="M84 62h32l-4 6H88zM99 62V44l10 12h-10" />`,
};

/**
 * A drawing of a kind of bridge, as an SVG element's markup.
 * @param {BridgeKind} kind
 * @param {string} [label] its accessible name; without one it's decoration
 */
export function bridgeDrawing(kind, label) {
  const named = label ? `role="img" aria-label="${label.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}"` : 'aria-hidden="true"';
  return `<svg class="real-drawing" viewBox="0 0 200 80" ${named}><rect class="sky" width="200" height="80" />`
    + `<path class="water" d="M0 64h200v16H0z" />${DRAWINGS[kind]()}</svg>`;
}
