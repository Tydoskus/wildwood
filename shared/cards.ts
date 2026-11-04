import type { RewardType } from "./enemy-definitions";
import { chanceWithLuck } from "./luck-research";
import { generateMap, proceduralMapNumber } from "./procedural-map-core";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import type { WoodTreeKind } from "./woodcutting";

/**
 * Cards: a rare drop from every campaign enemy and boss, from Endless bosses (one Warden card per band of ten maps)
 * and from two kinds of tree, switched on in the Cards tab (active-cards.ts).
 */

export type CardRarity = "regular" | "elite" | "boss";
/** A card's type: a weapon (HAND), helmet (HEAD) or armor (CHEST) card. */
export type CardSlot = "HAND" | "HEAD" | "CHEST";

/** Values are percent, except quickDraw (attacks a second), longShot (range) and iaido/prism (on or off). */
export type CardEffectId =
  // Offense
  | "atk" | "critChance" | "critDamage" | "doubleStrike" | "splitShot" | "bossSlayer" | "eliteSlayer" | "raceSlayer"
  | "rangedSlayer" | "execute" | "opener" | "berserk" | "steady" | "momentum" | "burn" | "poison" | "chill" | "stun"
  | "weaken" | "knockback" | "splash" | "chainLightning" | "lifesteal" | "quickDraw" | "arrowStorm" | "ricochet"
  | "piercing" | "iaido" | "reap"
  // Defense
  | "maxHealth" | "armor" | "regen" | "reflect" | "secondWind" | "dodge" | "rangedGuard" | "meleeGuard" | "bossGuard"
  | "eliteGuard" | "raceGuard" | "shield" | "panicHeal" | "lastStand" | "web" | "prism"
  // Utility
  | "fleetFoot" | "longShot" | "statGain" | "allStatGain" | "cardHunter" | "treasure" | "respawn" | "miningSpeed"
  | "oreFind" | "starshardFind" | "woodcuttingSpeed" | "logFind" | "onward";

/** A negative value is a cost. Boss cards may override an effect's chance, share, seconds or targets. */
export type CardEffect = {
  effect: CardEffectId;
  value: number;
  mapId?: string;
  stat?: RewardType;
  chance?: number;
  share?: number;
  seconds?: number;
  targets?: number;
};

export type CardDefinition = {
  id: string;
  enemy: string;
  mapId: string;
  /** 1 to 15. */
  tier: number;
  rarity: CardRarity;
  slot: CardSlot;
  effects: readonly CardEffect[];
  /** An Endless boss card: the Wardens of maps `from` to `to` (no end when missing) drop it. */
  endless?: { from: number; to?: number };
  /** A tree card: felling this kind of tree drops it. */
  tree?: WoodTreeKind;
  /** Fells (or kills) per drop in play, for a card whose odds are not its rarity's. */
  outcomes?: number;
  /** Left out of the Card Seller, so adding it never changes what an older tab and the server offer. */
  shop?: false;
};

/** Kills per card drop as designed; for bosses, boss kills. */
export const DESIGNED_CARD_DROP_OUTCOMES: Readonly<Record<CardRarity, number>> = Object.freeze({ regular: 10_000, elite: 20_000, boss: 1_000 });
/** The alpha's boost to every card drop; removing it restores the designed odds. */
export const ALPHA_CARD_DROP_BOOST = 10;
/** Kills per card drop in play; for bosses, boss kills. */
export const CARD_DROP_OUTCOMES: Readonly<Record<CardRarity, number>> = Object.freeze({
  regular: DESIGNED_CARD_DROP_OUTCOMES.regular / ALPHA_CARD_DROP_BOOST,
  elite: DESIGNED_CARD_DROP_OUTCOMES.elite / ALPHA_CARD_DROP_BOOST,
  boss: DESIGNED_CARD_DROP_OUTCOMES.boss / ALPHA_CARD_DROP_BOOST,
});
/**
 * Each kill also fills its card's meter by the kill's odds; a full meter guarantees the card. Full is this many times
 * the average kills a card takes, so the odds stay the same but nobody goes forever without one.
 */
export const CARD_METER_MULTIPLE = 2;
/** The meter a card needs, in kills at plain odds. */
export const cardMeterFull = (rarity: CardRarity) => CARD_DROP_OUTCOMES[rarity] * CARD_METER_MULTIPLE;
/** One kill's chance at its card: `odds` kills' worth out of `outcomes`, raised by Card Luck, never past certainty. */
export const cardDropChance = (outcomes: number, odds: number, cardLuckRank = 0) =>
  outcomes > 0 ? chanceWithLuck(odds / outcomes, "cardLuck", cardLuckRank) : 0;
/** Kills (fells for a tree card) per drop in play: the card's own odds, or its rarity's. */
export const cardOutcomes = (card: Pick<CardDefinition, "rarity" | "outcomes">) => card.outcomes ?? CARD_DROP_OUTCOMES[card.rarity];
/** One kill's chance at this card as the server rolls it: Card Hunter cards raise the odds, Card Luck the chance. */
export const cardKillChance = (card: Pick<CardDefinition, "rarity" | "outcomes">, cardHunter = 0, cardLuckRank = 0) =>
  cardDropChance(cardOutcomes(card), 1 + Math.max(0, cardHunter), cardLuckRank);
