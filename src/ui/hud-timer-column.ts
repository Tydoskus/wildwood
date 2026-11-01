import type { ActiveItemUpgrade } from "../wildstat-coop";
import type { ActiveResearch } from "./tech-tree-controller";
import type { createGameElements } from "./game-elements";
import { createHudProgressTimers } from "./hud-progress-timers";
import { installHudProgressSettings } from "./hud-progress-settings";
import { installHudReminders } from "./hud-reminders";
import { createRewardedGemAdController } from "./rewarded-gem-ad-controller";
import type { AdGemRewardRecord } from "../../shared/ad-gem-reward";
import type { RunRecord } from "../../shared/run-timing";
import { runTimerText, type LiveRunTiming } from "./prestige-runs-tab";
import { setHidden, setText } from "./dom-write";

type Elements = ReturnType<typeof createGameElements>;
type Dependencies = {
  getNativeBridge: () => unknown;
  isSupporter: () => boolean;
  adGemReward: () => AdGemRewardRecord | null;
  claimAdGems: () => Promise<{ ok: boolean; error?: string }>;
  startAdGems?: () => Promise<{ ok: boolean; error?: string }>;
  showGemReward: (amount: number) => void;
  setPromptActive: (active: boolean) => void;
  setAdPlaybackActive: (active: boolean) => void;
  showMessage: (text: string, color?: string) => void;
  connected: () => boolean;
  research: () => ActiveResearch | null;
  upgrades: () => ActiveItemUpgrade[];
  inTown: () => boolean;
  goToResearch?: () => boolean;
  runTiming?: () => LiveRunTiming;
  runHistory?: () => readonly RunRecord[];
};

/** The countdowns and reward entry share one column below the minimap. */
export function createHudTimerColumn(elements: Elements, dependencies: Dependencies) {
  const column = document.createElement("div");
  column.className = "hud-timer-column";
  const timer = (kind: "tech" | "slot" | "run", label: string) => {
    const element = document.createElement("div");
    element.className = `hud-progress-timer hud-progress-timer-${kind}`;
    element.setAttribute("role", "timer");
    element.textContent = `${label} 0:00`;
    element.hidden = true;
    return element;
  };
  const researchTimer = timer("tech", "Tech");
  const slotOneTimer = timer("slot", "Queue 1");
  const slotTwoTimer = timer("slot", "Queue 2");
  const slotThreeTimer = timer("slot", "Queue 3");
  const runTimer = timer("run", "Run");
  // In the minimap's stack, under the map name, players online and version, so a
  // longer map name pushes the timers down instead of drawing over them.
  const meta = document.querySelector(".minimap-meta");
  if (meta) meta.append(column); else elements.enemyRespawnAdBtn.before(column);
  column.append(runTimer, researchTimer, slotOneTimer, slotTwoTimer, slotThreeTimer, elements.enemyRespawnAdBtn);

  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* Continue with session choices. */ }
  // Installed before the ad button, which reads its timer setting on its first render.
  const settings = installHudProgressSettings(elements.settingsPanel, () => { timers.tick(); tickRun(); rewardedGemAd.sync(); }, storage);
  const reminders = installHudReminders({ column, before: elements.enemyRespawnAdBtn, townButton: elements.townButton, settingsPanel: elements.settingsPanel, inTown: dependencies.inTown,
    goToResearch: dependencies.goToResearch, storage });
  const rewardedGemAd = createRewardedGemAdController({
    button: elements.enemyRespawnAdBtn,
    status: elements.enemyRespawnAdStatus,
    countdown: elements.enemyRespawnAdCountdown,
    prompt: elements.enemyRespawnAdPrompt,
    confirmButton: elements.enemyRespawnAdConfirm,
    cancelButton: elements.enemyRespawnAdCancel,
    browserAd: elements.browserRewardedAd,
    browserAdTimer: elements.browserRewardedAdTimer,
  }, { ...dependencies, showWaitTimer: () => settings.visible("adTimer") });
  rewardedGemAd.init();

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
  const tickRun = () => {
    const text = settings.visible("run") && dependencies.connected() ? runTimerText(dependencies.runTiming?.(), dependencies.runHistory?.() ?? []) : null;
    setHidden(runTimer, text === null);
    if (text !== null) setText(runTimer, text);
  };
  // The ad's wait counts down on the same second; it does nothing while hidden.
  window.setInterval(() => { if (!document.hidden) { timers.tick(); tickRun(); rewardedGemAd.sync(); reminders.refresh(); } }, 1_000);
  document.addEventListener("visibilitychange", () => { timers.tick(); tickRun(); rewardedGemAd.sync(); });
  return rewardedGemAd;
}
