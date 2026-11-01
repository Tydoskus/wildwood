# Visual check

Screenshots of the game's own renderers, drawn from fake in-memory state: no game server, no login,
no network beyond the art in `public/`. Use it to see a rendering change, or to prove a refactor
(sprites moved into atlases, say) draws pixel for pixel what it drew before.

It is an offline tool: it builds into `local-data/visual-check-build` (gitignored), never into `dist/`
or `public/`, and needs no release notes or version bump.

## Scenes

Picked by URL hash in `visual-check.html`:

| Scene | What it draws |
| --- | --- |
| `plates` | Players' and enemies' overhead plates at the phone camera framing: guest, prestige badge, gender, dev and guild tags, long name with descenders, power, low HP, a chat bubble; enemy bars with and without HP numbers; Show My Name Plate off; chat bubbles stacked (system and duel notices left out); plate height over each helmet and the Invisible line; Safari's text metrics (no glyph bounds) |
| `gear` | One character per grade × refine (★0 ★10 ★20) × armour class, all slots; the refine-look thresholds; every non-graded piece with world art; held weapons in either hand both ways, aim in eight directions, running sway and idle bob, attacks, looks held over another kind of weapon, tools by level, Galaxy and Diamond finishes, every skin tone, and the death fall |
| `enemies` | Every atlas-animated enemy: idle and walk loops, the attack from its start, walking and attacking facing left, and dying, grouped by map |
| `parts` | The parts-built enemies (goblins, skeletons, slimes …) facing right and left, aiming up-right, down-right and up-left, hit, and dying |
| `combat-hits` | Damage numbers over a crowd at the phone framing (white dealt, yellow crits, red taken, a burst fanned out) as they rise, fade and go; each weapon's projectile and an enemy shot; bow, sword and staff skill effects partway through |
| `bosses` | Every world boss through the game's boss renderer: idle at 0, 0.25 and 0.5 s, mid-attack, hit with the bar's loss flash, and its hitbox and anchor over the art |
| `endless-bosses` | Each Endless enemy beside its boss (twice its size), hitbox circles over both |
| `dps-breakdown` | The DPS breakdown card over a bow build with Koi and Dragon, at phone and desktop width |
| `town-grid` | The Town's 3×3 grid opened to walk: north of the village, the north-east and south-west corners, and the outer wall, at the phone framing |
| `grove` | Timberwood's pines standing, then one felled, and an elder felled: each stump's small shadow among the standing trees' |
| `world` | Every campaign map, the first Endless map, the Soul Dimension and a guild hall where a player arrives, drawn by the game's own world renderer at the phone framing (ground, roads, decor, portals and their labels, camps, the minimap, the Night Forest's dark); players at a gate and at a boss for depth order; the Forest and the Night Forest at the desktop framing |
| `town` | The Town at the phone framing: the arrival, the same with attack-range research (the camera must not move), the player's zoom at 50% and 150%, the river at the west bridge, Ox, the countryside's baked ground; and the desktop framing |
| `exchange` | The Trade Chrysanthemum south of the village: the road from the village's south edge down to its square, the clerk at his booth, the square and the countryside beside it at the phone framing, and the square at the desktop framing |
| `guild-battlefield` | A guild battle replay's canvas: five a side walking in, at the first blow and midway; twenty a side midway, portrait and landscape |
| `icons` | The inventory window over a full bag (every item, a few grades again at ★10 / ★20), at 390 and 1280 wide |
| `hud` | The in-game HUD: player card, toolbar icons, gem wallet, minimap |
| `wordmark` | The start screen with the wordmark |
| `profile-own`, `profile-other` | The profile window's header: your own with the pencil and gear, another player's with the guild row and the ⋯ menu open |
| `shops` | The Smith on Craft, Reforge and Refine, the Weapon Seller on Sell and the Armor Seller on Buy, each at its real size with its pinned detail and grid, stacked, at phone and desktop width |
| `item-window`, `item-window-worn` | The item window on a graded bow: its skills, Equip, and the trash can that sells it, greyed while the bow is worn |
| `gem-shop` | The gem Shop at phone width: the Patreon rows and the dev note's Silver, Gold and Diamond frames, with the Diamond Galaxy set under Diamond |
| `server-boost` | The Server Boost's timer under the minimap, and the Shop's Server Boost row for a supporter on cooldown during a boost, a supporter ready, and a non-supporter |

