import { describe, expect, it } from "vitest";
import { strokeIsDrawnOnCpu } from "./text-outline-mode";

describe("text outline mode", () => {
  it("swaps the stroke for shadows only where Gecko draws the page", () => {
    expect(strokeIsDrawnOnCpu("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0")).toBe(true);
    expect(strokeIsDrawnOnCpu("Mozilla/5.0 (Android 13; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0")).toBe(true);
    // Firefox on iOS is WebKit underneath.
    expect(strokeIsDrawnOnCpu("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15")).toBe(false);
    expect(strokeIsDrawnOnCpu("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36")).toBe(false);
  });
});
