import { describe, expect, it } from "vitest";
import {
  addSoulKills, soulChunkCamps, soulChunkProps, soulDimensionAccess, soulEnemyStats, soulStatsUnlocked, soulTier, soulTierKillsNeeded,
  soulWindowChunks, withSoulStats, SOUL_CENTER, SOUL_CHUNK_SIZE, inSoulVillage, soulChunkOf,
} from "./soul-dimension";
import { MIN_ATTACK_INTERVAL } from "./rules";
import { decodePlayerMapFrame, decodePlayerMotionFrame, encodePlayerMapFrame, encodePlayerMotionFrame } from "./player-motion-frame";

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
    expect(soulTier({ ...each(1_000), speed: 30 })).toBe(1);
    expect(soulTier({ ...each(1_000), regen: 0 })).toBe(0);
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
    expect(soul.critDamage).toBeCloseTo(.01);
  });

  it("add to a run's base stats, and attack speed stops at the cap without slowing a faster run", () => {
    const run = { damage: 10, maxHp: 100, armor: 5, regen: 1, attackRate: 1.5 };
    const boosted = withSoulStats(run, { damage: 2, maxHp: 50, armor: 1, regen: .5, attackSpeed: .5 });
    expect(boosted).toMatchObject({ damage: 12, maxHp: 150, armor: 6, regen: 1.5 });
    expect(boosted.attackRate).toBeCloseTo(1 / (1 / 1.5 + .5));
    expect(withSoulStats(run, { attackSpeed: 100 }).attackRate).toBeCloseTo(MIN_ATTACK_INTERVAL);
    const challenge = { ...run, attackRate: MIN_ATTACK_INTERVAL * .8 };
    expect(withSoulStats(challenge, { attackSpeed: 1 }).attackRate).toBe(challenge.attackRate);
    expect(withSoulStats(run, null)).toBe(run);
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

describe("the soul world", () => {
  it("builds the same chunk on every client", () => {
    expect(soulChunkCamps(400, 410)).toEqual(soulChunkCamps(400, 410));
    expect(soulChunkProps(400, 410)).toEqual(soulChunkProps(400, 410));
  });

  it("keeps camps and wild props out of the village", () => {
    for (const { cx, cy } of soulWindowChunks(SOUL_CENTER.x, SOUL_CENTER.y)) {
      for (const camp of soulChunkCamps(cx, cy)) expect(inSoulVillage(camp.x, camp.y, 300)).toBe(false);
      for (const prop of soulChunkProps(cx, cy)) expect(inSoulVillage(prop.x, prop.y)).toBe(false);
    }
  });

  it("has camps out in the wilds: a fair number in any 5x5 window", () => {
    const x = SOUL_CENTER.x + SOUL_CHUNK_SIZE * 40, y = SOUL_CENTER.y - SOUL_CHUNK_SIZE * 17;
    const camps = soulWindowChunks(x, y).flatMap(({ cx, cy }) => soulChunkCamps(cx, cy));
    expect(camps.length).toBeGreaterThan(10);
    expect(new Set(camps.map(camp => camp.key)).size).toBe(camps.length);
    for (const camp of camps) expect(soulChunkOf(camp.x)).toBe(Number(camp.key.split(":")[0]));
  });

  it("has an edge: nothing past the world's last chunk", () => {
    expect(soulChunkCamps(-1, 5)).toEqual([]);
    expect(soulChunkProps(5, 1e9)).toEqual([]);
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
  it("carry Soul Dimension positions far past u16, and stay apart from the narrow format", () => {
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
