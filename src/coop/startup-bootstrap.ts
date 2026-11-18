import { installAppUpdateNotice } from '../app/app-update-notice';
import { NATIVE_URGENT_CHECK_MIN_MS, requestNativeUpdateCheck, signalNativeBootReady } from '../app/native-updates';
import { recentReleaseNotes } from "../app/changelog";
import { AUDIO_UNSYNCED_KEY, MUSIC_VOLUME_KEY } from "../game/runtime/game-settings";
import {
  createStartupAuthGate,
  loadDeferredGameBundle,
  preloadDeferredGameBundle,
  requestDeferredGameAssets,
  type StartupAccountState,
  type StartupActionResult,
} from "./startup-auth-gate";
import { startStartupArtworkReveal } from "./startup-artwork-reveal";
import { createStartupInstallControl } from "./startup-install";
import { createStartupReleaseNotes } from "./startup-release-notes";
import { createStartupMusicToggle } from "./startup-music-toggle";
import type { StartupStageTimer } from "./services/startup-telemetry";

type StartupBootstrapDependencies = {
  restoreKnownAccount: () => Promise<void>;
  accountState: () => StartupAccountState;
  knownCharacter: () => string;
  signIn: () => Promise<StartupActionResult> | StartupActionResult;
  switchAccount?: () => Promise<StartupActionResult> | StartupActionResult;
  continueAsGuest: () => Promise<StartupActionResult> | StartupActionResult;
  subscribe: (listener: () => void) => () => void;
  beginTelemetryStage?: (stage: "game-bundle") => StartupStageTimer;
};

/** Keeps the account shell independent from the deferred game bundle. The game asks for the Terms once loaded. */
/** Whether game.js, as the bootstrap loaded it, is the script running: see game-script-gate.ts. */
export { runningAsGameScript } from "./game-script-gate";
export function startStartupBootstrap(dependencies: StartupBootstrapDependencies) {
  // Mount the Android OTA banner before game.js boots so players stranded on the start or
  // protocol-refusal screens still see Update Ready and can restart straight into the fix.
  installAppUpdateNotice();
  // First, before any account work: game.js and the game's first artwork start downloading.
  const gameDownload = preloadDeferredGameBundle();
  if (gameDownload) requestDeferredGameAssets();
  const artworkReveal = startStartupArtworkReveal();
  let gameBundleRequested = false;
  let protocolUpdateTimer: number | null = null;
  const clearProtocolUpdateTimer = () => {
    if (protocolUpdateTimer === null) return;
    window.clearInterval(protocolUpdateTimer);
    protocolUpdateTimer = null;
  };
  const syncProtocolUpdateCheck = () => {
    if (gameBundleRequested || !dependencies.accountState().updating) {
      clearProtocolUpdateTimer();
      return;
    }
    requestNativeUpdateCheck(true);
    if (protocolUpdateTimer === null) {
      protocolUpdateTimer = window.setInterval(() => {
        if (gameBundleRequested || !dependencies.accountState().updating) { clearProtocolUpdateTimer(); return; }
        requestNativeUpdateCheck(true);
      }, NATIVE_URGENT_CHECK_MIN_MS);
    }
  };
  const onOtaAvailable = () => { if (!gameBundleRequested && dependencies.accountState().updating) requestNativeUpdateCheck(true); };
  window.addEventListener("wildstat:ota-available", onOtaAvailable);
  const installControl = createStartupInstallControl();
  const musicToggle = createStartupMusicToggle({ storageKey: MUSIC_VOLUME_KEY, unsyncedKey: AUDIO_UNSYNCED_KEY });
  const releaseNotes = createStartupReleaseNotes({
    releases: () => recentReleaseNotes(2),
  });
  createStartupAuthGate({
    ...dependencies,
    subscribe(listener) {
      return dependencies.subscribe(() => {
        syncProtocolUpdateCheck();
        listener();
      });
    },
    loadGame: async () => {
      gameBundleRequested = true;
      clearProtocolUpdateTimer();
      window.removeEventListener("wildstat:ota-available", onOtaAvailable);
      window.dispatchEvent(new Event("wildstat:game-boot-start"));
      const telemetry = dependencies.beginTelemetryStage?.("game-bundle");
      try {
        await loadDeferredGameBundle();
        telemetry?.finish();
        artworkReveal.dispose();
        installControl.dispose();
        musicToggle.dispose();
      } catch (error) {
        window.dispatchEvent(new Event("wildstat:game-boot-failed"));
        telemetry?.finish("failure", "bundle-load-error");
        throw error;
      }
    },
    releaseNotes,
    gameDownload,
  }).start();
  // A usable sign-in shell is healthy even when offline; never gate OTA health on server login.
  requestAnimationFrame(() => signalNativeBootReady());

  void Promise.resolve()
    .then(() => dependencies.restoreKnownAccount())
    .catch((error) => {
      console.error("WildStat account startup failed:", error);
      const accountChoiceDetail = document.getElementById("accountChoiceDetail");
      const loadingDetail = document.getElementById("loadingDetail");
      if (accountChoiceDetail) accountChoiceDetail.textContent = "ACCOUNT STARTUP FAILED · REFRESH TO TRY AGAIN";
      if (loadingDetail) loadingDetail.textContent = "Account Startup Failed · Refresh to Try Again";
    })
    .finally(() => {
      // Safe to call again after restore; artwork starts during verification.
      if (!gameBundleRequested) artworkReveal.start();
    });
}
