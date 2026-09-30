import { describe, expect, it, vi } from "vitest";
import { Identity, Timestamp } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const played = identity("a"), fresh = identity("b");

function fixture(options: { freshVerified?: boolean; freshEmail?: string } = {}) {
  const f = crystalFixture();
  const login = (who: Identity, email: string, verified = true) => f.seed("accountEmail",
    { identity: who, email, emailVerified: verified, loginId: `user_${who.toHexString().slice(0, 4)}`, named: false, seenAt: new Timestamp(1n) });
  f.seed("playerProfile", { identity: played, displayName: "Vis" });
  f.seed("playerProfile", { identity: fresh, displayName: "Brave Moth 509" });
  f.seed("analyticsPlayer", { identity: played, firstSeenDayKey: "20716", firstKillDayKey: "20716", firstBossDayKey: "20716", firstPrestigeDayKey: "" });
  login(played, "same@example.com");
  login(fresh, options.freshEmail ?? "same@example.com", options.freshVerified ?? true);
  const ask = (who: Identity) => {
    f.ctx.sender = who;
    const procedure = { ...f.ctx, withTx: (callback: (ctx: unknown) => unknown) => f.transaction(() => callback(f.ctx)) };
    return server.getOtherCharacterForLogin(procedure as any, {}) as string;
  };
  return { ...f, ask };
}

describe("a login that opened a new character on an email that already has one", () => {
  it("names the played character to the new login, and nothing to the played one", () => {
    const f = fixture();
    expect(f.ask(fresh)).toBe("Vis");
    expect(f.ask(played)).toBe("");
  });

  it("says nothing once the new character has played, or for an unverified or different address", () => {
    const f = fixture();
    f.seed("analyticsPlayer", { identity: fresh, firstSeenDayKey: "20725", firstKillDayKey: "20725", firstBossDayKey: "", firstPrestigeDayKey: "" });
    expect(f.ask(fresh)).toBe("");
    expect(fixture({ freshVerified: false }).ask(fresh)).toBe("");
    expect(fixture({ freshEmail: "other@example.com" }).ask(fresh)).toBe("");
  });
});
