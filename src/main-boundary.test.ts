import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/main.ts has no exports and nothing imports it, so no behavioural test can
// cover its wiring. This ratchet is the only automated pressure on its size.
//
// ENGINEERING.md and AGENTS.md set the real target at 1,000 lines. The file
// reached 2,224 before anything watched it, and the remaining distance runs
// through the combat, render and coop-sync wiring, where a mistake is only
// visible in play. So this guard enforces the one property that can be checked
// mechanically: the facade never grows again.
//
// Lower MAX_LINES as extractions land. Raising it means a feature's wiring
// genuinely belongs here after its own module took everything it could, and
// the raise is the wiring alone. Growth without an extraction first is the
// drift this guard exists to stop.
// Do not satisfy it by minifying or removing useful comments/whitespace.
const MAX_LINES = 2_172;
const TARGET_LINES = 1_000;

describe("game composition boundary", () => {
  it("never grows past its last recorded size", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const lineCount = source.split(/\r?\n/).length - Number(source.endsWith("\n"));

    expect(lineCount).toBeLessThanOrEqual(MAX_LINES);
  });

  it("records how far the facade still is from the documented target", () => {
    // Fails once the facade reaches 1,000 lines, as a prompt to replace this
    // ratchet with the strict sub-1,000 assertion that wildstat-coop.ts uses.
    expect(MAX_LINES).toBeGreaterThan(TARGET_LINES);
  });
});
