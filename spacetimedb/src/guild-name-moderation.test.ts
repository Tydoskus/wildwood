import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { createTestGuild } from "../../tests/helpers/guild-creation";
import { guildNameModerationReason } from "./chat-moderation";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("refuses the four-letter profanity the chat filter alone lets through", () => {
  // Some of these are already caught by the display-name rules with their own
  // reason; what matters is that none of them can become a guild.
  for (const name of ["CoCk", "COCK", "Cunt", "Dick", "Nazi", "Rape"]) expect(guildNameModerationReason(name), name).not.toBeNull();
  expect(guildNameModerationReason("cock")).toBe("Offensive guild name");
  for (const name of ["Soup", "Fish", "VIPs", "Yeet", "BRZA", "Uncs"]) expect(guildNameModerationReason(name), name).toBeNull();
});

it("blocks creating a guild under a blocked name without leaking which list caught it", () => {
  const f = crystalFixture();
  expect(() => createTestGuild(f, "CoCk")).toThrow("That guild name is not allowed.");
  expect(() => createTestGuild(f, "Soup")).not.toThrow();
});
