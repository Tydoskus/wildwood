import { recentReleaseNotes } from "../app/changelog";
import { MUSIC_VOLUME_KEY } from "../game/runtime/game-settings";
import {
  createStartupAuthGate,
  loadDeferredGameBundle,
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
  continueAsGuest: () => Promise<StartupActionResult> | StartupActionResult;
  legalConsentAccepted: () => boolean;
  acceptLegalTerms: (age: number) => Promise<StartupActionResult> | StartupActionResult;
  subscribe: (listener: () => void) => () => void;
  beginTelemetryStage?: (stage: "game-bundle") => StartupStageTimer;
};

/** Keeps the account/consent shell independent from the deferred game bundle. */
export function startStartupBootstrap(dependencies: StartupBootstrapDependencies) {
  const artworkReveal = startStartupArtworkReveal();
  let gameBundleRequested = false;
  const installControl = createStartupInstallControl();
  const musicToggle = createStartupMusicToggle({ storageKey: MUSIC_VOLUME_KEY });
  const releaseNotes = createStartupReleaseNotes({
    releases: () => recentReleaseNotes(2),
  });
  createStartupAuthGate({
    ...dependencies,
    loadGame: async () => {
      gameBundleRequested = true;
      const telemetry = dependencies.beginTelemetryStage?.("game-bundle");
      try {
        await loadDeferredGameBundle();
        telemetry?.finish();
        artworkReveal.dispose();
        installControl.dispose();
        musicToggle.dispose();
      } catch (error) {
        telemetry?.finish("failure", "bundle-load-error");
        throw error;
      }
    },
    releaseNotes,
  }).start();

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
      // Safe to call again after restore; artwork now starts during verification.
      if (!gameBundleRequested) artworkReveal.start();
    });
}
