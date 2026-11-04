// Snapshot duels: the challenger-only arena fight behind requestDuel, the
// deterministic combat resolution that pulseDuel, resolveScheduledDuel and
// runMaintenance drive, the replay row written when a duel finishes, the
// optional chat announcement, and the expired-request sweep. The duel tables, the schema
// registration and the requestDuel/acceptDuel/pulseDuel/resolveScheduledDuel
// reducer declarations stay in index.ts; this module only owns the bodies they
// call. Membership checks keep going through the duel.byChallenger index.
// Helpers that still live in index.ts arrive through
// createDuelRuntime's deps so the moved code reads exactly as it did.
import { soulAttackCapFor, soulStatsFor, withSoulStats } from "./soul-dimension";
import { ScheduleAt, Timestamp } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { insertSnapshotRow, updateSnapshotRow, deleteSnapshotRow } from "./snapshot-row-writes";
import { withDuelWide, writeReplayWide } from "./wide-stats";
import { sendDuelResultMessage } from "./social-service";
import {
  playerZone, playerWithMotion, stoppedMotionFields, syncPlayerMotion, syncPlayerMotionIdentity,
  syncPlayerMapMarker, ensureRealtimeFrameSchedules,
} from "./presence-runtime";
import { advanceDuelCombat, duelOutcome, initialDuelCombatState, DUEL_COMBAT_VERSION } from "../../shared/duel-combat";
import { DUEL_CARDS_VERSION } from "../../shared/duel-cards";
import { cardChance, cardStatFactors, cardValue } from "../../shared/card-effects";
import { bootSkillChanceFactor, hasBootStat, itemDefinition, weaponRatings } from "../../shared/items";
import { attackIntervalWithGear } from "../../shared/stat-rating";
import { activeCardIdsFor, activeCardTotalsFor } from "./active-cards";
import { duelAnnouncementText } from "../../shared/duel-announcement";
import { prestigePerkRanks } from "./prestige";
import { researchInPlay } from "./bonus-toggles";
import { prestigePerkValue, prestigeReflectChance, prestigeSwingMultiplier } from "../../shared/prestige-perks";
import { criticalDamageMultiplier } from "../../shared/critical-damage";
import { duelBowSkillFields } from "./bow-skills";
import { duelSwordSkillFields } from "./sword-skills";
import { deleteDuelStaffSkills, duelStaffSkillFields, duelStaffSkillRow, insertDuelStaffSkills } from "./staff-skills";
import { weaponAttackInterval, weaponHitFactor } from "../../shared/staff-skills";
import { readCritRating, readPlayerProgress } from "./wide-stats";
import { masteryInPlayFor } from "./weapon-mastery";
import { duelSkillsWithProficiency, masteryDamageTaken } from "../../shared/weapon-mastery";
import type { DuelFighter } from "../../shared/duel-combat";
import { armorSkillChanceFactor } from "../../shared/armor-class-perks";
import { equippedChestForProgress, equippedFeetForProgress, equippedHeadForProgress, itemLevelFor } from "./progress-helpers";
import { duelMasteryFold, duelSkillsWithTechniques } from "../../shared/mastery-techniques";

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
    if (isActive(current)) return withDuelWide(ctx, current);
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
  for (const id of expiredIds) { deleteSnapshotRow(ctx, "duel", id); ctx.db.duelRiposte.duelId.delete(id); ctx.db.duelCombatSnapshot.duelId.delete(id); deleteDuelStaffSkills(ctx, id); }
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
  equipmentPresentationForProgress: (ctx: any, progress: any) => any;
};

