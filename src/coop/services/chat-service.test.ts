import { describe, expect, it, vi } from "vitest";
import type { Identity } from "spacetimedb";
import type { ReducerPort } from "../ports";
import { createChatService } from "./chat-service";

const identity = (value: string) => ({ toHexString: () => value }) as Identity;
const alice = identity("alice"), bob = identity("bob");

function fixture() {
  let local = "alice";
  const reducers = { setPlayerBlocked: vi.fn(async () => {}), reportPlayer: vi.fn(async () => {}) };
  const connection = { reducers };
  const port = {
    protocolBlocked: () => false, connection: () => connection,
    runWorldReducer: (run: () => Promise<void>) => run(),
    errorMessage: (error: Error) => error.message, handleFailure: vi.fn(),
  } as unknown as ReducerPort;
  const notify = vi.fn();
  const service = createChatService({
    reducers: port, notify, localIdentity: () => local,
    identityFor: (hex) => hex === "bob" ? bob : hex === "alice" ? alice : undefined,
    nameFor: (hex) => hex === "bob" ? "Bob" : "Alice", rememberSender: vi.fn(),
  });
  const addMessage = (id: bigint, sender = bob, replyToMessageId = 0n) => service.tables.upsert({
    id, sender, senderName: sender === bob ? "Bob" : "Alice", senderIsGuest: false,
    message: "hello", replayId: 0n, powerLevel: 1, senderGender: 0, moderated: false,
    replyToMessageId, replyToSenderName: replyToMessageId ? "Bob" : "", replyToMessage: replyToMessageId ? "hello" : "",
    sentAt: { microsSinceUnixEpoch: 1000n },
  });
  return { service, reducers, notify, addMessage, switchAccount: () => { local = "bob"; service.resetSession(); } };
}

describe("server-synced player blocks and reports", () => {
  it("hydrates only our blocks and hides existing, future, and quoted chat", () => {
    const f = fixture();
    f.addMessage(1n); f.addMessage(2n, alice, 1n);
    const revision = f.service.api.chatRevision();
    f.service.tables.upsertBlock({ owner: bob, target: alice, targetName: "Alice" });
    expect(f.service.api.blockedPlayers()).toEqual([]);
    f.service.tables.upsertBlock({ owner: alice, target: bob, targetName: "Bob" });
    f.addMessage(3n);
    expect(f.service.api.chatRevision()).toBeGreaterThan(revision);
    expect(f.service.api.chatMessages()).toMatchObject([{ id: 2n, replyToMessage: "", replyToSenderName: "" }]);
    expect(f.service.api.blockedPlayers()).toEqual([{ identity: "bob", name: "Bob" }]);
    f.service.tables.removeBlock({ owner: alice, target: bob });
    expect(f.service.api.chatMessages()).toHaveLength(3);
  });
  it("updates filtering after a confirmed block and reverses it on unblock", async () => {
    const f = fixture(); f.addMessage(1n);
    expect(await f.service.api.setPlayerBlocked("bob", true)).toEqual({ ok: true });
    expect(f.reducers.setPlayerBlocked).toHaveBeenCalledWith({ target: bob, blocked: true });
    expect(f.service.api.chatMessages()).toEqual([]);
    await f.service.api.setPlayerBlocked("bob", false);
    expect(f.service.api.chatMessages()).toHaveLength(1);
  });
  it("replaces an existing message when its guest sender migrates to a blocked account", () => {
    const f = fixture();
    f.service.tables.upsertBlock({ owner: alice, target: bob, targetName: "Bob" });
    f.addMessage(1n, identity("guest"));
    expect(f.service.api.chatMessages()).toHaveLength(1);
    f.addMessage(1n, bob);
    expect(f.service.api.chatMessages()).toHaveLength(0);
    f.service.tables.removeBlock({ owner: alice, target: bob });
    expect(f.service.api.chatMessages()).toHaveLength(1);
  });
  it("does not pretend a failed block was saved", async () => {
    const f = fixture();
    f.reducers.setPlayerBlocked.mockRejectedValueOnce(new Error("offline"));
    expect(await f.service.api.setPlayerBlocked("bob", true)).toEqual({ ok: false, error: "offline" });
    expect(f.service.api.isPlayerBlocked("bob")).toBe(false);
  });
  it("clears blocks and ignores a late response after switching characters", async () => {
    const f = fixture();
    let resolve!: () => void;
    f.reducers.setPlayerBlocked.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const pending = f.service.api.setPlayerBlocked("bob", true);
    f.switchAccount(); resolve(); await pending;
    expect(f.service.api.blockedPlayers()).toEqual([]);
  });
  it("submits a private player report and rejects invalid/self reports", async () => {
    const f = fixture();
    expect(await f.service.api.reportPlayer("bob", "harassment", "  detail  ")).toEqual({ ok: true });
    expect(f.reducers.reportPlayer).toHaveBeenCalledWith({ target: bob, reason: "harassment", note: "detail" });
    expect((await f.service.api.reportPlayer("alice", "other", "")).ok).toBe(false);
    expect((await f.service.api.reportPlayer("bob", "other", "x".repeat(501))).ok).toBe(false);
    expect(f.reducers.reportPlayer).toHaveBeenCalledTimes(1);
  });
  it("retains a server-supplied identity so players can be unblocked without loading their profile", async () => {
    const f = fixture();
    f.service.tables.upsertBlock({ owner: alice, target: identity("offline"), targetName: "Offline" });
    expect(await f.service.api.setPlayerBlocked("offline", false)).toEqual({ ok: true });
    expect(f.service.api.blockedPlayers()).toEqual([]);
  });
});
