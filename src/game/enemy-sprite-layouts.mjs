import { ionGuardianAtlas } from "./enemy-atlases/ion-guardian.mjs";
import { verdantCryptAtlas } from "./enemy-atlases/verdant-crypt.mjs";
import { neonSentryAtlas } from "./enemy-atlases/neon-sentry.mjs";
import raptorAtlas from "./enemy-atlases/raptor-mechanic.mjs";
import pumpkinAtlas from "./enemy-atlases/pumpkin-orange.mjs";
import tulipAtlas from "./enemy-atlases/flower-tulip.mjs";
import beeAtlas from "./enemy-atlases/wingdemon-bee.mjs";
import fungusAtlas from "./enemy-atlases/fungus-rock.mjs";
import crystalAtlas from "./enemy-atlases/hornrabbit-crystal.mjs";
// Endless-only Layer Lab captures (0.867); names in shared/endless-enemies.ts.
import carapaceCastleAtlas from "./enemy-atlases/carapace-castle.mjs";
import carapaceGreenAtlas from "./enemy-atlases/carapace-green.mjs";
import carapaceIronAtlas from "./enemy-atlases/carapace-iron.mjs";
import evilmassAngryAtlas from "./enemy-atlases/evilmass-angry.mjs";
import evilmassBoxerAtlas from "./enemy-atlases/evilmass-boxer.mjs";
import evilmassKnightAtlas from "./enemy-atlases/evilmass-knight.mjs";
import flowerBerryAtlas from "./enemy-atlases/flower-berry.mjs";
import flowerCandyAtlas from "./enemy-atlases/flower-candy.mjs";
import flowerDaisyAtlas from "./enemy-atlases/flower-daisy.mjs";
import flowerDandelionAtlas from "./enemy-atlases/flower-dandelion.mjs";
import fungusHornAtlas from "./enemy-atlases/fungus-horn.mjs";
import hornrabbitDemonAtlas from "./enemy-atlases/hornrabbit-demon.mjs";
import hornrabbitJellyAtlas from "./enemy-atlases/hornrabbit-jelly.mjs";
import horseBroncoAtlas from "./enemy-atlases/horse-bronco.mjs";
import horseNightmareAtlas from "./enemy-atlases/horse-nightmare.mjs";
import horseUnicornAtlas from "./enemy-atlases/horse-unicorn.mjs";
import larvaGreenAtlas from "./enemy-atlases/larva-green.mjs";
import larvaKnightAtlas from "./enemy-atlases/larva-knight.mjs";
import larvaLeechAtlas from "./enemy-atlases/larva-leech.mjs";
import orcsmasherBerserkerAtlas from "./enemy-atlases/orcsmasher-berserker.mjs";
import orcsmasherRedAtlas from "./enemy-atlases/orcsmasher-red.mjs";
import orcsmasherWarlordAtlas from "./enemy-atlases/orcsmasher-warlord.mjs";
import orcswordButcherAtlas from "./enemy-atlases/orcsword-butcher.mjs";
import orcswordRookieAtlas from "./enemy-atlases/orcsword-rookie.mjs";
import orcswordVeteranAtlas from "./enemy-atlases/orcsword-veteran.mjs";
import pumpkinSteelAtlas from "./enemy-atlases/pumpkin-steel.mjs";
import raptorSwampAtlas from "./enemy-atlases/raptor-swamp.mjs";
import reaperBloodAtlas from "./enemy-atlases/reaper-blood.mjs";
import rhinoHugeAtlas from "./enemy-atlases/rhino-huge.mjs";
import toadGiantAtlas from "./enemy-atlases/toad-giant.mjs";
import toadHornAtlas from "./enemy-atlases/toad-horn.mjs";
import toadKingAtlas from "./enemy-atlases/toad-king.mjs";
import wingdemonAppleAtlas from "./enemy-atlases/wingdemon-apple.mjs";
import wingdemonBombAtlas from "./enemy-atlases/wingdemon-bomb.mjs";
import wingdemonEyeAtlas from "./enemy-atlases/wingdemon-eye.mjs";
import wingdemonVampireAtlas from "./enemy-atlases/wingdemon-vampire.mjs";
import winterIceAtlas from "./enemy-atlases/winter-ice.mjs";
import winterIronAtlas from "./enemy-atlases/winter-iron.mjs";
import winterSnowAtlas from "./enemy-atlases/winter-snow.mjs";
import wormLightningAtlas from "./enemy-atlases/worm-lightning.mjs";
import wormPoisonAtlas from "./enemy-atlases/worm-poison.mjs";

