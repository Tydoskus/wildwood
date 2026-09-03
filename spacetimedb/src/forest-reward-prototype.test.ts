import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENEMY_TYPES } from "../../src/game/enemies";
import { FOREST_REWARD_PROTOTYPE as rules } from "../../shared/forest-reward-prototype";
import { attackForestPrototype, beginForestPrototype } from "./forest-reward-prototype";

const startAt = 1_000_000n;
const fresh = () => beginForestPrototype(null, startAt);
const hit = (state = fresh(), overrides = {}, now = state.nextAttackAt) => attackForestPrototype(
  state, { encounter: state.encounter, firstAttack: state.lastAttack + 1n, count: 1, ...overrides }, now,
);

describe("isolated forest reward authority", () => {
  it("uses the actual Spitter health and damage reward with a fixed server-owned loadout", () => {
    expect(rules.enemyHp).toBe(ENEMY_TYPES.Spitter.hp);
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: rules.damageReward });
    expect(fresh()).toMatchObject({ damage: 10, enemyHp: 24, encounter: 1n, kills: 0n, lastAttack: 0n });
  });

  it("awards once, in the same state transition as the killing hit", () => {
    const first = hit();
    const second = hit(first);
    expect(second).toMatchObject({ enemyHp: 4, damage: 10, kills: 0n });
    const dead = hit(second);
    expect(dead).toMatchObject({ enemyHp: 0, damage: 11, kills: 1n, lastAttack: 3n });
    expect(dead.respawnAt).toBe(second.nextAttackAt + rules.respawnMicros);
    expect(() => hit(dead)).toThrow("already defeated");
  });

  it("makes retrying hits, killing hits, and acknowledged batches no-ops", () => {
    const state = fresh();
    const action = { encounter: 1n, firstAttack: 1n, count: 3 };
    const now = state.nextAttackAt + rules.attackIntervalMicros * 2n;
    const dead = attackForestPrototype(state, action, now);
    expect(attackForestPrototype(dead, action, now + 1n)).toBe(dead);
    expect(attackForestPrototype(dead, { ...action, count: 1 }, now + 1n)).toBe(dead);
  });

  it("never accepts client-supplied damage, reward amounts, or kill totals", () => {
    const state = hit(fresh(), { damage: 999999, kills: 99999n, damageReward: 999999 });
    expect(state).toMatchObject({ damage: 10, enemyHp: 14, kills: 0n });
  });

  it("rejects immediate attacks, accelerated batches, invalid counts and sequence jumps without mutating state", () => {
    const state = fresh();
    const original = { ...state };
    expect(() => hit(state, {}, state.nextAttackAt - 1n)).toThrow("cooldown");
    expect(() => hit(state, { count: 2 })).toThrow("budget");
    for (const count of [0, -1, 4, 255, 1.5, NaN, Infinity]) expect(() => hit(state, { count })).toThrow("batches");
    expect(() => hit(state, { firstAttack: 0n })).toThrow("sequence");
    expect(() => hit(state, { firstAttack: 2n })).toThrow("Out-of-order");
    expect(() => hit(state, { encounter: 2n })).toThrow("Stale");
    expect(state).toEqual(original);
  });

  it("rejects overlapping batches rather than partially replaying their damage", () => {
    const state = hit();
    expect(() => hit(state, { firstAttack: 1n, count: 2 })).toThrow("overlapping");
  });

  it("caps banked attacks after a long idle and does not reset cooldown when reopening", () => {
    let state = { ...fresh(), enemyHp: 1000 };
    const now = 100_000_000n;
    const original = state;
    expect(beginForestPrototype(state, now)).toBe(original);
    for (let i = 0; i < 3; i += 1) state = hit(state, {}, now);
    expect(() => hit(state, {}, now)).toThrow("cooldown");
    expect(state.lastAttack).toBe(3n);
  });

  it("retains progression across encounters but enforces respawn and rejects stale attacks", () => {
    const state = fresh();
    const action = { encounter: 1n, firstAttack: 1n, count: 3 };
    const dead = attackForestPrototype(state, action, state.nextAttackAt + rules.attackIntervalMicros * 2n);
    expect(() => beginForestPrototype(dead, dead.respawnAt - 1n)).toThrow("respawning");
    const next = beginForestPrototype(dead, dead.respawnAt);
    expect(next).toMatchObject({ encounter: 2n, damage: 11, kills: 1n, lastAttack: 3n, enemyHp: 24 });
    expect(() => attackForestPrototype(next, action, next.nextAttackAt)).toThrow("Stale");
    expect(hit(next).enemyHp).toBe(13);
  });
});

describe("prototype integration security contracts", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const prototype = source.slice(source.indexOf("export const devForestRewardPrototype"), source.indexOf("export const myPlayerBlocks"));
  it("keeps one private sender-keyed ledger and authorizes every mutation", () => {
    expect(source).toContain('{ name: "forest_reward_prototype", public: false }');
    expect(prototype).toContain("isDeveloperIdentity(ctx.sender)");
    expect(prototype).toContain("requireDeveloper(ctx)");
    expect(prototype.match(/requireForestPrototypeAccess\(ctx\)/g)).toHaveLength(2);
    expect(prototype).toContain("TUTORIAL_FOREST_MAP_ID");
    expect(prototype).toContain("activeDuelFor(ctx, ctx.sender)");
    expect(prototype).toContain("ctx.timestamp.microsSinceUnixEpoch");
  });
  it("never touches real stats, research, inventory, loot, or leaderboards", () => {
    expect(prototype).not.toMatch(/ctx\.db\.(playerProgress|playerResearch|leaderboardEntry|playerLifetime|playerItemDrop)/);
    expect(prototype).not.toContain("publishItemDrop");
    const save = source.slice(source.indexOf("export const savePlayerProgress"), source.indexOf("export const resetPlayerProgress"));
    expect(save).not.toContain("forestRewardPrototype");
    const signature = readFileSync(new URL("../../src/module_bindings/attack_forest_reward_prototype_reducer.ts", import.meta.url), "utf8");
    expect(signature).not.toMatch(/damage:|reward:|identity:|timestamp:|hp:/);
  });
});
