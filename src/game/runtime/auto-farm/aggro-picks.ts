import type { RewardType } from "../../enemies";
import { farmStatGroup } from "./auto-farm-priority";
import { aggroForcedCamps, type AggroChallenge } from "../../../../shared/aggro-challenge";

export { aggroPullCamps } from "../../../../shared/aggro-challenge";

/**
 * Which stat groups chase the player during an Aggro run: the player's own
 * picks, one more each run, saved per account on this device. A picked
 * group a map does not have simply has no one there to chase.
 */
export const AGGRO_GROUPS: readonly RewardType[] = ["damage", "health", "armor", "regen"];
export const AGGRO_GROUP_LABELS: Record<RewardType, string> = { damage: "Damage", health: "Max Health", speed: "Atk Speed", armor: "Armor", regen: "Regen", crit: "Crit Damage" };
const KEY = "wildstat:aggro-picks:v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const local = (): Storage | undefined => { try { return localStorage; } catch { return undefined; } };

export function readAggroPicks(identity: string | undefined, storage: () => Storage | undefined = local): RewardType[] {
  if (!identity) return [];
  try {
    const picks = JSON.parse(storage()?.getItem(`${KEY}:${identity}`) ?? "[]");
    return Array.isArray(picks) ? AGGRO_GROUPS.filter(group => picks.includes(group)) : [];
  } catch { return []; }
}

export function writeAggroPicks(identity: string | undefined, picks: readonly RewardType[], storage: () => Storage | undefined = local) {
  if (!identity) return;
  try { storage()?.setItem(`${KEY}:${identity}`, JSON.stringify(AGGRO_GROUPS.filter(group => picks.includes(group)))); } catch { /* The picks still apply this session. */ }
}

/** How many groups this run (or the next) asks for. */
export function aggroPicksNeeded(challenge: AggroChallenge | null | undefined) {
  return aggroForcedCamps({ active: true, completed: challenge?.completed ?? 0 });
}

/**
 * A tap on a group: a picked one leaves, an unpicked one joins while there is
 * room. With the count full a new group waits for the player to unpick one;
 * with a count of one it simply switches.
 * Whether a run may hold fewer than its count is the caller's to decide.
 */
export function togglePick(picks: readonly RewardType[], group: RewardType, needed: number): RewardType[] {
  if (picks.includes(group)) return picks.filter(pick => pick !== group);
  if (picks.length < needed) return [...picks, group];
  return needed === 1 ? [group] : [...picks];
}

/** Whether a tap on `group` was turned away because the count is already full. */
export const pickRefused = (picks: readonly RewardType[], group: RewardType, needed: number) =>
  needed > 1 && !picks.includes(group) && picks.length >= needed;

/**
 * What chases the player now: during a run, the saved picks as autofarm
 * groups and how many the run needs (autofarm fills any shortfall from the
 * map's other groups); outside a run, nothing.
 */
export function forcedAggroGroups(challenge: AggroChallenge | null | undefined, identity: string | undefined, storage?: () => Storage | undefined) {
  if (!challenge?.active) return null;
  return { groups: readAggroPicks(identity, storage).map(farmStatGroup) as string[], needed: aggroPicksNeeded(challenge) };
}
