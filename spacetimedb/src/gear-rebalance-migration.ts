import { DEFAULT_ATTACK_INTERVAL } from "../../shared/rules";
import { challengeAttackInterval } from "../../shared/prestige-challenge";
import { reflectRewardsOn } from "../../shared/bonus-toggles";
import { questKillStat, type WeeklyQuest } from "../../shared/weekly-quests";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { bonusOffFor } from "./bonus-toggles";
import { reflectRewardsInPlay } from "./prestige-challenge";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { iterPlayerProgress } from "./wide-stats";
import { hasWeaponStats } from "../../shared/weapon-stat-rolls";
import { ensureFirstStatRoll, setCopyStatRoll, setOfferStatRoll } from "./weapon-stat-roll";

/** A main run's interval at base: its Reflect Only wins kept, unless the player switched them off. */
const mainRunInterval = (ctx: any, identity: any) => {
  const challenge = ctx.db.playerPrestigeChallenge.identity.find(identity);
  return reflectRewardsOn(bonusOffFor(ctx, identity))
    ? challengeAttackInterval(DEFAULT_ATTACK_INTERVAL, challenge && { ...challenge, active: false }) : DEFAULT_ATTACK_INTERVAL;
};

/** A saved run's JSON at base attack speed and crit; an unreadable one is left alone. */
function resetRunJson(json: string, attackRate: number) {
  try {
    const saved = JSON.parse(json);
    if (!saved || typeof saved !== "object") return json;
    return JSON.stringify({ ...saved, attackRate, critRating: 0 });
  } catch { return json; }
}

/** A quest's stat no enemy on its map gives any more: the first one that is given there, else damage. */
function replacementStat(quest: WeeklyQuest, taken: Set<string>) {
  const stats = Object.keys(ENEMY_TYPES).filter(enemy => enemyDefeatDefinition(quest.mapId, enemy)).map(questKillStat);
  return stats.find(stat => stat && !taken.has(stat)) ?? stats.find(Boolean) ?? "damage";
}

/** Every graded weapon a player holds gets a random speed and crit roll: first copies, kept copies and offers. */
function rollHeldWeapons(ctx: any, progress: any) {
  let bag: unknown;
  try { bag = JSON.parse(progress.inventoryJson || "[]"); } catch { bag = []; }
  const held = new Set([...(Array.isArray(bag) ? bag : []), progress.equippedRightHand, progress.equippedLeftHand].filter(item => typeof item === "string"));
  for (const itemId of held) if (hasWeaponStats(itemId)) ensureFirstStatRoll(ctx, progress.identity, itemId);
}

/**
 * Migration 68: attack speed and crit come from weapons. Every run's own attack speed
 * and crit rating go back to base, live and saved; Reflect Only wins, Quick Draw and the soul stay. Quests on a
 * stat no enemy gives any more move to one that is, progress kept. Every weapon held rolls its speed and crit at random.
 * Returns the identities whose live row changed.
 */
export function resetRunAttackSpeedAndCrit(ctx: any) {
  const changed: any[] = [];
  for (const progress of [...iterPlayerProgress(ctx)]) {
    rollHeldWeapons(ctx, progress);
    const attackRate = challengeAttackInterval(DEFAULT_ATTACK_INTERVAL, reflectRewardsInPlay(ctx, progress.identity));
    if (progress.attackRate === attackRate && !progress.critRating) continue;
    updateSnapshotRow(ctx, "playerProgress", { ...progress, attackRate, critRating: 0 });
    changed.push(progress.identity);
  }
  // The main run waiting out a challenge, and parked challenge and Aggro runs, which have no wins in play.
  for (const row of [...ctx.db.prestigeChallengeBackup.iter()]) {
    ctx.db.prestigeChallengeBackup.identity.update({ ...row, progressJson: resetRunJson(row.progressJson, mainRunInterval(ctx, row.identity)) });
  }
  for (const table of [ctx.db.prestigeChallengeRun, ctx.db.aggroChallengeRun]) {
    for (const row of [...table.iter()]) table.identity.update({ ...row, progressJson: resetRunJson(row.progressJson, DEFAULT_ATTACK_INTERVAL) });
  }
  for (const copy of [...ctx.db.playerEquipmentCopy.iter()]) setCopyStatRoll(ctx, copy.identity, copy.itemId, copy.id, {});
  for (const offer of [...ctx.db.pendingEquipmentOffer.iter()]) setOfferStatRoll(ctx, offer.identity, offer.itemId, offer.id, {});
  for (const row of [...ctx.db.playerDailyQuest.iter()]) {
    let quests: WeeklyQuest[];
    try { quests = JSON.parse(row.questsJson); } catch { continue; }
    if (!Array.isArray(quests)) continue;
    const gone = (quest: WeeklyQuest) => quest.stat === "speed" || quest.stat === "crit";
    if (!quests.some(gone)) continue;
    const next = quests.map(quest => ({ ...quest }));
    for (const quest of next.filter(gone)) {
      const taken = new Set(next.filter(other => other.mapId === quest.mapId && other.stat).map(other => `${other.stat}`));
      quest.stat = replacementStat(quest, taken);
    }
    ctx.db.playerDailyQuest.identity.update({ ...row, questsJson: JSON.stringify(next) });
  }
  return changed;
}
