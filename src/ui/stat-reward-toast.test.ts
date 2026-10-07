import { describe, expect, it } from "vitest";
import { formatStatRewardToastAmount, statRewardToastModel } from "./stat-reward-toast";

describe("stat reward toast", () => {
  it.each([
    ["+4.88m DAMAGE", "+4.88m", "Damage", "⚔️"],
    ["+4.88m Damage", "+4.88m", "Damage", "⚔️"],
    ["+8.50k MAX HEALTH", "+8.50k", "Max Health", "♥"],
    ["+150 ARMOR", "+150", "Armor", "🛡️"],
    ["+0.25 ATK/SEC", "+0.25", "Attack Speed", "⚡"],
    ["+12 HP/SEC", "+12", "Regeneration", "✚"],
  ])("presents %s as a labeled stat increase", (text, amount, label, icon) => {
    expect(statRewardToastModel(text)).toMatchObject({ amount, label, icon });
  });

  it("parses compact amounts so repeated rewards can be accumulated", () => {
    expect(statRewardToastModel("+4.88m DAMAGE")).toMatchObject({ stat: "DAMAGE", value: 4_880_000 });
    expect(statRewardToastModel("+0.25 ATK/SEC")).toMatchObject({ stat: "ATK/SEC", value: .25 });
    expect(formatStatRewardToastAmount("DAMAGE", 9_760_000)).toBe("+9.76m");
    expect(formatStatRewardToastAmount("ATK/SEC", .5)).toBe("+0.50");
  });

  it("leaves unrelated notifications available to the fallback renderer", () => {
    expect(statRewardToastModel("ITEM FOUND")).toBeNull();
    expect(statRewardToastModel("+mystery DAMAGE")).toBeNull();
  });
});

it("names a curve map's speed reward Attack Speed", () => {
  expect(statRewardToastModel("+0.36 Attack Speed")).toMatchObject({ stat: "ATTACK SPEED", value: .36, label: "Attack Speed" });
});

it("shows soul stat gains as stat gains, apart from the run's own, crit damage as a percentage", async () => {
  const { SOUL_STAT_DETAILS } = await import("../../shared/soul-dimension");
  for (const detail of Object.values(SOUL_STAT_DETAILS)) {
    const amount = detail.label === "Crit Damage" ? `+${+(detail.reward * 100).toFixed(1)}%` : `+${detail.reward}`;
    const model = statRewardToastModel(`${amount} Soul ${detail.label}`);
    expect(model, detail.label).toMatchObject({ label: `Soul ${detail.label}`, amount });
    expect(model!.stat).not.toBe(statRewardToastModel("+1 Damage")!.stat);
  }
  expect(formatStatRewardToastAmount("SOUL CRIT DAMAGE", .6)).toBe("+0.6%");
  expect(formatStatRewardToastAmount("SOUL ATTACK SPEED", .003)).toBe("+0.003");
  expect(formatStatRewardToastAmount("SOUL DAMAGE", 12)).toBe("+12");
});
