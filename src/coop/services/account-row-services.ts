import type { DbConnection } from "../../module_bindings";
import { createOfflineProgressPreference } from "./offline-progress-watch";
import { createBowSkills } from "./bow-skills";
import { createAdGemReward } from "./ad-gem-reward";

/**
 * The account's own small rows, each read through a caller-scoped view and
 * followed for as long as the connection is current: the offline-progress
 * opt-out, the bow skill rolls with their copies and loot settings, and the
 * rewarded ad's Gem claims. They share one lifecycle, so the connection
 * starts them together and the coop API serves them together.
 */
export function createAccountRowServices(connection: () => DbConnection | null, notify: () => void) {
  const offlinePreference = createOfflineProgressPreference(connection, notify);
  const bowSkills = createBowSkills(notify);
  const adGemReward = createAdGemReward(notify);
  return {
    watch(current: DbConnection, isCurrent: () => boolean) {
      offlinePreference.watch(current, isCurrent);
      bowSkills.watch(current, isCurrent);
      adGemReward.watch(current, isCurrent);
    },
    api: {
      ...offlinePreference.api,
      ...bowSkills.api,
      ...adGemReward.api,
    },
  };
}
