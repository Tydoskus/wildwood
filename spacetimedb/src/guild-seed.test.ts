import { expect, it, vi } from "vitest";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const owner = new Identity("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
function fixture(count = 24) {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 27 });
  for (let i = 1; i <= count; i++) {
    const identity = new Identity(i.toString(16).padStart(64, "0"));
    f.progress(identity, { damage: i });
    f.seed("playerProfile", { identity, displayName: `Low ${i}` });
    f.seed("leaderboardEntry", { identity, displayName: `Low ${i}`, powerLevel: i, isGuest: true });
  }
  return f;
}
it("only lets the operator populate temp, selects twenty lowest unassigned players, and is idempotent", () => {
  const f = fixture();
  expect(() => f.run(server.seedTemporaryGuild)).toThrow("operator");
  f.run(server.createGuild, { name: "Keep" });
  const first = new Identity("1".padStart(64, "0"));
  // The lowest-power entry belongs elsewhere and must not be moved.
  f.seed("guildMember", { identity: first, guildId: 1n, name: "Low 1", joinedAt: 0n, eligibleAt: 0n });
  f.ctx.sender = owner;
  f.run(server.seedTemporaryGuild);
  const guild = f.db.guild.nameKey.find("temp");
  expect(guild.members).toBe(20);
  const roster = [...f.db.guildMember.guildId.filter(guild.id)];
  expect(roster.map(member => member.name)).toEqual(Array.from({ length: 20 }, (_, i) => `Low ${i + 2}`));
  expect(f.db.guildMember.identity.find(first).guildId).toBe(1n);
  f.run(server.seedTemporaryGuild);
  expect([...f.db.guildMember.guildId.filter(guild.id)]).toHaveLength(20);
  expect(roster.every(member => f.db.playerNameTag.identity.find(member.identity).guildTag === "temp")).toBe(true);
});
it("does not partially create temp when twenty eligible players are unavailable", () => {
  const f = fixture(19); f.ctx.sender = owner;
  expect(() => f.run(server.seedTemporaryGuild)).toThrow("twenty");
  expect(f.db.guild.count()).toBe(0n);
  expect(f.db.guildMember.count()).toBe(0n);
});
