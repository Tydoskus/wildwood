import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import * as server from "../../spacetimedb/src/index";
import { ATTACK_BALANCE_VERSION, PROTOCOL_VERSION } from "../../shared/rules";
import { createMemoryDatabase } from "./spacetime-memory-db";

export { server };
export const identity = (digit: string) => new Identity(digit.repeat(64));

// All state is isolated in memory. vi.mock in the importing test replaces only
// host registration, so these are the production reducer callbacks.
export function crystalFixture() {
  const storage = createMemoryDatabase(server.default);
  const { db } = storage;
  const ctx = {
    db, sender: identity("1"), connectionId: new ConnectionId(1n) as ConnectionId | null,
    timestamp: new Timestamp(10_000_000n),
    senderAuth: {} as { jwt?: { issuer: string; audience: string[] } },
    random: Object.assign(() => .5, { integerInRange: (min: number, max: number) => Math.floor((min + max) / 2) }),
  };
  const seed = (table: string, row: Record<string, unknown>) => db[table].insert(storage.row(table, row));
  const progress = (who = ctx.sender, overrides: Record<string, unknown> = {}) => seed("playerProgress", {
    identity: who, maxHp: 100, damage: 1_000, attackRate: 1, projectileSpeed: 1_000,
    projectileCount: 2, attackRange: 200, speed: 180, inventoryJson: "[]",
    equippedHead: "", equippedChest: "", equippedFeet: "", equippedRightHand: "", equippedLeftHand: "",
    ...overrides,
  });
  progress();
  seed("player", { identity: ctx.sender, mapId: "crystal_hollows", x: 4050, y: 4050,
    hp: 100, maxHp: 100, speed: 180, protocolVersion: PROTOCOL_VERSION, lastInputAt: ctx.timestamp });
  seed("playerProfile", { identity: ctx.sender, displayName: "Test Player", skinTone: 3 });
  seed("playerSession", { connectionId: ctx.connectionId, identity: ctx.sender,
    enteredWorld: true, protocolVersion: PROTOCOL_VERSION, connectedAt: ctx.timestamp, tabId: "test" });
  seed("playerController", { identity: ctx.sender, connectionId: ctx.connectionId });
  seed("playerBalanceVersion", { identity: ctx.sender, version: ATTACK_BALANCE_VERSION });
  const run = (reducer: (...args: any[]) => unknown, args: Record<string, unknown> = {}) =>
    storage.transaction(() => reducer(ctx, args));
  const patch = (table: string, changes: Record<string, unknown>, who = ctx.sender) => {
    db[table].identity.update({ ...db[table].identity.find(who), ...changes });
  };
  return { ...storage, ctx, seed, progress, run, patch };
}
