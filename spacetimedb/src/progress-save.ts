// The savePlayerProgress body. The client sends its whole stat block, but only
// the loadout and cosmetic slots are read; every stat is rebuilt from the
// stored row and server constants (see docs/ENGINEERING.md, "Progression
// authority"). The reducer declaration and its argument schema stay in index.ts.
import type { ModuleReducerCtx } from "./index";
import { syncWornSkill } from "./worn-skill";
import { requireControllingPlayer } from "./session-guards";
import { readPlayerProgress } from "./wide-stats";
import { defaultPlayerProgress, inventoryForProgress, cosmeticEquipmentForProgress, forestItemCountForProgress, samePlayerProgressValues, equipmentPresentationForProgress } from "./progress-helpers";
import { LOADOUT_FIELDS } from "../../shared/combat-progress";
import { wearsUnlentLook } from "../../shared/patreon-cosmetics";
import { lentLooksFor } from "./patreon";
import { allowedLoadout } from "./loadout";
import { PLAYER_PROJECTILE_SPEED, playerBaseMovementSpeed, movementSpeedsMatch } from "../../shared/rules";
import { savedAttackRange, effectiveMovementSpeedForProgress } from "./player-speed";
import { STARTER_BOW, WOODEN_ARMOR, BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS } from "../../shared/items";
import { insertSnapshotRow, updateSnapshotRow } from "./snapshot-row-writes";
import { powerFieldsForProgress } from "./player-power";
import { syncPlayerMotionIdentity, playerWithMotion } from "./presence-runtime";
import { touchCombatProfile } from "./combat-profile";

