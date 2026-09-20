// Snapshot duels: the challenger-only arena fight behind requestDuel, the
// deterministic combat resolution that pulseDuel, resolveScheduledDuel and
// runMaintenance drive, the replay row written when a duel finishes, the
// optional chat announcement, and the expired-request sweep. The duel tables, the schema
// registration and the requestDuel/acceptDuel/pulseDuel/resolveScheduledDuel
// reducer declarations stay in index.ts; this module only owns the bodies they
// call. Membership checks keep going through the duel.byChallenger index (see
// docs/development.md). Helpers that still live in index.ts arrive through
// createDuelRuntime's deps so the moved code reads exactly as it did.
import { ScheduleAt, Timestamp } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { insertSnapshotRow, updateSnapshotRow, deleteSnapshotRow } from "./shard-snapshot-writes";
import {
  playerZone, playerWithMotion, stoppedMotionFields, syncPlayerMotion, syncPlayerMotionIdentity,
  syncPlayerMapMarker, ensureRealtimeFrameSchedules,
} from "./presence-runtime";
import { advanceDuelCombat, duelOutcome, DUEL_COMBAT_VERSION } from "../../shared/duel-combat";
import { duelAnnouncementText } from "../../shared/duel-announcement";

export const DUEL_REQUEST_COOLDOWN_MICROS = 120_000_000n;
export const DUEL_REQUEST_TIMEOUT_MICROS = 30_000_000n;
export const DUEL_COUNTDOWN_MICROS = 3_000_000n;
export const DUEL_DURATION_MICROS = 30_000_000n;
export const DUEL_FINISH_HOLD_MICROS = 600_000n;
export const DUEL_ARENA = {
  challenger: { x: 5880, y: 5940 },
  opponent: { x: 6120, y: 5940 },
};

export function activeDuelFor(ctx: any, identity: any) {
  const isActive = (current: any) =>
    current.status === "requested" ||
    current.status === "countdown" ||
    current.status === "active" ||
    current.status === "finishing";
  for (const current of ctx.db.duel.byChallenger.filter(identity) as Iterable<any>) {
    if (isActive(current)) return current;
  }
  return null;
}

export function clearExpiredDuelRequests(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expiredIds: bigint[] = [];
  for (const current of ctx.db.duel.iter() as Iterable<any>) {
    if (
      current.status === "requested" &&
      now - current.createdAt.microsSinceUnixEpoch >= DUEL_REQUEST_TIMEOUT_MICROS
    ) {
      expiredIds.push(current.id);
    }
  }
  for (const id of expiredIds) deleteSnapshotRow(ctx, "duel", id);
}

export function returnDuelPlayer(ctx: any, identity: any, x: number, y: number) {
  const current = playerWithMotion(ctx, ctx.db.player.identity.find(identity));
  if (!current) return;
  const next = {
    ...current,
    x,
    y,
    ...playerZone(x, y),
    ...stoppedMotionFields(current, true),
    lastInputAt: ctx.timestamp,
  };
  updateSnapshotRow(ctx, "player", next);
  syncPlayerMotion(ctx, next);
  syncPlayerMotionIdentity(ctx, next);
  syncPlayerMapMarker(ctx, next, true);
  ensureRealtimeFrameSchedules(ctx);
}

// Everything the moved bodies still borrow from index.ts. Passing these in keeps
// the module free of runtime imports from ./index.
export type DuelRuntimeDeps = {
  requireControllingPlayer: (ctx: any) => any;
  isSupportedProtocol: (protocolVersion: number) => boolean;
  sameIdentity: (left: any, right: any) => boolean;
  playersBlocked: (ctx: any, owner: any, target: any) => boolean;
  isVirtualPlayer: (ctx: any, identity: any) => boolean;
  insertChatMessage: (ctx: any, sender: any, senderName: string, message: string, replayId?: bigint) => any;
  researchedDamage: (ctx: any, identity: any, damage: number) => number;
  researchedArmor: (ctx: any, identity: any, armor: number) => number;
  researchedRegen: (ctx: any, identity: any, regen: number) => number;
  maxHealthForProgress: (ctx: any, identity: any, progress: any) => number;
  attackIntervalForProgress: (progress: any) => number;
  equippedRightHandForProgress: (progress: any) => string;
  equippedLeftHandForProgress: (progress: any) => string;
  equipmentPresentationForProgress: (progress: any) => any;
};

