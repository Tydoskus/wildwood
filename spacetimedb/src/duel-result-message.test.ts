import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { pruneExpiredSocialMessages } from "./social-service";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const DAY = 86_400_000_000n;
function fight(blockedPair = false) {
  const f = crystalFixture(), opponent = identity("b");
  f.patch("playerProgress", { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.progress(opponent, { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0];
  if (blockedPair) f.seed("playerBlock", { key: `${opponent.toHexString()}:${f.ctx.sender.toHexString()}`, owner: opponent, target: f.ctx.sender, targetName: "Me" });
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n); f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  f.ctx.timestamp = new Timestamp(finishing.endsAtMicros); f.run(server.pulseDuel);
  return { f, opponent, duel };
}

it("sends the opponent the duel's result and replay privately, and erases it after a day", () => {
  const { f, opponent, duel } = fight();
  const messages = [...f.db.socialMessage.recipient.filter(opponent)];
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ channel: "dm" });
  expect(f.db.socialDuelMessage.messageId.find(messages[0].id)).toMatchObject({ replayId: duel.id });
  expect(messages[0].sender.equals(f.ctx.sender)).toBe(true);
  expect(messages[0].message).toMatch(/^Duel: .+ (defeated .+|and .+ drew)\. Watch the replay\.$/);
  // Still there at 23 hours; gone after a day, like the replay.
  pruneExpiredSocialMessages(f.ctx as any, f.ctx.timestamp.microsSinceUnixEpoch + 23n * 3_600_000_000n);
  expect([...f.db.socialMessage.recipient.filter(opponent)]).toHaveLength(1);
  pruneExpiredSocialMessages(f.ctx as any, f.ctx.timestamp.microsSinceUnixEpoch + DAY + 1n);
  expect([...f.db.socialMessage.recipient.filter(opponent)]).toHaveLength(0);
  expect([...f.db.socialDuelMessage.recipient.filter(opponent)]).toHaveLength(0);
});

it("sends nothing between players who have blocked each other", () => {
  const { f, opponent } = fight(true);
  expect([...f.db.socialMessage.recipient.filter(opponent)]).toHaveLength(0);
});
