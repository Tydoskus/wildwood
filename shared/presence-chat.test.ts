import { describe, expect, it } from "vitest";
import {
  PRESENCE_CHAT_COOLDOWN_MICROS,
  advancePresenceChatCooldown,
  isPresenceChatMessage,
  presenceChatCooldownElapsed,
  presenceChatMessage,
} from "./presence-chat";

describe("presence chat", () => {
  it("uses concise login and leave messages", () => {
    expect(presenceChatMessage("rymel", "login")).toBe("rymel has logged in.");
    expect(presenceChatMessage("rymel", "leave")).toBe("rymel has left.");
  });

  it("allows each event again after fifteen minutes", () => {
    const lastEventAt = 12_000_000n;
    expect(presenceChatCooldownElapsed(lastEventAt + PRESENCE_CHAT_COOLDOWN_MICROS - 1n, lastEventAt)).toBe(false);
    expect(presenceChatCooldownElapsed(lastEventAt + PRESENCE_CHAT_COOLDOWN_MICROS, lastEventAt)).toBe(true);
    expect(presenceChatCooldownElapsed(lastEventAt, 0n)).toBe(true);
  });

  it("tracks login and leave cooldowns independently", () => {
    const login = advancePresenceChatCooldown(null, "login", 10n);
    expect(login).toEqual({ lastLoginAtMicros: 10n, lastLeaveAtMicros: 0n });
    expect(advancePresenceChatCooldown(login, "login", 11n)).toBeNull();
    expect(advancePresenceChatCooldown(login, "leave", 11n)).toEqual({
      lastLoginAtMicros: 10n,
      lastLeaveAtMicros: 11n,
    });
  });

  it("recognizes plain system entries by their intentionally blank sender name", () => {
    expect(isPresenceChatMessage("")).toBe(true);
    expect(isPresenceChatMessage("rymel")).toBe(false);
  });
});
