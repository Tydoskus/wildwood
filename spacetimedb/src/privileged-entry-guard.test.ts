import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
afterEach(() => vi.restoreAllMocks());

/**
 * Every privileged entry point refuses anyone who is not the developer's
 * signed-in account or the database owner. Any export whose name starts with
 * "dev" is covered automatically, so a new developer tool that forgets its
 * guard fails here; the explicit list covers privileged names without it.
 */
const DEV_VIEWS = new Set(["devAccessAudit", "devBugReports", "devGemPurchaseReview", "devForestRewardPrototype"]);
const PRIVILEGED_WITHOUT_DEV_PREFIX = [
  "setDeveloperNameTag", "setDeveloperPresence", "simulateTimeAway",
  "getBalanceEditor", "previewMapBalance", "setMapBalance", "restoreMapBalance",
  "getModerationHistory", "getPlayerModerationHistory", "getDevReviewQueue", "getDevConsole", "getDevPlayerCard", "getModerationLog",
  "getAnalyticsDashboard", "getDeveloperTravelTarget",
  "configurePatreon", "configureGemCommerce", "setReleaseWindow", "refreshDuelWireAccess", "seedTemporaryGuild",
  "beginForestRewardPrototype", "attackForestRewardPrototype",
];
const REFUSED = /Developer access required|Database owner required|Account database owner required|Developer travel access required|Database operator required|WildStat updated\. Refresh to continue\./;

const exported = server as unknown as Record<string, unknown>;
const devEntries = Object.keys(exported).filter(name => /^dev[A-Z]/.test(name) && typeof exported[name] === "function");
const guarded = [...devEntries.filter(name => !DEV_VIEWS.has(name)), ...PRIVILEGED_WITHOUT_DEV_PREFIX];

function argsFor(target: Identity) {
  return {
    identity: target, target, sourceIdentity: identity("3"), targetIdentity: target, owner: target, verifier: target,
    identityHex: target.toHexString(), expectedDisplayName: "Target", displayName: "Target", reason: "test reason", note: "",
    confirmation: "ERASE", delta: 5n, id: 1n, key: "k", decision: "dismissed", reportKey: "chat:1", minutes: 60, untilMicros: 0n,
    enabled: true, visible: true, label: "label", seconds: 60, query: "Target", mapId: "tutorial_forest", number: 5,
    fromDayKey: "0", toDayKey: "1", beforeId: 0n, ticket: "ticket", maxCount: 1, expectedRevision: 0, revision: 1,
    settingsJson: "{}", operationId: "op", baselineJson: "{}", itemId: "wooden_sword", slot: "rightHand", level: 1,
    title: "t", body: "b", encounter: 1n, firstAttack: 1n, count: 1, version: "1", phase: "notice", startsAt: 0, reload: false,
    clientId: "c", clientSecret: "s", campaignId: "1", silverTierId: "1", goldTierId: "2", diamondTierId: "", redirectUri: "u",
    text: "", category: "", fromMs: 0, toMs: 0, message: "warning", mailReporter: true,
    maxHp: 1, damage: 1, attackRate: 1, projectileSpeed: 1, projectileCount: 1, attackRange: 1, armor: 1, regen: 1, speed: 1,
  };
}

function setup(sender: "player" | "unauthenticatedDeveloper") {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const f = crystalFixture();
  const target = identity("2");
  f.seed("playerProfile", { identity: target, displayName: "Target" });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  if (sender === "unauthenticatedDeveloper") {
    const old = f.ctx.sender, developer = new Identity(DEVELOPER_IDENTITY);
    for (const table of ["player", "playerProgress", "playerProfile", "playerController"]) {
      f.seed(table, { ...f.db[table].identity.find(old), identity: developer });
    }
    f.db.playerSession.connectionId.update({ ...f.db.playerSession.connectionId.find(f.ctx.connectionId), identity: developer });
    f.ctx.sender = developer;
    f.ctx.senderAuth = {};
  }
  const ctx = { ...f.ctx, withTx: (callback: (tx: unknown) => unknown) => f.transaction(() => callback(f.ctx)) };
  const call = (name: string) => f.transaction(() => (exported[name] as (ctx: unknown, args: unknown) => unknown)(ctx, argsFor(target)));
  return { f, target, call };
}

describe("privileged entry points", () => {
  it("finds the developer tools it is guarding, including the triage and moderation ones", () => {
    expect(devEntries).toEqual(expect.arrayContaining([
      "devReviewReport", "devReviewBug", "devFindPlayers", "devLiftPlayerSuspension", "devSetChatMute",
      "devSuspendPlayerAccount", "devDeleteBugReport", "devAdjustGems", "devEraseAccount", "devWarnPlayer", "devResetDisplayName",
    ]));
    for (const name of PRIVILEGED_WITHOUT_DEV_PREFIX) expect(typeof exported[name], name).toBe("function");
  });

  it.each(guarded)("%s refuses a signed-in player who is not the developer", name => {
    const { f, call } = setup("player");
    const before = f.db.moderationAction.count();
    expect(() => call(name)).toThrow(REFUSED);
    expect(f.db.moderationAction.count()).toBe(before);
  });

  it.each(guarded)("%s refuses the developer identity without its signed-in account", name => {
    const { call } = setup("unauthenticatedDeveloper");
    expect(() => call(name)).toThrow(REFUSED);
  });

  it("keeps the moderation, report, triage and mail tables private", () => {
    const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    for (const [file, name] of [
      ["./dev-review.ts", "dev_report_review"], ["./dev-review-mail.ts", "player_mail"], ["./chat-mute.ts", "player_chat_mute"],
      ["./moderation-history.ts", "moderation_action"], ["./social-tables.ts", "social_report"], ["./social-tables.ts", "social_message"],
      ["./index.ts", "player_report"], ["./defeat-session.ts", "defeat_session_restriction"],
    ]) expect(source(file), name).toContain(`name: "${name}", public: false`);
  });

  it.each([...DEV_VIEWS])("%s shows a non-developer nothing", name => {
    const { f } = setup("player");
    const rows = (exported[name] as (ctx: unknown) => unknown)({ db: f.db, sender: f.ctx.sender });
    expect(rows === undefined || (Array.isArray(rows) && rows.length === 0)).toBe(true);
  });
});
