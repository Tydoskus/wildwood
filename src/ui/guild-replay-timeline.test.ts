import { expect, it } from "vitest";
import { simulateGuildBattle } from "../../shared/guild-combat";
import { buildGuildReplayTimeline } from "./guild-replay-timeline";
const member = (identity: string) => ({ identity, name: identity, fighter: { maxHp: 100, damage: 1000, armor: 0, regen: 0, attackRate: 1 }, range: 160 });
it("keeps both lethal projectiles in flight before simultaneous knockouts", () => {
  const battle = simulateGuildBattle([member("a")], [member("b")]);
  const timeline = buildGuildReplayTimeline(battle);
  expect(timeline.shots).toHaveLength(2);
  for (const shot of timeline.shots) {
    expect(shot.launch).toBeLessThan(shot.impact);
    expect(shot.impact).toBe(timeline.deaths[shot.target]);
    expect(timeline.sample(shot.launch)[shot.actor].hp).toBeGreaterThan(0);
    expect(timeline.sample(shot.impact)[shot.target].hp).toBe(0);
  }
});
it("interpolates movement and allows scrubbing back without changing the saved frames", () => {
  const timeline = buildGuildReplayTimeline(simulateGuildBattle([member("a")], [member("b")]));
  const before = JSON.stringify(timeline.frames);
  const start = timeline.sample(.2), end = timeline.sample(.3), middle = timeline.sample(.25);
  expect(middle[0].x).toBeCloseTo((start[0].x + end[0].x) / 2);
  timeline.sample(90);
  expect(timeline.sample(.25)).toEqual(middle);
  expect(JSON.stringify(timeline.frames)).toBe(before);
});
