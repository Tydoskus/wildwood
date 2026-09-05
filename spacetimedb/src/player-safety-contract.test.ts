import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

describe("player safety server wiring", () => {
  it("keeps raw blocks and reports private and exposes only caller-owned blocks", () => {
    expect(section("const playerBlock = table(", "const playerReport")).toContain("public: false");
    expect(section("const playerReport = table(", "const chatMessageReportRateLimit")).toContain("public: false");
    expect(section("export const myPlayerBlocks", "function playersBlocked")).toContain("ctx.db.playerBlock.byOwner.filter(ctx.sender)");
  });
  it("authorizes both writes against the controlling sender and derives names on the server", () => {
    const block = section("export const setPlayerBlocked", "function consumeReportRate");
    const report = section("export const reportPlayer", "function transferPlayerBlocks");
    expect(block).toContain("requireControllingPlayer(ctx)");
    expect(block).toContain("owner: ctx.sender");
    expect(report).toContain("requireControllingPlayer(ctx)");
    expect(report).toContain("playerReportValidationError(ctx.sender.toHexString()");
    expect(report).toContain("reporter: ctx.sender");
    expect(report).toContain("targetName: profile.displayName");
    expect(report).toContain('report.status === "pending"');
    expect(report).toContain("consumeReportRate(ctx)");
    expect(section("export const reportChatMessage", "export const requestDuel")).toContain("consumeReportRate(ctx)");
  });
  it("checks blocks in both directions before any duel is inserted", () => {
    const check = section("function playersBlocked", "export const setPlayerBlocked");
    expect(check).toContain("playerBlockKey(owner.toHexString(), target.toHexString())");
    expect(check).toContain("playerBlockKey(target.toHexString(), owner.toHexString())");
    const duel = section("export const requestDuel", "export const acceptDuel");
    expect(duel.indexOf("playersBlocked(ctx, ctx.sender, opponent)")).toBeLessThan(duel.indexOf('insertSnapshotRow(ctx, "duel"'));
  });
  it("wires guest block transfer and full-account removal", () => {
    const transfer = section("function transferPlayerBlocks", "function removePlayerSafetyData");
    expect(transfer).toContain("byOwner.filter(guest)");
    expect(transfer).toContain("byTarget.filter(guest)");
    expect(transfer).toContain("sender: account");
    expect(source).toContain("transferPlayerBlocks(ctx, link.guest, ctx.sender)");
    expect(section("function removePlayerIdentityData", "function clearVirtualPlayersForOwner")).toContain("removePlayerSafetyData(ctx, identity)");
  });
});
