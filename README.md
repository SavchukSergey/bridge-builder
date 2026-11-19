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

The game speaks English, Russian and Ukrainian. It follows the browser's language on the first
visit, and **Settings → Language** changes it (the page reloads; the bridge is autosaved).

Served over HTTP(S), the game can be installed as an app (from the browser's menu or
**Settings → Install**) and plays offline: a service worker (`src/sw.js`) keeps a copy of
every file. Online it always asks the network first, so it never hides a newer version.

### Goal

Get every vehicle to the chequered flag without spending more than the budget. Crossing
within budget earns one star; cheaper bridges earn two or three. Your cheapest win on each
level is remembered. Budgets leave about 30% more than the cheapest known bridge (Canyon,
whose example bridge must cost a little too much, 20%), so a first bridge that works gets
across; the stars are what ask for a cheap one.

Each level also has one or two **challenges**, done by a win within budget with a twist:
**No cables**, **Light as a feather** (no full-size steel), **Few pieces** (a few members) or
**Penny pincher** (a cost a little under three stars). They show under the star goals, in the
results and as ◆ on the level cards. Every one is met by the level's reference bridge, so
none is impossible.

### Controls

| Action | How |
| --- | --- |
| Build a link | Click a joint, then click where the link should end |
| Move a joint | Drag it (anchors stay put) |
| Delete | Right-click a joint or link; right-click also cancels a link being placed |
| Place off the grid | Hold <kbd>Alt</kbd> |
| Mirror mode | <kbd>M</kbd> or the **Mirror** button: builds, deletes and moves symmetrically |
| Select several | <kbd>Shift</kbd>+drag a box over them, or <kbd>Shift</kbd>+click joints; <kbd>Ctrl</kbd>+<kbd>A</kbd> selects everything |
| Move, delete, copy a selection | Drag one of its joints / <kbd>Del</kbd> / <kbd>Ctrl</kbd>+<kbd>C</kbd>, then <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes at the pointer |
| Pan / zoom | Drag empty space / <kbd>Ctrl</kbd> + wheel |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> |
| Cancel | <kbd>Esc</kbd> |

Everything can be built from the keyboard alone: the arrow keys move a cursor along the grid
(<kbd>Shift</kbd>: 5 m at a time), <kbd>Enter</kbd> or <kbd>Space</kbd> clicks where it is,
<kbd>J</kbd> / <kbd>Shift</kbd>+<kbd>J</kbd> jump to the next / previous joint,
<kbd>G</kbd> picks up a joint to carry with the arrows (<kbd>G</kbd> again puts it down,
<kbd>Esc</kbd> puts it back), <kbd>Del</kbd> deletes what is under the cursor,
<kbd>1</kbd>&ndash;<kbd>6</kbd> choose a material and <kbd>T</kbd> starts or pauses the test.
The view follows the cursor; moving the mouse hands back to it.

While placing a link, a readout next to the pointer shows its length, its cost and how much
of the budget would be left. Brook has a short step-by-step tutorial.

When a test fails, the results name the member that broke first and how (pulled apart or
crushed) with a tip, and it stays marked in red on the bridge until you change it. **Watch it
break** replays the test in slow motion (¼×) from just before that member gave way, with
the view on it.

As soon as a test on a level ends without a win, the panel offers a hint (and the result
has a **Get a hint** button that goes straight to it): first a few words
about a design that works, then, if you want it, its outline drawn over the build area
(with what it costs) to build over. The outlines are the reference bridges the tests use to
prove every level can be won.

**Build it with me** goes one step further: it builds that bridge with you, one piece at a
time. The next piece glows, the box at the top says which material to pick and which dot to
click, with a line about what that kind of piece does, and each piece is ticked off as it's
placed (a piece of the wrong material is pointed out, and pieces the bridge doesn't need are
shown in red to take away). When it's all built, it says to press **Test**. It starts by
itself on the levels that teach one idea (Triangles, Ledges, Hanging road, Creek) until they're
won; anywhere else it's offered with the hint's outline. **Stop guiding** turns it off, and
it then doesn't start by itself on that level again.

