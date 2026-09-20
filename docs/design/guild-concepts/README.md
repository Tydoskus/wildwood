# Guild concept and emblems

Generated with the built-in image_gen tool. Concept: compact-guild.png.
Runtime sheet: public/assets/wildstat/guild-emblems-v3.png (1254 × 1254 RGBA).
Earlier flat version: art-source/generated/guilds/guild-emblems-v1.png.
Frame coordinates are in src/ui/guild-emblems.ts. Use the measured frame bounds rather than blindly dividing the generated sheet into equal quarters.

The local implementation retains the existing WildStat banner and Back button. Emblems currently use consistent defaults derived from guild names; no saved emblem-selection field is introduced.

## Superseded dimensional version prompt

Edit target: Image 1, the 16-emblem sprite sheet. Style reference: Image 2, specifically the raised, dimensional wolf shield badge in the WOLF guild header. User says sheet is much too flat. Redesign the rendering of ALL sixteen emblems to be visibly sculpted and 3D like the Image2 wolf badge, ideally more beautifully dimensional. Keep the SAME exact motifs, colors, ordering and 4x4 grid from Image1. Keep every icon separate with transparent background. Strong physical DEPTH: thick extruded silver shield rims, multi-plane broad bevels with clear top-left silver highlights and dark lower-right facets, inset colored enamel shield face visibly recessed behind the rim, sculpted animal faces that project forward like carved bas-relief with dimensional snouts, cheeks and layered tufts of fur, ambient occlusion where animal meets backing, soft dark cast shadow ON the backing shield under animal, reflected colored fill, rich premium hand-painted toy-like 3D game art. Broad volume shading and bevelled faceted contour as in reference2. Absolutely avoid the flat black-outline vector look of image1, avoid simple two-tone flat clipart. Still polished friendly stylized fantasy game art, not photorealistic, not thin intricate realism. Make grey wolf on emerald green top-left match reference2 wolf silhouette and sculptural shading closely. Strict 4x4 equal square grid with all emblems equal-size and aligned. 2048x2048 atlas if possible, transparent background, each shield centered in its own equal square cell, generous transparent gutters and at least 8% of cell margin all sides. No text, no numbering, no lines, no sparkles, no outer glow; no shadows bleeding out of each cell. Output only final sprite atlas.

## Current art direction

Keep the first cartoon style, but layer ears, horns, snouts and object edges over the rim. Do not use the sculpted rendering style of v2. See guild-emblems-v3-prompt.txt for the final built-in image_gen prompt.
