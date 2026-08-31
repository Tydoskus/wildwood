# Wildstat app icon and favicon — v1

Mode: built-in image generation, using the imagegen skill. Both artworks were generated from the user's updated Wildstat wordmark. No CLI/API generation fallback was used.

Release: prepared for v0.576, alongside the user's updated sign-in background, after the user approved including both new icons. The revised wordmark was released separately in v0.575.

## Files

- `app-icon-source.png`: original generated 1254 × 1254 app artwork.
- `app-icon-1024.png`: opaque RGB, square 1024 × 1024 app-icon export.
- `favicon-source.png`: original generated 1254 × 1254 simplified favicon artwork.
- `favicon-{16,32,48,64,128,256}.png`: browser-size PNG exports.
- `../../../public/assets/wildwood/wildstat-apple-touch-icon.png`: 180 × 180 Home Screen icon.
- `../../../public/assets/wildwood/wildstat-favicon-32.png`: 32 × 32 browser PNG.
- `../../../public/wildstat-favicon.ico`: multi-resolution 16/32/48/64/128/256-pixel ICO.
- `export.mjs`: reproducible macOS export recipe; refuses to overwrite existing outputs.

Only deterministic resizing, sRGB profile conversion, and ICO packaging are applied after generation. Original generated artwork is preserved. No rounded corner mask is baked into the artwork.

Design/export references: [Apple app-icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons) and [Apple Safari Web Clip icons](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html). This is a flat PNG asset set, not a layered Icon Composer package or an App Store approval claim.

## App icon prompt

```text
Use case: logo-brand
Asset type: finished iOS-style mobile game app icon, one square 1024 x 1024 image, not a presentation or device mockup.
Primary request: Create a polished, immediately recognizable compact app-icon adaptation of the supplied updated WILDSTAT wordmark.
Input images: Image 1 is the user's current Wildstat wordmark, a reference for the exact green-and-blue brand palette, chunky letter construction, and small leaf motif. It is not a background to place inside a badge.
Scene/backdrop: one full-bleed opaque deep forest-navy background, approximately #0b1920, subtly lighter near the center. Background fills all four square corners.
Subject: ONLY the two letters "WS" as a bold cohesive monogram: the W uses the reference's bright leaf-green face and dark-green depth; the S uses the reference's vivid blue/cyan face and deep royal-blue depth. Reuse the recognizable two-leaf sprout from the upper-left of the reference W as a small integrated part of the W. Keep both letter bodies at the SAME cap height and baseline, with a small tasteful overlap/connection but clear open letter counters. The S is not oversized.
Style/medium: premium friendly mobile RPG branding; substantial blocky letterforms, broad uncluttered faces, crisp restrained cel-shaded depth, a narrow dark edge and a few controlled bright edge highlights faithful to the supplied logo. Strong silhouette, no fussy surface texture.
Composition/framing: a single centered large monogram, optically balanced with the leaves; the full mark occupies roughly 78-82% of the canvas width and stays comfortably inside the central safe area. Keep the entire W, S, leaves, and shadows inside the canvas. The two letters must remain recognizable at small home-screen sizes.
Text (verbatim): "WS" — exactly one green W and one blue S, no other letters or words.
Constraints: square, fully opaque artwork; no rounded-corner clipping, no outer badge rim, no inset tile, no phone mockup, no border around the image, no checkerboard. Do not add the full eight-letter wordmark, tiny captions, extra leaves beyond the small reference sprout, trees, weapons, gems, characters, sparkles, particles, dramatic glows, lens flares, glossy glass overlays, or watermarks. Preserve the user's logo identity rather than introducing an unrelated symbol.
```

## Favicon prompt

```text
Use case: logo-brand
Asset type: production favicon artwork, one square 1024 x 1024 PNG master designed to export to 16, 32, and 48 pixels.
Primary request: Create a favicon companion to the generated Wildstat app icon. Preserve its recognizable WS monogram and leaf silhouette, but simplify the rendering for very small browser-tab sizes.
Input images: Image 1 is the Wildstat app icon and is the composition/identity reference to simplify. Image 2 is the user's updated full Wildstat wordmark and is the authoritative reference for the green W, blue S, and two-leaf sprout.
Scene/backdrop: full-bleed opaque solid dark forest-navy #0b1920, square right-angle corners, no inset badge.
Subject: exactly "WS", a large bold green W joined closely with a bright blue S, plus the same small two-leaf sprout integrated into the upper-left of the W. Match the app icon's substantial glyph shapes, equal letter-body height, shared baseline, and relative placement. Keep the W and S separately readable, with wide open counters and a clearly separated sprout.
Style/medium: exceptionally clean, small-size-first game brand mark. Broad mostly solid lime-green and vivid azure-blue faces, one darker edge tone per color, and only a small restrained highlight. Remove the app icon's glossy reflections, fine contour lines, surface facets, gradients, and shadows that would turn to noise when downsampled. Maintain a bold near-black silhouette edge.
Composition/framing: centered and compact; the combined monogram and sprout use roughly 86-90% of the square width. The mark must be unmistakable at 16 pixels, with balanced clear margins and no cropped parts.
Text (verbatim): "WS" only — one W and one S. No full wordmark and no other text.
Constraints: one icon, fully opaque PNG with a solid background to every edge; no checkerboard, no transparent corners, no rounded-corner clipping, no outer border, no device mockup, no grid of variants. No new symbols, no particles, no tiny ornament, no weapons, no gems, no watermarks. This must look like a simplified version of Image 1, not a new unrelated logo.
```
