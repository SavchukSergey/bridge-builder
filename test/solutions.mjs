// Failing and alternative designs, for calibrating budgets and testing failures. The
// reference bridges themselves live in the game (src/js/solutions.mjs), for the hints.

import { Builder, LEAN, aFrame, bareDeck, ledgeStruts, suspension, truss, trussDeck } from "../src/js/solutions.mjs";

export { Builder, bareDeck, solutions, suspension, trussDeck } from "../src/js/solutions.mjs";

/** Alternative designs, for calibrating budgets. */
export const alternatives = {
  creek: {
    "bare deck": (level) => bareDeck(level, -20, 10, 20, 10),
    "truss h6 steel": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 6 }); return b.build(); },
    "truss h6 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 6, diagonal: "cable" }); return b.build(); },
    "truss h4 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -20, 10, 20, 10, { h: 4, diagonal: "cable" }); return b.build(); },
    "suspension top 16 sag 4": (level) => suspension(level, 20, 16, 4),
    "suspension top 14 sag 3": (level) => suspension(level, 20, 14, 3),
  },
  canyon: {
    "suspension top 20 sag 6": (level) => suspension(level, 40, 20, 6),
    "truss h8 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -40, 10, 40, 10, { h: 8, diagonal: "cable" }); return b.build(); },
  },
  step: {
    "bare ramp": (level) => bareDeck(level, -30, 10, 30, 18),
    "truss h6 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 6, diagonal: "cable" }); return b.build(); },
    "truss h4 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 4, diagonal: "cable" }); return b.build(); },
    "truss h8 cable diag": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 8, diagonal: "cable" }); return b.build(); },
    "truss h6 steel": (level) => { const b = new Builder(level); trussDeck(b, -30, 10, 30, 18, { h: 6 }); return b.build(); },
  },
  ledges: {
    "bare deck": (level) => bareDeck(level, -25, 10, 25, 10),
    "two struts per side": (level) => ledgeStruts(level, [[-20, 0], [20, 0]], [-15, -5, 5, 15]),
    "light suspension": (level) => suspension(level, 25, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
  },
  heavy: {
    "creek's light suspension": (level) => suspension(level, 20, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
    "truss h6 cable diag": (level) => truss(level, -20, 10, 20, 10, { h: 6, ...LEAN }),
  },
  downhill: {
    "bare ramp": (level) => bareDeck(level, -30, 18, 30, 8),
    "truss h4 lean": (level) => truss(level, -30, 18, 30, 8, { h: 4, ...LEAN }),
  },
  rush: {
    "bare deck": (level) => bareDeck(level, -30, 10, 30, 10),
    "truss h4 lean": (level) => truss(level, -30, 10, 30, 10, { h: 4, ...LEAN }),
  },
  "long-span": {
    "bare deck": (level) => bareDeck(level, -50, 10, 50, 10),
    "suspension 22/6": (level) => suspension(level, 50, 22, 6, { hanger: "cable-thin" }),
  },
  viaduct: {
    "bare deck": (level) => bareDeck(level, -90, 10, 90, 10),
  },
  "branch-line": {
    "bare rail": (level) => bareDeck(level, -20, 10, 20, 10, "rail"),
    // the creek's answer as it was, with a road deck: the train has no rail to run on
    "road suspension": (level) => suspension(level, 20, 14, 3, { tower: "steel-light", hanger: "cable-thin" }),
  },
  freight: {
    "bare rail": (level) => bareDeck(level, -40, 10, 40, 10, "rail"),
    "truss h6 lean": (level) => truss(level, -40, 10, 40, 10, { h: 6, ...LEAN, deck: "rail" }),
    "suspension top 20 sag 6": (level) => suspension(level, 40, 20, 6, { deck: "rail" }),
  },
  mountain: {
    "bare rail + A-frame": (level) => {
      const b = new Builder(level);
      const deck = [];
      for (let x = -60; x <= 60; x += 10) deck.push(b.joint(x, 10));
      b.chain(deck, "rail");
      aFrame(b, -4, 4, -6, deck[6]);
      return b.build();
    },
  },
  gorge: {
    "bare deck": (level) => bareDeck(level, -40, 10, 40, 10),
    "truss h8 lean": (level) => truss(level, -40, 10, 40, 10, { h: 8, ...LEAN }),
  },
  pier: {
    "two trusses h6 + A-frame": (level) => {
      const b = new Builder(level);
      const left = trussDeck(b, -60, 10, 0, 10, { h: 6, diagonal: "cable" });
      trussDeck(b, 0, 10, 60, 10, { h: 6, diagonal: "cable" });
      b.link(b.joint(-4, -6), left.deck.at(-1), "steel");
      b.link(b.joint(4, -6), left.deck.at(-1), "steel");
      return b.build();
    },
    "two trusses h4 + A-frame": (level) => {
      const b = new Builder(level);
      const left = trussDeck(b, -60, 10, 0, 10, { h: 4, diagonal: "cable" });
      trussDeck(b, 0, 10, 60, 10, { h: 4, diagonal: "cable" });
      b.link(b.joint(-4, -6), left.deck.at(-1), "steel");
      b.link(b.joint(4, -6), left.deck.at(-1), "steel");
      return b.build();
    },
    "one truss h8, no pier": (level) => { const b = new Builder(level); trussDeck(b, -60, 10, 60, 10, { h: 8, diagonal: "cable" }); return b.build(); },
    "bare deck + A-frame": (level) => {
      const b = new Builder(level);
      const deck = []; for (let x = -60; x <= 60; x += 10) deck.push(b.joint(x, 10));
      b.chain(deck, "road");
      b.link(b.joint(-4, -6), deck[6], "steel"); b.link(b.joint(4, -6), deck[6], "steel");
      return b.build();
    },
  },
};
