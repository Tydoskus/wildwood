import { describe, expect, it } from "vitest";
import { isNewerGameVersion } from "./version";

describe("game version comparison", () => {
  it("only treats a strictly newer deployed build as an update", () => {
    expect(isNewerGameVersion("0.485", "0.484")).toBe(true);
    expect(isNewerGameVersion("0.484", "0.484")).toBe(false);
    expect(isNewerGameVersion("0.483", "0.484")).toBe(false);
  });

  it("ignores invalid version responses", () => {
    expect(isNewerGameVersion(undefined, "0.484")).toBe(false);
    expect(isNewerGameVersion("index.html", "0.484")).toBe(false);
  });
});
