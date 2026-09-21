# Supporter frame artwork

`patreon_silver.webp`, `patreon_gold.webp` and `patreon_diamond.webp` are the
three supporter frames, resized to 192x192 from the 1254x1254 sources in
`art-source/2D Avatar Frame/patreon_*_v2.png`. Each tier has its own artwork;
silver used to be the gold frame under a grayscale filter, which is gone.

The sources carry a soft glow baked around the metal, and how much differs per
tier, so the artwork is **not** trimmed. Instead `--avatar-frame-overhang` in
`game.css` is set per tier to put the metal where the retired single frame's
was: silver 12.7%, gold 10.2%, diamond 12.5%. Re-measure it if the art changes.

Silver carries a contrast boost and a dark drop-shadow rim. Chrome alone washed
out against the world's green and the window blue. The tint stays neutral so
blue reads as diamond, the tier above it.

Each image overlays the portrait and does not alter its dimensions or click
area. The travelling highlight is the same image used as a CSS mask, so artwork
and mask must stay the same shape and alignment.

`supporter.webp` is the retired single frame, kept so a cached client that still
requests it does not 404.
