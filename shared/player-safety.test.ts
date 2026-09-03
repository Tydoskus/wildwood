import { describe, expect, it } from "vitest";
import { playerBlockKey, playerReportValidationError } from "./player-safety";

describe("player safety validation", () => {
  it("requires another player and a known reason", () => {
    expect(playerReportValidationError("a", "a", "other", "")).toMatch(/yourself/);
    expect(playerReportValidationError("a", "b", "invented", "")).toMatch(/reason/);
    expect(playerReportValidationError("a", "b", "harassment", "")).toBeNull();
  });
  it("bounds private notes without requiring personal information", () => {
    expect(playerReportValidationError("a", "b", "other", "x".repeat(500))).toBeNull();
    expect(playerReportValidationError("a", "b", "other", "x".repeat(501))).toMatch(/500/);
    expect(playerReportValidationError("a", "b", "other", "   ")).toBeNull();
  });
  it("keeps each owner's block independent", () => {
    expect(playerBlockKey("a", "b")).toBe("a:b");
    expect(playerBlockKey("b", "a")).not.toBe(playerBlockKey("a", "b"));
  });
});
