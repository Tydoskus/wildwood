import { describe, expect, it, vi } from "vitest";
import type { ReducerPort } from "../ports";
import { createGuildService } from "./guild-service";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  const connection = { isActive: true, reducers: { joinGuild: vi.fn(async (_args: unknown) => {}) },
    procedures: { getGuildHub: vi.fn(async (_args: unknown) => JSON.stringify({ directory: [] })) } };
  let active = connection;
  let identity = "first";
  const drain = vi.fn(async () => true);
  const port = { connection: () => active, protocolBlocked: () => false, runWorldReducer: async (fn: () => unknown) => fn(), errorMessage: (error: Error) => error.message } as unknown as ReducerPort;
  const service = createGuildService({ reducers: port, localIdentity: () => identity, drainPendingProgress: drain });
  return { connection, drain, service, replace: () => { active = { ...connection }; }, signOut: () => { identity = ""; } };
}

describe("Guild service", () => {
  it("reads one paged snapshot on demand without subscribing", async () => {
    const h = harness();
    expect(h.connection.procedures.getGuildHub).not.toHaveBeenCalled();
    await h.service.api.loadGuild("45");
    expect(h.connection.procedures.getGuildHub).toHaveBeenCalledExactlyOnceWith({ afterId: 45n });
    expect(h.drain).not.toHaveBeenCalled();
  });
  it("rejects snapshot responses after panel cancellation", async () => {
    const h = harness(); const pending = deferred<string>();
    h.connection.procedures.getGuildHub.mockReturnValue(pending.promise);
    const load = h.service.api.loadGuild();
    h.service.api.cancel(); pending.resolve("{}");
    await expect(load).rejects.toThrow("session changed");
  });
  it("rejects snapshots after connection replacement or identity change", async () => {
    for (const change of ["replace", "signOut"] as const) {
      const h = harness(); const pending = deferred<string>();
      h.connection.procedures.getGuildHub.mockReturnValue(pending.promise);
      const load = h.service.api.loadGuild(); h[change](); pending.resolve("{}");
      await expect(load).rejects.toThrow("session changed");
    }
  });
  it("does not send mutations when progress cannot be drained", async () => {
    const h = harness(); h.drain.mockResolvedValue(false);
    await expect(h.service.api.guildAction({ kind: "join", guildId: "6" })).rejects.toThrow("still syncing");
    expect(h.connection.reducers.joinGuild).not.toHaveBeenCalled();
  });
  it("blocks duplicate guild actions while a mutation is in flight", async () => {
    const h = harness(); const pending = deferred<void>();
    h.connection.reducers.joinGuild.mockReturnValue(pending.promise);
    const first = h.service.api.guildAction({ kind: "join", guildId: "6" });
    await expect(h.service.api.guildAction({ kind: "join", guildId: "6" })).rejects.toThrow("already being saved");
    pending.resolve(); await first;
    expect(h.connection.reducers.joinGuild).toHaveBeenCalledExactlyOnceWith({ guildId: 6n });
  });
  it("checks cancellation again after draining before sending an action", async () => {
    const h = harness(); const pending = deferred<boolean>(); h.drain.mockReturnValue(pending.promise);
    const action = h.service.api.guildAction({ kind: "join", guildId: "7" });
    h.service.resetSession(); pending.resolve(true);
    await expect(action).rejects.toThrow("session changed");
    expect(h.connection.reducers.joinGuild).not.toHaveBeenCalled();
  });
  it("releases the old session lock without letting an old completion unlock a new action", async () => {
    const h = harness();
    const oldPending = deferred<void>();
    const newPending = deferred<void>();
    h.connection.reducers.joinGuild.mockReturnValueOnce(oldPending.promise).mockReturnValueOnce(newPending.promise);
    const oldAction = h.service.api.guildAction({ kind: "join", guildId: "6" });
    await Promise.resolve(); await Promise.resolve();
    h.service.resetSession();
    const newAction = h.service.api.guildAction({ kind: "join", guildId: "7" });
    oldPending.resolve();
    await expect(oldAction).rejects.toThrow("session changed");
    await expect(h.service.api.guildAction({ kind: "join", guildId: "7" })).rejects.toThrow("already being saved");
    newPending.resolve(); await newAction;
  });

});
