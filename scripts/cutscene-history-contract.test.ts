import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../spacetimedb/src/index.ts", import.meta.url), "utf8");
const subscriptions = readFileSync(new URL("../src/coop/services/base-subscription.ts", import.meta.url), "utf8");
function section(start: string, end: string) {
  const from = server.indexOf(start);
  const to = server.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return server.slice(from, to);
}

describe("server-owned cutscene history wiring", () => {
  it("keeps rows private and exposes only the caller's history", () => {
    expect(section("const playerCutsceneHistory =", "const playerProgress =")).toContain('public: false');
    const view = section("export const myCutsceneHistory =", "function ensureCutsceneHistory");
    expect(view).toContain("identity.find(ctx.sender)");
    expect(view).not.toContain(".iter()");
    const reducer = section("export const markPortalCutsceneSeen =", "function generatedDisplayName");
    expect(reducer).toContain("requireControllingPlayer(ctx)");
    expect(reducer).toContain("if (!bit) throw new SenderError");
    expect(reducer).toContain("unlockedPortalCutsceneMask(progress) & bit");
    expect(reducer).toContain("history.generation !== generation");
    expect(reducer).toContain("history.seenMask | bit");
  });

  it("migrates old unlocks only when the history row is first created", () => {
    const ensure = section("function ensureCutsceneHistory", "export const markPortalCutsceneSeen");
    expect(ensure.indexOf("if (existing) return existing")).toBeLessThan(ensure.indexOf("unlockedPortalCutsceneMask"));
    const enter = section("function enterWorldPresence", "export const");
    expect(enter).toContain("ensureCutsceneHistory(ctx, ctx.sender)");
    expect(enter.indexOf("ensureCutsceneHistory")).toBeGreaterThan(enter.indexOf("defaultPlayerProgress"));
  });

  it("transfers guest history, removes orphan rows, and resets only with character progress", () => {
    const claim = section("export const claimGuestAccount =", "export const");
    expect(claim).toContain("accountCutscenes.seenMask | guestCutscenes.seenMask");
    expect(claim).toContain("playerCutsceneHistory.identity.delete(link.guest)");
    const reset = section("export const resetPlayerProgress =", "function sendPlayerChatMessage");
    expect(reset).toContain("seenMask: 0");
    expect(reset).toContain("generation: history.generation + 1");
    expect(server.match(/playerCutsceneHistory.identity.delete\(identity\)/g)).toHaveLength(2);
  });

  it("hydrates cutscene history before replaying existing boss results", () => {
    expect(subscriptions).toContain("tables.myCutsceneHistory");
    expect(subscriptions).toContain("myCutsceneHistory.onUpdate");
    const seed = subscriptions.indexOf("for (const row of connection.db.myCutsceneHistory.iter())");
    const boss = subscriptions.indexOf("for (const row of connection.db.dragonResult.iter())");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(boss).toBeGreaterThan(seed);
  });
});
