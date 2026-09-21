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

describe("acknowledged update navigation", () => {
  it("waits for the handoff instead of reloading while a save is pending", async () => {
    vi.resetModules(); vi.useFakeTimers();
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { href: "https://example.test/game", replace }, history: { replaceState: vi.fn() }, setTimeout });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ version: "0.696" }) })));
    const { enforceLatestVersion } = await import("./version");
    let finish!: (ok: boolean) => void;
    const detected = vi.fn();
    enforceLatestVersion("0.695", detected, { canReload: () => true, beforeReload: () => new Promise(resolve => { finish = resolve; }) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(replace).not.toHaveBeenCalled(); expect(detected).not.toHaveBeenCalled();
    finish(true); await vi.advanceTimersByTimeAsync(701);
    expect(replace).toHaveBeenCalledWith("https://example.test/game?v=0.696");
    vi.useRealTimers();
  });
  it("does not navigate if a planned update is still holding the client", async () => {
    vi.resetModules(); vi.useFakeTimers();
    const replace = vi.fn(), beforeReload = vi.fn(async () => true);
    vi.stubGlobal("window", { location: { href: "https://example.test/game", replace }, history: { replaceState: vi.fn() }, setTimeout });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ version: "0.696" }) })));
    const { enforceLatestVersion } = await import("./version");
    enforceLatestVersion("0.695", vi.fn(), { canReload: () => false, beforeReload });
    await vi.advanceTimersByTimeAsync(5000);
    expect(beforeReload).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("a session the server refuses on a build that is already current", () => {
  it("waits out the grace a newer deploy would need, then reloads once and not again inside the cooldown", async () => {
    const { reloadStaleSession, shouldReloadStaleSession, STALE_SESSION_RELOAD_AFTER_MS, STALE_SESSION_RELOAD_COOLDOWN_MS } = await import("./version");
    expect(shouldReloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS - 1, Number.NaN, 1_000_000)).toBe(false);
    expect(shouldReloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS, Number.NaN, 1_000_000)).toBe(true);
    expect(shouldReloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS, 1_000_000 - STALE_SESSION_RELOAD_COOLDOWN_MS + 1, 1_000_000)).toBe(false);
    expect(shouldReloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS, 1_000_000 - STALE_SESSION_RELOAD_COOLDOWN_MS, 1_000_000)).toBe(true);
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const reload = vi.fn();
    expect(reloadStaleSession(5_000, storage, reload, 2_000_000)).toBe(false);
    expect(reloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS, storage, reload, 2_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(reloadStaleSession(STALE_SESSION_RELOAD_AFTER_MS, storage, reload, 2_000_001)).toBe(false);
  });
});
