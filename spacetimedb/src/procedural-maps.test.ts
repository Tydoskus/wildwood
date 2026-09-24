import { describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import {
  generatedMapUnlocked,
  clearProceduralProgress,
  mergeProceduralProgress,
} from "./procedural-maps";
import type { GameReducerContext } from "./index";

vi.mock(
  "spacetimedb/server",
  () => import("../../tests/helpers/spacetime-module"),
);

function harness() {
  const identity = Identity.fromString("1".padStart(64, "0"));
  const rows = (key: string): Record<string, any> => {
    const data = new Map<string, any>();
    const id = (row: any) => String(row[key]?.toHexString?.() ?? row[key]);
    const lookup = (value: any) => String(value?.toHexString?.() ?? value);
    return {
      data,
      insert: (row: any) => data.set(id(row), row),
      [key]: {
        find: (value: any) => data.get(lookup(value)) ?? null,
        update: (row: any) => data.set(id(row), row),
        delete: (value: any) => data.delete(lookup(value)),
      },
    };
  };
  const progress = rows("identity"),
    contribution = rows("key");
  contribution.byIdentity = {
    filter: (id: Identity) =>
      [...contribution.data.values()].filter((r) => r.identity.equals(id)),
  };
  const ctx = {
    sender: identity,
    timestamp: { microsSinceUnixEpoch: 1_000_000n },
    db: {
      proceduralProgress: progress,
      proceduralInstanceContribution: contribution,
      proceduralContribution: {
        byIdentity: { filter: () => [] },
      },
    },
  } as unknown as GameReducerContext;
  return { ctx, identity, progress, contribution };
}
describe("generated map durable unlocks", () => {
  it("requires campaign completion and the previous generated boss", () => {
    expect(generatedMapUnlocked("endless_1", 0, false)).toBe(false);
    expect(generatedMapUnlocked("endless_1", 0, true)).toBe(true);
    expect(generatedMapUnlocked("endless_3", 1, true)).toBe(false);
    expect(generatedMapUnlocked("endless_3", 2, true)).toBe(true);
  });
  it("merges guest progression and removes reset players from pending boss rewards", () => {
    const h = harness(),
      guest = Identity.fromString("2".padStart(64, "0"));
    h.progress.insert({ identity: guest, completed: 4 });
    mergeProceduralProgress(h.ctx, guest);
    expect(h.progress.identity.find(h.identity).completed).toBe(4);
    expect(h.progress.identity.find(guest)).toBeNull();
    clearProceduralProgress(h.ctx, h.identity);
    expect(h.progress.identity.find(h.identity)).toBeNull();
  });
});
