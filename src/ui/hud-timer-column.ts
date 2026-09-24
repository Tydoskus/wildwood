import type { ActiveItemUpgrade } from "../wildstat-coop";
import type { ActiveResearch } from "./tech-tree-controller";
import type { createGameElements } from "./game-elements";
import { createHudProgressTimers } from "./hud-progress-timers";
import { installHudProgressSettings } from "./hud-progress-settings";
import { createRewardedGemAdController } from "./rewarded-gem-ad-controller";
import type { AdGemRewardRecord } from "../../shared/ad-gem-reward";

type Elements = ReturnType<typeof createGameElements>;
type Dependencies = {
  getNativeBridge: () => unknown;
  isSupporter: () => boolean;
  adGemReward: () => AdGemRewardRecord | null;
  claimAdGems: () => Promise<{ ok: boolean; error?: string }>;
  showGemReward: (amount: number) => void;
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
  const researchTimer = timer("tech", "Tech");
  const slotOneTimer = timer("slot", "Slot 1");
  const slotTwoTimer = timer("slot", "Slot 2");
  const slotThreeTimer = timer("slot", "Slot 3");
  elements.enemyRespawnAdBtn.before(column);
  column.append(researchTimer, slotOneTimer, slotTwoTimer, slotThreeTimer, elements.enemyRespawnAdBtn);

  const rewardedGemAd = createRewardedGemAdController({
    button: elements.enemyRespawnAdBtn,
    status: elements.enemyRespawnAdStatus,
    countdown: elements.enemyRespawnAdCountdown,
    prompt: elements.enemyRespawnAdPrompt,
    confirmButton: elements.enemyRespawnAdConfirm,
    cancelButton: elements.enemyRespawnAdCancel,
    browserAd: elements.browserRewardedAd,
    browserAdTimer: elements.browserRewardedAdTimer,
  }, dependencies);
  rewardedGemAd.init();

  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* Continue with session choices. */ }
  const settings = installHudProgressSettings(elements.settingsPanel, () => timers.tick(), storage);
  const timers = createHudProgressTimers({
    research: researchTimer,
    slotOne: slotOneTimer,
    slotTwo: slotTwoTimer,
    slotThree: slotThreeTimer,
  }, { ...dependencies, visible: () => ({
    research: settings.visible("research"),
    slotOne: settings.visible("slotOne"),
    slotTwo: settings.visible("slotTwo"),
    slotThree: settings.visible("slotThree"),
  }) });
  // The ad's wait counts down on the same second; it does nothing while hidden.
  window.setInterval(() => { timers.tick(); rewardedGemAd.sync(); }, 1_000);
  document.addEventListener("visibilitychange", () => { timers.tick(); rewardedGemAd.sync(); });
  return rewardedGemAd;
}
