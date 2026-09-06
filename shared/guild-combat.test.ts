import { describe, expect, it } from "vitest";
import { advanceGuildCombat, initialGuildCombat, simulateGuildBattle, type GuildCombatFrame, type GuildFighter } from "./guild-combat";
const fighter = { maxHp: 100, damage: 20, armor: 0, regen: 0, attackRate: 1 };
const team = (count: number, side = "a", stats = fighter): GuildFighter[] => Array.from({ length: count }, (_, i) => ({ identity: `${side}${i}`, name: `${side}${i}`, fighter: stats }));

describe("whole-guild combat", () => {
  it("resolves equal simultaneous lethal attacks without a first-side advantage", () => {
    const result = simulateGuildBattle(team(1, "a", { ...fighter, damage: 1000 }), team(1, "b", { ...fighter, damage: 1000 }));
    expect(result.outcome).toBe("DRAW"); expect(result.attackerSurvivors).toBe(0); expect(result.defenderSurvivors).toBe(0);
  });
  it("allows unequal full rosters and retargets after a knockout", () => {
    const frames: GuildCombatFrame[] = [];
    const result = simulateGuildBattle(team(6), team(2, "b"), frame => frames.push(frame));
    expect(result.attackers).toHaveLength(6); expect(result.defenders).toHaveLength(2);
    expect(result.outcome).toBe("VICTORY");
    expect(frames.some(frame => frame.actors.some((actor, i) => i < 6 && actor.attacks > 0))).toBe(true);
    for (const frame of frames) expect(frame.actors.every(actor => actor.hp >= 0)).toBe(true);
  });
  it("keeps 20v20 combat deterministic, bounded and mirrored", () => {
    const attackers = team(20), defenders = team(20, "b"), frames: GuildCombatFrame[] = [];
    const first = simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
    expect(first).toEqual(simulateGuildBattle(attackers, defenders));
    expect(first.outcome).toBe("DRAW");
    expect(frames.length).toBeLessThanOrEqual(601);
    expect(frames.every(frame => frame.actors.length === 40)).toBe(true);
    expect(frames[0].actors[0].x).not.toBe(frames[20].actors[0].x);
    expect(JSON.stringify(first).length).toBeLessThan(15000);
  });
  it("uses the identical tick function for an independently played replay", () => {
    const attackers = team(4), defenders = team(7, "b", { ...fighter, attackRate: .37 });
    const frames: GuildCombatFrame[] = []; simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
    let replay = initialGuildCombat(attackers, defenders);
    for (const expected of frames.slice(1)) {
      replay = advanceGuildCombat([...attackers, ...defenders], attackers.length, replay);
      expect(replay).toEqual(expected);
    }
  });
  it("stops passive teams at sixty seconds and rejects invalid rosters", () => {
    const passive = { ...fighter, damage: 0, regen: 100 };
    expect(simulateGuildBattle(team(1, "a", passive), team(20, "b", passive))).toMatchObject({ outcome: "DRAW", duration: 60 });
    expect(() => simulateGuildBattle([], team(1))).toThrow();
    expect(() => simulateGuildBattle(team(21), team(1))).toThrow();
    expect(() => simulateGuildBattle(team(1, "a", { ...fighter, damage: NaN }), team(1))).toThrow();
  });
});
