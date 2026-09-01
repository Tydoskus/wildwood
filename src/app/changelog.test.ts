import { describe, expect, it } from "vitest";
import { recentReleaseNotes, releaseDate } from "./changelog";

describe("release-note dates", () => {
  it("keeps current releases visible on the sign-in screen", () => {
    const releases = recentReleaseNotes(2, new Date(2026, 7, 22, 12));

    expect(releases).toContainEqual(expect.objectContaining({ version: "0.474", date: "AUG 22, 2026" }));
    expect(releases.some(({ version }) => version === "0.459")).toBe(true);
    expect(releases.some(({ version }) => version === "0.458")).toBe(false);
  });

  it("always includes at least the latest ten releases after the date window expires", () => {
    const releases = recentReleaseNotes(1, new Date(2030, 0, 1, 12));

    expect(releases).toHaveLength(10);
    expect(releases.map(({ version }) => version)).toEqual([
      "0.583", "0.582", "0.581", "0.580", "0.579",
      "0.578", "0.577", "0.576", "0.575", "0.574",
    ]);
  });

  it("formats recorded ISO release days for display", () => {
    expect(releaseDate("0.474")).toBe("AUG 22, 2026");
    expect(releaseDate("0.431")).toBe("AUG 17, 2026");
    expect(releaseDate("0.430")).toBe("AUG 16, 2026");
  });
});
