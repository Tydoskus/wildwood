import { describe, expect, it } from "vitest";
import { statRewardToastModel } from "./stat-reward-toast";

describe("stat reward toast", () => {
  it.each([
    ["+4.88m DAMAGE", "+4.88m", "Damage", "⚔️"],
    ["+8.50k MAX HEALTH", "+8.50k", "Max Health", "♥"],
    ["+150 ARMOR", "+150", "Armor", "🛡️"],
    ["+0.25 ATK/SEC", "+0.25", "Attack Speed", "⚡"],
    ["+12 HP/SEC", "+12", "Regeneration", "✚"],
  ])("presents %s as a labeled stat increase", (text, amount, label, icon) => {
    expect(statRewardToastModel(text)).toEqual({ amount, label, icon });
  });

  it("leaves unrelated notifications available to the fallback renderer", () => {
    expect(statRewardToastModel("ITEM FOUND")).toBeNull();
  });
});
