import { createPrestigePanel } from "./game-ui-runtime";
import { createPrestigeChallengePanel, installPrestigeTabs } from "./prestige-challenge-panel";
import { createPrestigeRunsTab } from "./prestige-runs-tab";
import { gameConfirm } from "./confirm-dialog";
import { challengeWinReached, reflectOnlyWinNotice } from "./prestige-challenge-win";
import { createAggroChallengePanel } from "./aggro-challenge-panel";
import { readAggroPicks, writeAggroPicks } from "../game/runtime/auto-farm/aggro-picks";
import { AGGRO_CHALLENGE_LIMIT, aggroGoal, aggroPullCamps } from "../../shared/aggro-challenge";

/** Compose the map label and account prestige controls. Prestige past 20 and the newer perks are open to everyone. */
export function createPrestigeExpansionRuntime(d: {
  coop: any; mapName: () => string; mapLabel: HTMLElement;
}) {
  const { coop } = d;
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
  /** An Aggro run's goal, the same for every run and player: a first prestige's (shared/aggro-challenge.ts). */
  const aggroRunGoal = () => ({ label: aggroGoal().label, met: Boolean(coop?.prestigeCampaignComplete?.(1)) });
  return {
    unlocked: () => true,
    tick() {
      const name = d.mapName();
      if (d.mapLabel.textContent !== name) d.mapLabel.textContent = name;
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
        prestige: () => coop?.prestige?.() ?? null, expanded: () => true,
        perks: () => coop?.storedPrestigePerks?.() ?? coop?.prestigePerks?.(), spendPerk: (perk: string) => coop?.spendPrestigePerkPoint?.(perk),
        unlocked: () => Boolean(coop?.prestigeCampaignComplete?.((coop?.prestige?.()?.level ?? 0) + 1)),
        completed: () => coop?.proceduralCompleted?.() ?? 0,
        challenge: () => Boolean(coop?.prestigeChallenge?.()?.active || coop?.aggroChallenge?.()?.active),
        challengesWon: () => coop?.prestigeChallenge?.()?.completed ?? 0,
        challengeGoal: () => {
          if (coop?.aggroChallenge?.()?.active) return { ...aggroRunGoal(), name: "Aggro", reward: "+1 Pull camp" };
          const state = coop?.prestigeChallenge?.(); return state?.active ? coop?.prestigeChallengeGoal?.(state.completed) ?? null : null;
        },
        respec: () => options.runPrestige(coop?.respecPrestigePerks),
      });
      const doc = options.e.prestigePerks.ownerDocument as Document;
      installPrestigeTabs(doc);
      createPrestigeRunsTab({ container: doc.getElementById("prestigeRunsTab")!,
        timing: () => coop?.runTiming?.() ?? null, history: () => coop?.runHistory?.() ?? [] });
      challengePanel = createPrestigeChallengePanel({ container: doc.getElementById("prestigeChallengeTab")!,
        state: () => coop?.prestigeChallenge?.() ?? { active: false, completed: 0 },
        locked: () => (coop?.prestige?.()?.level ?? 0) < 1 ? "Prestige once to unlock"
          : coop?.aggroChallenge?.()?.active ? "Finish Aggro first" : null,
        start: () => both(options.runPrestige(coop?.startPrestigeChallenge)),
        abandon: () => both(options.runPrestige(coop?.abandonPrestigeChallenge)),
      });
      aggroPanel = createAggroChallengePanel({ container: doc.getElementById("prestigeChallengeTab")!,
        state: () => coop?.aggroChallenge?.() ?? { active: false, completed: 0 },
        locked: () => (coop?.prestige?.()?.level ?? 0) < 1 ? "Prestige once to unlock"
          : coop?.prestigeChallenge?.()?.active ? "Finish Reflect Only first" : null,
        goal: () => aggroGoal().label,
        picks: () => readAggroPicks(coop?.localIdentity?.()),
        setPicks: picks => writeAggroPicks(coop?.localIdentity?.(), picks),
        start: () => both(options.runPrestige(coop?.startAggroRun)),
        abandon: () => both(options.runPrestige(coop?.abandonAggroRun)),
      });
      return panel;
    },
  };
}