/** Kills from an empty meter to a sure drop: each kill fills it by the Card Hunter odds (Card Luck does not). */
export const cardSureByKills = (card: Pick<CardDefinition, "rarity" | "outcomes">, cardHunter = 0) =>
  Math.ceil(cardOutcomes(card) * CARD_METER_MULTIPLE / (1 + Math.max(0, cardHunter)) - 1e-9);

export const CARDS: readonly CardDefinition[] = Object.freeze([
  { id: "bramble_card", enemy: "Bramble", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "reflect", value: 1.5 }] },
  { id: "needle_card", enemy: "Needle", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "HAND",
    effects: [{ effect: "doubleStrike", value: 1 }] },
  { id: "mossback_card", enemy: "Mossback", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "armor", value: 3 }] },
  { id: "spitter_card", enemy: "Spitter", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "HAND",
    effects: [{ effect: "atk", value: 2 }] },
  { id: "brood_card", enemy: "Brood", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "regen", value: 4 }] },
  { id: "cindermaw_card", enemy: "Cindermaw", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "HAND",
    effects: [{ effect: "burn", value: 3 }] },
  { id: "king_slime_card", enemy: "King Slime", mapId: "tutorial_forest", tier: 1, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "maxHealth", value: 3.1 }, { effect: "secondWind", value: 0.26 }] },
  { id: "dread_warden_card", enemy: "Dread Warden", mapId: "tutorial_forest", tier: 1, rarity: "elite", slot: "HAND",
    effects: [{ effect: "eliteSlayer", value: 9 }] },
  { id: "striker_card", enemy: "Striker", mapId: "tutorial_forest", tier: 1, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1 }] },
  { id: "dragon_card", enemy: "Dragon", mapId: "tutorial_forest", tier: 1, rarity: "boss", slot: "HAND",
    effects: [{ effect: "splash", value: 25 }] },
  { id: "dune_raider_card", enemy: "Dune Raider", mapId: "beginner_desert", tier: 2, rarity: "regular", slot: "HAND",
    effects: [{ effect: "raceSlayer", value: 9, mapId: "beginner_desert" }] },
  { id: "dune_archer_card", enemy: "Dune Archer", mapId: "beginner_desert", tier: 2, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "longShot", value: 2 }] },
  { id: "dune_regent_card", enemy: "Dune Regent", mapId: "beginner_desert", tier: 2, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "raceGuard", value: 9, mapId: "beginner_desert" }, { effect: "maxHealth", value: 3.4 }] },
  { id: "venom_guard_card", enemy: "Venom Guard", mapId: "beginner_desert", tier: 2, rarity: "regular", slot: "HAND",
    effects: [{ effect: "poison", value: 3.2 }] },
  { id: "wastes_reaper_card", enemy: "Wastes Reaper", mapId: "beginner_desert", tier: 2, rarity: "elite", slot: "HAND",
    effects: [{ effect: "execute", value: 13 }] },
  { id: "blight_oracle_card", enemy: "Blight Oracle", mapId: "beginner_desert", tier: 2, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "respawn", value: 3 }] },
  { id: "dune_needle_card", enemy: "Dune Needle", mapId: "beginner_desert", tier: 2, rarity: "regular", slot: "HAND",
    effects: [{ effect: "quickDraw", value: 0.05 }] },
  { id: "dune_striker_card", enemy: "Dune Striker", mapId: "beginner_desert", tier: 2, rarity: "regular", slot: "HAND",
    effects: [{ effect: "critDamage", value: 6 }] },
  { id: "desert_spider_card", enemy: "Desert Spider", mapId: "beginner_desert", tier: 2, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "web", value: 40, seconds: 2 }, { effect: "maxHealth", value: 6 }] },
  { id: "frost_raider_card", enemy: "Frost Raider", mapId: "intermediate_snowlands", tier: 3, rarity: "regular", slot: "HAND",
    effects: [{ effect: "chill", value: 4.6 }] },
  { id: "glacier_archer_card", enemy: "Glacier Archer", mapId: "intermediate_snowlands", tier: 3, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "rangedGuard", value: 6 }] },
  { id: "glacier_regent_card", enemy: "Glacier Regent", mapId: "intermediate_snowlands", tier: 3, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "shield", value: 5 }] },
  { id: "rime_guard_card", enemy: "Rime Guard", mapId: "intermediate_snowlands", tier: 3, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "armor", value: 6.9 }, { effect: "regen", value: -5 }] },
  { id: "whiteout_reaper_card", enemy: "Whiteout Reaper", mapId: "intermediate_snowlands", tier: 3, rarity: "elite", slot: "HAND",
    effects: [{ effect: "stun", value: 1.7 }] },
  { id: "aurora_oracle_card", enemy: "Aurora Oracle", mapId: "intermediate_snowlands", tier: 3, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "allStatGain", value: 1.7 }] },
  { id: "frost_needle_card", enemy: "Frost Needle", mapId: "intermediate_snowlands", tier: 3, rarity: "regular", slot: "HAND",
    effects: [{ effect: "arrowStorm", value: 1.1 }] },
  { id: "frost_striker_card", enemy: "Frost Striker", mapId: "intermediate_snowlands", tier: 3, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1.1 }] },
  { id: "frostclaw_card", enemy: "Frostclaw", mapId: "intermediate_snowlands", tier: 3, rarity: "boss", slot: "HAND",
    effects: [{ effect: "stun", value: 12, seconds: 1.5 }] },
  { id: "ember_raider_card", enemy: "Ember Raider", mapId: "advanced_lava_wastes", tier: 4, rarity: "regular", slot: "HAND",
    effects: [{ effect: "atk", value: 4.9 }, { effect: "maxHealth", value: -3.6 }] },
  { id: "cinder_archer_card", enemy: "Cinder Archer", mapId: "advanced_lava_wastes", tier: 4, rarity: "regular", slot: "HAND",
    effects: [{ effect: "burn", value: 3.6 }] },
  { id: "cinder_regent_card", enemy: "Cinder Regent", mapId: "advanced_lava_wastes", tier: 4, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "maxHealth", value: 3.8 }, { effect: "meleeGuard", value: 5 }] },
  { id: "magma_guard_card", enemy: "Magma Guard", mapId: "advanced_lava_wastes", tier: 4, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "raceGuard", value: 10, mapId: "advanced_lava_wastes" }] },
  { id: "ash_reaper_card", enemy: "Ash Reaper", mapId: "advanced_lava_wastes", tier: 4, rarity: "elite", slot: "HAND",
    effects: [{ effect: "berserk", value: 11 }] },
  { id: "inferno_oracle_card", enemy: "Inferno Oracle", mapId: "advanced_lava_wastes", tier: 4, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "panicHeal", value: 9 }] },
  { id: "cinder_needle_card", enemy: "Cinder Needle", mapId: "advanced_lava_wastes", tier: 4, rarity: "regular", slot: "HAND",
    effects: [{ effect: "doubleStrike", value: 1.2 }] },
  { id: "cinder_striker_card", enemy: "Cinder Striker", mapId: "advanced_lava_wastes", tier: 4, rarity: "regular", slot: "HAND",
    effects: [{ effect: "opener", value: 10 }] },
  { id: "magmalisk_card", enemy: "Magmalisk", mapId: "advanced_lava_wastes", tier: 4, rarity: "boss", slot: "HAND",
    effects: [{ effect: "burn", value: 100, share: .3 }, { effect: "atk", value: 6 }] },
  { id: "depth_raider_card", enemy: "Depth Raider", mapId: "infernal_depths", tier: 5, rarity: "regular", slot: "HAND",
    effects: [{ effect: "raceSlayer", value: 10, mapId: "infernal_depths" }] },
  { id: "abyss_archer_card", enemy: "Abyss Archer", mapId: "infernal_depths", tier: 5, rarity: "regular", slot: "HAND",
    effects: [{ effect: "lifesteal", value: 0.64 }] },
  { id: "abyss_regent_card", enemy: "Abyss Regent", mapId: "infernal_depths", tier: 5, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "maxHealth", value: 4 }, { effect: "secondWind", value: 0.34 }] },
  { id: "obsidian_colossus_card", enemy: "Obsidian Colossus", mapId: "infernal_depths", tier: 5, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "armor", value: 3.9 }] },
  { id: "doom_reaper_card", enemy: "Doom Reaper", mapId: "infernal_depths", tier: 5, rarity: "elite", slot: "HAND",
    effects: [{ effect: "bossSlayer", value: 4 }, { effect: "execute", value: 11 }] },
  { id: "nether_oracle_card", enemy: "Nether Oracle", mapId: "infernal_depths", tier: 5, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "cardHunter", value: 10 }] },
  { id: "abyss_needle_card", enemy: "Abyss Needle", mapId: "infernal_depths", tier: 5, rarity: "regular", slot: "HAND",
    effects: [{ effect: "weaken", value: 3.9 }] },
  { id: "abyss_striker_card", enemy: "Abyss Striker", mapId: "infernal_depths", tier: 5, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 0.9 }, { effect: "fleetFoot", value: 0.9 }] },
  { id: "gloomroot_card", enemy: "Gloomroot", mapId: "infernal_depths", tier: 5, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "lastStand", value: 50 }] },
  { id: "tide_raider_card", enemy: "Tide Raider", mapId: "water_reach", tier: 6, rarity: "regular", slot: "HAND",
    effects: [{ effect: "knockback", value: 5.4 }] },
  { id: "reef_archer_card", enemy: "Reef Archer", mapId: "water_reach", tier: 6, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "longShot", value: 3 }] },
  { id: "reef_regent_card", enemy: "Reef Regent", mapId: "water_reach", tier: 6, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "shield", value: 4 }, { effect: "regen", value: 6 }] },
  { id: "coral_colossus_card", enemy: "Coral Colossus", mapId: "water_reach", tier: 6, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "reflect", value: 2 }] },
  { id: "drowned_reaper_card", enemy: "Drowned Reaper", mapId: "water_reach", tier: 6, rarity: "elite", slot: "HAND",
    effects: [{ effect: "lifesteal", value: 1.02 }] },
  { id: "tidal_oracle_card", enemy: "Tidal Oracle", mapId: "water_reach", tier: 6, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "fleetFoot", value: 1.4 }, { effect: "statGain", value: 2.8, stat: "health" }] },
  { id: "reef_needle_card", enemy: "Reef Needle", mapId: "water_reach", tier: 6, rarity: "regular", slot: "HAND",
    effects: [{ effect: "ricochet", value: 1.4 }] },
  { id: "reef_striker_card", enemy: "Reef Striker", mapId: "water_reach", tier: 6, rarity: "regular", slot: "HAND",
    effects: [{ effect: "critDamage", value: 8 }] },
  { id: "tidewyrm_card", enemy: "Tidewyrm", mapId: "water_reach", tier: 6, rarity: "boss", slot: "HAND",
    effects: [{ effect: "splash", value: 60, chance: 15 }] },
  { id: "sakura_ronin_card", enemy: "Sakura Ronin", mapId: "samurai_garden", tier: 7, rarity: "regular", slot: "HAND",
    effects: [{ effect: "doubleStrike", value: 1 }, { effect: "critChance", value: 1 }] },
  { id: "petal_archer_card", enemy: "Petal Archer", mapId: "samurai_garden", tier: 7, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1.4 }] },
  { id: "petal_regent_card", enemy: "Petal Regent", mapId: "samurai_garden", tier: 7, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "dodge", value: 2.1 }] },
  { id: "bamboo_guardian_card", enemy: "Bamboo Guardian", mapId: "samurai_garden", tier: 7, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "meleeGuard", value: 6 }] },
  { id: "moonblade_reaper_card", enemy: "Moonblade Reaper", mapId: "samurai_garden", tier: 7, rarity: "elite", slot: "HAND",
    effects: [{ effect: "critDamage", value: 9 }, { effect: "execute", value: 12 }] },
  { id: "shrine_oracle_card", enemy: "Shrine Oracle", mapId: "samurai_garden", tier: 7, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "treasure", value: 6 }] },
  { id: "petal_needle_card", enemy: "Petal Needle", mapId: "samurai_garden", tier: 7, rarity: "regular", slot: "HAND",
    effects: [{ effect: "piercing", value: 1.4 }] },
  { id: "petal_striker_card", enemy: "Petal Striker", mapId: "samurai_garden", tier: 7, rarity: "regular", slot: "HAND",
    effects: [{ effect: "opener", value: 11 }] },
  { id: "koi_shogun_card", enemy: "Koi Shogun", mapId: "samurai_garden", tier: 7, rarity: "boss", slot: "HAND",
    effects: [{ effect: "iaido", value: 1 }, { effect: "critDamage", value: 15 }] },
  { id: "gale_prowler_card", enemy: "Gale Prowler", mapId: "cloudspire", tier: 8, rarity: "regular", slot: "HAND",
    effects: [{ effect: "momentum", value: 1.5 }] },
  { id: "nimbus_archer_card", enemy: "Nimbus Archer", mapId: "cloudspire", tier: 8, rarity: "regular", slot: "HAND",
    effects: [{ effect: "rangedSlayer", value: 9 }] },
  { id: "nimbus_regent_card", enemy: "Nimbus Regent", mapId: "cloudspire", tier: 8, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "dodge", value: 1.6 }, { effect: "maxHealth", value: 4.7 }] },
  { id: "skyguard_colossus_card", enemy: "Skyguard Colossus", mapId: "cloudspire", tier: 8, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "rangedGuard", value: 8 }] },
  { id: "thunder_reaper_card", enemy: "Thunder Reaper", mapId: "cloudspire", tier: 8, rarity: "elite", slot: "HAND",
    effects: [{ effect: "chainLightning", value: 4.5 }] },
  { id: "tempest_oracle_card", enemy: "Tempest Oracle", mapId: "cloudspire", tier: 8, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "fleetFoot", value: 2.2 }] },
  { id: "gale_needle_card", enemy: "Gale Needle", mapId: "cloudspire", tier: 8, rarity: "regular", slot: "HAND",
    effects: [{ effect: "quickDraw", value: 0.08 }] },
  { id: "gale_striker_card", enemy: "Gale Striker", mapId: "cloudspire", tier: 8, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1.5 }] },
  { id: "tempest_kirin_card", enemy: "Tempest Kirin", mapId: "cloudspire", tier: 8, rarity: "boss", slot: "HEAD",
    effects: [{ effect: "fleetFoot", value: 10 }, { effect: "quickDraw", value: .2 }] },
  { id: "fen_prowler_card", enemy: "Fen Prowler", mapId: "moonfen", tier: 9, rarity: "regular", slot: "HAND",
    effects: [{ effect: "raceSlayer", value: 13, mapId: "moonfen" }] },
  { id: "glowcap_archer_card", enemy: "Glowcap Archer", mapId: "moonfen", tier: 9, rarity: "regular", slot: "HAND",
    effects: [{ effect: "poison", value: 4.7 }] },
  { id: "glowcap_regent_card", enemy: "Glowcap Regent", mapId: "moonfen", tier: 9, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "regen", value: 7 }, { effect: "maxHealth", value: 4.9 }] },
  { id: "bog_colossus_card", enemy: "Bog Colossus", mapId: "moonfen", tier: 9, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "raceGuard", value: 13, mapId: "moonfen" }] },
  { id: "moonmire_reaper_card", enemy: "Moonmire Reaper", mapId: "moonfen", tier: 9, rarity: "elite", slot: "HAND",
    effects: [{ effect: "chill", value: 6.6 }, { effect: "weaken", value: 4.9 }] },
  { id: "wisp_oracle_card", enemy: "Wisp Oracle", mapId: "moonfen", tier: 9, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "starshardFind", value: 24 }] },
  { id: "fen_needle_card", enemy: "Fen Needle", mapId: "moonfen", tier: 9, rarity: "regular", slot: "HAND",
    effects: [{ effect: "lifesteal", value: 0.79 }] },
  { id: "fen_striker_card", enemy: "Fen Striker", mapId: "moonfen", tier: 9, rarity: "regular", slot: "HAND",
    effects: [{ effect: "execute", value: 13 }] },
  { id: "miremaw_card", enemy: "Miremaw", mapId: "moonfen", tier: 9, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "secondWind", value: 3 }, { effect: "regen", value: 20 }] },
  { id: "shard_hopper_card", enemy: "Shard Hopper", mapId: "crystal_hollows", tier: 10, rarity: "regular", slot: "HAND",
    effects: [{ effect: "splash", value: 8 }] },
  { id: "crystal_spitter_card", enemy: "Crystal Spitter", mapId: "crystal_hollows", tier: 10, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "longShot", value: 3 }] },
  { id: "crystal_regent_card", enemy: "Crystal Regent", mapId: "crystal_hollows", tier: 10, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "reflect", value: 2.6 }, { effect: "armor", value: 5.2 }] },
  { id: "geode_guardian_card", enemy: "Geode Guardian", mapId: "crystal_hollows", tier: 10, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "miningSpeed", value: 7 }] },
  { id: "prism_reaver_card", enemy: "Prism Reaver", mapId: "crystal_hollows", tier: 10, rarity: "elite", slot: "HAND",
    effects: [{ effect: "splitShot", value: 3.5 }, { effect: "critChance", value: 1.7 }] },
  { id: "hollow_oracle_card", enemy: "Hollow Oracle", mapId: "crystal_hollows", tier: 10, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "oreFind", value: 7 }] },
  { id: "shard_needle_card", enemy: "Shard Needle", mapId: "crystal_hollows", tier: 10, rarity: "regular", slot: "HAND",
    effects: [{ effect: "doubleStrike", value: 1.6 }] },
  { id: "shard_striker_card", enemy: "Shard Striker", mapId: "crystal_hollows", tier: 10, rarity: "regular", slot: "HAND",
    effects: [{ effect: "critDamage", value: 10 }] },
  { id: "prismshell_card", enemy: "Prismshell", mapId: "crystal_hollows", tier: 10, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "reflect", value: 8 }, { effect: "prism", value: 1 }] },
  { id: "gear_prowler_card", enemy: "Gear Prowler", mapId: "clockwork_ruins", tier: 11, rarity: "regular", slot: "HAND",
    effects: [{ effect: "steady", value: 7 }] },
  { id: "rivet_spitter_card", enemy: "Rivet Spitter", mapId: "clockwork_ruins", tier: 11, rarity: "regular", slot: "HAND",
    effects: [{ effect: "knockback", value: 6.9 }] },
  { id: "gear_regent_card", enemy: "Gear Regent", mapId: "clockwork_ruins", tier: 11, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "shield", value: 8 }] },
  { id: "iron_guardian_card", enemy: "Iron Guardian", mapId: "clockwork_ruins", tier: 11, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "armor", value: 3.6 }, { effect: "meleeGuard", value: 5 }] },
  { id: "scrap_reaver_card", enemy: "Scrap Reaver", mapId: "clockwork_ruins", tier: 11, rarity: "elite", slot: "HAND",
    effects: [{ effect: "bossSlayer", value: 8 }] },
  { id: "spark_oracle_card", enemy: "Spark Oracle", mapId: "clockwork_ruins", tier: 11, rarity: "elite", slot: "HAND",
    effects: [{ effect: "stun", value: 2.6 }] },
  { id: "gear_needle_card", enemy: "Gear Needle", mapId: "clockwork_ruins", tier: 11, rarity: "regular", slot: "HAND",
    effects: [{ effect: "quickDraw", value: 0.09 }] },
  { id: "gear_striker_card", enemy: "Gear Striker", mapId: "clockwork_ruins", tier: 11, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1.7 }] },
  { id: "ironhorn_card", enemy: "Ironhorn", mapId: "clockwork_ruins", tier: 11, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "bossGuard", value: 15 }, { effect: "eliteGuard", value: 15 }, { effect: "armor", value: 12 }] },
  { id: "gourd_prowler_card", enemy: "Gourd Prowler", mapId: "duskfall_orchard", tier: 12, rarity: "regular", slot: "HAND",
    effects: [{ effect: "execute", value: 14 }] },
  { id: "seed_spitter_card", enemy: "Seed Spitter", mapId: "duskfall_orchard", tier: 12, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "statGain", value: 3.6, stat: "health" }] },
  { id: "harvest_regent_card", enemy: "Harvest Regent", mapId: "duskfall_orchard", tier: 12, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "secondWind", value: 0.47 }, { effect: "maxHealth", value: 5.6 }] },
  { id: "husk_guardian_card", enemy: "Husk Guardian", mapId: "duskfall_orchard", tier: 12, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "raceGuard", value: 14, mapId: "duskfall_orchard" }] },
  { id: "thorn_reaver_card", enemy: "Thorn Reaver", mapId: "duskfall_orchard", tier: 12, rarity: "elite", slot: "HAND",
    effects: [{ effect: "eliteSlayer", value: 11 }, { effect: "momentum", value: 1.9 }] },
  { id: "harvest_oracle_card", enemy: "Harvest Oracle", mapId: "duskfall_orchard", tier: 12, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "allStatGain", value: 2.7 }] },
  { id: "gourd_needle_card", enemy: "Gourd Needle", mapId: "duskfall_orchard", tier: 12, rarity: "regular", slot: "HAND",
    effects: [{ effect: "splitShot", value: 3.6 }] },
  { id: "gourd_striker_card", enemy: "Gourd Striker", mapId: "duskfall_orchard", tier: 12, rarity: "regular", slot: "HAND",
    effects: [{ effect: "critDamage", value: 11 }] },
  { id: "dreadreaper_card", enemy: "Dreadreaper", mapId: "duskfall_orchard", tier: 12, rarity: "boss", slot: "HAND",
    effects: [{ effect: "reap", value: 10 }, { effect: "bossSlayer", value: 10 }] },
  { id: "circuit_prowler_card", enemy: "Circuit Prowler", mapId: "neon_bastion", tier: 13, rarity: "regular", slot: "HAND",
    effects: [{ effect: "chainLightning", value: 3.7 }] },
  { id: "pulse_spitter_card", enemy: "Pulse Spitter", mapId: "neon_bastion", tier: 13, rarity: "regular", slot: "HAND",
    effects: [{ effect: "stun", value: 1.9 }] },
  { id: "voltage_regent_card", enemy: "Voltage Regent", mapId: "neon_bastion", tier: 13, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "shield", value: 6 }, { effect: "reflect", value: 2.9 }] },
  { id: "relay_guardian_card", enemy: "Relay Guardian", mapId: "neon_bastion", tier: 13, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "rangedGuard", value: 9 }] },
  { id: "arc_reaver_card", enemy: "Arc Reaver", mapId: "neon_bastion", tier: 13, rarity: "elite", slot: "HAND",
    effects: [{ effect: "doubleStrike", value: 1.9 }, { effect: "chainLightning", value: 3.9 }] },
  { id: "signal_oracle_card", enemy: "Signal Oracle", mapId: "neon_bastion", tier: 13, rarity: "elite", slot: "HEAD",
    effects: [{ effect: "cardHunter", value: 14 }] },
  { id: "circuit_needle_card", enemy: "Circuit Needle", mapId: "neon_bastion", tier: 13, rarity: "regular", slot: "HAND",
    effects: [{ effect: "quickDraw", value: 0.09 }] },
  { id: "circuit_striker_card", enemy: "Circuit Striker", mapId: "neon_bastion", tier: 13, rarity: "regular", slot: "HEAD",
    effects: [{ effect: "critChance", value: 1.3 }, { effect: "fleetFoot", value: 1.3 }] },
  { id: "voltwarden_card", enemy: "Voltwarden", mapId: "neon_bastion", tier: 13, rarity: "boss", slot: "HAND",
    effects: [{ effect: "chainLightning", value: 20, targets: 3, share: .7 }, { effect: "quickDraw", value: .2 }] },
  { id: "mossbound_stalker_card", enemy: "Mossbound Stalker", mapId: "verdant_catacombs", tier: 14, rarity: "regular", slot: "HAND",
    effects: [{ effect: "raceSlayer", value: 15, mapId: "verdant_catacombs" }] },
  { id: "spore_slinger_card", enemy: "Spore Slinger", mapId: "verdant_catacombs", tier: 14, rarity: "regular", slot: "HAND",
    effects: [{ effect: "poison", value: 5.8 }] },
  { id: "mycelial_regent_card", enemy: "Mycelial Regent", mapId: "verdant_catacombs", tier: 14, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "regen", value: 8 }, { effect: "panicHeal", value: 10 }] },
  { id: "ossuary_guardian_card", enemy: "Ossuary Guardian", mapId: "verdant_catacombs", tier: 14, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "raceGuard", value: 15, mapId: "verdant_catacombs" }] },
  { id: "briar_reaver_card", enemy: "Briar Reaver", mapId: "verdant_catacombs", tier: 14, rarity: "elite", slot: "HAND",
    effects: [{ effect: "berserk", value: 12 }, { effect: "lifesteal", value: 1.01 }] },
  { id: "crypt_oracle_card", enemy: "Crypt Oracle", mapId: "verdant_catacombs", tier: 14, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "lastStand", value: 29 }] },
  { id: "moss_needle_card", enemy: "Moss Needle", mapId: "verdant_catacombs", tier: 14, rarity: "regular", slot: "HAND",
    effects: [{ effect: "weaken", value: 5.8 }] },
  { id: "moss_striker_card", enemy: "Moss Striker", mapId: "verdant_catacombs", tier: 14, rarity: "regular", slot: "HAND",
    effects: [{ effect: "opener", value: 15 }] },
  { id: "gravebloom_card", enemy: "Gravebloom", mapId: "verdant_catacombs", tier: 14, rarity: "boss", slot: "HEAD",
    effects: [{ effect: "allStatGain", value: 10 }] },
  { id: "ion_patrol_card", enemy: "Ion Patrol", mapId: "ion_citadel", tier: 15, rarity: "regular", slot: "HAND",
    effects: [{ effect: "atk", value: 4 }] },
  { id: "capacitor_gunner_card", enemy: "Capacitor Gunner", mapId: "ion_citadel", tier: 15, rarity: "regular", slot: "HAND",
    effects: [{ effect: "splash", value: 10 }] },
  { id: "citadel_marshal_card", enemy: "Citadel Marshal", mapId: "ion_citadel", tier: 15, rarity: "elite", slot: "CHEST",
    effects: [{ effect: "maxHealth", value: 6.3 }, { effect: "eliteGuard", value: 10 }] },
  { id: "bastion_defender_card", enemy: "Bastion Defender", mapId: "ion_citadel", tier: 15, rarity: "regular", slot: "CHEST",
    effects: [{ effect: "bossGuard", value: 8 }] },
  { id: "flux_enforcer_card", enemy: "Flux Enforcer", mapId: "ion_citadel", tier: 15, rarity: "elite", slot: "HAND",
    effects: [{ effect: "atk", value: 4.2 }, { effect: "eliteSlayer", value: 13 }] },
  { id: "reactor_warden_card", enemy: "Reactor Warden", mapId: "ion_citadel", tier: 15, rarity: "elite", slot: "HAND",
    effects: [{ effect: "momentum", value: 3 }] },
  { id: "ion_needle_card", enemy: "Ion Needle", mapId: "ion_citadel", tier: 15, rarity: "regular", slot: "HAND",
    effects: [{ effect: "quickDraw", value: 0.1 }] },
  { id: "ion_striker_card", enemy: "Ion Striker", mapId: "ion_citadel", tier: 15, rarity: "regular", slot: "HAND",
    effects: [{ effect: "critChance", value: 1.4 }, { effect: "critDamage", value: 8 }] },
  { id: "aegis_prime_card", enemy: "Aegis Prime", mapId: "ion_citadel", tier: 15, rarity: "boss", slot: "CHEST",
    effects: [{ effect: "shield", value: 25, seconds: 6 }, { effect: "bossGuard", value: 10 }] },
  // Endless: one Warden card for each band of ten maps, at the boss odds.
  { id: "warden_i_card", enemy: "Warden I", mapId: "endless", tier: 15, rarity: "boss", slot: "CHEST", endless: { from: 1, to: 10 }, shop: false,
    effects: [{ effect: "maxHealth", value: 7 }, { effect: "bossGuard", value: 12 }] },
  { id: "warden_ii_card", enemy: "Warden II", mapId: "endless", tier: 15, rarity: "boss", slot: "HEAD", endless: { from: 11, to: 20 }, shop: false,
    effects: [{ effect: "onward", value: 1 }] },
  { id: "warden_iii_card", enemy: "Warden III", mapId: "endless", tier: 15, rarity: "boss", slot: "HAND", endless: { from: 21, to: 30 }, shop: false,
    effects: [{ effect: "bossSlayer", value: 15 }, { effect: "atk", value: 5 }] },
  { id: "warden_iv_card", enemy: "Warden IV", mapId: "endless", tier: 15, rarity: "boss", slot: "HEAD", endless: { from: 31, to: 40 }, shop: false,
    effects: [{ effect: "cardHunter", value: 20 }] },
  { id: "warden_v_card", enemy: "Warden V", mapId: "endless", tier: 15, rarity: "boss", slot: "CHEST", endless: { from: 41, to: 50 }, shop: false,
    effects: [{ effect: "shield", value: 9 }, { effect: "armor", value: 8 }] },
  { id: "warden_vi_card", enemy: "Warden VI", mapId: "endless", tier: 15, rarity: "boss", slot: "HAND", endless: { from: 51 }, shop: false,
    effects: [{ effect: "critDamage", value: 16 }, { effect: "doubleStrike", value: 2 }] },
  // Timberwood: felling the tree drops its card, at odds of its own.
  { id: "oak_tree_card", enemy: "Oak Tree", mapId: "timberwood", tier: 5, rarity: "regular", slot: "HEAD", tree: "oak", outcomes: 500, shop: false,
    effects: [{ effect: "woodcuttingSpeed", value: 7 }] },
  { id: "elder_tree_card", enemy: "Elder Tree", mapId: "timberwood", tier: 13, rarity: "elite", slot: "HEAD", tree: "elder", outcomes: 150, shop: false,
    effects: [{ effect: "logFind", value: 7 }] },
]);

