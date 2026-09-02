import { describe, expect, it, vi } from "vitest";
import {
  isMissingWorldPresenceError,
  retryAfterMissingWorldPresence,
} from "./world-presence-recovery";

describe("world presence recovery", () => {
  it("recognizes the server's missing-presence rejection", () => {
    expect(isMissingWorldPresenceError(new Error("update_movement_state: Enter WildStat first."))).toBe(true);
    expect(isMissingWorldPresenceError(new Error("update_movement_state: Enter Wildstat first."))).toBe(true);
    expect(isMissingWorldPresenceError(new Error("update_movement_state: Enter Wildwood first."))).toBe(true);
    expect(isMissingWorldPresenceError(new Error("Touch the Upgrade Bench first."))).toBe(false);
  });

  it.each(["WildStat", "Wildstat", "Wildwood"])("re-enters and retries exactly once after a %s rejection", async (name) => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error(`Enter ${name} first.`))
      .mockResolvedValueOnce("accepted");
    const recover = vi.fn().mockResolvedValue(true);

    await expect(retryAfterMissingWorldPresence(attempt, recover)).resolves.toBe("accepted");
    expect(recover).toHaveBeenCalledOnce();
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry unrelated failures or a failed recovery", async () => {
    const unrelatedAttempt = vi.fn().mockRejectedValue(new Error("Not enough Gems."));
    const recover = vi.fn().mockResolvedValue(true);
    await expect(retryAfterMissingWorldPresence(unrelatedAttempt, recover)).rejects.toThrow("Not enough Gems.");
    expect(recover).not.toHaveBeenCalled();

    const missingAttempt = vi.fn().mockRejectedValue(new Error("Enter WildStat first."));
    await expect(retryAfterMissingWorldPresence(missingAttempt, () => false)).rejects.toThrow("Enter WildStat first.");
    expect(missingAttempt).toHaveBeenCalledOnce();
  });
});
