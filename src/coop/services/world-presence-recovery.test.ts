import { describe, expect, it, vi } from "vitest";
import {
  isMissingWorldPresenceError,
  retryAfterMissingWorldPresence,
} from "./world-presence-recovery";

describe("world presence recovery", () => {
  it("recognizes the server's missing-presence rejection", () => {
    expect(isMissingWorldPresenceError(new Error("update_movement_state: Enter Wildwood first."))).toBe(true);
    expect(isMissingWorldPresenceError(new Error("Touch the Upgrade Bench first."))).toBe(false);
  });

  it("re-enters and retries exactly once", async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error("Enter Wildwood first."))
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

    const missingAttempt = vi.fn().mockRejectedValue(new Error("Enter Wildwood first."));
    await expect(retryAfterMissingWorldPresence(missingAttempt, () => false)).rejects.toThrow("Enter Wildwood first.");
    expect(missingAttempt).toHaveBeenCalledOnce();
  });
});
