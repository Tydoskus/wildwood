import { describe, expect, it } from "vitest";
import { ALPHA_CARD_DROP_BOOST, CARDS, CARD_DROP_OUTCOMES, DESIGNED_CARD_DROP_OUTCOMES, cardDropChance, cardMeterFull, cardDefinition, cardForBoss, cardForEnemy, cardKillChance, cardSureByKills, type CardEffectId, endlessRolledFrom } from "./cards";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { ENEMY_TYPES } from "./enemy-definitions";
import { enemyDefeatDefinition } from "./enemy-defeats";

const KNOWN_EFFECTS: readonly CardEffectId[] = [
  "atk", "critChance", "critDamage", "doubleStrike", "splitShot", "bossSlayer", "eliteSlayer", "raceSlayer", "rangedSlayer",
  "execute", "opener", "berserk", "steady", "momentum", "burn", "poison", "chill", "stun", "weaken", "knockback", "splash",
  "chainLightning", "lifesteal", "quickDraw", "arrowStorm", "ricochet", "piercing", "iaido", "reap", "maxHealth", "armor",
  "regen", "reflect", "secondWind", "dodge", "rangedGuard", "meleeGuard", "bossGuard", "eliteGuard", "raceGuard", "shield",
  "panicHeal", "lastStand", "web", "prism", "fleetFoot", "longShot", "statGain", "allStatGain", "cardHunter", "treasure",
  "respawn", "miningSpeed", "oreFind", "starshardFind", "woodcuttingSpeed", "logFind", "onward",
];

describe("the cards", () => {
  it("gives every campaign enemy and boss exactly one card, of its map and tier", () => {
    const kinds = Object.keys(ENEMY_TYPES);
    let enemies = 0;
    CAMPAIGN_MAPS.forEach((map, index) => {
      for (const kind of kinds.filter(kind => enemyDefeatDefinition(map.id, kind))) {
        const card = cardForEnemy(map.id, kind);
        expect(card, `${map.id} ${kind}`).toBeDefined();
        expect(card).toMatchObject({ mapId: map.id, tier: index + 1, rarity: ENEMY_TYPES[kind as keyof typeof ENEMY_TYPES].elite ? "elite" : "regular" });
        enemies++;
      }
      expect(cardForBoss(map.id), map.id).toMatchObject({ enemy: map.bossName, mapId: map.id, tier: index + 1, rarity: "boss" });
    });
    // Nothing else but the Endless Warden cards, the tree cards, and each map's Needle and Striker cards, which drop on Endless.
    const endlessRolled = CARDS.filter(card => endlessRolledFrom(card) !== null);
    expect(endlessRolled).toHaveLength(2 * CAMPAIGN_MAPS.length);
    expect(CARDS.filter(card => !card.endless && !card.tree)).toHaveLength(enemies + CAMPAIGN_MAPS.length + endlessRolled.length);
    expect(new Set(CARDS.map(card => card.id)).size).toBe(CARDS.length);
    expect(CARDS.every(card => cardDefinition(card.id) === card)).toBe(true);
    expect(cardDefinition("not_a_card")).toBeUndefined();
  });

  it("rolls each map's Needle and Striker cards on its Endless levels, by the camp's stat", () => {
    for (const [number, mapIndex] of [[1, 1], [15, 15], [16, 1], [42, 12]]) {
      const map = CAMPAIGN_MAPS[mapIndex - 1];
      const rolled = new Set(Array.from({ length: 32 }, (_, site) => cardForEnemy(`endless_${number}`, `site:${site}`)?.enemy));
      expect([...rolled].sort(), `endless_${number}`).toEqual(CARDS.filter(card => card.mapId === map.id && /(Needle|Striker)$/.test(card.enemy))
        .map(card => card.enemy).sort());
    }
  });

  it("gives every card known effects with real values, and map cards their own map", () => {
    for (const card of CARDS) {
      expect(["HAND", "HEAD", "CHEST"], card.id).toContain(card.slot);
      expect(card.effects.length, card.id).toBeGreaterThan(0);
      for (const effect of card.effects) {
        expect(KNOWN_EFFECTS, card.id).toContain(effect.effect);
        expect(Number.isFinite(effect.value) && effect.value !== 0, card.id).toBe(true);
        if (effect.effect === "raceSlayer" || effect.effect === "raceGuard") expect(effect.mapId, card.id).toBe(card.mapId);
        if (effect.effect === "statGain") expect(["damage", "health", "speed", "armor", "regen", "crit"], card.id).toContain(effect.stat);
      }
      // A card's only cost comes with a gain.
      expect(card.effects.some(effect => effect.value > 0), card.id).toBe(true);
    }
    // Every effect is on at least one card.
    expect(new Set(CARDS.flatMap(card => card.effects.map(effect => effect.effect)))).toEqual(new Set(KNOWN_EFFECTS));
  });

  it("grows with its map: a later map's card of the same effect is never weaker", () => {
    const strongest = new Map<string, number>();
    for (const card of [...CARDS].filter(card => card.rarity === "regular" && card.effects.length === 1).sort((a, b) => a.tier - b.tier)) {
      const [{ effect, value }] = card.effects;
      expect(value, card.id).toBeGreaterThanOrEqual(strongest.get(effect) ?? 0);
      strongest.set(effect, value);
    }
  });
});

describe("drops", () => {
  it("drops a card once in 10,000 kills, an elite's in 20,000, a boss's in 1,000 boss kills, as designed", () => {
    expect(DESIGNED_CARD_DROP_OUTCOMES).toEqual({ regular: 10_000, elite: 20_000, boss: 1_000 });
  });

  it("drops cards ten times as often during the alpha, and the meter fills ten times as soon", () => {
    expect(ALPHA_CARD_DROP_BOOST).toBe(10);
    expect(CARD_DROP_OUTCOMES).toEqual({ regular: 1_000, elite: 2_000, boss: 100 });
    expect(cardMeterFull("regular")).toBe(2_000);
    expect(cardMeterFull("elite")).toBe(4_000);
    expect(cardMeterFull("boss")).toBe(200);
    expect(cardDropChance(CARD_DROP_OUTCOMES.regular, 1)).toBeCloseTo(1 / 1_000, 12);
    expect(cardDropChance(CARD_DROP_OUTCOMES.boss, 1)).toBeCloseTo(1 / 100, 12);
  });

  it("gives this player's chance a kill: Card Hunter raises the odds and the meter, Card Luck only the chance", () => {
    const needle = cardDefinition("needle_card")!, dragon = cardDefinition("dragon_card")!;
    expect(cardKillChance(needle)).toBeCloseTo(1 / 1_000, 12);
    expect(cardKillChance(needle, .14)).toBeCloseTo(1.14 / 1_000, 12);
    expect(cardKillChance(needle, .14, 4)).toBeCloseTo(cardDropChance(1_000, 1.14, 4), 12);
    expect(cardKillChance(dragon, 0, 10)).toBeGreaterThan(cardKillChance(dragon));
    expect(cardSureByKills(needle)).toBe(2_000);
    expect(cardSureByKills(needle, .14)).toBe(1_755);
    expect(cardSureByKills(dragon, 1)).toBe(100);
  });
});
