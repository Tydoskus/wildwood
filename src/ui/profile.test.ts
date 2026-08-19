import { afterEach, describe, expect, it, vi } from "vitest";
import { profilePresenceText } from "./profile";

describe("profile presence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps online status ahead of any stored timestamp", () => {
    expect(profilePresenceText(true, 0)).toBe("ONLINE");
  });

  it("renders a valid offline last-seen timestamp", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Aug 18, 7:30 PM");
    expect(profilePresenceText(false, Date.now())).toBe("LAST SEEN AUG 18, 7:30 PM");
  });

  it("uses a placeholder when no timestamp exists", () => {
    expect(profilePresenceText(false, 0)).toBe("LAST SEEN —");
  });
});