A win sets off confetti (more for more stars; none if the system asks for reduced motion),
and earns **badges** for milestones over the whole game: the first bridge, 10 and 30 stars,
5 extra goals, a railway level, every level, every goal and every star. They show in the
level list, and a result announces the ones it earned.

After a win, a **money saver** may point at a piece that hardly worked: it is marked in
green, with the cheaper piece of the same sort that would still be strong enough there (steel
to light steel or wood, cable to thin cable) and what that saves. It suggests a swap, never
taking a piece away: a piece that carries almost nothing can still be what stops a truss
folding up.

Eight levels are built on the same idea as a famous bridge, and winning one shows **a real
bridge like yours**: a drawing of that kind of bridge and one fact about it (Tarr Steps after
Brook, the Forth Bridge after Triangles, the Golden Gate after Hanging road, the Brooklyn
Bridge after Creek, the Millau Viaduct after Viaduct, the Sydney Harbour Bridge after Deep
gorge, Tower Bridge after Drawbridge and the Glenfinnan Viaduct after Mountain railway). The level list collects them.

The win that completes the last level leads to the **ending**: a trophy, the stars, extra
goals and badges won out of all there are, and how many stars are still waiting. The level
list keeps a button back to it.

The speaker buttons on the level text, the hint, the result and the tutorial **read them
aloud** with the browser's own voices, in the game's language. They hide themselves on a
device with no voice for it.

On a touch screen the buttons are at least 44 px, and the dots are drawn bigger.

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
asks for reduced motion), **Simple controls**, the language, the tutorial again, and a reset of
all progress. Simple controls are on at first: they put away the mirror, the stress view,
snapping, camera follow, export and import (and their keys and help rows), which a
younger player doesn't need. Turn it off for every tool.

### Materials

| Material | Price | Notes |
| --- | --- | --- |
| Road | $300/m | Concrete deck; the only thing road vehicles can drive on |
| Rail | $400/m | Steel railway deck: lighter than road, stronger in tension; trains only |
| Steel | $200/m | 20 × 20 cm; takes tension and compression |
| Light steel | $70/m | A quarter of the section and strength |
| Wood | $30/m | 20 × 20 cm timber: the cheapest, but weaker than light steel per dollar |
| Cable | $60/m | Wire rope; tension only, goes slack when pushed |
| Thin cable | $20/m | A fifth of the section and strength |
| Winch | $150/m | Drawbridge only: a cable that pulls itself in during the test, then lets out |

Links longer than 25 m are split into equal segments of 25 m or less.

### Levels

Nineteen levels, each introducing one idea, in four settings: summer, desert, snow and
night. Open the list from the level button in the
toolbar: it shows your stars and best cost on each. A level unlocks once the one before it
(or any later one) is won within budget.

The game is written for players from about nine: the first five levels teach one idea
each (a road, triangles, props from below, hanging from posts, building the posts), and the
words are everyday ones (a member is a *piece*, a joint a *dot*, tension *pulled* and
compression *squashed*).

| # | Level | The idea |
| --- | --- | --- |
| 1 | Brook | 20 m, a car and a bus: lay a road across |
| 2 | Triangles | 30 m and the 200 t hauler: triangles on top of the road |
| 3 | Ledges | rock ledges below the road to prop the deck from |
| 4 | Hanging road | 50 m with the posts already up: hang the road from them |
| 5 | Creek | 40 m: build the posts too, and hang the road |
| 6 | Canyon | 80 m: the example bridge works but costs too much |
| 7 | Step up | the far side is 8 m higher |
| 8 | Heavy load | one 200 t heavy hauler: cables stretch too much |
| 9 | Downhill | the far side is 10 m lower, five trucks |
| 10 | Rush hour | nine vehicles nose to tail, at night, with a fire engine and ice-cream vans |
| 11 | River pier | 120 m with a rock in the river for a pier |
| 12 | Long span | 100 m with nothing to stand on |
| 13 | Viaduct | 180 m with two rocks: three spans |
| 14 | Deep gorge | low ledges: an arch is cheaper than a truss |
| 15 | Grand crossing | 160 m, climbing, six trucks |
| 16 | Drawbridge | a tall-masted boat sails through first: hang the road from a winch that lifts it |
| 17 | Branch line | the railway: 40 m and a 240 t train, on Rail |
| 18 | Freight | 80 m and a 380 t train, nearly as long as the bridge |
| 19 | Mountain railway | 120 m with a rock for a pier, a 520 t train |

