# Map enemy artwork

One family per map does **not** mean one slime body for the whole game. Restore
the existing families first, including their original color/equipment variants;
use new pack families for the remaining maps.

| Map | Family | Artwork |
| --- | --- | --- |
| Tutorial Forest | Green slimes | Original plain, stone and crowned variants |
| Beginner Desert | Brown goblins | Original warrior/archer layers |
| Intermediate Snowlands | Skeletons | Original bone-colored skeleton layers |
| Advanced Lava Lake | Orange slimes | Original plain, stone and crowned variants |
| Night Forest / Infernal Depths | Poison skeletons | Original poison skeleton layers |
| Water Reach | Green goblins | Original warrior/archer layers |
| Samurai Garden | Tulip monsters | LayerLab `Flower_Tulip` |
| Cloudspire | Winged bee monsters | LayerLab `WingDemon_Bee` |
| Moonfen | Rock fungi | LayerLab `Fungus_Rock` |

`src/game/enemy-sprite-layouts.mjs` is the source of truth. Enemy names are existing
combat/reward identities, not instructions to pick a different species within a
map. No server state, stats, hitboxes, attack timings, camps or rewards change.
Regular sprite size remains 54; elite size remains 78. The original layered
goblin/skeleton coordinates are scaled together, preserving their proportions.
Original-family archers retain aimed bows without separate floating hand/arm
layers. The three new animated families use their own attack poses, with no bow
overlays; their ranged combat behavior is unchanged.

## New animation sheets

The three new families use 256-pixel frames captured in Unity at 12 FPS and
quality-95 WebP sheets with exact alpha. Tulip and bee each have 28 frames;
rock fungus has 34. Only **idle, walk and attack** are shipped. Source packages,
Unity projects, previews, and lossless masters remain under ignored `art-source/`.
Only the selected runtime sheets/metadata enter `public/`.

`src/game/enemy-atlases/` contains generated crop/timing metadata. Pages are lazy
loaded by the existing map preparation/background preload pipeline and shared
across all five variants in a map. Each family stays below 16 MiB decoded RGBA and
each sheet below 2048 × 2048. All three families together are below 768 KiB on disk.
Frame rectangles reuse exported metadata; no manifest request or per-frame canvas
baking is needed in play.

`enemy-animation.ts` chooses idle/walk from actual movement and starts the attack
pose when the simulation actually strikes/fires. Playback never decides hit timing
or damage. Remote combat shadows also supply this presentation-only attack clock.
Hit flashes and death squash/fade remain the existing game effects; death freezes
the current atlas frame. Fixed capture origins preserve motion, and idle silhouette
bounds keep the floating labels from jumping between frames. The captures include
their own shadows; `hasBakedShadow: true` disables the game's added ground shadow
for these families alone. Original-family enemies retain their added shadows.

These three captures are authored facing left. Their animation layouts declare
`sourceFacingX: -1`; the renderer mirrors only the atlas around its fixed origin
to match the actor's right-facing coordinate system before world-facing is applied.
This applies equally to idle, walking and attacks, without changing movement,
combat targeting, or the original families' equipment.

## Promoting another capture

Export the three motions with `launchers/Open Unity Sprite Exporter.command`.
Then run:

```sh
node scripts/import-enemy-sprite.mjs <local-export-folder> <new-enemy-id>
```

The importer uses an installed Sharp module; `WILDSTAT_SHARP_MODULE` can point to
its installed module directory if it is not in this project's Node resolution path.
It validates the manifest, strips hit/death pages, converts PNG to WebP (or keeps
existing WebP bytes), verifies dimensions and pixel-exact alpha, and measures the
idle silhouette. It refuses to overwrite an existing runtime id: use a revision
suffix when changing a deployed sheet so cached art cannot mismatch new metadata.
Import the generated module and assign it to a family in the layout table. Set
`sourceFacingX` to match the capture's authored direction (`-1` left, `1` right;
omitted means right).

The loose-layer aligner remains for original sprites; baked sheets use the Unity
exporter's preview. The user owns visual review: inspect facing, idle/walk/attack,
elite scale, and label/shadow placement on the three new maps, plus the restored
goblin/skeleton assembly and its bow overlays. Objective checks cover paths, frame crops,
texture budgets, map-scoped loading, animation transitions and renderer transforms.
