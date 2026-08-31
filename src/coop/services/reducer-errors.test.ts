import { describe, expect, it } from "vitest";
import { reducerErrorMessage } from "./reducer-errors";

describe("server message branding compatibility", () => {
  it.each([
    ["Wildwood updated. Refresh to continue.", "Wildstat updated. Refresh to continue."],
    ["Enter Wildwood first.", "Enter Wildstat first."],
    ["This account already has Wildwood progress.", "This account already has Wildstat progress."],
    ["Review and accept the Wildwood Terms to continue.", "Review and accept the Wildstat Terms to continue."],
    ["WILDWOOD is active in another tab.", "Wildstat is active in another tab."],
  ])("displays an older server's %s under the current name", (legacy, current) => {
    expect(reducerErrorMessage(new Error(legacy))).toBe(current);
    expect(reducerErrorMessage(current)).toBe(current);
  });

  it("does not rewrite website addresses, database names, or unrelated errors", () => {
    const message = "Wildwood is unavailable at https://tydoskus.github.io/wildwood/ (database wildwood-coop).";
    expect(reducerErrorMessage(message)).toBe("Wildstat is unavailable at https://tydoskus.github.io/wildwood/ (database wildwood-coop).");
    expect(reducerErrorMessage("Connect to https://wildwood.example/ or wss://example.test/wildwood-coop")).toBe("Connect to https://wildwood.example/ or wss://example.test/wildwood-coop");
    expect(reducerErrorMessage(new Error("Not enough Gems."))).toBe("Not enough Gems.");
  });
});
