import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { recordModerationAction, readModerationHistory } from "./moderation-history";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("records automatic filtering with original evidence, rule, target, and actual message ID", () => {
  const f = crystalFixture();
  f.run(server.sendChatMessage, { message: "send nudes" });
  const message = [...f.db.chatMessage.iter()][0];
  const action = [...f.db.moderationAction.iter()][0];
  expect(action).toMatchObject({ targetIdentity: f.ctx.sender.toHexString(), targetName: "Test Player",
    action: "Message filtered", reason: "Explicit sexual content", channel: "world",
    actorType: "automatic", actorIdentity: "", rule: "content-filter-v5",
    before: "send nudes", after: "Message moderated.", messageId: message.id.toString(), reportId: "" });
  expect(action.recordedAt.microsSinceUnixEpoch).toBe(f.ctx.timestamp.microsSinceUnixEpoch);
  f.db.chatMessage.id.delete(message.id);
  expect(f.db.moderationAction.count()).toBe(1n);
});

it("does not record ordinary messages or rejected sends", () => {
  const f = crystalFixture();
  f.run(server.sendChatMessage, { message: "Hello" });
  expect(() => f.run(server.sendChatMessage, { message: "send nudes" })).toThrow();
  expect(f.db.moderationAction.count()).toBe(0n);
});

it("rolls the action and its history back together if evidence cannot be stored", () => {
  const f = crystalFixture();
  vi.spyOn(f.db.moderationAction, "insert").mockImplementation(() => { throw new Error("storage failed"); });
  expect(() => f.run(server.sendChatMessage, { message: "send nudes" })).toThrow("storage failed");
  expect(f.db.chatMessage.count()).toBe(0n);
  expect(f.db.chatCooldown.count()).toBe(0n);
});

it("keeps evidence private and pages in stable batches of 50 without scanning history", () => {
  const f = crystalFixture();
  for (let i = 0; i < 103; i++) recordModerationAction(f.ctx as any, {
    targetIdentity: f.ctx.sender.toHexString(), targetName: "Player", channel: "world", action: "Message filtered",
    reason: "Test", actorType: "automatic", rule: "test", before: `${i}`, after: "Message moderated.",
  });
  const scan = vi.spyOn(f.db.moderationAction, "iter");
  const first = readModerationHistory(f.ctx as any, 0n);
  expect(first.entries).toHaveLength(50);
  expect(first.entries[0].id).toBe("103");
  const second = readModerationHistory(f.ctx as any, BigInt(first.beforeId));
  const third = readModerationHistory(f.ctx as any, BigInt(second.beforeId));
  expect(second.entries).toHaveLength(50);
  expect(third.entries).toHaveLength(3);
  expect(third.hasMore).toBe(false);
  expect(new Set([...first.entries, ...second.entries, ...third.entries].map(row => row.id)).size).toBe(103);
  expect(scan).not.toHaveBeenCalled();
  const proc = () => server.getModerationHistory({ withTx: (callback: any) => callback(f.ctx) } as any, { beforeId: 0n });
  expect(proc).toThrow();
  const developer = identity("1");
  // Correct authentication alone never grants an ordinary account access.
  f.ctx.sender = developer;
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  expect(proc).toThrow();
  f.ctx.sender = new (f.ctx.sender.constructor as any)("c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13");
  // The procedure additionally requires a supported session for the developer.
  f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: f.ctx.sender });
  expect(JSON.parse(proc()).entries).toHaveLength(50);
  f.ctx.senderAuth = {};
  expect(proc).toThrow();
  expect(readFileSync(new URL("./moderation-history.ts", import.meta.url), "utf8")).toContain('name: "moderation_action", public: false');
});
