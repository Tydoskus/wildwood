# Unity sprite exporter

A local, one-character-at-a-time art tool. Unity samples a prefab's animations,
captures transparent frames, and packs them into PNG sheets with timing and foot
anchor metadata. The included offline browser preview can convert the sheets to
a WebP ZIP. No AI service, upload, game deployment, or enemy replacement is involved.

The default motion set is **idle, walk, and attack only**. WildStat keeps its existing
hit and death effects; no hit/death animation textures need to be shipped. The old
five-slot exporter window is migrated to these three slots on its next script reload.
Previously generated five-motion folders remain untouched as source backups.

## Open it

On macOS, double-click **Open Unity Sprite Exporter.command** in `launchers/`.
The first launch creates an isolated Built-in-pipeline project under
`art-source/unity-workspace/SpriteExporter/`. It uses an installed stable Unity
editor at least as new as **2022.3.62f3** (the LayerLab pack's stated minimum).
It does not install Unity. Later launches keep the project's saved editor version;
they do not silently upgrade/downgrade it or modify your other Unity projects.

Unity opens **WildStat → Sprite Exporter** after compilation. If the project is
already open, the launcher focuses Unity and requests that window again.

1. Click **Import a trusted .unitypackage…** and approve the desired assets in
   Unity's normal import dialog. As with any Unity project, only import trusted
   packages; this tool is not a sandbox for third-party editor scripts.
2. Drag one **prefab** from Unity's Project panel into **Character prefab**.
3. Check the automatically matched **idle / walk / attack** clips.
   Matching uses names, not a guarantee about their meaning. Drag clips manually
   if necessary. Extra attacks can have their own motion slots. Leave unused slots
   empty. Idle/walk loop by default; other motions hold their final pose.
4. Start with **256 px / 12 FPS**. Export this character.
5. Click **Preview / make WebP**, then choose the completed export folder in the
   browser's folder picker. Play or scrub every motion; check the foot cross,
   silhouette, colors, alpha edges, and attack motion. The user owns visual review.
6. Optionally download a **WebP bundle (.zip)**. It includes converted sheets and
   an updated `sprite.json`. Keep the PNG folder as the lossless master. The browser
   encoder's quality 100 setting is not a guarantee of lossless WebP. A browser that
   cannot encode WebP reports that explicitly instead of renaming a PNG to `.webp`.

Exports land under `art-source/generated/unity-sprites/`. Every export gets a new
timestamped directory, so earlier exports and original art are preserved. Cancelled
or failed captures leave a clearly marked `.incomplete-*` directory, never a valid
completed export. You can remove those incomplete directories yourself.

The browser reads only the folder you select. Its content security policy disables
network connections. Selecting local files avoids `file://` canvas restrictions
without starting a server or uploading anything. A WebP ZIP can be previewed again
by extracting it and selecting its folder in the original preview window.

## Alignment and capture behavior

- The camera uses the union of **all sampled poses in all selected clips**; it never
  auto-zooms or centers each individual frame. That preserves size and animation motion.
- **Foot point** is a fixed point in prefab-root world coordinates (default `0, 0`).
  It is exported in pixel coordinates with a top-left origin. If the prefab origin
  is not on its feet, adjust it once. The camera also keeps this point in frame.
- **Keep root in place** suppresses translation of the animation root while retaining
  movement of children (jumps, attacks, limb motion). Turn it off only for intentional
  root-motion capture. No scene or source prefab is saved or edited by capture.
- **Animation root** is the child path containing the Animator, not necessarily the
  outer prefab. The tool detects a single Animator automatically; multiple Animator
  hierarchies need an explicit root and clip assignment.
- Loops omit the duplicated endpoint. One-shots include the final pose, sampled just
  short of an exact wrap boundary. Total playback duration matches the source clip;
  effective export FPS may differ slightly due to whole-frame rounding.
- Sheets are capped at **2048 × 2048**, split into pages when needed, and have two
  transparent gutter pixels per frame edge. Maximum 600 frames per clip / 2,000 per
  export. The preview has an additional total decoded-pixel memory budget.
- **Premultiplied material** undoes the premultiplied render-target color produced by
  `Sprites/Default`, accounting for linear versus gamma rendering. Custom shaders
  are flagged for color/alpha review; turn this off only when the material already
  produces straight-alpha RGB. Materials requiring a scene light or post-process
  need their own setup rather than an assumed default.

## Supported first version / known limits

This captures **SpriteRenderer-based transform, color, visibility, and sprite-swap
AnimationClips** in the **Built-in pipeline**. Sorting groups and layered sprites
are rendered by Unity. The inspected LayerLab Enemy Monster 3 rock-fungus prefab
uses this type of animation; it is not a collection of finished animation PNGs.

It does not simulate gameplay scripts, animation events, physics, Animator state
machine transitions, blend trees, or script-generated effects. Mesh renderers,
particles/trails, humanoid clips, and SpriteSkin deformation are rejected rather
than silently exported as incorrect/static frames. URP/HDRP are explicitly rejected.
Other packs may need an adapter. All 50 monsters are **not** automatically certified
by testing one; inspect each selected character's motions before promoting it.

The source package, scratch Unity project, and output are Git-ignored and outside
`public/`, so normal game builds and releases do not publish them. Confirm the
applicable license before promoting third-party art into a distributed game or
public repository. This tool does not grant usage/distribution rights.

## Output contract and game integration

`sprite.json` version 1 contains:

- `pages`: local PNG or WebP filenames and pixel dimensions.
- `frameWidth`, `frameHeight`: fixed frame size shared by all motions.
- `alpha`: `straight`; `sourceAlpha` records the material-blending assumption used
  for capture. The default is a premultiplied source, as with `Sprites/Default`.
- `anchorX`, `anchorY`: foot point inside every frame, top-left pixel coordinates.
- `pixelsPerUnit`: conversion from Unity world units to exported frame pixels.
- `animations`: unique motion key, looping flag, total duration, per-frame duration,
  and ordered `{ page, x, y, w, h }` rectangles in top-left pixel coordinates.
- `warnings`: capture diagnostics for edge clipping or custom materials.

To draw at a ground point `(x, y)` with scale `s`, place the frame at
`(x - anchorX * s, y - anchorY * s)`, with size
`(frameWidth * s, frameHeight * s)`. Advance frames using `frameDurationMs`; loop
idle/walk, and clamp one-shot motion playback to its last frame. Each frame's
`page` selects a texture and its rectangle selects the source pixels.

WildStat's family assignments live in `src/game/enemy-sprite-layouts.mjs`. Original
families use static layers; selected new families use the exported idle/walk/attack
sheets through `src/game/runtime/enemy-animation.ts`. The exporter itself still
does not automatically replace game art or choose gameplay identities, hitboxes,
attack-impact timing, or rewards. Deliberate promotion uses
`scripts/import-enemy-sprite.mjs`; see `docs/enemy-art-families.md` for current
assignments, texture budgets and the unchanged in-game hit/death presentation.

## Objective checks

```sh
npm run art:unity:prepare  # create/update tool files, without launching Unity
npm run art:unity:check    # compile against installed Unity APIs; run C# math checks
npx vitest run scripts/unity-sprite-exporter.test.ts scripts/repository-layout.test.ts
```

The compile check uses the installed Unity C# compiler and references, not stub
Unity classes. It does not start Unity or inspect purchased art. It verifies packing,
frame timing, bounded texture dimensions, alpha math, and camera-fit calculations.
JavaScript tests cover local-project installation, version pinning, manifest safety,
one-shot/loop playback, WebP metadata mapping, ZIP headers/CRCs, and network isolation.

For an objective actual-prefab capture check, Unity also has this batch entry point:

```text
Unity -batchmode -quit -projectPath <local-art-project>
  -importPackage <trusted-package.unitypackage>
  -logFile <local-import-log-file>

Unity -batchmode -projectPath <local-art-project>
  -executeMethod WildStat.ArtTools.SpriteExportBatch.Run
  -wildstatSpritePrefab "Assets/.../Character.prefab"
  -logFile <local-log-file>
```

Use separate import and export invocations: Unity can defer `-importPackage` until
after an execute method has already run. Do not use `-nographics`: the exporter needs a rendering device. The method exits
Unity itself and records the last successful export for the interactive window.
It checks decoded sheet dimensions, transparent gutters, and distinct rendered
frames in each motion. A synthetic two-color fixture also checks orientation,
straight-alpha color recovery, and source-object preservation without judging art.
Those checks are not a substitute for visual judgment.

API references: [Unity animation sampling](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/AnimationClip.SampleAnimation.html),
[preview scenes](https://docs.unity3d.com/2022.3/Documentation/ScriptReference/SceneManagement.EditorSceneManager.NewPreviewScene.html),
[command-line options](https://docs.unity3d.com/2022.3/Documentation/Manual/EditorCommandLineArguments.html).
