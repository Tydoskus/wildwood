import { SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";
import { CAMPAIGN_UNLOCK_FIELDS, highestCampaignMap, withoutLockedEquipment } from "../../shared/equipment-access";
import { MAX_PLAYER_STAT, MAX_ARMOR, MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { recordModerationAction } from "./moderation-history";
import { readPlayerProgress } from "./wide-stats";

export type ProgressionRollbackArgs = {
  identity: Identity; expectedDisplayName: string; operationId: string; baselineJson: string; reason: string;
};

/** Owner-only, explicit snapshot correction. Never infer misconduct from a power ratio. */
export function rollbackPlayerProgression(ctx: ModuleReducerCtx, args: ProgressionRollbackArgs, hooks: {
  requireOwner: () => void;
  apply: (progress: any, mapIndex: number) => void;
}) {
  hooks.requireOwner();
  if (!/^[a-z0-9-]{1,80}$/.test(args.operationId) || !args.reason.trim() || args.reason.length > 500 || args.baselineJson.length > 20_000) {
    throw new SenderError("Invalid rollback request.");
  }
  const target = args.identity.toHexString(), rule = `progression-rollback:${args.operationId}`;
  // Administrative operation only; no new polling, subscription or combat-path work.
  for (const action of ctx.db.moderationAction.iter()) {
    if (action.rule === rule && action.targetIdentity === target) return;
  }
  const profile = ctx.db.playerProfile.identity.find(args.identity);
  const current = readPlayerProgress(ctx, args.identity);
  if (!profile || !current || profile.displayName !== args.expectedDisplayName) throw new SenderError("Rollback target changed or was not found.");
  let baseline: any;
  try { baseline = JSON.parse(args.baselineJson); } catch { throw new SenderError("Invalid rollback snapshot."); }
  if (!baseline || baseline.identity !== target) throw new SenderError("Rollback snapshot identity mismatch.");
  const fields = { maxHp: [1, MAX_PLAYER_STAT], damage: [1, MAX_PLAYER_STAT], armor: [0, MAX_ARMOR], regen: [0, MAX_PLAYER_STAT], attackRate: [Math.fround(MIN_ATTACK_INTERVAL), 10] };
  const next = { ...current };
  for (const [field, [min, max]] of Object.entries(fields)) {
    const value = baseline[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new SenderError(`Invalid rollback ${field}.`);
    (next as any)[field] = value;
  }
  let locked = false;
  for (const field of CAMPAIGN_UNLOCK_FIELDS) {
    if (typeof baseline[field] !== "boolean" || locked && baseline[field]) throw new SenderError("Invalid rollback map access.");
    next[field] = baseline[field]; locked ||= !baseline[field];
  }
  const mapIndex = highestCampaignMap(next), claims = (1 << mapIndex) - 1;
  if (baseline.bossRewardClaims !== claims) throw new SenderError("Rollback boss claims must match campaign access.");
  next.bossRewardClaims = claims;
  const owned: string[] = JSON.parse(current.inventoryJson);
  const fallback = Object.fromEntries(["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"].map(field =>
    [field, typeof baseline[field] === "string" && owned.includes(baseline[field]) ? baseline[field] : ""]));
  const restored = withoutLockedEquipment(next, next, fallback);
  const json = (value: unknown) => JSON.stringify(value, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  const before = json({ progress: current, procedural: ctx.db.proceduralProgress.identity.find(args.identity),
    location: ctx.db.playerLastLocation.identity.find(args.identity), homeReturn: ctx.db.homeReturnLocation.identity.find(args.identity),
    cutscenes: ctx.db.playerCutsceneHistory.identity.find(args.identity) });
  hooks.apply(restored, mapIndex);
  recordModerationAction(ctx, { targetIdentity: target, targetName: profile.displayName, channel: "account",
    action: "Progression rolled back", reason: args.reason, actorType: "owner", rule,
    before, after: json({ progress: restored, mapIndex, baseline: args.baselineJson }) });
}