const BY_ID = new Map(CARDS.map(card => [card.id, card]));
const MAP_CARDS = CARDS.filter(card => !card.endless && !card.tree);
// Needle and Striker cards drop on Endless only (ENDLESS_ROLLED).
const BY_ENEMY = new Map(MAP_CARDS.filter(card => card.rarity !== "boss" && !/(Needle|Striker)$/.test(card.enemy)).map(card => [`${card.mapId}:${card.enemy}`, card]));
const BY_BOSS = new Map(MAP_CARDS.filter(card => card.rarity === "boss").map(card => [card.mapId, card]));
const ENDLESS_CARDS = CARDS.filter(card => card.endless);
const BY_TREE = new Map(CARDS.filter(card => card.tree).map(card => [card.tree, card]));

export function cardDefinition(cardId: unknown) {
  return typeof cardId === "string" ? BY_ID.get(cardId) : undefined;
}

/**
 * The Needle and Striker cards: their camps left the campaign maps when attack speed and crit moved to weapons,
 * and they drop on Endless instead. Endless N's regular enemies roll those of campaign map
 * ((N - 1) mod 15) + 1: the damage and health camps its Needle card, the armor and regen camps its Striker card.
 */
const ENDLESS_ROLLED = new Map(CAMPAIGN_MAPS.map(map => [map.id, {
  needle: MAP_CARDS.find(card => card.mapId === map.id && card.enemy.endsWith("Needle")),
  striker: MAP_CARDS.find(card => card.mapId === map.id && card.enemy.endsWith("Striker")),
}]));
/** The campaign map whose Needle and Striker cards an Endless level rolls (1-15). */
export const endlessRolledMapIndex = (endlessNumber: number) => (Math.max(1, Math.floor(endlessNumber)) - 1) % CAMPAIGN_MAPS.length + 1;
/** Whether a card is one of those, and the first Endless level it drops on (then every fifteenth). */
export function endlessRolledFrom(card: CardDefinition) {
  const index = CAMPAIGN_MAPS.findIndex(map => map.id === card.mapId);
  const rolled = index < 0 ? undefined : ENDLESS_ROLLED.get(card.mapId);
  return rolled && (rolled.needle === card || rolled.striker === card) ? index + 1 : null;
}
// A few Endless levels' camp stats by site, kept: a kill report asks per species.
const endlessSiteStats = new Map<string, string[]>();
function endlessSiteStat(mapId: string, site: number) {
  let stats = endlessSiteStats.get(mapId);
  if (!stats) {
    stats = generateMap(mapId as `endless_${number}`).camps.flatMap(camp => Array<string>(camp.count).fill(camp.stat));
    if (endlessSiteStats.size >= 16) endlessSiteStats.delete(endlessSiteStats.keys().next().value!);
    endlessSiteStats.set(mapId, stats);
  }
  return stats[site];
}

