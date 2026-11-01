// Session and access guards every reducer runs before it touches state: the
// connection's session row, the protocol and legal-consent gates, the
// controlling-tab check, and developer/database-owner identity. Moved out of
// index.ts unchanged; the reducer declarations that call them stay there.
import type { ModuleReducerCtx } from "./index";
import { Identity } from "spacetimedb";
import { DEVELOPER_IDENTITY as DEVELOPER_IDENTITY_HEX } from "../../shared/developer-identity";
import { requireAllowedDefeatSession, defeatRestrictionError } from "./defeat-session";
import { SenderError } from "spacetimedb/server";
import { COMPATIBLE_PROTOCOL_VERSIONS, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { CHAT_AGE_REQUIRED, TERMS_VERSION, isEligiblePlayerAgeBand, isPlayableAgeBand } from "../../shared/legal";
import { playerWithMotion } from "./presence-runtime";
import { auditPrivilegedAccess } from "./privileged-access-audit";

// Cached clients parse these exact wire messages. Current clients rebrand them
// for display; changing them would break reconnects and account linking in old tabs.
export const LEGACY_CLIENT_ERRORS = {
  protocolUpdate: "Wildwood updated. Refresh to continue.",
  missingPresence: "Enter Wildwood first.",
  existingAccountProgress: "This account already has Wildwood progress.",
} as const;

export const DEVELOPER_IDENTITY = new Identity(DEVELOPER_IDENTITY_HEX);

// Maincloud database owner. CLI maintenance calls run as this identity, while
// in-game developer actions run as DEVELOPER_IDENTITY above.
export const DATABASE_OWNER_IDENTITY_HEX = "c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79";

export function sameConnection(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}

export function sessionForContext(ctx: any) {
  return ctx.connectionId ? ctx.db.playerSession.connectionId.find(ctx.connectionId) : null;
}

export function requireSession(ctx: any) {
  requireAllowedDefeatSession(ctx);
  const session = sessionForContext(ctx);
  if (!session || !sameIdentity(session.identity, ctx.sender)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}

// A blocked connection may continue sending queued packets for a short time
// after its session is invalidated. Hot reducers should quietly drop those
// packets instead of throwing a new error for every retry and flooding logs.
export function blockedSession(ctx: any) {
  return Boolean(defeatRestrictionError(ctx));
}

export function isSupportedProtocol(protocolVersion: number) {
  return COMPATIBLE_PROTOCOL_VERSIONS.includes(protocolVersion);
}

export function requireCurrentLegalConsent(ctx: any) {
  const consent = ctx.db.playerLegalConsent.identity.find(ctx.sender);
  if (consent?.termsVersion !== TERMS_VERSION || !isPlayableAgeBand(consent?.ageBand ?? -1)) {
    throw new SenderError("Review and accept the Wildstat Terms to continue.");
  }
  return consent;
}

/** Chat, guild and private messages need a 13+ age; the Terms alone let a player in, not talk. */
export function requireChatAge(ctx: any) {
  if (!isEligiblePlayerAgeBand(ctx.db.playerLegalConsent.identity.find(ctx.sender)?.ageBand ?? -1)) throw new SenderError(CHAT_AGE_REQUIRED);
}

export function requireSupportedSessionProtocol(ctx: any) {
  const session = requireSession(ctx);
  if (!isSupportedProtocol(session.protocolVersion)) {
    throw new SenderError(LEGACY_CLIENT_ERRORS.protocolUpdate);
  }
  return session;
}

/** The stored player row, as it was last written: x, y and facing are where the last packet left them. */
function currentPlayerRow(ctx: any) {
  requireSupportedSessionProtocol(ctx);
  const current = ctx.db.player.identity.find(ctx.sender);
  if (!current) throw new SenderError(LEGACY_CLIENT_ERRORS.missingPresence);
  return current;
}

export function requireCurrentProtocol(ctx: any) {
  return playerWithMotion(ctx, currentPlayerRow(ctx));
}

/**
 * requireControllingPlayer's checks, errors and order, without moving the row to where the player's motion
 * has carried them since: for a reducer that reads neither the position nor the facing (a kill report).
 */
export function requireControllingPlayerRow(ctx: any) {
  const current = currentPlayerRow(ctx);
  const controller = ctx.db.playerController.identity.find(ctx.sender);
  if (!ctx.connectionId || !controller || !sameConnection(controller.connectionId, ctx.connectionId)) {
    throw new SenderError("Wildstat is active in another tab.");
  }
  return current;
}

export function requireControllingPlayer(ctx: any) {
  return playerWithMotion(ctx, requireControllingPlayerRow(ctx));
}

export function hasSpacetimeAuthAccount(ctx: any) {
  const jwt = ctx.senderAuth?.jwt;
  return Boolean(
    jwt &&
    jwt.issuer === SPACETIME_AUTH_ISSUER &&
    Array.isArray(jwt.audience) &&
    jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID),
  );
}

export function isDeveloperIdentity(identity: any) {
  return identity?.toHexString?.().replace(/^0x/i, "").toLowerCase() === DEVELOPER_IDENTITY_HEX;
}

export function isDatabaseOwnerIdentity(identity: any) {
  return identity?.toHexString?.().replace(/^0x/i, "").toLowerCase() === DATABASE_OWNER_IDENTITY_HEX;
}

export function isVirtualPlayer(ctx: any, identity: any) {
  return Boolean(ctx.db.virtualPlayer.identity.find(identity));
}

export function requireDeveloperSession(ctx: ModuleReducerCtx, action: string) {
  auditPrivilegedAccess(ctx, action, () => {
    requireSupportedSessionProtocol(ctx);
    if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
      throw new SenderError("Developer access required.");
    }
  });
}

