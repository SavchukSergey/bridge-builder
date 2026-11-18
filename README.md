# Bridge Builder

A bridge-building physics puzzle in the browser. Span a gap with steel beams, cables and
road deck, stay within budget, then press **Test** and watch a convoy of 40-tonne trucks
find out whether your design holds.

No build step and no dependencies at runtime: plain JavaScript modules and a canvas.

## Play

```sh
npm install
npm start
```

Then open <http://localhost:8080>.

### Goal

Get every truck to the chequered flag without spending more than the budget. Crossing
within budget earns one star; cheaper bridges earn two or three. Your cheapest win on each
level is remembered.

### Controls

| Action | How |
| --- | --- |
| Build a link | Click a joint, then click where the link should end |
| Move a joint | Drag it (anchors stay put) |
| Delete | Right-click a joint or link; right-click also cancels a link being placed |
| Place off the grid | Hold <kbd>Alt</kbd> |
| Mirror mode | <kbd>M</kbd> or the **Mirror** button: builds, deletes and moves symmetrically |
| Pan / zoom | Drag empty space / <kbd>Ctrl</kbd> + wheel |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> |
| Cancel | <kbd>Esc</kbd> |

Hover over any member to see its load: tension or compression in kN, and how much of its
strength it uses (during a test, also its peak). **Stress view** colours the whole bridge
by load.

### Materials

| Material | Price | Notes |
| --- | --- | --- |
| Road | $300/m | Concrete deck; the only thing trucks can drive on |
| Steel | $200/m | 20 × 20 cm; takes tension and compression |
| Light steel | $70/m | A quarter of the section and strength |
| Cable | $60/m | Wire rope; tension only, goes slack when pushed |
| Thin cable | $20/m | A fifth of the section and strength |

Links longer than 10 m are split into 10 m segments.

### Levels

1. **Creek**: 40 m, two trucks. A bare deck won't hold.
2. **Canyon**: 80 m, four trucks. The example bridge works but costs too much.
3. **Step up**: 60 m, with the far side 8 m higher.
4. **River pier**: 120 m, with a rock in the river to build a pier on.

## How it works

The bridge is a mass–spring model: every link is an axial spring with stiffness *EA/L*,
damped at 10 % of critical, with its mass split between its two joints. The simulation
uses semi-implicit Euler integration with an adaptive time step derived from the stiffest
link, and runs in real time. A link breaks when its stress exceeds its material's tensile
or compressive strength. Trucks are moving point loads that share their weight between the
joints of the road link under them.

```
src/
  index.html, css/      page and styles
  js/
    main.js             UI wiring
    game.js             modes, editing, undo, saves, the load test
    scene.js            the structure and the physics step
    engine/             joints and links
    materials/          material properties and looks
    level.mjs           level definitions, star thresholds
    vehicle.mjs         trucks
    scenery.mjs         background, ground, water
    effects.mjs         debris, dust, splashes
    audio.mjs           synthesized sound (Web Audio)
test/                   node:test suites
```

## Development

```sh
npm test            # unit and simulation tests (node:test)
npm run typecheck   # TypeScript checks the JSDoc types; nothing is compiled
npm run check       # both
```

GitHub Actions runs both on every push and pull request. A second workflow can publish
`src/` to GitHub Pages; see the comments in `.github/workflows/pages.yml` for how to turn
it on.

## Licence

ISC
