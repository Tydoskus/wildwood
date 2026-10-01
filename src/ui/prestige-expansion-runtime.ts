import { createPrestigeExpansionNotice } from "./prestige-expansion-notice";
import { prestigeExpansionLabel } from "../../shared/prestige-expansion";
import { activeRelease } from "../../shared/release-window";
import { createPrestigePanel } from "./game-ui-runtime";
import { createPrestigeChallengePanel, installPrestigeTabs } from "./prestige-challenge-panel";
import { gameConfirm } from "./confirm-dialog";
import { challengeWinReached, reflectOnlyWinNotice } from "./prestige-challenge-win";

/** Compose the shared launch notice, map label and account prestige controls. */
export function createPrestigeExpansionRuntime(d: {
  coop: any; started: () => boolean; mapName: () => string; mapLabel: HTMLElement;
}) {
  const { coop } = d;
  const now = () => coop?.serverNowMs?.() ?? Date.now();
  const unlocksAt = () => coop?.prestigeExpansionUnlocksAt?.();
  const notice = createPrestigeExpansionNotice({ unlocksAt, now,
    visible: () => d.started() && !activeRelease(coop?.releaseWindow?.() ?? null, now()) });
  let challengePanel: ReturnType<typeof createPrestigeChallengePanel> | undefined;
  let lastChallenge: { identity: string; active: boolean; completed: number } | null = null;
  return {
    unlocked: notice.unlocked,
    tick() {
      const name = d.mapName();
      if (d.mapLabel.textContent !== name) d.mapLabel.textContent = name;
      notice.tick();
      challengePanel?.render();
      // The server ends a Reflect Only run the moment its goal is met; this is where the player hears of it.
      const state = coop?.prestigeChallenge?.(), identity = coop?.localIdentity?.() ?? "";
      if (state) {
        const next = { identity, active: Boolean(state.active), completed: state.completed ?? 0 };
        if (challengeWinReached(lastChallenge, next)) void gameConfirm(reflectOnlyWinNotice(next.completed));
        lastChallenge = next;
      }
    },
    createPanel(options: Record<string, any>) {
      const panel = createPrestigePanel({ ...options,
        prestige: () => coop?.prestige?.() ?? null, expanded: notice.unlocked,
        expansionCountdown: () => unlocksAt() ? prestigeExpansionLabel(unlocksAt(), now()) : "",
        perks: () => coop?.prestigePerks?.(), spendPerk: (perk: string) => coop?.spendPrestigePerkPoint?.(perk),
        unlocked: () => Boolean(coop?.prestigeCampaignComplete?.((coop?.prestige?.()?.level ?? 0) + 1)),
        completed: () => coop?.proceduralCompleted?.() ?? 0,
        challenge: () => coop?.prestigeChallenge?.()?.active ?? false,
        challengesWon: () => coop?.prestigeChallenge?.()?.completed ?? 0,
        challengeGoal: () => { const state = coop?.prestigeChallenge?.(); return state?.active ? coop?.prestigeChallengeGoal?.(state.completed) ?? null : null; },
        respec: () => options.runPrestige(coop?.respecPrestigePerks),
        freeRespec: () => options.runPrestige(coop?.useFreePrestigeRespec),
        freeRespecAvailable: () => coop?.freeRespecAvailable?.() ?? false,
      });
      const doc = options.e.prestigePerks.ownerDocument as Document;
      installPrestigeTabs(doc);
      challengePanel = createPrestigeChallengePanel({ container: doc.getElementById("prestigeChallengeTab")!,
        state: () => coop?.prestigeChallenge?.() ?? { active: false, completed: 0 },
        locked: () => !notice.unlocked() ? "Unlocks when the prestige countdown ends"
          : (coop?.prestige?.()?.level ?? 0) > 0 ? null : "Prestige once to unlock",
        start: () => options.runPrestige(coop?.startPrestigeChallenge),
        abandon: () => options.runPrestige(coop?.abandonPrestigeChallenge),
      });
      return panel;
    },
  };
}
