# Adding campaign content

Append maps to `campaign-registry.json` in play order. Keep existing `claimIndex`
values unchanged; they are saved boss-clear bits. The current u32 save field
supports 32 campaign claims. Endless itself has no fixed map count.

The registry drives map names, campaign access, balance entries, default portal
links, final campaign baseline, Endless entry, and prestige requirements.
With 15 campaign maps, Endless 1 is stage 16; with 16 maps it is stage 17.
Prestige 1 always requires stage 15, prestige 2 stage 16, and so on.
New map settings default to neutral multipliers when loading older balance data.
Existing Endless saves remain relative Endless progress, not absolute map numbers.

A new map still needs authored terrain/spawn camps and its boss encounter/art
integration in the game. Add its map identifier to the game's MapId type while
wiring that content. Put the spawn-camp export in `campsKey`, or provide live
spawn camps in map-designs.json. New maps can use the preceding boss claim for
access instead of adding another unlock boolean/database column.

Register boss artwork in `src/game/boss-art.json`: sheet, single image, or an
atlas manifest. The tuner discovers that registry on reload; its save operation
adds missing tuning constants. Wire those constants into any newly authored
renderer/encounter. Existing renderer styles share crop geometry with the tuner.
New attack mechanics and image loading still need their normal game integration.