export function requireDeveloper(ctx: ModuleReducerCtx, action: string) {
  auditPrivilegedAccess(ctx, action, () => {
    requireControllingPlayer(ctx);
    if (!isDeveloperIdentity(ctx.sender) || !hasSpacetimeAuthAccount(ctx)) {
      throw new SenderError("Developer access required.");
    }
  });
}

export function touchPlayerAccessAudit(ctx: any, protocolVersion: number) {
  if (isVirtualPlayer(ctx, ctx.sender)) return;
  const profile = ctx.db.playerProfile.identity.find(ctx.sender);
  if (!profile) return;
  const current = ctx.db.playerAccessAudit.identity.find(ctx.sender);
  const next = {
    identity: ctx.sender,
    viewer: DEVELOPER_IDENTITY,
    displayName: profile.displayName,
    firstSeenAt: current?.firstSeenAt ?? ctx.timestamp,
    lastSeenAt: ctx.timestamp,
    accountType: hasSpacetimeAuthAccount(ctx) ? "account" : "guest",
    lastProtocolVersion: protocolVersion,
    label: current?.label ?? "",
  };
  if (current) ctx.db.playerAccessAudit.identity.update(next);
  else ctx.db.playerAccessAudit.insert(next);
}

export function backfillKnownAccessAudit(ctx: any) {
  if (!isDeveloperIdentity(ctx.sender)) return;
  for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) {
    if (isVirtualPlayer(ctx, lifetime.identity)) continue;
    if (ctx.db.playerAccessAudit.identity.find(lifetime.identity)) continue;
    const profile = ctx.db.playerProfile.identity.find(lifetime.identity);
    if (!profile) continue;
    const status = ctx.db.playerAccountStatus.identity.find(lifetime.identity);
    const activePlayer = ctx.db.player.identity.find(lifetime.identity);
    ctx.db.playerAccessAudit.insert({
      identity: lifetime.identity,
      viewer: DEVELOPER_IDENTITY,
      displayName: profile.displayName,
      firstSeenAt: lifetime.joinedAt,
      lastSeenAt: lifetime.sessionStartedAt,
      accountType: status ? (status.isGuest ? "guest" : "account") : "unknown",
      lastProtocolVersion: activePlayer?.protocolVersion ?? 0,
      label: "",
    });
  }
}

export function sameIdentity(a: any, b: any) {
  return a?.toHexString?.() === b?.toHexString?.();
}
