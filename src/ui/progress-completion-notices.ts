import { RESEARCH_DEFINITIONS } from "../../shared/research";
import { isUpgradeSlot, UPGRADE_SLOT_LABELS } from "../../shared/slot-upgrades";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { createInventoryNotice } from "./inventory-notice";
import type { ActiveResearch } from "./tech-tree-controller";

type ProgressSession = {
  localIdentity?: () => string;
  isConnected?: () => boolean;
};

type ShowCompletion = (kind: "Research" | "Upgrade", detail: string, icon: string, color: string) => void;

export function createProgressCompletionNotices(
  inventoryButton: HTMLElement,
  session: () => ProgressSession | null | undefined,
  showCompletion: ShowCompletion,
) {
  const inventoryNotice = createInventoryNotice(inventoryButton);
  return {
    researchHooks: {
      localIdentity: () => session()?.localIdentity?.() ?? "",
      isConnected: () => Boolean(session()?.isConnected?.()),
      onResearchFinished: (job: ActiveResearch) => {
        const definition = RESEARCH_DEFINITIONS[job.researchId];
        showCompletion("Research", `${definition.title} Lv ${job.targetRank}`, definition.icon, "#f3a6ce");
      },
    },
    onUpgradeFinished: (job: ActiveItemUpgrade) => {
      const track = isUpgradeSlot(job.itemId) ? UPGRADE_SLOT_LABELS[job.itemId] : "SLOT";
      showCompletion("Upgrade", `${track} +${job.targetLevel}`, "◆", "#f3cf70");
    },
    poll(
      techTree: { updateNotice: () => void },
      upgradeBench: { finishedUpgradeWaiting: (connected: boolean) => boolean },
    ) {
      techTree.updateNotice();
      inventoryNotice.set(upgradeBench.finishedUpgradeWaiting(Boolean(session()?.isConnected?.())));
    },
  };
}
