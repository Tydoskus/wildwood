import { describe, expect, it } from "vitest";
import { RELEASE_NOTES, recentReleaseNotes, releaseDate } from "./changelog";

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
    expect(releases.map(({ version }) => version)).toEqual(Object.keys(RELEASE_NOTES).slice(0, 10));
  });

  it("never tells a player prestige clears their tech research", () => {
    // Prestige keeps research, and the notes are read back long after the
    // release they describe, so a note that says otherwise misinforms.
    const claims = Object.entries(RELEASE_NOTES).flatMap(([version, notes]) => notes
      .filter(note => /research/i.test(note) && /\bprestige/i.test(note))
      .filter(note => /\b(clears|resets|wipes|loses)\b[^.]*research/i.test(note))
      // A note correcting the old false claim is itself accurate.
      .filter(note => !/no longer|does not|doesn't|never/i.test(note))
      .map(note => `${version}: ${note}`));
    expect(claims).toEqual([]);
  });

  it("formats recorded ISO release days for display", () => {
    expect(releaseDate("0.732")).toBe("SEP 17, 2026");
    expect(releaseDate("0.733")).toBe("SEP 17, 2026");
    expect(releaseDate("9.999")).toBe("");
    expect(releaseDate("0.474")).toBe("AUG 22, 2026");
    expect(releaseDate("0.431")).toBe("AUG 17, 2026");
    expect(releaseDate("0.430")).toBe("AUG 16, 2026");
  });
});