export function cardForEnemy(mapId: string, enemy: string) {
  const number = proceduralMapNumber(mapId);
  if (number === null) return BY_ENEMY.get(`${mapId}:${enemy}`);
  const site = /^site:(\d+)$/.exec(enemy);
  const stat = site ? endlessSiteStat(mapId, Number(site[1])) : undefined;
  if (!stat) return undefined;
  const rolled = ENDLESS_ROLLED.get(CAMPAIGN_MAPS[endlessRolledMapIndex(number) - 1].id);
  return stat === "damage" || stat === "health" ? rolled?.needle : rolled?.striker;
}

/** A campaign map's boss card, or for Endless map N the Warden card of N's band. */
export function cardForBoss(mapId: string) {
  const number = proceduralMapNumber(mapId);
  if (number === null) return BY_BOSS.get(mapId);
  return ENDLESS_CARDS.find(card => number >= card.endless!.from && number <= (card.endless!.to ?? Infinity));
}

/** The card felling this kind of tree can drop. */
export function cardForTree(kind: string) {
  return BY_TREE.get(kind as WoodTreeKind);
}

/**
 * The most attacks a second Quick Draw cards could add, kept at its old bound of twenty slots of the best one:
 * at most twelve cards are active, and this sets the attack speed floor every run plays under.
 */
export const MAX_CARD_QUICK_DRAW = 20
  * Math.max(0, ...CARDS.flatMap(card => card.effects.filter(effect => effect.effect === "quickDraw").map(effect => effect.value)));