On the **drawbridge** a sailing boat comes through the canal before the traffic, and the
dashed space its mast needs must be clear while it sails. A **Winch** (shown only on that
level) pulls itself in to 35% of its built length, lifting a road hinged at the near bank,
then lets it back out; the traffic sets off once the road is down. A road that can't lift
stops the boat, and the test is lost.

**Sandbox** (the last card in the level list) lets you design your own gap: its width (20
to 200 m), how much higher or lower the far bank is, a rock in the middle for a pier, the
traffic (cars, trucks, rush hour, a town convoy, the heavy hauler or a train), the budget and the scenery.
A sandbox is always open and doesn't count towards progress. Its level id spells out the
whole design, so its bridge is saved like any other, and **Share** sends the level along
with the bridge.

| Vehicle | Mass | Length | Axles |
| --- | --- | --- | --- |
| Car | 1.5 t | 4.4 m | 2 |
| Bus | 18 t | 12 m | 2 |
| Truck | 40 t | 12 m | 5 |
| Heavy hauler | 200 t | 22 m | 9 |
| Fire engine | 16 t | 9.6 m | 3 |
| Ice-cream van | 3.5 t | 6 m | 2 |
| School bus | 14 t | 11 m | 2 |
| Locomotive | 100 t | 20 m | 4 (two bogies) |
| Wagon | 70 t | 15 m | 4 (two bogies) |

Every level has a reference bridge (`src/js/solutions.mjs`) that crosses within budget, and the budgets
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
    game.js             the Game class: wiring the layers below together, and drawing
    game-core.mjs       shared state, options, view, progress, running the load test
    game-levels.mjs     switching levels, undo and redo, saves, import and export
    game-editing.mjs    building, mirroring, dragging and deleting links and joints
    game-input.mjs      mouse, touch, wheel and keyboard
    game-config.mjs     tuning values (pick radii, zoom limits, link lengths, speeds)
    game-types.mjs      shared JSDoc types
    storage.mjs         localStorage keys and safe access
    scene.js            the structure and the physics step
    engine/             joints and links
    materials/          material properties and looks
    level.mjs           level definitions, star thresholds
    sandbox.mjs         sandbox levels the player designs
    level-preview.mjs   level thumbnails for the level-select screen
    vehicle.mjs         driving, falling and axle loads
    vehicle-types.mjs   cars, buses, trucks, haulers, locomotives, wagons: sizes, axles, drawings
    themes.mjs          scenery palettes: summer, snow, desert, night
    hints.mjs           advice after a failed test, and a hint for each level
    challenges.mjs      each level's challenges
    badges.mjs          milestones over the whole game
    confetti.mjs        the confetti for a win
    drawbridge.mjs      the drawbridge: winches, the boat and the space it needs
    ending.mjs          the ending, once every level is won
    real-bridges.mjs    famous bridges built on each level's idea, and their drawings
    speech.mjs          reading text aloud
    solutions.mjs       a reference bridge for each level (the hint outline; the tests use them too)
    guide.mjs           "Build it with me": the order to build a reference bridge in, and how far along you are
    guide-ui.mjs        "Build it with me" on screen: when it runs, and what it says for each step
    share.mjs           bridges packed into links
    scenery.mjs         background, ground, water
    effects.mjs         debris, dust, splashes
    audio.mjs           synthesized sound (Web Audio)
  js/i18n.mjs           translations: t(key, params), plural forms, numbers by language
  js/locales/           en.mjs (text the game builds), ru.mjs, uk.mjs; the page's own text is
                        tagged data-i18n in index.html, and test/i18n.test.mjs checks every key
  sw.js                 service worker: offline play (its SHELL lists every file in src/)
  manifest.webmanifest  install as an app
  icons/                app icons (scripts/make-icons.mjs draws the PNGs)
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
