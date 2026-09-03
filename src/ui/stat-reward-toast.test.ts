import { describe, expect, it } from "vitest";
import { formatStatRewardToastAmount, statRewardToastModel } from "./stat-reward-toast";

describe("stat reward toast", () => {
  it.each([
    ["+4.88m DAMAGE", "+4.88m", "Damage", "⚔️"],
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
