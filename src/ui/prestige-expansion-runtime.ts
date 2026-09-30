import { createPrestigeExpansionNotice } from "./prestige-expansion-notice";
import { prestigeExpansionLabel } from "../../shared/prestige-expansion";
import { activeRelease } from "../../shared/release-window";
import { createPrestigePanel } from "./game-ui-runtime";

/** Compose the shared launch notice, map label and account prestige controls. */
export function createPrestigeExpansionRuntime(d: {
  coop: any; started: () => boolean; mapName: () => string; mapLabel: HTMLElement;
}) {
  const { coop } = d;
  const now = () => coop?.serverNowMs?.() ?? Date.now();
  const unlocksAt = () => coop?.prestigeExpansionUnlocksAt?.();
  const notice = createPrestigeExpansionNotice({ unlocksAt, now,
    visible: () => d.started() && !activeRelease(coop?.releaseWindow?.() ?? null, now()) });
  return {
    unlocked: notice.unlocked,
    tick() {
      const name = d.mapName();
      if (d.mapLabel.textContent !== name) d.mapLabel.textContent = name;
      notice.tick();
    },
    createPanel(options: Record<string, any>) {
      return createPrestigePanel({ ...options,
        prestige: () => coop?.prestige?.() ?? null, expanded: notice.unlocked,
        expansionCountdown: () => unlocksAt() ? prestigeExpansionLabel(unlocksAt(), now()) : "",
        perks: () => coop?.prestigePerks?.(), spendPerk: (perk: string) => coop?.spendPrestigePerkPoint?.(perk),
        unlocked: () => Boolean(coop?.prestigeCampaignComplete?.((coop?.prestige?.()?.level ?? 0) + 1)),
        completed: () => coop?.proceduralCompleted?.() ?? 0,
        respec: () => options.runPrestige(coop?.respecPrestigePerks),
      });
    },
  };
}
