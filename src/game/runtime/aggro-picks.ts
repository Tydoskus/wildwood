import type { RewardType } from "../enemies";
import { farmStatGroup } from "./auto-farm-priority";
import { aggroForcedCamps, type AggroChallenge } from "../../../shared/aggro-challenge";

export { aggroPullCamps } from "../../../shared/aggro-challenge";

/**
 * Which stat groups chase the player during an Aggro run: the player's own
 * picks, one more each run, saved per account on this device. They used to be
 * a random pick on every arrival; Ryan wanted them chosen and kept. A picked
 * group a map does not have simply has no one there to chase.
 */
export const AGGRO_GROUPS: readonly RewardType[] = ["damage", "health", "speed", "armor", "regen"];
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

/** The autofarm groups that chase the player now: the picks during a run, none outside one. */
export function forcedAggroGroups(challenge: AggroChallenge | null | undefined, identity: string | undefined, storage?: () => Storage | undefined) {
  return challenge?.active ? readAggroPicks(identity, storage).slice(0, aggroPicksNeeded(challenge)).map(farmStatGroup) : [];
}