/** One family within each map, not one recolored slime across the whole game.
 * Keep this browser JavaScript: the local layer aligner imports it directly.
 * Names/roles remain gameplay identities; this table only selects their art.
 */
// These loose bow sprites fire down in their source pose. Turn that axis
// toward actor-local right when a ranged enemy tracks a target.
export const ENEMY_BOW_AIM_OFFSET_RADIANS = -Math.PI / 2;
export const REGULAR_ENEMY_SPRITE_SIZE = 54;
export const ELITE_ENEMY_SPRITE_SIZE = 78;
const PARTS = "assets/wildstat/2D Character - Casual Monsters/_PNG";
const SHARED_BOW = `${PARTS}/goblin/goblin/goblin_archer/bow.webp`;

export const MAP_ENEMY_FAMILIES = {
  tutorial_forest: "slime-green",
  beginner_desert: "goblin",
  intermediate_snowlands: "skeleton",
  advanced_lava_wastes: "slime-orange",
  infernal_depths: "skeleton-poison",
  water_reach: "goblin-green",
  samurai_garden: "flower-tulip",
  cloudspire: "wingdemon-bee",
  moonfen: "fungus-rock",
  crystal_hollows: "hornrabbit-crystal", clockwork_ruins: "raptor-mechanic", duskfall_orchard: "pumpkin-orange", neon_bastion: "neon-sentry", verdant_catacombs: "verdant-crypt", ion_citadel: "ion-guardian",
};

