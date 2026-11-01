import { nativeBridgeForRuntime } from "../app/native-ads";
import type { CoopAccess } from "../game/runtime/coop-access";
import type { createDuelSessionController } from "../game/runtime/duel/duel-session-controller";
import type { createMapMusicController } from "../game/runtime/audio";
import type { PlayerCombatController } from "../game/runtime/player-combat-controller";
import type { createPlayerIdentityRenderer } from "../game/runtime/render/player-identity-renderer";
import type { PlayerState } from "../game/runtime/types";
import type { createAppShellController } from "./app-shell-controller";
import type { createGameElements } from "./game-elements";
import { createGameMailbox } from "./game-mailbox";
import { createGameRuntimeHud } from "./game-ui-runtime";
import { createHudTimerColumn } from "./hud-timer-column";
import { createItemGiftController } from "./item-gift-controller";
import { installServerBoostHud } from "./server-boost-hud";
import { installMysteriousOreTimer } from "./mysterious-ore-timer";

type GameElements = ReturnType<typeof createGameElements>;
type IdentityRenderer = ReturnType<typeof createPlayerIdentityRenderer>;

export type HudRuntimeDeps = {
  coop: CoopAccess;
  e: GameElements;
  player: PlayerState;
  duelSession: Pick<ReturnType<typeof createDuelSessionController>, "activeDuel" | "duelOpponentName">;
  applyProfileIcon: IdentityRenderer["applyProfileIcon"];
  playerPower: IdentityRenderer["playerPower"];
  playerShield: () => ReturnType<PlayerCombatController["cardShield"]> | undefined;
  setDeveloperAccess: (developer: boolean) => void;
  applyVitalityResearch: () => void;
  techTree: { updateNotice: () => void; tick: (now: number) => void };
  appShell: ReturnType<typeof createAppShellController>;
  updateProfileDuelButton: () => void;
  mapMusic: ReturnType<typeof createMapMusicController>;
  setGameplayPause: (reason: string, active: boolean) => void;
  inTown: () => boolean;
  /** Research Ready's tap (town-runtimes.ts). */
  goToResearch?: () => boolean;
  showMessage: (text: string, color?: string) => void;
};

/** The play screen's HUD, and the column of research and upgrade timers (and the Server Boost's) that also offers the rewarded ad. */
export function createHudRuntime(deps: HudRuntimeDeps) {
  const { coop, e, appShell } = deps;
  const client = coop.client;
  const runtimeHud = createGameRuntimeHud({
    e, coop: client, player: deps.player,
    activeDuel: deps.duelSession.activeDuel, duelOpponentName: deps.duelSession.duelOpponentName,
    applyProfileIcon: deps.applyProfileIcon, playerPower: deps.playerPower, playerShield: deps.playerShield,
    setDeveloperAccess: deps.setDeveloperAccess, applyVitalityResearch: deps.applyVitalityResearch,
    updateTechNotice: deps.techTree.updateNotice, tickTechTree: deps.techTree.tick,
    refreshAppStatus: appShell.refreshStatus, updateProfileDuelButton: deps.updateProfileDuelButton,
  });

  const rewardedRespawnAd = createHudTimerColumn(e, {
    getNativeBridge: () => nativeBridgeForRuntime(window),
    isSupporter: () => (client?.supporterTier?.() ?? "none") !== "none",
    adGemReward: () => client?.adGemReward?.() ?? null,
    claimAdGems: () => client?.claimAdGems?.() ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" }),
    startAdGems: () => client?.startAdGems?.() ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" }),
    showGemReward: amount => runtimeHud.showGemDrop(amount, "Ad reward"),
    setPromptActive: () => {},
    setAdPlaybackActive: active => {
      deps.setGameplayPause("rewarded-ad", active);
      if (active) deps.mapMusic.pause();
      else appShell.ensureMusicPlaying();
    },
    showMessage: deps.showMessage,
    connected: coop.connected,
    research: () => client?.activeResearch?.() ?? null,
    upgrades: () => client?.activeItemUpgrades?.() ?? [],
    inTown: deps.inTown,
    goToResearch: deps.goToResearch,
    runTiming: () => client?.runTiming?.(),
    runHistory: () => client?.runHistory?.() ?? [],
  });
  installServerBoostHud(() => client?.serverBoost?.()?.remainingMs ?? 0);
  installMysteriousOreTimer({ source: () => client, connected: coop.connected });

  return { runtimeHud, rewardedRespawnAd };
}

export type GiftsAndMailDeps = {
  coop: CoopAccess;
  e: GameElements;
  /** Whether the player is in the world, past the tutorial. */
  playing: () => boolean;
  guildPanel: () => { close: () => void } | undefined;
  showMessage: (text: string, color?: string) => void;
};

/** The mailbox button and the developer's item gifts, which wait until the player is in the world. */
export function createGiftsAndMail(deps: GiftsAndMailDeps) {
  const { coop, e } = deps;
  const client = coop.client;
  const mailbox = createGameMailbox(e.mailboxToggle, e.minimapVersionEl, client, deps.playing);
  const itemGift = createItemGiftController({
    canShow: () => deps.playing() && coop.connected() && !client?.sessionConflict?.(),
    identity: coop.identity,
    gift: () => client?.pendingItemGift?.() ?? null,
    claim: async key => client?.claimItemGift?.(key),
    setPaused: paused => { if (paused) deps.guildPanel()?.close(); },
    showMessage: deps.showMessage,
    afterDismiss: () => refresh(),
  });

  /** Rechecks for a waiting gift and for new mail. */
  function refresh() {
    itemGift.refresh();
    mailbox.refresh();
  }

  return { mailbox, refresh };
}
