import { describe, expect, it } from "vitest";
import { compareVersions, incrementVersion, insertReleaseNotes } from "./release-live.mjs";

describe("live release helper", () => {
  it("increments the final numeric version segment", () => {
    expect(incrementVersion("0.456")).toBe("0.457");
    expect(incrementVersion("1.9.99")).toBe("1.9.100");
    expect(() => incrementVersion("v1.2")).toThrow("Invalid version");
    expect(compareVersions("0.457", "0.456")).toBe(1);
    expect(compareVersions("0.456.0", "0.456")).toBe(0);
    expect(compareVersions("0.455", "0.456")).toBe(-1);
  });

  it("inserts escaped release notes at the top", () => {
    const source = `export const RELEASE_NOTES: Record<string, string[]> = {\n  "0.456": [\n    "Old note.",\n  ],\n};\n`;
    const updated = insertReleaseNotes(source, "0.457", ["First note.", "Player's \"Bow\" fixed."]);
    expect(updated).toContain(`  "0.457": [\n    "First note.",\n    "Player's \\"Bow\\" fixed.",\n  ],\n`);
    expect(updated.indexOf('"0.457"')).toBeLessThan(updated.indexOf('"0.456"'));
    expect(() => insertReleaseNotes(updated, "0.457", ["Duplicate."])).toThrow("already contain");
  });
});
