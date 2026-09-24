import { SenderError, table, t } from "spacetimedb/server";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { DEFEAT_COOLDOWN, DEFEAT_GUEST_BLOCK_SECONDS, DEFEAT_REAUTH, freshAuthentication } from "../../shared/defeat-session";
import { isDeveloperIdentity } from "../../shared/developer-identity";
import { recordModerationAction } from "./moderation-history";
import type { GameReducerContext } from "./index";


/** 2100-01-01: far enough that a "permanent" suspension outlives the game. */
export const PERMANENT_SUSPENSION_MICROS = 4_102_444_800_000_000n;
export const defeatSessionRestriction = table({ name: "defeat_session_restriction", public: false }, {
  identity: t.identity().primaryKey(), revokedAtMicros: t.u64(), blockedUntilMicros: t.u64(), requireSignIn: t.bool(),
});

export function defeatRestrictionError(ctx: Pick<GameReducerContext, "db" | "sender" | "senderAuth" | "timestamp">) {
  const row = ctx.db.defeatSessionRestriction.identity.find(ctx.sender);
  if (!row) return null;
  if (row.requireSignIn) {
    const jwt = ctx.senderAuth?.jwt;
    const authenticated = jwt?.issuer === SPACETIME_AUTH_ISSUER && jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID);
    if (!authenticated || !freshAuthentication(jwt?.fullPayload?.auth_time, row.revokedAtMicros))
      return `${DEFEAT_REAUTH}: Kill report exceeded the server allowance. Sign in again.`;
  }
  if (ctx.timestamp.microsSinceUnixEpoch < row.blockedUntilMicros)
    return `${DEFEAT_COOLDOWN}:${row.blockedUntilMicros / 1000n}: Account access temporarily restricted.`;
  return null;
}

/** Owner-authorized fixed deadline: retrying the same action cannot extend it. */
export function suspendPlayerAccount(ctx: GameReducerContext, args: {
  identity: GameReducerContext['sender']; expectedDisplayName: string; untilMicros: bigint; reason: string;
}) {
  const profile = ctx.db.playerProfile.identity.find(args.identity);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (!profile || profile.displayName !== args.expectedDisplayName) throw new SenderError("Suspension target changed or was not found.");
  // Zero means permanent: the seven-day rail guards against a typo in a date,
  // and a deliberate zero is not a typo. It still needs a reason and is logged.
  const permanent = args.untilMicros === 0n;
  const untilMicros = permanent ? PERMANENT_SUSPENSION_MICROS : args.untilMicros;
  if ((!permanent && (untilMicros <= now || untilMicros > now + 7n * 86_400_000_000n)) || !args.reason.trim() || args.reason.length > 500)
    throw new SenderError("Choose a suspension of at most seven days, or zero for permanent, and a reason.");
  const prior = ctx.db.defeatSessionRestriction.identity.find(args.identity);
  if (prior && prior.blockedUntilMicros >= untilMicros) return;
  const next = { identity: args.identity, revokedAtMicros: now, requireSignIn: false, blockedUntilMicros: untilMicros };
  if (prior) ctx.db.defeatSessionRestriction.identity.update(next); else ctx.db.defeatSessionRestriction.insert(next);
  for (const session of ctx.db.playerSession.byIdentity.filter(args.identity))
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: false, protocolVersion: 0 });
  if (ctx.db.playerController.identity.find(args.identity)) ctx.db.playerController.identity.delete(args.identity);
  const json = (value: unknown) => JSON.stringify(value, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  recordModerationAction(ctx, { targetIdentity: args.identity.toHexString(), targetName: profile.displayName,
    channel: "account", action: permanent ? "Account permanently suspended" : "Account suspended", reason: args.reason,
    actorType: isDeveloperIdentity(ctx.sender.toHexString()) ? "developer" : "owner", rule: "owner-account-suspension",
    before: json(prior), after: json(next) });
}

export function requireAllowedDefeatSession(ctx: GameReducerContext) {
  const error = defeatRestrictionError(ctx);
  if (error) throw new SenderError(error);
}