export function saveSubmittedProgress(ctx: ModuleReducerCtx, progress: {
  maxHp: number;
  damage: number;
  attackRate: number;
  projectileSpeed: number;
  projectileCount: number;
  attackRange: number;
  armor: number;
  regen: number;
  speed: number;
  bootsCollected: boolean;
  inventoryJson: string;
  equippedHead: string;
  equippedChest: string;
  equippedFeet: string;
  enemyKills: number;
  equippedRightHand: string;
  equippedLeftHand: string;
  cosmeticHead: string;
  cosmeticChest: string;
  cosmeticFeet: string;
  cosmeticRightHand: string;
  cosmeticLeftHand: string;
}) {
  const activePlayer = requireControllingPlayer(ctx);
  const current = readPlayerProgress(ctx, ctx.sender);
  const base = current ?? defaultPlayerProgress(ctx.sender);
  if (current && LOADOUT_FIELDS.every(field => progress[field] === base[field]) && !wearsUnlentLook(base, lentLooksFor(ctx, ctx.sender))) {
    return;
  }
  touchCombatProfile(ctx, ctx.sender);
  const bootsCollected = base.bootsCollected;
  const inventorySource = { ...base, identity: ctx.sender, bootsCollected };
  const inventory = inventoryForProgress(inventorySource);
  const inventoryJson = JSON.stringify(inventory);
  // The ownership and hand rules live in loadout.ts, which auto equip checks too.
  const { equippedHead, equippedChest, equippedFeet, equippedRightHand, equippedLeftHand } = allowedLoadout(progress, inventory);
  const cosmeticEquipment = cosmeticEquipmentForProgress({
    ...base,
    inventoryJson,
    equippedHead,
    equippedChest,
    equippedFeet,
    equippedRightHand,
    equippedLeftHand,
    cosmeticHead: progress.cosmeticHead,
    cosmeticChest: progress.cosmeticChest,
    cosmeticFeet: progress.cosmeticFeet,
    cosmeticRightHand: progress.cosmeticRightHand,
    cosmeticLeftHand: progress.cosmeticLeftHand,
  }, lentLooksFor(ctx, ctx.sender), inventory);
  const next = {
    identity: ctx.sender,
    maxHp: base.maxHp,
    damage: base.damage,
    attackRate: base.attackRate,
    projectileSpeed: PLAYER_PROJECTILE_SPEED,
    projectileCount: base.projectileCount,
    attackRange: savedAttackRange(ctx, ctx.sender),
    armor: base.armor,
    regen: base.regen,
    speed: playerBaseMovementSpeed(false),
    speedOverride: base.speedOverride ?? 0,
    bootsCollected,
    inventoryJson,
    equippedHead,
    equippedChest,
    equippedFeet,
    equippedRightHand,
    equippedLeftHand,
    ...cosmeticEquipment,
    cosmeticItemsJson: base.cosmeticItemsJson ?? "[]",
    introComplete: base.introComplete,
    desertUnlocked: base.desertUnlocked,
    snowlandsUnlocked: base.snowlandsUnlocked,
    lavaUnlocked: base.lavaUnlocked,
    infernalUnlocked: base.infernalUnlocked,
    waterUnlocked: base.waterUnlocked,
    samuraiUnlocked: base.samuraiUnlocked,
    cloudspireUnlocked: base.cloudspireUnlocked,
    moonfenUnlocked: base.moonfenUnlocked,
    crystalHollowsUnlocked: base.crystalHollowsUnlocked, clockworkRuinsUnlocked: base.clockworkRuinsUnlocked, duskfallOrchardUnlocked: base.duskfallOrchardUnlocked, neonBastionUnlocked: base.neonBastionUnlocked, verdantCatacombsUnlocked: base.verdantCatacombsUnlocked, ionCitadelUnlocked: base.ionCitadelUnlocked,
    bossRewardClaims: base.bossRewardClaims ?? 0,
    // The stats above are full values; the write sets the *Wide columns from them.
    critRating: base.critRating ?? 0, maxHpWide: 0, damageWide: 0, armorWide: 0, regenWide: 0,
    bowCount: forestItemCountForProgress(base, STARTER_BOW, "bowCount"),
    woodenArmorCount: forestItemCountForProgress(base, WOODEN_ARMOR, "woodenArmorCount"),
  };
  if (!current) insertSnapshotRow(ctx, "playerProgress", next);
  else if (!samePlayerProgressValues(current, next)) updateSnapshotRow(ctx, "playerProgress", next);
  syncWornSkill(ctx, ctx.sender, next);
  const equipment = equipmentPresentationForProgress(ctx, next, inventory);
  const leaderboard = ctx.db.leaderboardEntry.identity.find(ctx.sender);
  if (leaderboard) {
    const appearance = { skinTone: ctx.db.playerProfile.identity.find(ctx.sender)?.skinTone ?? 3, ...equipment };
    if (
      leaderboard.skinTone !== appearance.skinTone ||
      leaderboard.headItem !== appearance.headItem ||
      leaderboard.chestItem !== appearance.chestItem ||
      leaderboard.feetItem !== appearance.feetItem ||
      leaderboard.rightHandItem !== appearance.rightHandItem ||
      leaderboard.leftHandItem !== appearance.leftHandItem
    ) ctx.db.leaderboardEntry.identity.update({ ...leaderboard, ...appearance });
  }
  const presentation = {
    ...powerFieldsForProgress(ctx, next),
    speed: effectiveMovementSpeedForProgress(ctx, next) + (
      base.equippedFeet === BLACK_BOOTS && next.equippedFeet === BLACK_BOOTS &&
      movementSpeedsMatch(activePlayer.speed, effectiveMovementSpeedForProgress(ctx, base) + BLACK_BOOTS_SPEED_BONUS)
        ? BLACK_BOOTS_SPEED_BONUS : 0),
    ...equipment,
  };
  if (
    activePlayer.power !== presentation.power ||
    activePlayer.powerLevel !== presentation.powerLevel ||
    activePlayer.speed !== presentation.speed ||
    activePlayer.feetItem !== presentation.feetItem ||
    activePlayer.headItem !== presentation.headItem ||
    activePlayer.chestItem !== presentation.chestItem ||
    activePlayer.rightHandItem !== presentation.rightHandItem ||
    activePlayer.leftHandItem !== presentation.leftHandItem
  ) {
    const nextPlayer = { ...activePlayer, ...presentation };
    updateSnapshotRow(ctx, "player", nextPlayer);
    syncPlayerMotionIdentity(ctx, playerWithMotion(ctx, nextPlayer));
  }
}
