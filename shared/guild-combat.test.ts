import { buildGuildEntrance } from "./guild-entrance";
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
  it("keeps 20v20 combat deterministic and bounded", () => {
    const attackers = team(20), defenders = team(20, "b"), frames: GuildCombatFrame[] = [];
    const first = simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
    expect(first).toEqual(simulateGuildBattle(attackers, defenders));
    expect(first.outcome).toBe("DRAW");
    expect(frames.length).toBeLessThanOrEqual(601);
    expect(frames.every(frame => frame.actors.length === 40)).toBe(true);
    expect(frames[80].actors.some((actor, i) => actor.x !== frames[0].actors[i].x)).toBe(true);
    expect(JSON.stringify(first).length).toBeLessThan(15000);
  });
  it("uses the identical tick function for an independently played replay", () => {
    const attackers = team(4), defenders = team(7, "b", { ...fighter, attackRate: .37 });
    const frames: GuildCombatFrame[] = []; simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
    const arrivals = buildGuildEntrance({ attackers, defenders }).arrivals.map(entry => entry.start + entry.travel);
    let replay = initialGuildCombat(attackers, defenders);
    for (const expected of frames.slice(1)) {
      replay = advanceGuildCombat([...attackers, ...defenders], attackers.length, replay, arrivals);
      expect(replay).toEqual(expected);
    }
  });
  it("stops passive teams at sixty seconds and rejects invalid rosters", () => {
    const passive = { ...fighter, damage: 0, regen: 100 };
    expect(simulateGuildBattle(team(1, "a", passive), team(20, "b", passive))).toMatchObject({ duration: 60 });
    expect(() => simulateGuildBattle([], team(1))).toThrow();
    expect(() => simulateGuildBattle(team(21), team(1))).toThrow();
    expect(() => simulateGuildBattle(team(1, "a", { ...fighter, damage: NaN }), team(1))).toThrow();
  });
});

it("starts fighting before all arrivals and never targets a pending fighter", () => {
  const attackers = team(20), defenders = team(20, "b"), frames: GuildCombatFrame[] = [];
  const arrival = buildGuildEntrance({ attackers, defenders });
  const ready = arrival.arrivals.map(entry => entry.start + entry.travel);
  simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
  expect(frames.some(frame => frame.time < arrival.duration && frame.actors.some(actor => actor.attacks > 0))).toBe(true);
  for (const frame of frames) for (const [i, actor] of frame.actors.entries()) {
    if (frame.time < ready[i]) {
      expect(actor.hp).toBe(fighter.maxHp);
      expect(actor.attacks).toBe(0);
      expect(actor.target).toBe(-1);
    }
    if (actor.target >= 0) expect(frame.time).toBeGreaterThan(ready[actor.target]);
  }
});
it("keeps reserves alive when all currently arrived teammates have fallen", () => {
  const attackers = team(20, "a", { ...fighter, maxHp: 1, damage: 1000 });
  const defenders = team(20, "b", { ...fighter, maxHp: 1, damage: 1000 });
  const ready = buildGuildEntrance({ attackers, defenders }).arrivals.map(entry => entry.start + entry.travel);
  const frames: GuildCombatFrame[] = [];
  const result = simulateGuildBattle(attackers, defenders, frame => frames.push(frame));
  expect(result.duration).toBeGreaterThan(Math.max(...ready));
  expect(frames.some(frame => frame.actors.some(actor => actor.hp === 0) && frame.actors.some((actor, i) => actor.hp > 0 && frame.time < ready[i]))).toBe(true);
});
it("retains the original simultaneous simulation for saved version 2 battles", () => {
  const frames: GuildCombatFrame[] = [];
  const result = simulateGuildBattle(team(20), team(20, "b"), frame => frames.push(frame), 2);
  expect(result.version).toBe(2); expect(result.outcome).toBe("DRAW");
  expect(frames[1].actors.every((actor, i) => actor.x !== frames[0].actors[i].x)).toBe(true);
});

// These values were captured before the arrival/targeting change.
it.each([[2, 8], [3, 10.3]] as const)("retains saved v%s outcomes and timing", (version, duration) => {
  const side = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => ({ identity: prefix + i, name: prefix + i,
    fighter: { maxHp: 100 + i * 19, damage: 10 + i * 3, armor: 7 * i, regen: 0, attackRate: .7 }, range: 160 }));
  expect(simulateGuildBattle(side("a", 7), side("b", 5), undefined, version))
    .toMatchObject({ version, duration, outcome: "VICTORY", attackerSurvivors: 6, defenderSurvivors: 0 });
});
it("distributes random targets and keeps them stable between reinforcement waves", () => {
  const attackers = team(20), defenders = team(20, "b"), fighters = [...attackers, ...defenders];
  const initial = initialGuildCombat(attackers, defenders);
  // All opponents are eligible, including an artificially closest target.
  initial.actors[20].x = initial.actors[0].x + 1;
  const ready = fighters.map(() => 0);
  const first = advanceGuildCombat(fighters, 20, initial, ready);
  expect(new Set(first.actors.slice(0, 20).map(actor => actor.target)).size).toBe(20);
  expect(first.actors.slice(0, 20).some((actor, i) => actor.target !== i + 20)).toBe(true);
  const next = advanceGuildCombat(fighters, 20, first, ready);
  expect(next.actors.map(actor => actor.target)).toEqual(first.actors.map(actor => actor.target));
  expect(advanceGuildCombat(fighters, 20, initial, ready)).toEqual(first);
});


it("freezes normal walking speed for new fights while preserving historical speed", () => {
  for (const speed of [undefined, 180]) {
    const fighters = [...team(1), ...team(1, "b")].map(f => ({ ...f, moveSpeed: speed }));
    const frame = initialGuildCombat(fighters.slice(0, 1), fighters.slice(1));
    const next = advanceGuildCombat(fighters, 1, frame);
    expect(next.actors[0].x - frame.actors[0].x).toBeCloseTo((speed ?? 90) * .1);
    const arrival = buildGuildEntrance({ attackers: fighters.slice(0, 1), defenders: fighters.slice(1) });
    expect(arrival.arrivals[0].travel).toBeCloseTo(470 / (speed ?? 90));
  }
});
it("uses melee reach only for melee weapons and saved range for bows", async () => {
  const { guildWeaponRange } = await import("./guild-combat");
  expect(guildWeaponRange("wooden_sword", 200)).toBe(75);
  expect(guildWeaponRange("starter_bow", 200)).toBe(200);
  expect(guildWeaponRange("wooden_sword", 250)).toBe(125);
  expect(guildWeaponRange("starter_bow", 250)).toBe(250);
  const fighters = [...team(1), ...team(1, "b")].map((f, i) => ({ ...f, range: i ? 75 : 200, moveSpeed: 180 }));
  const initial = initialGuildCombat(fighters.slice(0, 1), fighters.slice(1));
  initial.actors[0].x = 0; initial.actors[1].x = 150;
  initial.actors.forEach(actor => { actor.cooldown = 0; });
  const next = advanceGuildCombat(fighters, 1, initial);
  expect(next.actors[0].attacks).toBe(1);
  expect(next.actors[1].attacks).toBe(0);
});
