import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";

vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function finishedDuel() {
  const f = crystalFixture();
  const opponent = identity("2");
  f.progress(opponent);
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0];
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n);
  f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  f.ctx.timestamp = new Timestamp(finishing.endsAtMicros);
  f.run(server.pulseDuel);
  return { f, replayId: duel.id };
}

it("does not announce a duel until the challenger chooses to share it", () => {
  const { f, replayId } = finishedDuel();
  expect([...f.db.chatMessage.iter()]).toHaveLength(0);

  f.run(server.shareDuelReplay, { id: replayId });
  expect([...f.db.chatMessage.iter()]).toMatchObject([
    { replayId, message: "Test Player and Opponent drew a duel." },
  ]);

  f.run(server.shareDuelReplay, { id: replayId });
  expect([...f.db.chatMessage.iter()]).toHaveLength(1);
});
