import { challengeMinimumInterval } from "./prestige-challenge";
import { RATING_MAX, attackIntervalForRating, attackSpeedRatingForInterval } from "./stat-rating";
import { describe, expect, it } from "vitest";
import {
  addSoulKills, cleanSoulStats, EMPTY_SOUL_STATS, soulCritRatingAfterKills, soulDimensionAccess, soulEnemyStats, soulStatsUnlocked, soulTier, soulTierKillsNeeded, withSoulStats, withoutSoulStats, SOUL_CAMPS, SOUL_POPULATION, SOUL_TIER_KILL_TYPES,
} from "./soul-dimension";
import { MIN_ATTACK_INTERVAL } from "./rules";
import { decodePlayerMapFrame, decodePlayerMotionFrame, encodePlayerMapFrame, encodePlayerMotionFrame } from "./player-motion-frame";
import { critDamageForLevels, critDamageLevelsFor, ratingForLevels, ratingLevels } from "./stat-rating";

const each = (count: number) => ({ damage: count, health: count, armor: count, regen: count, speed: count });

describe("soul tiers", () => {
  it("needs 5^(N+1) kills of every reward type for tier N", () => {
    expect([1, 2, 3, 4, 5, 6].map(soulTierKillsNeeded)).toEqual([25, 125, 625, 3_125, 15_625, 78_125]);
    expect(soulTier(each(24))).toBe(0);
    expect(soulTier(each(25))).toBe(1);
    expect(soulTier(each(124))).toBe(1);
    expect(soulTier(each(125))).toBe(2);
    expect(soulTier(each(10_000_000))).toBe(6);
  });

  it("counts the fewest type: one type behind holds the tier back", () => {
    expect(soulTier({ ...each(1_000), armor: 30 })).toBe(1);
    expect(soulTier({ ...each(1_000), regen: 0 })).toBe(0);
  });

  it("asks nothing of attack speed enemies: few maps have them", () => {
    expect(SOUL_TIER_KILL_TYPES).toEqual(["damage", "health", "armor", "regen"]);
    expect(soulTier({ ...each(1_000), speed: 0 })).toBe(soulTier(each(1_000)));
  });

  it("wakes the soul enemies in order: damage, health, armor, regen, attack speed, crit damage", () => {
    expect(soulStatsUnlocked(0)).toEqual([]);
    expect(soulStatsUnlocked(1)).toEqual(["damage"]);
    expect(soulStatsUnlocked(6)).toEqual(["damage", "health", "armor", "regen", "attackSpeed", "critDamage"]);
  });
});

describe("soul stats", () => {
  it("pay a flat amount a kill that never grows", () => {
    let soul = addSoulKills(null, "damage", 10);
    soul = addSoulKills(soul, "health", 3);
    soul = addSoulKills(soul, "critDamage", 5);
    expect(soul.damage).toBe(10);
    expect(soul.maxHp).toBe(3);
    // Crit damage is a rating, paid at 0.002x a kill: five kills from nothing is 1.06x.
    expect(critDamageForLevels(ratingLevels(soul.critDamage))).toBeCloseTo(1.06, 9);
  });

  it("add to a run's base stats, attack speed as rating on the run's, never past the cap nor slowing a faster run", () => {
    const run = { damage: 10, maxHp: 100, armor: 5, regen: 1, attackRate: attackIntervalForRating(200) };
    const boosted = withSoulStats(run, { damage: 2, maxHp: 50, armor: 1, regen: .5, attackSpeed: 100 });
    expect(boosted).toMatchObject({ damage: 12, maxHp: 150, armor: 6, regen: 1.5 });
    expect(boosted.attackRate).toBeCloseTo(attackIntervalForRating(300), 9);
    expect(withSoulStats(run, { attackSpeed: RATING_MAX }).attackRate).toBeCloseTo(MIN_ATTACK_INTERVAL);
    const challenge = { ...run, attackRate: MIN_ATTACK_INTERVAL * .8 };
    expect(withSoulStats(challenge, { attackSpeed: 1 }).attackRate).toBe(challenge.attackRate);
    expect(withSoulStats(run, null)).toBe(run);
  });

  it("let attack speed reach the cap Reflect Only wins raise, and undo exactly under it", () => {
    // Two wins: the base cap plus a whole attack a second, and a run already at the base cap.
    const cap = challengeMinimumInterval({ active: false, completed: 2 });
    const run = { damage: 10, maxHp: 100, armor: 5, regen: 1, attackRate: attackIntervalForRating(400, cap) };
    const boosted = withSoulStats(run, { attackSpeed: 100 }, cap);
    expect(attackSpeedRatingForInterval(boosted.attackRate, cap)).toBeCloseTo(500, 6);
    expect(1 / boosted.attackRate).toBeGreaterThan(1 / attackIntervalForRating(500));
    expect(withSoulStats(run, { attackSpeed: RATING_MAX }, cap).attackRate).toBeCloseTo(cap);
    expect(withoutSoulStats(boosted, { attackSpeed: 100 }, 9, cap).attackRate).toBeCloseTo(run.attackRate, 9);
    // At the cap it cannot be undone exactly, so the saved interval stands.
    expect(withoutSoulStats({ ...run, attackRate: cap }, { attackSpeed: 100 }, .7, cap).attackRate).toBe(.7);
  });
});