const spriteSize = (elite) => elite ? ELITE_ENEMY_SPRITE_SIZE : REGULAR_ENEMY_SPRITE_SIZE;
const spriteHeight = (size) => Math.round(size * 70 / 74);
function bowLayer(elite) {
  const w = elite ? 54 : 42;
  const h = Math.round(w * 40 / 66);
  return { src: SHARED_BOW, x: -w * .54, y: 0, w, h, aimPivot: { x: 0, y: h * .6 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS };
}

function slimeSprite(color, { elite = false, ranged = false, armored = false } = {}) {
  const size = spriteSize(elite);
  const height = elite ? size : armored ? size * 66 / 77 : size * 70 / 74;
  const variant = elite ? "-king" : armored ? "-stone" : "";
  return {
    family: `slime-${color}`, size, height,
    layers: [
      { src: `assets/wildstat/enemies/slime-${color}${variant}.webp`, x: -size / 2, y: -height / 2, w: size, h: height },
      ...(ranged ? [bowLayer(elite)] : []),
    ],
  };
}

// Original authored layer positions, normalized together to current enemy
// sizes. Never scale individual limbs independently or restore old hitboxes.
function layeredSprite(family, folder, parts, elite) {
  const size = spriteSize(elite);
  const height = spriteHeight(size);
  const top = Math.min(...parts.map((part) => part.y));
  const bottom = Math.max(...parts.map((part) => part.y + part.h));
  const scale = height / (bottom - top);
  const centerY = (top + bottom) / 2;
  return {
    family, size, height,
    layers: parts.map(({ file, ...part }) => ({
      ...part, src: `${PARTS}/${folder}/${file}.webp`,
      x: part.x * scale, y: (part.y - centerY) * scale, w: part.w * scale, h: part.h * scale,
      ...(part.aimPivot ? { aimPivot: { x: part.aimPivot.x * scale, y: (part.aimPivot.y - centerY) * scale } } : {}),
    })),
  };
}

function goblinSprite(green, { elite = false, ranged = false } = {}) {
  const color = green ? "goblin_green" : "goblin";
  const parts = ranged ? [
    { file: "leg", x: -14, y: 22, w: 15, h: 16 },
    { file: "leg2", x: 1, y: 22, w: 15, h: 16 },
    { file: "body", x: -25, y: -31, w: 50, h: 58 },
    { file: "hat", x: -32, y: -43, w: 64, h: 39 },
    { file: "bow", x: -27, y: 0, w: 50, h: 30, aimPivot: { x: 0, y: 18 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS },
  ] : [
    { file: "leg", x: -15, y: 23, w: 17, h: 15 },
    { file: "leg2", x: 1, y: 23, w: 17, h: 15 },
    { file: "body", x: -28, y: -39, w: 56, h: 70 },
    { file: "arm", x: -38, y: -16, w: 72, h: 31 },
    { file: "arm2", x: 18, y: -8, w: 17, h: 17 },
  ];
  return layeredSprite(green ? "goblin-green" : "goblin", `goblin/${color}/goblin_${ranged ? "archer" : "warrior"}`, parts, elite);
}

function skeletonSprite(poison, { elite = false, ranged = false, armored = false } = {}) {
  const color = poison ? "skull_poison" : "skull";
  const role = ranged ? "skull_archer" : armored ? "skull_warrior" : "skull";
  const parts = ranged ? [
    { file: "leg1", x: -16, y: 19, w: 15, h: 21 },
    { file: "leg2", x: 1, y: 19, w: 17, h: 22 },
    { file: "body", x: -20, y: -5, w: 40, h: 40 },
    { file: "head", x: -32, y: -37, w: 64, h: 46 },
    { file: "bow", x: 15, y: -6, w: 43, h: 33, aimPivot: { x: 20, y: 8 }, aimOffsetRadians: ENEMY_BOW_AIM_OFFSET_RADIANS },
  ] : armored ? [
    { file: "leg", x: -16, y: 24, w: 18, h: 26 },
    { file: "leg2", x: 1, y: 27, w: 17, h: 23 },
    { file: "body", x: -25, y: -18, w: 50, h: 50 },
    { file: "arm", x: -40, y: -10, w: 70, h: 44 },
    { file: "head", x: -34, y: -49, w: 68, h: 57 },
    { file: "shield", x: 18, y: -6, w: 32, h: 34 },
  ] : [
    { file: "leg", x: -17, y: 25, w: 20, h: 27 },
    { file: "leg2", x: 1, y: 27, w: 19, h: 25 },
    { file: "body", x: -29, y: -23, w: 58, h: 59 },
    { file: "arm", x: -35, y: -12, w: 25, h: 26 },
    { file: "arm2", x: 10, y: -12, w: 25, h: 26 },
    { file: "head", x: -34, y: -56, w: 68, h: 57 },
  ];
  return layeredSprite(poison ? "skeleton-poison" : "skeleton", `skull/${color}/${role}`, parts, elite);
}

function animatedSprite(family, atlas, { elite = false } = {}) {
  const size = spriteSize(elite);
  const height = spriteHeight(size);
  const scale = height / (atlas.bounds.bottom - atlas.bounds.top);
  return {
    family, size, height,
    // The captured bodies sit a little high inside their frame. Keep the
    // floating labels anchored to the actor while lowering only the artwork
    // toward its reward text and baked ground shadow.
    visualOffsetY: 7,
    // Fixed origin across motions; idle bounds keep labels/shadows steady.
    animation: {
      ...atlas, x: -atlas.anchorX * scale, y: height / 2 - atlas.bounds.bottom * scale,
      w: atlas.frameWidth * scale, h: atlas.frameHeight * scale,
      top: -height / 2, bottom: height / 2,
      // These Unity captures face left; the actor's local forward is right.
      sourceFacingX: -1,
      hasBakedShadow: true,
    },
    // The new families use their baked attack poses, including ranged roles.
    layers: [],
  };
}

const forest = (options) => slimeSprite("green", options);
const desert = (options) => goblinSprite(false, options);
const snow = (options) => skeletonSprite(false, options);
const lava = (options) => slimeSprite("orange", options);
const night = (options) => skeletonSprite(true, options);
const water = (options) => goblinSprite(true, options);
const samurai = (options) => animatedSprite("flower-tulip", tulipAtlas, options);
const cloudspire = (options) => animatedSprite("wingdemon-bee", beeAtlas, options);
const moonfen = (options) => animatedSprite("fungus-rock", fungusAtlas, options);
const crystalHollows = (options) => animatedSprite("hornrabbit-crystal", crystalAtlas, options);
const clockworkRuins = (options) => animatedSprite("raptor-mechanic", raptorAtlas, options);
const duskfallOrchard = (options) => animatedSprite("pumpkin-orange", pumpkinAtlas, options);
// One sword-sentry design for this region; the unused designs live in art-source.
const neonBastion = (options) => {
  const sprite = animatedSprite("neon-sentry", neonSentryAtlas("reaver"), options);
  sprite.animation.sourceFacingX = 1;
  return sprite;
};
const verdantCatacombs = (role, options) => {
  const sprite = animatedSprite("verdant-crypt", verdantCryptAtlas(role), options);
  sprite.animation.sourceFacingX = 1;
  return sprite;
};
const ionCitadel = (options) => {
  const sprite = animatedSprite("ion-guardian", ionGuardianAtlas(), options);
  sprite.animation.sourceFacingX = 1;
  return sprite;
};

export const ENEMY_SPRITE_LAYOUTS = {
  // Endless-only: one Layer Lab capture each (shared/endless-enemies.ts).
  "Castle Carapace": animatedSprite("carapace-castle", carapaceCastleAtlas),
  "Green Carapace": animatedSprite("carapace-green", carapaceGreenAtlas),
  "Iron Carapace": animatedSprite("carapace-iron", carapaceIronAtlas),
  "Angry Evilmass": animatedSprite("evilmass-angry", evilmassAngryAtlas),
  "Boxer Evilmass": animatedSprite("evilmass-boxer", evilmassBoxerAtlas),
  "Knight Evilmass": animatedSprite("evilmass-knight", evilmassKnightAtlas),
  "Berry Bloom": animatedSprite("flower-berry", flowerBerryAtlas),
  "Candy Bloom": animatedSprite("flower-candy", flowerCandyAtlas),
  "Daisy Bloom": animatedSprite("flower-daisy", flowerDaisyAtlas),
  "Dandelion Bloom": animatedSprite("flower-dandelion", flowerDandelionAtlas),
  "Horned Fungus": animatedSprite("fungus-horn", fungusHornAtlas),
  "Demon Hornrabbit": animatedSprite("hornrabbit-demon", hornrabbitDemonAtlas),
  "Jelly Hornrabbit": animatedSprite("hornrabbit-jelly", hornrabbitJellyAtlas),
  "Bronco": animatedSprite("horse-bronco", horseBroncoAtlas),
  "Nightmare": animatedSprite("horse-nightmare", horseNightmareAtlas),
  "Unicorn": animatedSprite("horse-unicorn", horseUnicornAtlas),
  "Green Larva": animatedSprite("larva-green", larvaGreenAtlas),
  "Knight Larva": animatedSprite("larva-knight", larvaKnightAtlas),
  "Leech Larva": animatedSprite("larva-leech", larvaLeechAtlas),
  "Orc Berserker": animatedSprite("orcsmasher-berserker", orcsmasherBerserkerAtlas),
  "Red Orc Smasher": animatedSprite("orcsmasher-red", orcsmasherRedAtlas),
  "Orc Warlord": animatedSprite("orcsmasher-warlord", orcsmasherWarlordAtlas),
  "Orc Butcher": animatedSprite("orcsword-butcher", orcswordButcherAtlas),
  "Orc Rookie": animatedSprite("orcsword-rookie", orcswordRookieAtlas),
  "Orc Veteran": animatedSprite("orcsword-veteran", orcswordVeteranAtlas),
  "Steel Pumpkin": animatedSprite("pumpkin-steel", pumpkinSteelAtlas),
  "Swamp Raptor": animatedSprite("raptor-swamp", raptorSwampAtlas),
  "Blood Reaper": animatedSprite("reaper-blood", reaperBloodAtlas),
  "Huge Rhino": animatedSprite("rhino-huge", rhinoHugeAtlas),
  "Giant Toad": animatedSprite("toad-giant", toadGiantAtlas),
  "Horned Toad": animatedSprite("toad-horn", toadHornAtlas),
  "Toad King": animatedSprite("toad-king", toadKingAtlas),
  "Apple Wingdemon": animatedSprite("wingdemon-apple", wingdemonAppleAtlas),
  "Bomb Wingdemon": animatedSprite("wingdemon-bomb", wingdemonBombAtlas),
  "Eye Wingdemon": animatedSprite("wingdemon-eye", wingdemonEyeAtlas),
  "Vampire Wingdemon": animatedSprite("wingdemon-vampire", wingdemonVampireAtlas),
  "Ice Winterling": animatedSprite("winter-ice", winterIceAtlas),
  "Iron Winterling": animatedSprite("winter-iron", winterIronAtlas),
  "Snow Winterling": animatedSprite("winter-snow", winterSnowAtlas),
  "Lightning Worm": animatedSprite("worm-lightning", wormLightningAtlas),
  "Poison Worm": animatedSprite("worm-poison", wormPoisonAtlas),
  "Ion Patrol": ionCitadel(),
  "Capacitor Gunner": ionCitadel({ ranged: true }),
  "Citadel Marshal": ionCitadel({ elite: true }),
  "Bastion Defender": ionCitadel(),
  "Flux Enforcer": ionCitadel({ elite: true, ranged: true }),
  "Reactor Warden": ionCitadel({ elite: true }),
  "Mossbound Stalker": verdantCatacombs("stalker"),
  "Spore Slinger": verdantCatacombs("slinger", { ranged: true }),
  "Mycelial Regent": verdantCatacombs("regent", { elite: true }),
  "Ossuary Guardian": verdantCatacombs("guardian"),
  "Briar Reaver": verdantCatacombs("reaver", { elite: true, ranged: true }),
  "Crypt Oracle": verdantCatacombs("oracle", { elite: true }),

  Bramble: forest(),
  Needle: forest(),
  // Attack speed and crit camps (0.901.47) wear their map's regular melee look.
  Striker: forest(),
  "Dune Needle": desert(), "Dune Striker": desert(),
  "Frost Needle": snow(), "Frost Striker": snow(),
  "Cinder Needle": lava(), "Cinder Striker": lava(),
  "Abyss Needle": night(), "Abyss Striker": night(),
  "Reef Needle": water(), "Reef Striker": water(),
  "Petal Needle": samurai(), "Petal Striker": samurai(),
  "Gale Needle": cloudspire(), "Gale Striker": cloudspire(),
  "Fen Needle": moonfen(), "Fen Striker": moonfen(),
  "Shard Needle": crystalHollows(), "Shard Striker": crystalHollows(),
  "Gear Needle": clockworkRuins(), "Gear Striker": clockworkRuins(),
  "Gourd Needle": duskfallOrchard(), "Gourd Striker": duskfallOrchard(),
  "Circuit Needle": neonBastion(), "Circuit Striker": neonBastion(),
  "Moss Needle": verdantCatacombs("stalker"), "Moss Striker": verdantCatacombs("stalker"),
  "Ion Needle": ionCitadel(), "Ion Striker": ionCitadel(),
  Mossback: forest({ armored: true }),
  Spitter: forest(),
  Brood: forest({ ranged: true }),
  Cindermaw: forest({ armored: true }),
  "King Slime": forest({ elite: true }),
  "Dread Warden": forest({ elite: true }),
  "Dune Raider": desert(),
  "Dune Archer": desert({ ranged: true }),
  "Dune Regent": desert({ elite: true }),
  "Venom Guard": desert(),
  "Wastes Reaper": desert({ elite: true, ranged: true }),
  "Blight Oracle": desert({ elite: true }),
  "Frost Raider": snow(),
  "Glacier Archer": snow({ ranged: true }),
  "Glacier Regent": snow({ elite: true }),
  "Rime Guard": snow({ armored: true }),
  "Whiteout Reaper": snow({ elite: true, ranged: true }),
  "Aurora Oracle": snow({ elite: true }),
  "Ember Raider": lava(),
  "Cinder Archer": lava({ ranged: true }),
  "Cinder Regent": lava({ elite: true }),
  "Magma Guard": lava({ armored: true }),
  "Ash Reaper": lava({ elite: true, ranged: true }),
  "Inferno Oracle": lava({ elite: true }),
  "Depth Raider": night(),
  "Abyss Archer": night({ ranged: true }),
  "Abyss Regent": night({ elite: true }),
  "Obsidian Colossus": night({ armored: true }),
  "Doom Reaper": night({ elite: true, ranged: true }),
  "Nether Oracle": night({ elite: true }),
  "Tide Raider": water(),
  "Reef Archer": water({ ranged: true }),
  "Reef Regent": water({ elite: true }),
  "Coral Colossus": water(),
  "Drowned Reaper": water({ elite: true, ranged: true }),
  "Tidal Oracle": water({ elite: true }),
  "Sakura Ronin": samurai(),
  "Petal Archer": samurai(),
  "Petal Regent": samurai({ elite: true }),
  "Bamboo Guardian": samurai(),
  "Moonblade Reaper": samurai({ elite: true }),
  "Shrine Oracle": samurai({ elite: true }),
  "Gale Prowler": cloudspire(),
  "Nimbus Archer": cloudspire(),
  "Nimbus Regent": cloudspire({ elite: true }),
  "Skyguard Colossus": cloudspire(),
  "Thunder Reaper": cloudspire({ elite: true }),
  "Tempest Oracle": cloudspire({ elite: true }),
  "Fen Prowler": moonfen(),
  "Shard Hopper": crystalHollows(), "Gear Prowler": clockworkRuins(), "Gourd Prowler": duskfallOrchard(), "Circuit Prowler": neonBastion(),
  "Glowcap Archer": moonfen(),
  "Glowcap Regent": moonfen({ elite: true }),
  "Crystal Spitter": crystalHollows(), "Rivet Spitter": clockworkRuins(), "Seed Spitter": duskfallOrchard(), "Pulse Spitter": neonBastion(),
  "Crystal Regent": crystalHollows({ elite: true }), "Gear Regent": clockworkRuins({ elite: true }), "Harvest Regent": duskfallOrchard({ elite: true }), "Voltage Regent": neonBastion({ elite: true }),
  "Bog Colossus": moonfen(),
  "Geode Guardian": crystalHollows(), "Iron Guardian": clockworkRuins(), "Husk Guardian": duskfallOrchard(), "Relay Guardian": neonBastion(),
  "Moonmire Reaper": moonfen({ elite: true }),
  "Prism Reaver": crystalHollows({ elite: true }), "Scrap Reaver": clockworkRuins({ elite: true }), "Thorn Reaver": duskfallOrchard({ elite: true }), "Arc Reaver": neonBastion({ elite: true }),
  "Wisp Oracle": moonfen({ elite: true }),
  "Hollow Oracle": crystalHollows({ elite: true }), "Spark Oracle": clockworkRuins({ elite: true }), "Harvest Oracle": duskfallOrchard({ elite: true }), "Signal Oracle": neonBastion({ elite: true }),
};
