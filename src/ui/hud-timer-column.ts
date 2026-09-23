import type { ActiveItemUpgrade } from "../wildstat-coop";
import type { ActiveResearch } from "./tech-tree-controller";
import type { createGameElements } from "./game-elements";
import { createHudProgressTimers } from "./hud-progress-timers";
import { createRewardedRespawnAdController } from "./rewarded-respawn-ad-controller";

type Elements = ReturnType<typeof createGameElements>;
type Dependencies = {
  getNativeBridge: () => unknown;
  isSupporter: () => boolean;
  grantBoost: () => boolean;
  toggleBoost: () => boolean;
  isBoostEnabled: () => boolean;
  boostRemainingMs: () => number;
  setPromptActive: (active: boolean) => void;
  setAdPlaybackActive: (active: boolean) => void;
  showMessage: (text: string, color?: string) => void;
  connected: () => boolean;
  research: () => ActiveResearch | null;
  upgrades: () => ActiveItemUpgrade[];
};

/** The countdowns and reward entry share one column below the minimap. */
export function createHudTimerColumn(elements: Elements, dependencies: Dependencies) {
  const column = document.createElement("div");
  column.className = "hud-timer-column";
  const timer = (kind: "tech" | "slot", label: string) => {
    const element = document.createElement("div");
    element.className = `hud-progress-timer hud-progress-timer-${kind}`;
    element.setAttribute("role", "timer");
    element.textContent = `${label} 0:00`;
    element.hidden = true;
    return element;
  };
  const researchTimer = timer("tech", "TECH");
  const slotOneTimer = timer("slot", "SLOT 1");
  const slotTwoTimer = timer("slot", "SLOT 2");
  elements.enemyRespawnAdBtn.before(column);
  column.append(researchTimer, slotOneTimer, slotTwoTimer, elements.enemyRespawnBoostStatus, elements.enemyRespawnAdBtn);

  const rewardedRespawnAd = createRewardedRespawnAdController({
    button: elements.enemyRespawnAdBtn,
    status: elements.enemyRespawnAdStatus,
    bankButton: elements.enemyRespawnBoostStatus,
    bankTimer: elements.enemyRespawnBoostTimer,
    prompt: elements.enemyRespawnAdPrompt,
    confirmButton: elements.enemyRespawnAdConfirm,
    cancelButton: elements.enemyRespawnAdCancel,
    browserAd: elements.browserRewardedAd,
    browserAdTimer: elements.browserRewardedAdTimer,
  }, dependencies);
  rewardedRespawnAd.init();

  const timers = createHudProgressTimers({
    research: researchTimer,
    slotOne: slotOneTimer,
    slotTwo: slotTwoTimer,
  }, dependencies);
  window.setInterval(timers.tick, 1_000);
  document.addEventListener("visibilitychange", timers.tick);
  return rewardedRespawnAd;
}
