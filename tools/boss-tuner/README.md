# WildStat Boss Tuner

    npm run boss:tuner

Opens a local editor for the four things that decide how a boss sits on screen
and how it is hit. Pick a boss on the left, drag or slide on the right, and
press **Save all**.

- **Hitbox** — the ellipse the server tests a shot against. Drag the pink ring
  to move it, or its left/right edge to set the width and its top/bottom edge
  to set the height. A boss whose height equals its width is a plain circle,
  which is what every boss was before this existed.
- **Centre** — how far the body sits below the anchor, the white cross. The
  anchor is the point the server measures distance from, and on a squat boss it
  is nowhere near the middle of the creature.
- **Floating HUD** — where the name and health bar hang from. Anchored to the
  top of the artwork rather than the top of the sprite's cell, which on a short
  boss is mostly empty air.
- **Shadow** — how far down the ground shadow sits. It is also the boss's
  depth key, so moving it changes whether the boss draws in front of or behind
  a player standing beside it.
- **Frame** — a correction for the frame on screen: where its crop sits in the
  cell, how big that crop is, where the frame lands, and its scale. Every field
  is a correction from zero, so an untouched frame draws exactly as it did
  before. These are written to `src/game/boss-frame-crops.json`, and only the
  frames actually nudged appear in it.

Frame names come from the rule the renderer picks by, not from a guess, so a
frame the game never draws says "never drawn" rather than inviting work on it.
Magmalisk has one and so does Gloomroot; Frostclaw's idle cycles through all
four, which is why its names read as pairs.

Saving writes each value back to the constant it came from:
`*_RADIUS` in `spacetimedb/src/boss-combat.ts`, `*_VERTICAL_RADIUS` and
`*_HITBOX_OFFSET_Y` in `shared/boss-hitbox.ts`, and `*_ART_TOP` and
`*_SPRITE_GROUND_OFFSET` in `src/game/constants.ts`. A boss with no constant
yet gets one appended. Nothing else in those files is touched.

Radii are server-side, so a change to a hitbox needs
`npm run spacetime:publish:live` as well as the client push.

`node scripts/check-boss-hitboxes.mjs` measures the artwork and prints what the
numbers ought to be, which is the quickest way to find a boss worth opening
here. The server only listens on `127.0.0.1`.

The draw sizes in `scripts/boss-tuner-server.mjs` mirror literals inside
`boss-renderer.ts`. If a boss is ever redrawn at a different size, that table
needs the same edit or this preview lies.
