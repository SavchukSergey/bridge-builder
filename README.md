# Bridge Builder

A bridge-building physics puzzle in the browser. Span a gap with steel beams, cables and
road or rail deck, stay within budget, then press **Test** and watch the traffic (cars,
buses, 40-tonne trucks, a 200-tonne heavy hauler, and freight trains) find out whether your
design holds.

No build step and no dependencies at runtime: plain JavaScript modules and a canvas.

## Play

```sh
npm install
npm start
```

Then open <http://localhost:8080>.

### Goal

Get every vehicle to the chequered flag without spending more than the budget. Crossing
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

While placing a link, a readout next to the pointer shows its length, its cost and how much
of the budget would be left. Brook has a short step-by-step tutorial.

When a test fails, the results name the member that broke first and how (pulled apart or
crushed) with a tip, and it stays marked in red on the bridge until you change it.

On a phone or tablet: tap a joint, then tap (or slide a finger and lift) to place a link;
hold to delete, drag to pan, pinch to zoom. On a phone the materials sit in a sheet along
the bottom.

The load test runs at 0.5×, 1×, 2× or 4× (the speed button next to Test, or `[` and `]`);
the physics is the same at every speed, so the result is too. **Follow** (`F`) keeps the
camera on the traffic; it is on by default on phones.

**Share** (in the toolbar, and in the results after a win) copies a link that opens your
bridge: the design is packed into the address's `#bridge=` part, so nothing is uploaded.
A link to a level the player hasn't unlocked yet doesn't open.

Hover over any member to see its load: tension or compression in kN, and how much of its
strength it uses (during a test, also its peak). **Stress view** colours the whole bridge
by load: pale when relaxed, deepening to blue in tension and to orange in compression, and
compressed members are also dashed. The colours were picked to stay apart for the common
kinds of colour blindness (a test checks this with simulated protanopia, deuteranopia and
tritanopia).

**Settings** (the gear) has the sound volume, screen shake (off by default if the system
asks for reduced motion), the tutorial again, and a reset of all progress.

### Materials

| Material | Price | Notes |
| --- | --- | --- |
| Road | $300/m | Concrete deck; the only thing road vehicles can drive on |
| Rail | $400/m | Steel railway deck: lighter than road, stronger in tension; trains only |
| Steel | $200/m | 20 × 20 cm; takes tension and compression |
| Light steel | $70/m | A quarter of the section and strength |
| Cable | $60/m | Wire rope; tension only, goes slack when pushed |
| Thin cable | $20/m | A fifth of the section and strength |

Links longer than 10 m are split into 10 m segments.

### Levels

Thirteen levels, each introducing one idea, in four settings: summer, desert, snow and
night. Open the list from the level button in the
toolbar: it shows your stars and best cost on each. A level unlocks once the one before it
is won within budget.

| # | Level | The idea |
| --- | --- | --- |
| 1 | Brook | 20 m, a car and a bus: lay a road across |
| 2 | Creek | 40 m: a bare deck sags and snaps, so hold it up |
| 3 | Ledges | rock ledges below the road to prop the deck from |
| 4 | Canyon | 80 m: the example bridge works but costs too much |
| 5 | Step up | the far side is 8 m higher |
| 6 | Heavy load | one 200 t heavy hauler: cables stretch too much |
| 7 | Downhill | the far side is 10 m lower, five trucks |
| 8 | Rush hour | nine vehicles nose to tail, at night |
| 9 | River pier | 120 m with a rock in the river for a pier |
| 10 | Long span | 100 m with nothing to stand on |
| 11 | Viaduct | 180 m with two rocks: three spans |
| 12 | Deep gorge | low ledges: an arch is cheaper than a truss |
| 13 | Grand crossing | 160 m, climbing, six trucks |
| 14 | Branch line | the railway: 40 m and a 240 t train, on Rail |
| 15 | Freight | 80 m and a 380 t train, nearly as long as the bridge |
| 16 | Mountain railway | 120 m with a rock for a pier, a 520 t train |

| Vehicle | Mass | Length | Axles |
| --- | --- | --- | --- |
| Car | 1.5 t | 4.4 m | 2 |
| Bus | 18 t | 12 m | 2 |
| Truck | 40 t | 12 m | 5 |
| Heavy hauler | 200 t | 22 m | 9 |
| Locomotive | 100 t | 20 m | 4 (two bogies) |
| Wagon | 70 t | 15 m | 4 (two bogies) |

Every level has a reference bridge in the tests that crosses within budget, and the budgets
are set so the cheapest known design uses 85-95% of them.

## How it works

The bridge is a mass–spring model: every link is an axial spring with stiffness *EA/L*,
damped at 10 % of critical, with its mass split between its two joints. The simulation
uses semi-implicit Euler integration with an adaptive time step derived from the stiffest
link, and runs in real time. A link breaks when its stress exceeds its material's tensile
or compressive strength. Vehicles are moving loads: each axle pushes down on the road link
under it with its share of the weight, split between that link's two joints.

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
    level-preview.mjs   level thumbnails for the level-select screen
    vehicle.mjs         driving, falling and axle loads
    vehicle-types.mjs   cars, buses, trucks, haulers, locomotives, wagons: sizes, axles, drawings
    themes.mjs          scenery palettes: summer, snow, desert, night
    hints.mjs           advice after a failed test
    share.mjs           bridges packed into links
    scenery.mjs         background, ground, water
    effects.mjs         debris, dust, splashes
    audio.mjs           synthesized sound (Web Audio)
test/                   node:test suites
```

## Development

```sh
npm test            # unit and simulation tests (node:test)
npm run typecheck   # TypeScript checks the JSDoc types; nothing is compiled
npm run lint        # ESLint (eslint.config.js)
npm run check       # all three
```

GitHub Actions runs all three on every push and pull request. A second workflow can publish
`src/` to GitHub Pages; see the comments in `.github/workflows/pages.yml` for how to turn
it on.

## Licence

ISC
