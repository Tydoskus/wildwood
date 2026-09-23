# WildStat Boss Tuner

    npm run boss:tuner

Opens a local editor for the things that decide how a sprite-sheet boss sits
on screen and how it is hit. Pick a boss, drag the pink ellipse in the preview
or adjust a field, and press **Save changes** in the header. A yellow dot marks
each boss with unsaved edits. **Revert boss** restores the selected boss to its
last saved values; **Reload from disk** reloads all bosses after confirmation.
The preview starts paused so its frame controls stay stable while you edit.

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
- **Artwork** — where the sprite sits. For most bosses the game positions its
  shadow and status bar relative to this offset, and the preview does the same.
  The Spider's artwork has its own feet-based offset.
- **Shadow** — how far down the ground shadow sits, independent of draw order.
- **Depth** — whether the boss draws in front of or behind a player standing
  beside it. This shared a number with the shadow until they were separated,
  which is why nudging a shadow used to change draw order.
- **Frame** — a correction for the frame on screen: where its crop sits in the
  cell, how big that crop is, where the frame lands, and its scale. Every field
  is a correction from zero, so an untouched frame draws exactly as it did
  before. Move status bar handles poses taller than idle. These are written to
  `src/game/boss-frame-crops.json`, and only the
  frames actually nudged appear in it.

Frame names come from the rule the renderer picks by, not from a guess, so a
frame the game never draws says "never drawn" rather than inviting work on it.
Magmalisk has one and so does Gloomroot; Frostclaw's idle cycles through all
four, which is why its names read as pairs.

Saving sends only edited bosses and writes their values back to the constants
they came from:
`*_RADIUS` in `spacetimedb/src/boss-combat.ts`, `*_VERTICAL_RADIUS` and
`*_HITBOX_OFFSET_Y` in `shared/boss-hitbox.ts`, and `*_ART_TOP`,
`*_SPRITE_Y_OFFSET`, `*_SPRITE_GROUND_OFFSET` and `*_DEPTH_OFFSET` in
`src/game/constants.ts`. The Spider stands from `SPIDER_STAND_OFFSET`, because
its artwork is placed from its feet rather than from a centre. A boss with no constant
yet gets one appended. Nothing else in those files is touched.

Radii are server-side, so a change to a hitbox needs
`npm run spacetime:publish:live` as well as the client push.

`node scripts/check-boss-hitboxes.mjs` measures the artwork and prints what the
numbers ought to be, which is the quickest way to find a boss worth opening
here. The preview and checker apply the same green removal and frame alignment
as the game before showing or measuring the artwork. The server only listens
on `127.0.0.1`.

The draw sizes, health bar sizes, and guide offsets in
`scripts/boss-tuner-server.mjs` mirror `boss-renderer.ts`. If a boss is redrawn
differently, update that table so the preview stays accurate. If another tuner
is already running, the command reuses it only when it matches this checkout
and editor version; otherwise it starts on the next free local port.