export function createDuelRuntime(deps: DuelRuntimeDeps) {
  const {
    requireControllingPlayer, isSupportedProtocol, sameIdentity, playersBlocked, isVirtualPlayer,
    insertChatMessage, researchedDamage, researchedArmor, researchedRegen, maxHealthForProgress,
    attackIntervalForProgress, equippedRightHandForProgress, equippedLeftHandForProgress,
    equipmentPresentationForProgress,
  } = deps;

  /** Crit chance and multiplier in a duel: research, Keen Edge, the soul, the rating (the weapon's with it) and cards. */
  function duelCrit(ctx: any, identity: any, gearRating = 0) {
    const research = researchInPlay(ctx, identity);
    const ranks = prestigePerkRanks(ctx, identity);
    const cards = cardStatFactors(activeCardTotalsFor(ctx, identity));
    return {
      chance: Math.min(1, (research?.criticalChance ?? 0) * .01 + prestigePerkValue(ranks, "keenEdge") + cards.critChance),
      multiplier: criticalDamageMultiplier({ researchRank: research?.criticalDamage, perks: ranks,
        soul: soulStatsFor(ctx, identity)?.critDamage, rating: readCritRating(ctx, identity) + gearRating, capRank: research?.critCap, card: cards.critDamage }),
    };
  }

  function duelDamage(ctx: any, identity: any, damage: number, opponentWeapon = "", gearRating = 0) {
    const ranks = prestigePerkRanks(ctx, identity);
    const totals = activeCardTotalsFor(ctx, identity);
    const baseDamage = researchedDamage(ctx, identity, damage);
    const crit = duelCrit(ctx, identity, gearRating);
    // Duel simulation is deterministic and both sides replay it, so random
    // rolls fold into expected damage. Criticals and Double Strike both do,
    // and the cards that never change in a duel: Double Strike, Steady (duellists
    // stand) and Ranged Slayer against a bow (shared/duel-cards.ts plays the rest).
    const cards = (1 + cardChance(totals, "doubleStrike") / 100) * (1 + Math.max(0, cardValue(totals, "steady")) / 100)
      * (itemDefinition(opponentWeapon)?.weapon?.mode === "RANGED" ? 1 + Math.max(0, cardValue(totals, "rangedSlayer")) / 100 : 1);
    return baseDamage * (1 + crit.chance * (crit.multiplier - 1)) * prestigeSwingMultiplier(ranks) * cards;
  }

  /**
   * One side's fighter before the matchup: its health, its averaged hit (a staff's bolt factor in), the weapon's
   * attack interval (a staff casts slower), armor, regen, crits and the Mastery in play. Duels and guild fights share it.
   */
  function duelSide(ctx: any, identity: any, progress: any, opponentWeapon = "") {
    const rightHand = equippedRightHandForProgress(progress), weapon = rightHand || equippedLeftHandForProgress(progress);
    // The weapon's attack speed and crit damage rating.
    const cap = soulAttackCapFor(ctx, identity), gearRating = weapon ? weaponRatings(weapon, itemLevelFor(ctx, identity, weapon)) : { speed: 0, crit: 0 };
    const runInterval = attackIntervalWithGear(attackIntervalForProgress(withSoulStats(progress, soulStatsFor(ctx, identity), cap)), gearRating.speed, cap);
    return {
      weapon, mastery: masteryInPlayFor(ctx, identity, rightHand, weapon), crit: duelCrit(ctx, identity, gearRating.crit),
      maxHp: maxHealthForProgress(ctx, identity, progress),
      hit: duelDamage(ctx, identity, progress.damage, opponentWeapon, gearRating.crit) * weaponHitFactor(weapon),
      attackInterval: weapon ? weaponAttackInterval(weapon, runInterval) : Number(DUEL_DURATION_MICROS) / 1_000_000 + 1,
      armor: researchedArmor(ctx, identity, progress.armor), regen: researchedRegen(ctx, identity, progress.regen),
    };
  }

  /**
   * A guild battle fighter: the duel's side with its Mastery folded in. A crowd has no one opponent, so Parry and
   * Ranged Slayer stay out, and Guard and Mana Shield count as the extra health they make a knockout take.
   */
  function guildFighter(ctx: any, identity: any, progress: any): DuelFighter {
    const side = duelSide(ctx, identity, progress);
    if (!side.weapon) return { maxHp: side.maxHp, damage: 0, armor: side.armor, regen: side.regen, attackRate: 31 };
    const fold = duelMasteryFold({ mastery: side.mastery, crit: side.crit, damage: side.hit, attackInterval: side.attackInterval,
      maxHp: side.maxHp, deflect: 0, opponent: { damage: 0, attackInterval: side.attackInterval, ranged: false } });
    const taken = masteryDamageTaken(side.mastery) * fold.damageTaken;
    return { maxHp: side.maxHp / taken, damage: side.hit * fold.damage, armor: side.armor, regen: (side.regen + fold.regen) / taken,
      attackRate: fold.attackInterval };
  }

  /** Iaido's first hit is a full critical: its damage over the averaged hit, at the side's own crits (duelSide). */
  function duelFirstHit(ctx: any, identity: any, crit: ReturnType<typeof duelCrit>) {
    if (cardValue(activeCardTotalsFor(ctx, identity), "iaido") <= 0) return 1;
    return crit.multiplier / (1 + crit.chance * (crit.multiplier - 1));
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

    ctx.db.duelReplay.insert(writeReplayWide(ctx, {
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
    }));
    // The opponent hears of it privately, shared to public chat or not.
    sendDuelResultMessage(ctx, { id: current.id, challenger: current.challenger, opponent: current.opponent, challengerName, opponentName,
      outcome: challengerWon ? "challenger" : opponentWon ? "opponent" : "draw" });

    deleteSnapshotRow(ctx, "duel", current.id);
    ctx.db.duelRiposte.duelId.delete(current.id);
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
    const riposte = ctx.db.duelRiposte.duelId.find(current.id);
    // The snapshot freezes both weapons' rolls, so changing equipment cannot change a running fight.
    // Old records without a snapshot keep their historical combat version.
    const fight = { ...current, ...(ctx.db.duelCombatSnapshot.duelId.find(current.id) ?? { ...riposte, ...duelBowSkillFields(ctx, current), ...duelSwordSkillFields(ctx, current) }),
      ...duelStaffSkillRow(ctx, current.id) };
    // Card duels keep running state the duel row does not store, so they resolve from the start each time.
    const fromStart = (current.combatVersion ?? 0) >= DUEL_CARDS_VERSION;
    const { resolvedMicros, cards: _cards, challengerChilledUntil: _chilledA, opponentChilledUntil: _chilledB, ...combat } = advanceDuelCombat(fight, fromStart ? initialDuelCombatState(fight) : current,
      fromStart ? 0 : Number(current.lastResolvedAt.microsSinceUnixEpoch - current.startsAtMicros),
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

    const challengerProgress = readPlayerProgress(ctx, ctx.sender);
    const opponentProgress = readPlayerProgress(ctx, opponent);
    const challengerProfile = ctx.db.playerProfile.identity.find(ctx.sender);
    const opponentProfile = ctx.db.playerProfile.identity.find(opponent);
    if (!challengerProgress || !opponentProgress || !challengerProfile || !opponentProfile) throw new SenderError("Player profile unavailable.");
    if (cooldown) ctx.db.duelRequestCooldown.identity.update({ ...cooldown, requestedAt: ctx.timestamp });
    else ctx.db.duelRequestCooldown.insert({ identity: ctx.sender, requestedAt: ctx.timestamp });

    const startsAtMicros = ctx.timestamp.microsSinceUnixEpoch + DUEL_COUNTDOWN_MICROS;
    const endsAtMicros = startsAtMicros + DUEL_DURATION_MICROS;
    const challengerAppearance = equipmentPresentationForProgress(ctx, challengerProgress);
    const opponentAppearance = equipmentPresentationForProgress(ctx, opponentProgress);
    const inactiveAttackRate = Number(DUEL_DURATION_MICROS) / 1_000_000 + 1;
    const challengerWeapon = equippedRightHandForProgress(challengerProgress) || equippedLeftHandForProgress(challengerProgress);
    const opponentWeapon = equippedRightHandForProgress(opponentProgress) || equippedLeftHandForProgress(opponentProgress);
    // Each side's fighter (duelSide); a staff's bolts hit a little harder and come slower (shared/staff-skills.ts).
    const challengerSide = duelSide(ctx, ctx.sender, challengerProgress, opponentWeapon);
    const opponentSide = duelSide(ctx, opponent, opponentProgress, challengerWeapon);
    const challengerMaxHp = challengerSide.maxHp, opponentMaxHp = opponentSide.maxHp;
    // Weapon Mastery, frozen into the duel: Skill Proficiency in the skill chances, Swordplay's Guard in what the other
    // side deals, and the techniques folded into damage, speed, regen and skill chances (mastery-techniques.ts).
    const challengerMastery = challengerSide.mastery, opponentMastery = opponentSide.mastery;
    // Magic armor and Mystic Boots raise each side's skill chances as Skill Proficiency does.
    const skillGear = (progress: any) => {
      const feet = equippedFeetForProgress(progress);
      return armorSkillChanceFactor(equippedHeadForProgress(progress), equippedChestForProgress(progress))
        * (hasBootStat(feet) ? bootSkillChanceFactor(feet, itemLevelFor(ctx, progress.identity, feet)) : 1);
    };
    const challengerSkillGear = skillGear(challengerProgress), opponentSkillGear = skillGear(opponentProgress);
    const withProficiency = <T extends Record<string, number>>(fields: T) => duelSkillsWithTechniques(
      duelSkillsWithProficiency(fields, challengerMastery.level, opponentMastery.level, challengerSkillGear, opponentSkillGear),
      challengerMastery, opponentMastery);
    const sides = { challenger: ctx.sender, opponent, challengerWeaponItem: challengerWeapon, opponentWeaponItem: opponentWeapon };
    const swordFields = withProficiency(duelSwordSkillFields(ctx, sides));
    const challengerHit = challengerSide.hit, opponentHit = opponentSide.hit;
    const challengerInterval = challengerSide.attackInterval, opponentInterval = opponentSide.attackInterval;
    const ranged = (weapon: string) => itemDefinition(weapon)?.weapon?.mode === "RANGED";
    const challengerFold = duelMasteryFold({ mastery: challengerMastery, crit: challengerSide.crit, damage: challengerHit,
      attackInterval: challengerInterval, maxHp: challengerMaxHp, deflect: swordFields.challengerDeflect,
      opponent: { damage: opponentHit, attackInterval: opponentInterval, ranged: ranged(opponentWeapon) } });
    const opponentFold = duelMasteryFold({ mastery: opponentMastery, crit: opponentSide.crit, damage: opponentHit,
      attackInterval: opponentInterval, maxHp: opponentMaxHp, deflect: swordFields.opponentDeflect,
      opponent: { damage: challengerHit, attackInterval: challengerInterval, ranged: ranged(challengerWeapon) } });
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
      challengerDamage: challengerHit * challengerFold.damage * masteryDamageTaken(opponentMastery) * opponentFold.damageTaken,
      challengerArmor: challengerSide.armor,
      challengerAttackRate: challengerWeapon ? challengerFold.attackInterval : inactiveAttackRate,
      challengerRegen: challengerSide.regen + (challengerWeapon ? challengerFold.regen : 0),
      challengerAttacks: 0,
      challengerDamageDealt: 0,
      challengerRegened: 0,
      challengerBlocked: 0,
      opponentHp: opponentMaxHp,
      opponentMaxHp,
      opponentDamage: opponentHit * opponentFold.damage * masteryDamageTaken(challengerMastery) * challengerFold.damageTaken,
      opponentArmor: opponentSide.armor,
      opponentAttackRate: opponentWeapon ? opponentFold.attackInterval : inactiveAttackRate,
      opponentRegen: opponentSide.regen + (opponentWeapon ? opponentFold.regen : 0),
      opponentAttacks: 0,
      opponentDamageDealt: 0,
      opponentRegened: 0,
      opponentBlocked: 0,
      challengerHeadItem: challengerAppearance.headItem,
      challengerChestItem: challengerAppearance.chestItem,
      challengerFeetItem: challengerAppearance.feetItem,
      challengerWeaponItem: challengerWeapon,
      opponentWeaponItem: opponentWeapon,
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
    // Both riposte chances and one seed, frozen beside the duel so the fight
    // resolves the same way however many times it is replayed.
    ctx.db.duelRiposte.insert({
      duelId: insertedDuel.id,
      // Reflect cards add to the perk; a chance never passes 1.
      challengerRiposte: Math.min(1, prestigeReflectChance(prestigePerkRanks(ctx, ctx.sender)) + cardChance(activeCardTotalsFor(ctx, ctx.sender), "reflect") / 100),
      opponentRiposte: Math.min(1, prestigeReflectChance(prestigePerkRanks(ctx, opponent)) + cardChance(activeCardTotalsFor(ctx, opponent), "reflect") / 100),
      riposteSeed: ctx.timestamp.microsSinceUnixEpoch,
    });
    ctx.db.duelCombatSnapshot.insert({ ...ctx.db.duelRiposte.duelId.find(insertedDuel.id),
      ...withProficiency(duelBowSkillFields(ctx, insertedDuel)), ...swordFields,
      challengerCards: activeCardIdsFor(ctx, ctx.sender),
      opponentCards: activeCardIdsFor(ctx, opponent),
      challengerFirstHit: duelFirstHit(ctx, ctx.sender, challengerSide.crit), opponentFirstHit: duelFirstHit(ctx, opponent, opponentSide.crit) });
    insertDuelStaffSkills(ctx, insertedDuel.id, withProficiency(duelStaffSkillFields(ctx, insertedDuel)));
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

  return { duelDamage, guildFighter, finishDuel, resolveDuel, startDuel, publishDuelReplay };
}
