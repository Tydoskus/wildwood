import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("wildstat coop composition boundary", () => {
  it("keeps the browser-facing facade below 1,000 lines", () => {
    const source = readFileSync(new URL("../wildstat-coop.ts", import.meta.url), "utf8");
    const lineCount = source.split(/\r?\n/).length - Number(source.endsWith("\n"));

    expect(lineCount).toBeLessThan(1_000);
  });
});