export function createDuelRuntime(deps: DuelRuntimeDeps) {
  const {
    requireControllingPlayer, isSupportedProtocol, sameIdentity, playersBlocked, isVirtualPlayer,
    insertChatMessage, researchedDamage, researchedArmor, researchedRegen, maxHealthForProgress,
    attackIntervalForProgress, equippedRightHandForProgress, equippedLeftHandForProgress,
    equipmentPresentationForProgress,
  } = deps;

  function duelDamage(ctx: any, identity: any, damage: number) {
    const research = ctx.db.playerResearch.identity.find(identity);
    const baseDamage = researchedDamage(ctx, identity, damage);
    const criticalChance = (research?.criticalChance ?? 0) * .01;
    const criticalMultiplier = 1.05 + (research?.criticalDamage ?? 0) * .05;
    // Duel simulation is deterministic. Fold random criticals into expected
    // damage so the server snapshot still honors both critical technologies.
    return baseDamage * (1 + criticalChance * (criticalMultiplier - 1));
  }

  function finishDuel(ctx: any, current: any) {
    returnDuelPlayer(
      ctx,
      current.challenger,
      current.challengerOriginX,
      current.challengerOriginY,
    );
    const challengerName = current.challengerName || ctx.db.playerProfile.identity.find(current.challenger)?.displayName || "PLAYER";
    const opponentName = current.opponentName || ctx.db.playerProfile.identity.find(current.opponent)?.displayName || "PLAYER";
    const outcome = current.combatVersion >= 1 ? duelOutcome(current, current)
      : current.challengerHp > current.opponentHp ? "CHALLENGER_WIN"
        : current.opponentHp > current.challengerHp ? "OPPONENT_WIN" : "DRAW";
    const challengerWon = outcome === "CHALLENGER_WIN";
    const opponentWon = outcome === "OPPONENT_WIN";
    const winnerName = challengerWon ? challengerName : opponentWon ? opponentName : "DRAW";
    const durationSeconds = Math.max(0, Number(current.lastResolvedAt.microsSinceUnixEpoch - current.startsAtMicros) / 1_000_000);

    ctx.db.duelReplay.insert({
      id: current.id,
      combatVersion: current.combatVersion ?? 0,
      challengerIdentity: current.challenger.toHexString(),
      opponentIdentity: current.opponent.toHexString(),
      challengerName,
      opponentName,
      winnerName,
      durationSeconds,
      challengerMaxHp: current.challengerMaxHp,
      challengerDamage: current.challengerDamage,
      challengerArmor: current.challengerArmor,
      challengerAttackRate: current.challengerAttackRate,
      challengerRegen: current.challengerRegen,
      challengerFinalHp: current.challengerHp,
      challengerAttacks: current.challengerAttacks,
      challengerDamageDealt: current.challengerDamageDealt,
      challengerRegened: current.challengerRegened,
      challengerBlocked: current.challengerBlocked,
      opponentMaxHp: current.opponentMaxHp,
      opponentDamage: current.opponentDamage,
      opponentArmor: current.opponentArmor,
      opponentAttackRate: current.opponentAttackRate,
      opponentRegen: current.opponentRegen,
      opponentFinalHp: current.opponentHp,
      opponentAttacks: current.opponentAttacks,
      opponentDamageDealt: current.opponentDamageDealt,
      opponentRegened: current.opponentRegened,
      opponentBlocked: current.opponentBlocked,
      createdAt: ctx.timestamp,
      challengerHeadItem: current.challengerHeadItem,
      challengerChestItem: current.challengerChestItem,
      challengerFeetItem: current.challengerFeetItem,
      challengerWeaponItem: current.challengerWeaponItem,
      opponentWeaponItem: current.opponentWeaponItem,
      challengerRightHandItem: current.challengerRightHandItem,
      challengerLeftHandItem: current.challengerLeftHandItem,
      opponentHeadItem: current.opponentHeadItem,
      opponentChestItem: current.opponentChestItem,
      opponentFeetItem: current.opponentFeetItem,
      opponentRightHandItem: current.opponentRightHandItem,
      opponentLeftHandItem: current.opponentLeftHandItem,
      challengerGender: current.challengerGender,
      opponentGender: current.opponentGender,
    });

    deleteSnapshotRow(ctx, "duel", current.id);
  }

  function publishDuelReplay(ctx: any, id: bigint) {
    requireControllingPlayer(ctx);
    const replay = ctx.db.duelReplay.id.find(id);
    if (!replay) throw new SenderError("Duel replay unavailable.");
    if (replay.challengerIdentity !== ctx.sender.toHexString()) {
      throw new SenderError("Only the challenger can share this duel.");
    }
    for (const message of ctx.db.chatMessage.iter() as Iterable<any>) {
      if (message.replayId === id && !message.moderated) return;
    }
    const announcementOutcome = replay.combatVersion >= 1
      ? duelOutcome(replay, { challengerHp: replay.challengerFinalHp, opponentHp: replay.opponentFinalHp })
      : replay.challengerFinalHp > replay.opponentFinalHp ? "CHALLENGER_WIN"
        : replay.opponentFinalHp > replay.challengerFinalHp ? "OPPONENT_WIN" : "DRAW";
    insertChatMessage(
      ctx,
      ctx.sender,
      replay.challengerName,
      duelAnnouncementText(replay.challengerName, replay.opponentName, announcementOutcome),
      id,
    );
  }

  function resolveDuel(ctx: any, current: any) {
    if (current.status === "finishing") {
      if (ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros) finishDuel(ctx, current);
      return;
    }
    if (current.status === "countdown") {
      if (ctx.timestamp.microsSinceUnixEpoch < current.startsAtMicros) return;
      // Continue directly into simulation. Scheduled resolution may be the first
      // server wake-up when the challenger backgrounds during the countdown.
      current = {
        ...current,
        status: "active",
        startedAt: ctx.timestamp,
        lastResolvedAt: new Timestamp(current.startsAtMicros),
      };
    }
    const resolutionMicros = current.endsAtMicros < ctx.timestamp.microsSinceUnixEpoch
      ? current.endsAtMicros
      : ctx.timestamp.microsSinceUnixEpoch;
    const { resolvedMicros, ...combat } = advanceDuelCombat(current, current,
      Number(current.lastResolvedAt.microsSinceUnixEpoch - current.startsAtMicros),
      Number(resolutionMicros - current.startsAtMicros));
    const next = {
      ...current, ...combat,
      lastResolvedAt: new Timestamp(current.startsAtMicros + BigInt(resolvedMicros)),
    };

    if (
      next.challengerHp <= 0 ||
      next.opponentHp <= 0 ||
      ctx.timestamp.microsSinceUnixEpoch >= current.endsAtMicros
    ) {
      const finishing = {
        ...next,
        status: "finishing",
        endsAtMicros: ctx.timestamp.microsSinceUnixEpoch + DUEL_FINISH_HOLD_MICROS,
      };
      updateSnapshotRow(ctx, "duel", finishing);
      ctx.db.duelResolutionSchedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(finishing.endsAtMicros),
        duelId: finishing.id,
      });
    } else {
      updateSnapshotRow(ctx, "duel", next);
    }
  }

  function startDuel(ctx: any, opponent: any) {
    const challenger = requireControllingPlayer(ctx);
    // Only the challenger plays this snapshot duel. The opponent may be
    // offline or on an older app; wire-access filters protect older decoders.
    if (challenger.protocolVersion < 105 || !isSupportedProtocol(challenger.protocolVersion)) {
      throw new SenderError("Update your app to start a duel.");
    }
    if (sameIdentity(opponent, ctx.sender)) throw new SenderError("You cannot duel yourself.");
    if (playersBlocked(ctx, ctx.sender, opponent)) throw new SenderError("Duel unavailable for this player.");
    if (isVirtualPlayer(ctx, opponent) || isVirtualPlayer(ctx, ctx.sender)) {
      throw new SenderError("Virtual test players cannot duel.");
    }
    if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your current duel first.");

    const cooldown = ctx.db.duelRequestCooldown.identity.find(ctx.sender);
    // ctx is untyped here, and `any - bigint` infers as number; both operands
    // are bigints at runtime, so say so rather than let the branch widen.
    const cooldownElapsed: bigint = cooldown
      ? (ctx.timestamp.microsSinceUnixEpoch as bigint) - (cooldown.requestedAt.microsSinceUnixEpoch as bigint)
      : DUEL_REQUEST_COOLDOWN_MICROS;
    if (cooldownElapsed < DUEL_REQUEST_COOLDOWN_MICROS) {
      const remainingSeconds = Number((DUEL_REQUEST_COOLDOWN_MICROS - cooldownElapsed + 999_999n) / 1_000_000n);
      throw new SenderError(`Duel cooldown: ${remainingSeconds} seconds remaining.`);
    }

    const challengerProgress = ctx.db.playerProgress.identity.find(ctx.sender);
    const opponentProgress = ctx.db.playerProgress.identity.find(opponent);
    const challengerProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const opponentProfile = ctx.db.playerProfile.identity.find(opponent);
    if (!challengerProgress || !opponentProgress || !challengerProfile || !opponentProfile) throw new SenderError("Player profile unavailable.");
    if (cooldown) ctx.db.duelRequestCooldown.identity.update({ ...cooldown, requestedAt: ctx.timestamp });
    else ctx.db.duelRequestCooldown.insert({ identity: ctx.sender, requestedAt: ctx.timestamp });

    const startsAtMicros = ctx.timestamp.microsSinceUnixEpoch + DUEL_COUNTDOWN_MICROS;
    const endsAtMicros = startsAtMicros + DUEL_DURATION_MICROS;
    const challengerRightHandItem = equippedRightHandForProgress(challengerProgress);
    const opponentRightHandItem = equippedRightHandForProgress(opponentProgress);
    const challengerLeftHandItem = challengerRightHandItem ? "" : equippedLeftHandForProgress(challengerProgress);
    const opponentLeftHandItem = opponentRightHandItem ? "" : equippedLeftHandForProgress(opponentProgress);
    const challengerAppearance = equipmentPresentationForProgress(challengerProgress);
    const opponentAppearance = equipmentPresentationForProgress(opponentProgress);
    const challengerMaxHp = maxHealthForProgress(ctx, ctx.sender, challengerProgress);
    const opponentMaxHp = maxHealthForProgress(ctx, opponent, opponentProgress);
    const inactiveAttackRate = Number(DUEL_DURATION_MICROS) / 1_000_000 + 1;
    const insertedDuel = insertSnapshotRow(ctx, "duel", {
      id: 0n,
      combatVersion: DUEL_COMBAT_VERSION,
      challenger: ctx.sender,
      opponent,
      status: "countdown",
      createdAt: ctx.timestamp,
      startedAt: ctx.timestamp,
      startsAtMicros,
      endsAtMicros,
      lastResolvedAt: ctx.timestamp,
      challengerOriginX: challenger.x,
      challengerOriginY: challenger.y,
      opponentOriginX: 0,
      opponentOriginY: 0,
      challengerHp: challengerMaxHp,
      challengerMaxHp,
      challengerDamage: duelDamage(ctx, ctx.sender, challengerProgress.damage),
      challengerArmor: researchedArmor(ctx, ctx.sender, challengerProgress.armor),
      challengerAttackRate: challengerRightHandItem || challengerLeftHandItem ? attackIntervalForProgress(challengerProgress) : inactiveAttackRate,
      challengerRegen: researchedRegen(ctx, ctx.sender, challengerProgress.regen),
      challengerAttacks: 0,
      challengerDamageDealt: 0,
      challengerRegened: 0,
      challengerBlocked: 0,
      opponentHp: opponentMaxHp,
      opponentMaxHp,
      opponentDamage: duelDamage(ctx, opponent, opponentProgress.damage),
      opponentArmor: researchedArmor(ctx, opponent, opponentProgress.armor),
      opponentAttackRate: opponentRightHandItem || opponentLeftHandItem ? attackIntervalForProgress(opponentProgress) : inactiveAttackRate,
      opponentRegen: researchedRegen(ctx, opponent, opponentProgress.regen),
      opponentAttacks: 0,
      opponentDamageDealt: 0,
      opponentRegened: 0,
      opponentBlocked: 0,
      challengerHeadItem: challengerAppearance.headItem,
      challengerChestItem: challengerAppearance.chestItem,
      challengerFeetItem: challengerAppearance.feetItem,
      challengerWeaponItem: challengerRightHandItem || challengerLeftHandItem,
      opponentWeaponItem: opponentRightHandItem || opponentLeftHandItem,
      challengerRightHandItem: challengerAppearance.rightHandItem,
      challengerLeftHandItem: challengerAppearance.leftHandItem,
      opponentHeadItem: opponentAppearance.headItem,
      opponentChestItem: opponentAppearance.chestItem,
      opponentFeetItem: opponentAppearance.feetItem,
      opponentRightHandItem: opponentAppearance.rightHandItem,
      opponentLeftHandItem: opponentAppearance.leftHandItem,
      challengerName: challengerProfile.displayName,
      opponentName: opponentProfile.displayName,
      challengerGender: challengerProfile.gender,
      opponentGender: opponentProfile.gender,
    });
    ctx.db.duelResolutionSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(endsAtMicros),
      duelId: insertedDuel.id,
    });
    const nextChallenger = {
      ...challenger,
      x: DUEL_ARENA.challenger.x,
      y: DUEL_ARENA.challenger.y,
      ...playerZone(DUEL_ARENA.challenger.x, DUEL_ARENA.challenger.y),
      ...stoppedMotionFields(challenger, true),
      lastInputAt: ctx.timestamp,
    };
    updateSnapshotRow(ctx, "player", nextChallenger);
    syncPlayerMotion(ctx, nextChallenger);
    syncPlayerMotionIdentity(ctx, nextChallenger);
    syncPlayerMapMarker(ctx, nextChallenger, true);
    ensureRealtimeFrameSchedules(ctx);
  }

  return { duelDamage, finishDuel, resolveDuel, startDuel, publishDuelReplay };
}
