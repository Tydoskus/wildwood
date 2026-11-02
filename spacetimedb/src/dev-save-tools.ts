// Developer save tools: editing a player's saved stats, copying combat stats
// between players, and resetting the daily gem bonus. Each body runs behind the
// developer gate its reducer declaration in index.ts calls first.
import type { ModuleReducerCtx } from "./index";
import { Identity } from "spacetimedb";
import { isDatabaseOwnerIdentity, requireDeveloper, sameIdentity } from "./session-guards";
import { SenderError } from "spacetimedb/server";
import { currentUtcDayKey, ensureDailyGemBonusState, ensureGemWallet, applyGemBalanceChange } from "./gem-wallet";
import { DAILY_LOGIN_GEM_BONUS } from "../../shared/gems";
import { readPlayerProgress } from "./wide-stats";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { effectiveMovementSpeedForProgress } from "./player-speed";
import { powerFieldsForProgress } from "./player-power";
import { syncPlayerMotionIdentity, playerWithMotion } from "./presence-runtime";
import { refreshLeaderboard } from "./leaderboard-refresh";
import { requireAllowedDisplayName, syncDisplayNamePresentation } from "./display-names";
import { MAX_MOVEMENT_SPEED_OVERRIDE, playerBaseMovementSpeed, MAX_PLAYER_STAT, MIN_ATTACK_INTERVAL, PLAYER_PROJECTILE_SPEED, MAX_ARMOR, movementSpeedsMatch } from "../../shared/rules";
import { touchAllCombatProfiles } from "./combat-profile";

export function devResetDailyBonus(ctx: ModuleReducerCtx, { identity }: { identity: Identity }) {
  if (!isDatabaseOwnerIdentity(ctx.sender)) {
    requireDeveloper(ctx, "dev_reset_daily_gem_bonus");
    if (!sameIdentity(identity, ctx.sender)) throw new SenderError("Developers may reset only their own daily bonus.");
  }
  const dayKey = currentUtcDayKey(ctx);
  const state = ensureDailyGemBonusState(ctx, identity);
  if (state.claimableDayKey === dayKey) return;

  const wallet = ensureGemWallet(ctx, identity);
  if (wallet.balance < DAILY_LOGIN_GEM_BONUS) {
    throw new SenderError("At least 7 Gems are needed to reverse today's bonus for preview.");
  }
  const nextCycle = state.claimCycle + 1n;
  applyGemBalanceChange(ctx, {
    identity,
    delta: -DAILY_LOGIN_GEM_BONUS,
    kind: "developer_daily_bonus_reset",
    note: "Reversed today's daily bonus for Claim-window preview.",
    externalReference: `daily-reset:${identity.toHexString()}:${dayKey}:${nextCycle}`,
  });
  ctx.db.dailyGemBonus.identity.update({
    ...state,
    claimableDayKey: dayKey,
    lastClaimedDayKey: "",
    claimCycle: nextCycle,
    revision: state.revision + 1n,
    updatedAt: ctx.timestamp,
  });
}

export function devCopyCombatStats(ctx: ModuleReducerCtx, { sourceIdentity, targetIdentity }: { sourceIdentity: Identity; targetIdentity: Identity }) {
  if (!isDatabaseOwnerIdentity(ctx.sender)) requireDeveloper(ctx, "dev_copy_player_combat_stats");
  touchAllCombatProfiles(ctx);
  if (sameIdentity(sourceIdentity, targetIdentity)) throw new SenderError("Source and target must differ.");
  const source = readPlayerProgress(ctx, sourceIdentity);
  const target = readPlayerProgress(ctx, targetIdentity);
  if (!source || !target) throw new SenderError("Player progress row not found.");

  const nextProgress = {
    ...target,
    maxHp: source.maxHp,
    damage: source.damage,
    attackRate: source.attackRate,
    projectileSpeed: source.projectileSpeed,
    projectileCount: source.projectileCount,
    attackRange: source.attackRange,
    armor: source.armor,
    regen: source.regen,
    speed: source.speed,
    speedOverride: source.speedOverride,
  };
  updateSnapshotRow(ctx, "playerProgress", nextProgress);
  const active = ctx.db.player.identity.find(targetIdentity);
  if (active) {
    const nextPlayer = {
      ...active,
      speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
      ...powerFieldsForProgress(ctx, nextProgress),
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
  refreshLeaderboard(ctx);
}

export function devUpdateSave(ctx: ModuleReducerCtx, update: {
  identity: Identity;
  displayName: string;
  maxHp: number;
  damage: number;
  attackRate: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  armor: number;
  regen: number;
  speed: number;
}) {
  requireDeveloper(ctx, "dev_update_player_save");
  const profile = ctx.db.playerProfile.identity.find(update.identity);
  const progress = readPlayerProgress(ctx, update.identity);
  if (!profile || !progress) throw new SenderError("Player save row not found.");
  const displayName = update.displayName.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9 _-]{2,20}$/.test(displayName)) {
    throw new SenderError("Name must be 2-20 letters, numbers, spaces, hyphens, or underscores.");
  }
  requireAllowedDisplayName(displayName);
  const bounded = (value: number, min: number, max: number, field: string) => {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new SenderError(`${field} must be between ${min} and ${max}.`);
    }
    return value;
  };
  const requestedSpeed = bounded(update.speed, 0, MAX_MOVEMENT_SPEED_OVERRIDE, "Move speed");
  const equipmentSpeed = playerBaseMovementSpeed(false);
  const nextProgress = {
    ...progress,
    maxHp: bounded(update.maxHp, 1, MAX_PLAYER_STAT, "Max HP"),
    damage: bounded(update.damage, 1, MAX_PLAYER_STAT, "Damage"),
    attackRate: bounded(update.attackRate, MIN_ATTACK_INTERVAL, 10, "Attack rate"),
    projectileSpeed: PLAYER_PROJECTILE_SPEED,
    projectileCount: Math.max(1, Math.min(20, Math.floor(update.projectileCount))),
    attackRange: bounded(update.attackRange, 1, 5_000, "Attack range"),
    armor: bounded(update.armor, 0, MAX_ARMOR, "Armor"),
    regen: bounded(update.regen, 0, MAX_PLAYER_STAT, "Regen"),
    speed: equipmentSpeed,
    speedOverride: requestedSpeed === 0 || movementSpeedsMatch(requestedSpeed, equipmentSpeed) ? 0 : requestedSpeed,
  };
  updateSnapshotRow(ctx, "playerProfile", { ...profile, displayName });
  syncDisplayNamePresentation(ctx, update.identity, displayName);
  updateSnapshotRow(ctx, "playerProgress", nextProgress);
  const active = ctx.db.player.identity.find(update.identity);
  if (active) {
    const nextPlayer = {
      ...active,
      speed: effectiveMovementSpeedForProgress(ctx, nextProgress),
      ...powerFieldsForProgress(ctx, nextProgress),
    };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
  const audit = ctx.db.playerAccessAudit.identity.find(update.identity);
  if (audit) ctx.db.playerAccessAudit.identity.update({ ...audit, displayName });
  refreshLeaderboard(ctx);
}
