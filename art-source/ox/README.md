# Ox

`og-player-spritesheet.png` is the game's original ("OG") player sprite: the
orange horned creature with a green leaf collar and brown belt. It is copied
unchanged from commit `c45270ef` (2026-08-02, "Create standalone Wildwood game
repo"), where it was `assets/wildwood/wildwood-player-spritesheet.png`.

It is a 4 × 4 sheet, 1254 px square: rows face down (front), left, right and
away; the columns are walk frames. Ox, the Galaxy set's seller in the Town's
bottom-right house, uses the first frame of the first row: standing, facing down.

`node scripts/art/bake-ox-sprite.mjs` bakes it into
`public/assets/wildstat/ox-idle.webp`.
