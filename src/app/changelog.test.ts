import { describe, expect, it } from "vitest";
import { recentReleaseNotes, releaseDate } from "./changelog";

describe("release-note dates", () => {
  it("keeps current releases visible on the sign-in screen", () => {
    const releases = recentReleaseNotes(2, new Date(2026, 7, 22, 12));

    expect(releases).toContainEqual(expect.objectContaining({ version: "0.474", date: "AUG 22, 2026" }));
    expect(releases.some(({ version }) => version === "0.459")).toBe(true);
    expect(releases.some(({ version }) => version === "0.458")).toBe(false);
  });

  it("formats recorded ISO release days for display", () => {
    expect(releaseDate("0.474")).toBe("AUG 22, 2026");
    expect(releaseDate("0.431")).toBe("AUG 17, 2026");
    expect(releaseDate("0.430")).toBe("AUG 16, 2026");
  });
});
