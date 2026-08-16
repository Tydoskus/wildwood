import { describe, expect, it } from "vitest";
import { createUpdateResumeStore, inferLegacyUpdateResumeMode } from "./update-resume-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

describe("forced-update session resume", () => {
  it("restores the same session mode once for the requested release", () => {
    const storage = memoryStorage();
    const store = createUpdateResumeStore(storage, "resume", () => 1_000);
    store.write("0.420", "account");

    expect(store.consume("0.420")).toBe("account");
    expect(store.consume("0.420")).toBeNull();
  });

  it("does not turn an ordinary or different-version reload into auto sign-in", () => {
    const storage = memoryStorage();
    const store = createUpdateResumeStore(storage, "resume", () => 1_000);
    store.write("0.420", "guest");

    expect(store.consume("0.421")).toBeNull();
  });

  it("rejects stale or malformed handoffs", () => {
    let now = 1_000;
    const storage = memoryStorage();
    const store = createUpdateResumeStore(storage, "resume", () => now);
    store.write("0.420", "guest");
    now += 10 * 60_000 + 1;
    expect(store.consume("0.420")).toBeNull();

    storage.setItem("resume", "not-json");
    expect(store.consume("0.420")).toBeNull();
    expect(storage.getItem("resume")).toBeNull();
  });

  it("recognizes an older active tab for the first release of the feature only", () => {
    expect(inferLegacyUpdateResumeMode({
      requestedVersion: "0.420",
      currentVersion: "0.420",
      hadPlayableTab: true,
      hasAccountToken: false,
      consumedVersion: "",
    })).toBe("guest");
    expect(inferLegacyUpdateResumeMode({
      requestedVersion: "0.420",
      currentVersion: "0.420",
      hadPlayableTab: true,
      hasAccountToken: true,
      consumedVersion: "",
    })).toBe("account");
    expect(inferLegacyUpdateResumeMode({
      requestedVersion: "0.420",
      currentVersion: "0.420",
      hadPlayableTab: true,
      hasAccountToken: true,
      consumedVersion: "0.420",
    })).toBeNull();
    expect(inferLegacyUpdateResumeMode({
      requestedVersion: "0.419",
      currentVersion: "0.420",
      hadPlayableTab: true,
      hasAccountToken: true,
      consumedVersion: "",
    })).toBeNull();
  });
});
