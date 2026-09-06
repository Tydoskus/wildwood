import { describe, expect, it } from "vitest";
import { isPresenceChatMessage } from "./presence-chat";

describe("presence chat presentation", () => {
  it("identifies system entries by their intentionally blank sender name", () => {
    expect(isPresenceChatMessage("")).toBe(true);
    expect(isPresenceChatMessage("rymel")).toBe(false);
  });
});
