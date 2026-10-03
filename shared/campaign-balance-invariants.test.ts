import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { campaignMapTargetSeconds } from "./campaign-pacing";
import { BOSS_DAMAGE_PROFILES, BOSS_DAMAGE_REFERENCE } from "./boss-damage";
import { ENEMY_BASE_VALUES } from "./enemy-base-values";
import { campaignMeleeChaseSpeed, ENEMY_TYPES, type EnemyDefinition } from "./enemy-definitions";
import { defaultBalanceSettings, resolveMapBalance } from "./map-balance";
import * as rules from "./rules";

// Design rules the campaign tables must keep, whatever the tuning. These replace
// tests that pinned individual table values (Bramble speed 205, Dune Raider
// reward 6, ...), which had to be rewritten on every retune without checking
// anything a retune could break. Deliberate baselines stay pinned where they
// live (map 1 Spitters: shared/map-balance.test.ts, shared/balance-curve.test.ts).

const settings = defaultBalanceSettings();
const maps = CAMPAIGN_MAPS.map(map => resolveMapBalance(map.id, settings, 0));
const roleOf = (enemy: EnemyDefinition) => `${enemy.elite ? "elite" : "regular"}:${enemy.reward.type}`;
// The six fitted tracks; Forest's regen enemy is a regular and anchors the regen elites.
const TRACKS = ["regular:damage", "regular:health", "regular:armor", "elite:damage", "elite:health", "elite:regen"] as const;
const strongest = (index: number, role: string) => {
  const rows = Object.values(maps[index].enemies).filter(enemy => roleOf(enemy) === role);
  return rows.length ? rows.reduce((a, b) => (b.hp > a.hp ? b : a)) : undefined;
};
const bossHp = (map: typeof CAMPAIGN_MAPS[number]) => (rules as unknown as Record<string, number>)[`${map.bossArt}_MAX_HP`];

describe("campaign enemies grow map over map", () => {
  it.each(TRACKS)("%s: health, hit and reward all rise from each map to the next", role => {
    let previous: EnemyDefinition | undefined;
    for (const [index, map] of CAMPAIGN_MAPS.entries()) {
      const row = strongest(index, role);
      if (!row) { expect(index, `${role} missing on ${map.id}`).toBe(0); continue; }
      if (previous) {
        expect(row.hp, `${role} hp on ${map.id}`).toBeGreaterThan(previous.hp);
        expect(row.damage, `${role} damage on ${map.id}`).toBeGreaterThan(previous.damage);
        expect(row.reward.amount, `${role} reward on ${map.id}`).toBeGreaterThan(previous.reward.amount);
      }
      previous = row;
    }
  });

  it("never slows a track down on a later map", () => {
    for (const role of TRACKS) {
      let previous = 0;
      for (const index of CAMPAIGN_MAPS.keys()) {
        const row = strongest(index, role);
        if (!row) continue;
        expect(row.speed, `${role} speed on ${CAMPAIGN_MAPS[index].id}`).toBeGreaterThanOrEqual(previous);
        previous = row.speed;
      }
    }
  });

  it("pays an elite more, and makes it tougher, than the regular of its stat on the same map", () => {
    for (const map of maps) {
      const rows = Object.values(map.enemies);
      for (const elite of rows.filter(row => row.elite)) for (const regular of rows.filter(row => !row.elite && row.reward.type === elite.reward.type)) {
        expect(elite.reward.amount, `${map.mapId}`).toBeGreaterThan(regular.reward.amount);
        expect(elite.hp, `${map.mapId}`).toBeGreaterThan(regular.hp);
      }
    }
  });
});

describe("bosses gate progression", () => {
  it("authors every boss with more health than the last", () => {
    for (let i = 1; i < CAMPAIGN_MAPS.length; i++) expect(bossHp(CAMPAIGN_MAPS[i]), CAMPAIGN_MAPS[i].id).toBeGreaterThan(bossHp(CAMPAIGN_MAPS[i - 1]));
  });

  it("resolves every boss tougher than the last and than anything on its own map", () => {
    for (const [index, map] of maps.entries()) {
      const boss = map.boss!;
      expect(boss.hp, map.mapId).toBeGreaterThan(Math.max(...Object.values(map.enemies).map(enemy => enemy.hp)));
      if (index) expect(boss.hp, map.mapId).toBeGreaterThan(maps[index - 1].boss!.hp);
    }
  });

  it("hits harder with each boss, and contact never outweighs the boss's heaviest attack", () => {
    const kinds = CAMPAIGN_MAPS.map(map => map.bossKind as keyof typeof BOSS_DAMAGE_PROFILES);
    for (let i = 1; i < kinds.length; i++) expect(BOSS_DAMAGE_REFERENCE[kinds[i]], kinds[i]).toBeGreaterThan(BOSS_DAMAGE_REFERENCE[kinds[i - 1]]);
    for (const kind of kinds) {
      expect(BOSS_DAMAGE_REFERENCE[kind]).toBe(Math.max(...Object.values(BOSS_DAMAGE_PROFILES[kind])));
      expect(BOSS_DAMAGE_PROFILES[kind].contact).toBeLessThan(BOSS_DAMAGE_REFERENCE[kind]);
    }
  });
});

it("makes each map take longer than the last", () => {
  for (let i = 1; i < CAMPAIGN_MAPS.length; i++) expect(campaignMapTargetSeconds(i)).toBeGreaterThan(campaignMapTargetSeconds(i - 1));
});

describe("authored enemy table", () => {
  it("is the runtime enemy table, untouched until a map snapshot installs", () => {
    expect(ENEMY_TYPES).toEqual(ENEMY_BASE_VALUES);
    expect(ENEMY_TYPES).not.toBe(ENEMY_BASE_VALUES);
  });

  it("keeps every enemy finite, positive and inside the chase-speed range", () => {
    for (const [kind, enemy] of Object.entries(ENEMY_TYPES)) {
      for (const value of [enemy.hp, enemy.damage, enemy.attackSpeed, enemy.reward.amount, enemy.r]) {
        expect(Number.isFinite(value), kind).toBe(true);
        expect(value, kind).toBeGreaterThan(0);
      }
      expect(enemy.speed, kind).toBeGreaterThanOrEqual(campaignMeleeChaseSpeed(0));
      expect(enemy.speed, kind).toBeLessThanOrEqual(rules.ENEMY_TOP_CHASE_SPEED);
    }
  });

  it("leaves Forest exactly as authored: no curve, floor or boost reshapes the tutorial except regen pay", () => {
    for (const [kind, enemy] of Object.entries(maps[0].enemies)) {
      const authored = ENEMY_BASE_VALUES[kind as keyof typeof ENEMY_BASE_VALUES];
      expect(enemy.hp, kind).toBe(authored.hp);
      expect(enemy.damage, kind).toBe(authored.damage);
      expect(enemy.speed, kind).toBe(authored.speed);
      expect(enemy.reward.type, kind).toBe(authored.reward.type);
      if (enemy.reward.type !== "regen") expect(enemy.reward.amount, kind).toBe(authored.reward.amount);
    }
  });
});
