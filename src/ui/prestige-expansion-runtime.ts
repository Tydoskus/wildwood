import { createPrestigeExpansionNotice } from "./prestige-expansion-notice";
import { prestigeExpansionLabel } from "../../shared/prestige-expansion";
import { activeRelease } from "../../shared/release-window";
import { createPrestigePanel } from "./game-ui-runtime";
import { createPrestigeChallengePanel, installPrestigeTabs } from "./prestige-challenge-panel";
import { gameConfirm } from "./confirm-dialog";
import { challengeWinReached, reflectOnlyWinNotice } from "./prestige-challenge-win";
import { createAggroChallengePanel } from "./aggro-challenge-panel";
import { AGGRO_CHALLENGE_LIMIT, aggroPullCamps } from "../../shared/aggro-challenge";
import { prestigeCampaignTarget, prestigeEndlessRequirement } from "../../shared/prestige";

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
  let aggroPanel: ReturnType<typeof createAggroChallengePanel> | undefined;
  let lastAggro: { identity: string; active: boolean; completed: number } | null = null;
  // Each challenge locks the other while it runs, so a start or drop-out on
  // one card redraws both: the other card has no tick of its own while the
  // window is open, and kept saying "Finish Aggro first" after a drop-out.
  const both = async <T,>(action: Promise<T>) => {
    try { return await action; } finally { challengePanel?.render(); aggroPanel?.render(); }
  };
  /** An Aggro run's goal: the regular requirement of the player's next prestige. */
  const aggroGoal = () => {
    const next = (coop?.prestige?.()?.level ?? 0) + 1, endless = prestigeEndlessRequirement(next);
    const campaign = Boolean(coop?.prestigeCampaignComplete?.(next));
    return { label: campaign && endless > 0 ? `Clear Endless ${endless}` : `Defeat ${prestigeCampaignTarget(next).bossName}`,
      met: campaign && (coop?.proceduralCompleted?.() ?? 0) >= endless };
  };
  return {
    unlocked: notice.unlocked,
    tick() {
      const name = d.mapName();
      if (d.mapLabel.textContent !== name) d.mapLabel.textContent = name;
      notice.tick();
      challengePanel?.render();
      aggroPanel?.render();
      const aggro = coop?.aggroChallenge?.(), who = coop?.localIdentity?.() ?? "";
      if (aggro) {
        const next = { identity: who, active: Boolean(aggro.active), completed: aggro.completed ?? 0 };
        if (challengeWinReached(lastAggro, next)) void gameConfirm({ message: "Aggro complete!", details: [
          { label: "Pull aggroes", value: `${aggroPullCamps(next)} camps`, kind: "after" },
          { label: "Your saved run", value: "Restored" },
          { label: "Challenges won", value: `${next.completed}/${AGGRO_CHALLENGE_LIMIT}` },
        ], confirmLabel: "Nice!", cancelLabel: "" });
        lastAggro = next;
      }
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
        perks: () => coop?.storedPrestigePerks?.() ?? coop?.prestigePerks?.(), spendPerk: (perk: string) => coop?.spendPrestigePerkPoint?.(perk),
        unlocked: () => Boolean(coop?.prestigeCampaignComplete?.((coop?.prestige?.()?.level ?? 0) + 1)),
        completed: () => coop?.proceduralCompleted?.() ?? 0,
        challenge: () => Boolean(coop?.prestigeChallenge?.()?.active || coop?.aggroChallenge?.()?.active),
        challengesWon: () => coop?.prestigeChallenge?.()?.completed ?? 0,
        challengeGoal: () => {
          if (coop?.aggroChallenge?.()?.active) return { ...aggroGoal(), name: "Aggro", reward: "+1 Pull camp" };
          const state = coop?.prestigeChallenge?.(); return state?.active ? coop?.prestigeChallengeGoal?.(state.completed) ?? null : null;
        },
        respec: () => options.runPrestige(coop?.respecPrestigePerks),
        freeRespec: () => options.runPrestige(coop?.useFreePrestigeRespec),
        freeRespecAvailable: () => coop?.freeRespecAvailable?.() ?? false,
      });
      const doc = options.e.prestigePerks.ownerDocument as Document;
      installPrestigeTabs(doc);
      challengePanel = createPrestigeChallengePanel({ container: doc.getElementById("prestigeChallengeTab")!,
        state: () => coop?.prestigeChallenge?.() ?? { active: false, completed: 0 },
        locked: () => !notice.unlocked() ? "Unlocks when the prestige countdown ends"
          : (coop?.prestige?.()?.level ?? 0) < 1 ? "Prestige once to unlock"
          : coop?.aggroChallenge?.()?.active ? "Finish Aggro first" : null,
        start: () => both(options.runPrestige(coop?.startPrestigeChallenge)),
        abandon: () => both(options.runPrestige(coop?.abandonPrestigeChallenge)),
      });
      aggroPanel = createAggroChallengePanel({ container: doc.getElementById("prestigeChallengeTab")!,
        state: () => coop?.aggroChallenge?.() ?? { active: false, completed: 0 },
        locked: () => !notice.unlocked() ? "Unlocks when the prestige countdown ends"
          : (coop?.prestige?.()?.level ?? 0) < 1 ? "Prestige once to unlock"
          : coop?.prestigeChallenge?.()?.active ? "Finish Reflect Only first" : null,
        goal: () => aggroGoal().label,
        start: () => both(options.runPrestige(coop?.startAggroRun)),
        abandon: () => both(options.runPrestige(coop?.abandonAggroRun)),
      });
      return panel;
    },
  };
}
