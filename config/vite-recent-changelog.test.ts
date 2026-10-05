import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trimReleaseNotes } from "./vite-recent-changelog";

describe("shipped changelog", () => {
  it("keeps only the newest release notes, unchanged, and leaves the rest of the module alone", () => {
    const source = readFileSync(new URL("../src/app/changelog.ts", import.meta.url), "utf8");
    const trimmed = trimReleaseNotes(source, 3);
    const versions = [...trimmed.slice(0, trimmed.indexOf("\n};\n")).matchAll(/^  "(\d+(?:\.\d+)+)": \[/gm)].map(match => match[1]);
    const newest = [...source.matchAll(/^  "(\d+(?:\.\d+)+)": \[/gm)].slice(0, 3).map(match => match[1]);
    expect(versions).toEqual(newest);
    expect(trimmed).toContain("export const RELEASE_DAYS");
    expect(trimmed).toContain("export function recentReleaseNotes");
    expect(trimmed.length).toBeLessThan(source.length / 5);
  });
});