describe("soul enemies", () => {
  it("are built at the player's strength: tougher and harder-hitting as the player grows", () => {
    const weak = soulEnemyStats({ dps: 10, maxHp: 100, armor: 0, regen: 1 });
    const strong = soulEnemyStats({ dps: 1_000, maxHp: 10_000, armor: 0, regen: 100 });
    expect(strong.hp / weak.hp).toBeCloseTo(100);
    expect(strong.damage / weak.damage).toBeCloseTo(100);
  });

  it("hit through armor as hard as before it, so armor never makes them free", () => {
    const bare = soulEnemyStats({ dps: 10, maxHp: 1_000, armor: 0, regen: 0 });
    const armored = soulEnemyStats({ dps: 10, maxHp: 1_000, armor: 1_000, regen: 0 });
    expect(armored.damage).toBeCloseTo(bare.damage * 2);
  });
});

describe("the soul forest", () => {
  it("holds Tutorial Forest's camps, every one of them, and as many enemies as the forest has", () => {
    expect(SOUL_CAMPS.length).toBeGreaterThan(5);
    expect(new Set(SOUL_CAMPS.map(camp => camp.key)).size).toBe(SOUL_CAMPS.length);
    expect(SOUL_POPULATION).toBe(SOUL_CAMPS.reduce((sum, camp) => sum + camp.count, 0));
    for (const camp of SOUL_CAMPS) { expect(camp.roll).toBeGreaterThanOrEqual(0); expect(camp.roll).toBeLessThan(1); }
  });
});

describe("Soul Dimension access", () => {
  it("is the developer's alone until opened, and always needs a prestige", () => {
    expect(soulDimensionAccess({ open: false, developer: false, prestigeLevel: 5 })).toBe("closed");
    expect(soulDimensionAccess({ open: false, developer: true, prestigeLevel: 1 })).toBe("open");
    expect(soulDimensionAccess({ open: true, developer: false, prestigeLevel: 0 })).toBe("locked");
    expect(soulDimensionAccess({ open: true, developer: false, prestigeLevel: 1 })).toBe("open");
  });
});

describe("wide motion frames", () => {
  it("carry Town positions far past u16, and stay apart from the narrow format", () => {
    const motion = [{ networkId: 7, x: 512_345.6, y: 499_999.9, vx: -240.5, vy: 12, simulationTick: 70_000, motionEpoch: 3 }];
    const wide = encodePlayerMotionFrame(motion, true);
    expect(wide.byteLength).toBe(20);
    const [decoded] = decodePlayerMotionFrame(wide, 1);
    expect(decoded.x).toBeCloseTo(512_345.6, 1);
    expect(decoded.y).toBeCloseTo(499_999.9, 1);
    expect(decoded.vx).toBeCloseTo(-240.5, 1);
    expect(decoded.simulationTick).toBe(70_000 & 0xffff);
    const narrow = decodePlayerMotionFrame(encodePlayerMotionFrame([{ ...motion[0], x: 1_000, y: 2_000 }]), 1)[0];
    expect([narrow.x, narrow.y]).toEqual([1_000, 2_000]);
    const map = decodePlayerMapFrame(encodePlayerMapFrame([{ networkId: 9, x: 777_777.7, y: 3 }], true), 1)[0];
    expect(map.x).toBeCloseTo(777_777.7, 1);
  });
});

it("keeps soul attack speed and crit damage as rating points, never past the rating's top", () => {
  expect(addSoulKills(EMPTY_SOUL_STATS, "attackSpeed", 3).attackSpeed).toBe(3);
  expect(addSoulKills({ ...EMPTY_SOUL_STATS, critDamage: RATING_MAX }, "critDamage", 10).critDamage).toBe(RATING_MAX);
  expect(cleanSoulStats({ attackSpeed: 1e305 }).attackSpeed).toBe(RATING_MAX);
});

describe("soul crit damage at the old pace (0.901.47.1)", () => {
  it("adds 0.002x crit damage a kill even near 100x, where a point of rating did nothing", () => {
    const at50 = ratingForLevels(critDamageLevelsFor(50));
    expect(critDamageForLevels(ratingLevels(soulCritRatingAfterKills(at50, 1)))).toBeCloseTo(50.002, 6);
    expect(critDamageForLevels(ratingLevels(soulCritRatingAfterKills(at50, 1_000)))).toBeCloseTo(52, 6);
    // 50x to 100x is 25,000 kills, as it was.
    expect(soulCritRatingAfterKills(at50, 25_000)).toBe(RATING_MAX);
    expect(critDamageForLevels(ratingLevels(soulCritRatingAfterKills(at50, 24_990)))).toBeLessThan(100);
  });
});
