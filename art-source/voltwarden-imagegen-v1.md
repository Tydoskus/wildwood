# Voltwarden image generation

Created with the built-in ImageGen tool. The original transparent PNG is used without background removal or repainting at `public/assets/wildstat/voltwarden-boss-v1.png`.

The game adds idle motion, an attack pulse, and a hurt flash. Laser lanes and EMP rings are rendered separately to match gameplay geometry.

## Prompt

Use case: stylized-concept. Asset type: production-ready isolated 2D boss sprite for a top-down cartoon action RPG called Wildstat. Create Voltwarden, the massive neon robot guardian of Neon Bastion. One single full-body character, centered on a genuinely transparent background with alpha, no scenery or ground shadow. Thick bold BLACK outer outlines and black interior lines, clean flat cel shading with only 2 solid tones per material, chunky simple readable shapes, appealing hand-drawn cartoon game art. A broad heavy armored robot with oversized shoulder armor, short powerful legs, large gauntlets, a small angular helmet and narrow magenta visor. Dark slate-blue armor, bright cyan circuit inlays, a large circular cyan reactor in its chest with a magenta diamond core. Two substantial electrical coil pylons rising behind its shoulders give a distinctive boss silhouette. Its fists and chest reactor are the sources of laser-lane and expanding EMP-ring attacks; no handheld weapons. Slight three-quarter view facing toward the viewer and a little to the right, camera elevated enough to see shoulder and head top planes, suitable for a top-down map. Neutral battle-ready stance with arms slightly away from body, feet on the same ground plane, entire silhouette visible with generous transparent margin. Strong silhouette readable at 250 pixels high. Flat colors, sharply defined broad areas. No gradients, no soft glows, no photorealism, no 3D rendering, no tiny surface texture, no words, no labels, no watermark, no frame, no extra characters, no sprite sheet, no checkerboard drawn into the image. Square 1024x1024 transparent PNG.

## Reserved enemy designs

Neon Bastion uses the sword sentry (`reaver.svg`) for all camp roles. The five other original SVG sheets are preserved under `art-source/reserved/neon-sentries/` for future maps. `scripts/build-neon-sentries.mjs` regenerates both the active sheet and those archived designs.
