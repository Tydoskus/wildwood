import { describe, expect, it } from "vitest";
import { GUILD_CHAT_RETENTION_DAYS } from "../../shared/social";
import {
  GUILD_CHAT_DISPLAY_TTL_MS,
  PUBLIC_CHAT_DISPLAY_TTL_MS,
  chatMessageDisplayTtlMs,
} from "./chat-presentation";

describe("chat message display TTL", () => {
  it("keeps public chat for 1 day, guild chat for 1 week, and private DMs unlimited on the client", () => {
    expect(GUILD_CHAT_RETENTION_DAYS).toBe(7);
    expect(chatMessageDisplayTtlMs("public")).toBe(PUBLIC_CHAT_DISPLAY_TTL_MS);
    expect(chatMessageDisplayTtlMs("public")).toBe(86_400_000);
    expect(chatMessageDisplayTtlMs("guild")).toBe(GUILD_CHAT_DISPLAY_TTL_MS);
    expect(chatMessageDisplayTtlMs("guild")).toBe(7 * 86_400_000);
    expect(chatMessageDisplayTtlMs("private")).toBe(Number.POSITIVE_INFINITY);
  });
});
