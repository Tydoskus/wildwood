import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLoadedVersionQuery, isNewerGameVersion } from "./version";

afterEach(() => vi.unstubAllGlobals());

describe("clean update URLs", () => {
  it("removes only a successfully loaded version marker and preserves route state", () => {
    const replaceState = vi.fn();
    const state = { keep: true };
    vi.stubGlobal("window", {
      location: { href: "https://example.test/wildwood/?v=0.608&debug=1#game" },
      history: { state, replaceState },
    });
    clearLoadedVersionQuery("0.608");
    expect(replaceState).toHaveBeenCalledWith(state, "", "https://example.test/wildwood/?debug=1#game");
  });

  it.each(["?v=0.609", "?v=0.608&code=oauth&state=keep", "?v=0.608&error=denied", ""])("leaves pending updates and auth callbacks alone: %s", (query) => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location: { href: `https://example.test/${query}` }, history: { replaceState } });
    clearLoadedVersionQuery("0.608");
    expect(replaceState).not.toHaveBeenCalled();
  });
});

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