`world`, `town` and `bosses` build a map the way the game does (`game-world.ts`: the bootstrap state,
the map's layout, camps and boss, `createWorldRendering`) with no server; workers are off so ground
tiles are painted on the spot.

Clocks, `Math.random`, animation and the device pixel ratio are pinned, so two captures of the same
code are identical (0 changed pixels).

## Check against the baseline

    npm run visual:check                     # capture every checked scene and compare
    npm run visual:check -- --scenes gear    # just some
    npm run visual:check -- --update         # the change is intended: take a new baseline

`local-data/visual-check-baseline/` holds each checked scene at one width and pixel ratio (lossless
WebP, listed in its `manifest.json`). It is gitignored: pixels depend on the Chrome version and the
machine's fonts, so each machine keeps its own. `--update` creates it; take it on the code before a
change, then check after. The check captures into `local-data/visual-check-run/` and exits 1 when
any pixel changed, with `*.side.png` pictures (baseline | now | changes in magenta) in its `diff/`
folder. It needs Chrome, so it is not part of vitest or CI: run it before handing over a change that
touches drawing. A new Chrome version can move text by a pixel; the check says when the baseline came
from another version, and `--update` after looking at the pictures settles it.

## Capture

    npm run visual:capture -- --out <dir> [--scenes plates,gear] [--dpr 1,2] [--cap 2|3]

Builds the harness, serves it on `127.0.0.1:4517` with `public/` behind it, runs headless Chrome
with DevTools on port `9351`, and writes `<scene>-<width>w@<dpr>x.png` plus `manifest.json`.
The game canvas is capped at the game's own pixel ratio, 2 unless `--cap 3` (Settings > High
Resolution), so `--dpr 3` shows a 3× phone as players see it: the canvas stretched 1.5×.
`--no-build` reuses the last build; `--port` / `--cdp-port` move the ports (never 3000 or 8000).

To capture another commit, check it out in a temporary worktree, copy `tools/visual-check/` and
`config/vite.visual-check.config.ts` into it, and run its `capture.mjs` with a different `--out` and
`--build-dir`.

## Diff

    npm run visual:diff -- <baseline-dir> <candidate-dir> [--out <dir>] [--threshold 0] [--tolerance 0]

Prints changed pixels per capture. For each capture that changed it writes `<name>.diff.png`
(changes in magenta) and `<name>.side.png` (baseline | candidate | diff). Exits 1 when any capture
changes more than `--threshold` pixels, differs in size, or is missing on one side.

## Always kill Chrome

`capture.mjs` closes Chrome and the server in every exit path (errors, Ctrl-C, SIGTERM), and a
watchdog kills Chrome if the script itself is killed. Still, after a session check that nothing is
left over; a forgotten headless Chrome once ran for days at full CPU:

    ps aux | grep remote-debugging-port | grep -v grep

## Perf

    npm run perf -- [--maps tutorial_forest,town] [--frames 150] [--phone] [--json <file>] [--shot <png>] [--no-build]

Times the game's world drawing on real maps: the `perf` scene draws each map as the game does (its canvas runtime
and WebGL world layer, real clocks) while the player walks a circle, at 100% and the farthest zoom-out, and again
without tall props and without enemies to show what each costs. Chrome runs headless on the real GPU with vsync and
the frame cap off. `work ms` is the game's own drawing a frame; `frame ms` the whole frame through to the GPU
(median and slowest 5%). `--phone` frames a 390×844 screen. A Mac's GPU is far faster than a budget phone's, so
compare rows with each other and runs before and after a change, not with a phone's frame rate.
