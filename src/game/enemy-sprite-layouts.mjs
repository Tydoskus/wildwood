/**
 * Renderer source of truth for enemy sprite layout.
 *
 * This file intentionally stays valid browser JavaScript so the local enemy
 * sprite aligner can import the exact values used by the game.
 */
export const ENEMY_BOW_AIM_OFFSET_RADIANS = Math.PI / 2;

export const ENEMY_SPRITE_LAYOUTS = {
  Bramble: { src: "assets/wildwood/enemies/slime-green.png", size: 46 },
  Needle: { src: "assets/wildwood/enemies/slime-orange.png", size: 42 },
  Mossback: { src: "assets/wildwood/enemies/slime-green-stone.png", size: 62 },
  Spitter: { src: "assets/wildwood/enemies/slime-orange.png", size: 50 },
  Brood: {
    size: 64,
    height: 70,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg1.png", x: -16, y: 19, w: 15, h: 21 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg2.png", x: 1, y: 19, w: 17, h: 22 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/body.png", x: -20, y: -5, w: 40, h: 40 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/bow.png", x: 15, y: -6, w: 43, h: 33, aimPivot: { x: 20, y: 8 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/head.png", x: -32, y: -37, w: 64, h: 46 },
    ],
  },
  Cindermaw: { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 64 },
  "King Slime": { src: "assets/wildwood/enemies/slime-green-king.png", size: 74 },
  "Dread Warden": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 88 },
  "Dune Raider": {
    size: 70,
    height: 78,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/leg.png", x: -15, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/leg2.png", x: 1, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/body.png", x: -28, y: -39, w: 56, h: 70 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/arm.png", x: -38, y: -16, w: 72, h: 31 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/arm2.png", x: 18, y: -8, w: 17, h: 17 },
    ],
  },
  "Dune Archer": {
    size: 68,
    height: 76,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/leg.png", x: -14, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/leg2.png", x: 1, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/body.png", x: -25, y: -31, w: 50, h: 58 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/hat.png", x: -32, y: -43, w: 64, h: 39 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/bow.png", x: -27, y: 0, w: 50, h: 30, aimPivot: { x: 0, y: 18 }, aimOffsetRadians: 0 },
    ],
  },
  "Venom Guard": {
    size: 76,
    height: 86,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg.png", x: -16, y: 24, w: 18, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg2.png", x: 1, y: 27, w: 17, h: 23 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/body.png", x: -25, y: -18, w: 50, h: 50 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/arm.png", x: -40, y: -10, w: 70, h: 44 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/head.png", x: -34, y: -49, w: 68, h: 57 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/shield.png", x: 18, y: -6, w: 32, h: 34 },
    ],
  },
  "Wastes Reaper": {
    size: 86,
    height: 92,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg1.png", x: -18, y: 25, w: 19, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg2.png", x: 1, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/body.png", x: -26, y: -22, w: 52, h: 52 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/bow.png", x: 19, y: -17, w: 56, h: 43, aimPivot: { x: 26, y: 5 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/head.png", x: -39, y: -56, w: 78, h: 56 },
    ],
  },
  "Blight Oracle": {
    size: 82,
    height: 92,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg.png", x: -17, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg2.png", x: 1, y: 27, w: 19, h: 25 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/body.png", x: -29, y: -23, w: 58, h: 59 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm.png", x: -35, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm2.png", x: 10, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/head.png", x: -34, y: -56, w: 68, h: 57 },
    ],
  },
  "Frost Raider": { src: "assets/wildwood/enemies/slime-green-stone.png", size: 62 },
  "Glacier Archer": { src: "assets/wildwood/enemies/slime-orange.png", size: 50 },
  "Rime Guard": { src: "assets/wildwood/enemies/slime-green-stone.png", size: 70 },
  "Whiteout Reaper": { src: "assets/wildwood/enemies/slime-orange.png", size: 66 },
  "Aurora Oracle": { src: "assets/wildwood/enemies/slime-green.png", size: 68 },
  "Ember Raider": { src: "assets/wildwood/enemies/slime-orange.png", size: 58 },
  "Cinder Archer": { src: "assets/wildwood/enemies/slime-orange.png", size: 54 },
  "Magma Guard": { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 78 },
  "Ash Reaper": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 92 },
  "Inferno Oracle": { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 84 },
  "Depth Raider": { src: "assets/wildwood/enemies/slime-orange.png", size: 62 },
  "Abyss Archer": { src: "assets/wildwood/enemies/slime-orange.png", size: 58 },
  "Obsidian Colossus": { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 84 },
  "Doom Reaper": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 98 },
  "Nether Oracle": { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 90 },
  "Tide Raider": {
    size: 76,
    height: 84,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_warrior/leg.png", x: -15, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_warrior/leg2.png", x: 1, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_warrior/body.png", x: -28, y: -39, w: 56, h: 70 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_warrior/arm.png", x: -38, y: -16, w: 72, h: 31 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_warrior/arm2.png", x: 18, y: -8, w: 17, h: 17 },
    ],
  },
  "Reef Archer": {
    size: 74,
    height: 82,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_archer/leg.png", x: -14, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_archer/leg2.png", x: 1, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_archer/body.png", x: -25, y: -31, w: 50, h: 58 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_archer/hat.png", x: -32, y: -43, w: 64, h: 39 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin_green/goblin_archer/bow.png", x: -27, y: 0, w: 50, h: 30, aimPivot: { x: 0, y: 18 }, aimOffsetRadians: 0 },
    ],
  },
  "Coral Colossus": {
    size: 90,
    height: 100,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg.png", x: -16, y: 24, w: 18, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg2.png", x: 1, y: 27, w: 17, h: 23 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/body.png", x: -25, y: -18, w: 50, h: 50 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/arm.png", x: -40, y: -10, w: 70, h: 44 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/head.png", x: -34, y: -49, w: 68, h: 57 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/shield.png", x: 18, y: -6, w: 32, h: 34 },
    ],
  },
  "Drowned Reaper": {
    size: 98,
    height: 104,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg1.png", x: -18, y: 25, w: 19, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg2.png", x: 1, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/body.png", x: -26, y: -22, w: 52, h: 52 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/bow.png", x: 19, y: -17, w: 56, h: 43, aimPivot: { x: 26, y: 5 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/head.png", x: -39, y: -56, w: 78, h: 56 },
    ],
  },
  "Tidal Oracle": {
    size: 92,
    height: 100,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg.png", x: -17, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg2.png", x: 1, y: 27, w: 19, h: 25 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/body.png", x: -29, y: -23, w: 58, h: 59 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm.png", x: -35, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm2.png", x: 10, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/head.png", x: -34, y: -56, w: 68, h: 57 },
    ],
  },
};