/** Commit this with the receipt, never throw afterward (that would undo it). */
export function restrictDefeatSession(ctx: GameReducerContext, evidence: {
  mapId: string; streamId: string; sequence: string;
  violations: { enemy: string; requested: number; accepted: number }[];
}) {
  const jwt = ctx.senderAuth?.jwt;
  const requireSignIn = Boolean(jwt?.issuer === SPACETIME_AUTH_ISSUER && jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const row = { identity: ctx.sender, revokedAtMicros: now, requireSignIn,
    blockedUntilMicros: requireSignIn ? 0n : now + BigInt(DEFEAT_GUEST_BLOCK_SECONDS) * 1_000_000n };
  if (ctx.db.defeatSessionRestriction.identity.find(ctx.sender)) ctx.db.defeatSessionRestriction.identity.update(row);
  else ctx.db.defeatSessionRestriction.insert(row);
  const identity = ctx.sender.toHexString();
  const displayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "";
  const action = requireSignIn ? "session_revoked" : "guest_connection_blocked";
  const moderationId = recordModerationAction(ctx, {
    targetIdentity: identity, targetName: displayName,
    channel: "game", action,
    reason: "Enemy defeat claim exceeded server allowance", actorType: "automatic", rule: "enemy_defeat_allowance",
    before: JSON.stringify(evidence), after: JSON.stringify({ requireSignIn, blockedUntilMs: Number(row.blockedUntilMicros / 1000n) }),
  });
  // Invalidate every controlling session, including inactive tabs, immediately.
  for (const session of ctx.db.playerSession.byIdentity.filter(ctx.sender))
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: false, protocolVersion: 0 });
  if (ctx.db.playerController.identity.find(ctx.sender)) ctx.db.playerController.identity.delete(ctx.sender);
  // The caller logs only after all reward/session cleanup has succeeded.
  // Link the readable diagnostic to the durable, transaction-backed evidence.
  return { event: "enemy_defeat_session_restricted", action, identity, displayName,
    connectionId: ctx.connectionId?.toHexString() ?? null, moderationId: moderationId.toString(),
    atMicros: now.toString(), requireSignIn, blockedUntilMs: Number(row.blockedUntilMicros / 1000n), ...evidence };
}

/** Apply the same short guest block/session revocation to an impossible
 * movement-speed packet. This is deliberately separate from defeat evidence
 * so moderation history keeps the security signal and reason accurate. */
export function restrictMovementSession(ctx: GameReducerContext, evidence: {
  mapId: string; requestedSpeed: number; serverSpeed: number; allowedSpeed: number;
}) {
  const jwt = ctx.senderAuth?.jwt;
  const requireSignIn = Boolean(jwt?.issuer === SPACETIME_AUTH_ISSUER && jwt.audience.includes(SPACETIME_AUTH_CLIENT_ID));
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const row = { identity: ctx.sender, revokedAtMicros: now, requireSignIn,
    blockedUntilMicros: requireSignIn ? 0n : now + BigInt(DEFEAT_GUEST_BLOCK_SECONDS) * 1_000_000n };
  if (ctx.db.defeatSessionRestriction.identity.find(ctx.sender)) ctx.db.defeatSessionRestriction.identity.update(row);
  else ctx.db.defeatSessionRestriction.insert(row);
  const identity = ctx.sender.toHexString();
  const displayName = ctx.db.playerProfile.identity.find(ctx.sender)?.displayName ?? "";
  const moderationId = recordModerationAction(ctx, {
    targetIdentity: identity, targetName: displayName,
    channel: "game", action: requireSignIn ? "session_revoked" : "guest_connection_blocked",
    reason: "Movement speed exceeded the server allowance", actorType: "automatic", rule: "movement_speed_allowance",
    before: JSON.stringify(evidence), after: JSON.stringify({ requireSignIn, blockedUntilMs: Number(row.blockedUntilMicros / 1000n) }),
  });
  for (const session of ctx.db.playerSession.byIdentity.filter(ctx.sender))
    ctx.db.playerSession.connectionId.update({ ...session, enteredWorld: false, protocolVersion: 0 });
  if (ctx.db.playerController.identity.find(ctx.sender)) ctx.db.playerController.identity.delete(ctx.sender);
  console.warn("Movement speed session restricted", JSON.stringify({
    event: "movement_speed_session_restricted", identity, displayName,
    connectionId: ctx.connectionId?.toHexString() ?? null, moderationId: moderationId.toString(),
    atMicros: now.toString(), requireSignIn, blockedUntilMs: Number(row.blockedUntilMicros / 1000n), ...evidence,
  }));
}
