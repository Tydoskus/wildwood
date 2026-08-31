# Wildstat Art Style

All new Wildstat art should use this visual language unless a feature-specific art direction document explicitly overrides it.

Wildstat is mobile-first. Judge silhouettes, contrast, detail, and labels at portrait-phone gameplay size before desktop presentation; desktop is a secondary compatibility target.

## Core direction

- Casual mobile RPG game art.
- Bold, rounded silhouettes with immediate small-screen readability.
- Thick, smooth black sticker outlines around the complete shape.
- Saturated candy colors with a friendly, playful mood.
- Clean cel shading with two or three deliberate value groups.
- Soft beveled depth instead of realistic materials or complex rendering.
- Small, glossy upper-left highlights used sparingly.
- High contrast between adjacent shapes.
- Minimal internal detail; every mark must remain useful at gameplay size.

## UI icons

- Center one subject inside a square canvas with comfortable transparent padding.
- Prefer one strong silhouette over layered scenery or decorative frames.
- Use genuine transparency and preserve clean alpha edges.
- Test readability at 16, 24, 32, and 48 pixels before shipping.
- Keep important shapes separated after downscaling.
- Avoid text inside icons unless the UI cannot communicate the meaning without it.

## Characters, creatures, objects, and environments

- Carry the same rounded proportions, black contour language, candy palette, cel shading, and upper-left lighting into every asset family.
- Exaggerate the feature that communicates function: weapon blade, monster face, upgrade glow, doorway, resource, or interactable surface.
- Keep backgrounds quieter than characters, rewards, and interactable objects.
- Match the established top-down game perspective when an asset belongs in the world.

## Avoid

- Photorealism, painterly rendering, thin outlines, noisy texture, excessive gradients, muddy colors, tiny ornamental detail, harsh realism, or distant shadows.
- Mixed lighting directions, inconsistent outline weights, watermarks, accidental text, or decorative elements that weaken the silhouette.
- Pixel art unless a deliberate feature brief calls for it.

## Canonical generation prompt

> Casual mobile RPG game art, bold rounded silhouette, thick smooth black sticker outline, saturated candy colors, clean cel shading, subtle glossy upper-left highlight, minimal detail, soft beveled depth, playful high-contrast presentation, optimized for small-screen readability. Keep the complete subject centered with clear padding. No text, no watermark, no photorealism, no noisy detail.

Add asset-specific subject, composition, perspective, palette, and transparency requirements after this shared prompt. Generate large, inspect the silhouette and alpha, then export an optimized gameplay copy without overwriting the source asset.
