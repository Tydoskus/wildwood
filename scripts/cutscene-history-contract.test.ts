import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("../spacetimedb/src/index.ts", import.meta.url), "utf8");
// Guest claiming and identity removal bodies live beside the reducer module.
const lifecycle = readFileSync(new URL("../spacetimedb/src/account-lifecycle.ts", import.meta.url), "utf8");
function section(start: string, end: string, source = server) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
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
    expect(section("export const claimGuestAccount =", "export const")).toContain("claimGuestAccountFor(ctx, code)");
    const claim = section("function claimGuestAccountFor", "function removeIdentityPresence", lifecycle);
    expect(claim).toContain("accountCutscenes.seenMask | guestCutscenes.seenMask");
    expect(claim).toContain("playerCutsceneHistory.identity.delete(link.guest)");
    const reset = section("export const resetPlayerProgress =", "function sendPlayerChatMessage");
    expect(reset).toContain("seenMask: 0");
    expect(reset).toContain("generation: history.generation + 1");
    expect(server.match(/playerCutsceneHistory.identity.delete\(identity\)/g)).toBeNull();
    expect(lifecycle.match(/playerCutsceneHistory.identity.delete\(identity\)/g)).toHaveLength(2);
  });
});
