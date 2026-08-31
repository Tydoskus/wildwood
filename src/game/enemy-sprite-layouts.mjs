/**
 * Renderer source of truth for enemy sprite layout.
 *
 * Every map deliberately reuses one slime body. Color distinguishes the map,
 * a shared bow distinguishes ranged enemies, and scale distinguishes elites.
 * This keeps new regions visually readable without requiring five bespoke
 * regular-enemy drawings for every tier.
 */
export const ENEMY_BOW_AIM_OFFSET_RADIANS = 0;

export const REGULAR_ENEMY_SPRITE_SIZE = 54;
export const ELITE_ENEMY_SPRITE_SIZE = 78;

const SLIME_BODY_SOURCE = "assets/wildstat/enemies/slime-green.png";
const SLIME_BOW_SOURCE = "assets/wildstat/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/bow.png";

export const MAP_ENEMY_FAMILY_TINTS = {
  tutorial_forest: null,
  beginner_desert: "#f3a13b",
  intermediate_snowlands: "#9bdff5",
  advanced_lava_wastes: "#f05c3f",
  infernal_depths: "#8157bd",
  water_reach: "#42cbd5",
  samurai_garden: "#ef7eae",
};

function slimeSprite(tint, { elite = false, ranged = false } = {}) {
  const size = elite ? ELITE_ENEMY_SPRITE_SIZE : REGULAR_ENEMY_SPRITE_SIZE;
  const bodyHeight = Math.round(size * 70 / 74);
  const body = {
    src: SLIME_BODY_SOURCE,
    x: -size / 2,
    y: -bodyHeight / 2,
    w: size,
    h: bodyHeight,
    ...(tint ? { tint } : {}),
  };
  if (!ranged) return { size, height: bodyHeight, layers: [body] };

  const bowWidth = elite ? 54 : 42;
  const bowHeight = Math.round(bowWidth * 40 / 66);
  return {
    size,
    height: bodyHeight,
    layers: [
      body,
      {
        src: SLIME_BOW_SOURCE,
        x: -bowWidth * .54,
        y: 0,
        w: bowWidth,
        h: bowHeight,
        aimPivot: { x: 0, y: bowHeight * .6 },
        aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS,
      },
    ],
  };
}

const forest = MAP_ENEMY_FAMILY_TINTS.tutorial_forest;
const desert = MAP_ENEMY_FAMILY_TINTS.beginner_desert;
const snow = MAP_ENEMY_FAMILY_TINTS.intermediate_snowlands;
const lava = MAP_ENEMY_FAMILY_TINTS.advanced_lava_wastes;
const night = MAP_ENEMY_FAMILY_TINTS.infernal_depths;
const water = MAP_ENEMY_FAMILY_TINTS.water_reach;
const samurai = MAP_ENEMY_FAMILY_TINTS.samurai_garden;

export const ENEMY_SPRITE_LAYOUTS = {
  Bramble: slimeSprite(forest),
  Needle: slimeSprite(forest),
  Mossback: slimeSprite(forest),
  Spitter: slimeSprite(forest),
  Brood: slimeSprite(forest, { ranged: true }),
  Cindermaw: slimeSprite(forest),
  "King Slime": slimeSprite(forest, { elite: true }),
  "Dread Warden": slimeSprite(forest, { elite: true }),

  "Dune Raider": slimeSprite(desert),
  "Dune Archer": slimeSprite(desert, { ranged: true }),
  "Venom Guard": slimeSprite(desert),
  "Wastes Reaper": slimeSprite(desert, { elite: true, ranged: true }),
  "Blight Oracle": slimeSprite(desert, { elite: true }),

  "Frost Raider": slimeSprite(snow),
  "Glacier Archer": slimeSprite(snow, { ranged: true }),
  "Rime Guard": slimeSprite(snow),
  "Whiteout Reaper": slimeSprite(snow, { elite: true, ranged: true }),
  "Aurora Oracle": slimeSprite(snow, { elite: true }),

  "Ember Raider": slimeSprite(lava),
  "Cinder Archer": slimeSprite(lava, { ranged: true }),
  "Magma Guard": slimeSprite(lava),
  "Ash Reaper": slimeSprite(lava, { elite: true, ranged: true }),
  "Inferno Oracle": slimeSprite(lava, { elite: true }),

  "Depth Raider": slimeSprite(night),
  "Abyss Archer": slimeSprite(night, { ranged: true }),
  "Obsidian Colossus": slimeSprite(night),
  "Doom Reaper": slimeSprite(night, { elite: true, ranged: true }),
  "Nether Oracle": slimeSprite(night, { elite: true }),

  "Tide Raider": slimeSprite(water),
  "Reef Archer": slimeSprite(water, { ranged: true }),
  "Coral Colossus": slimeSprite(water),
  "Drowned Reaper": slimeSprite(water, { elite: true, ranged: true }),
  "Tidal Oracle": slimeSprite(water, { elite: true }),

  "Sakura Ronin": slimeSprite(samurai),
  "Petal Archer": slimeSprite(samurai, { ranged: true }),
  "Bamboo Guardian": slimeSprite(samurai),
  "Moonblade Reaper": slimeSprite(samurai, { elite: true, ranged: true }),
  "Shrine Oracle": slimeSprite(samurai, { elite: true }),
};
