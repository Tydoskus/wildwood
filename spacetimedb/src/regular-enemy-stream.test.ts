import { STARTER_BOW } from "../../shared/items";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity } from "../../tests/helpers/crystal-hollows-fixture";
import { reportKills } from "../../tests/helpers/enemy-defeat";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { LEGACY_LOOT_CURSOR_RETIRED_AT_MICROS, REGULAR_ENEMY_STREAM_IDLE_MICROS, pruneIdleStreams } from "./regular-enemy-loot";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const DAY = 86_400_000_000n;
const enemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition("water_reach", kind)?.reward.type === "damage")!;
const batch = { streamId: "test-stream-123456", sequence: 1n, mapId: "water_reach", enemies: [{ enemy, count: 1 }] };
function fixture(now = LEGACY_LOOT_CURSOR_RETIRED_AT_MICROS - DAY) {
  const f = crystalFixture();
  f.ctx.timestamp = new Timestamp(now);
  f.patch("player", { mapId: batch.mapId });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  return f;
}
const streamKey = (f: ReturnType<typeof fixture>) => `${f.ctx.sender.toHexString()}:${batch.streamId}`;

it("moves a stream from the old cursor table on its next report, and still refuses a replay", () => {
  const f = fixture();
  f.seed("regularEnemyLootCursor", { key: streamKey(f), identity: f.ctx.sender, sequence: 4n });
  reportKills(f, { ...batch, sequence: 5n });
  expect(f.db.regularEnemyLootCursor.key.find(streamKey(f))).toBeFalsy();
  expect(f.db.regularEnemyStream.key.find(streamKey(f))).toMatchObject({ sequence: 5n, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
  const before = f.db.playerProgress.identity.find(f.ctx.sender).damage;
  reportKills(f, { ...batch, sequence: 5n });
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(before);
});

it("drops streams idle a month and keeps recent ones", () => {
  const f = fixture();
  const now = f.ctx.timestamp.microsSinceUnixEpoch;
  f.seed("regularEnemyStream", { key: "old", identity: identity("1"), sequence: 1n, updatedAtMicros: now - REGULAR_ENEMY_STREAM_IDLE_MICROS - 1n });
  f.seed("regularEnemyStream", { key: "recent", identity: identity("1"), sequence: 1n, updatedAtMicros: now - DAY });
  f.seed("regularEnemyLootCursor", { key: "legacy", identity: identity("1"), sequence: 1n });
  expect(pruneIdleStreams(f.ctx as any)).toBe(1);
  expect([...f.db.regularEnemyStream.iter()].map((row: any) => row.key)).toEqual(["recent"]);
  // Before the retirement date an old cursor may still belong to an open tab.
  expect(f.db.regularEnemyLootCursor.key.find("legacy")).toBeTruthy();
});

it("clears the old cursor table once every live tab has had a month to move over", () => {
  const f = fixture(LEGACY_LOOT_CURSOR_RETIRED_AT_MICROS);
  f.seed("regularEnemyLootCursor", { key: "legacy", identity: identity("1"), sequence: 1n });
  expect(pruneIdleStreams(f.ctx as any)).toBe(1);
  expect([...f.db.regularEnemyLootCursor.iter()]).toEqual([]);
});
