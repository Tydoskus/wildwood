import { recentReleaseNotes } from "../app/changelog";
import { GAME_VERSION, SEEN_VERSION_KEY } from "../game/runtime/game-settings";
import {
  createStartupAuthGate,
  loadDeferredGameBundle,
  type StartupAccountState,
  type StartupActionResult,
} from "./startup-auth-gate";
import { createStartupReleaseNotes } from "./startup-release-notes";

type StartupBootstrapDependencies = {
  restoreKnownAccount: () => Promise<void>;
  accountState: () => StartupAccountState;
  knownCharacter: () => string;
  signIn: () => Promise<StartupActionResult> | StartupActionResult;
  continueAsGuest: () => Promise<StartupActionResult> | StartupActionResult;
  legalConsentAccepted: () => boolean;
  acceptLegalTerms: (age: number) => Promise<StartupActionResult> | StartupActionResult;
  subscribe: (listener: () => void) => () => void;
};

/** Keeps the account/consent shell independent from the deferred game bundle. */
export function startStartupBootstrap(dependencies: StartupBootstrapDependencies) {
  const releaseNotes = createStartupReleaseNotes({
    version: GAME_VERSION,
    releases: () => recentReleaseNotes(2),
    seenVersion: () => { try { return localStorage.getItem(SEEN_VERSION_KEY) || ""; } catch { return ""; } },
    markSeen: () => { try { localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION); } catch {} },
  });
  createStartupAuthGate({
    ...dependencies,
    loadGame: () => loadDeferredGameBundle(),
    releaseNotes,
  }).start();

  void Promise.resolve().then(() => dependencies.restoreKnownAccount()).catch((error) => {
    console.error("Wildwood account startup failed:", error);
    const accountChoiceDetail = document.getElementById("accountChoiceDetail");
    const loadingDetail = document.getElementById("loadingDetail");
    if (accountChoiceDetail) accountChoiceDetail.textContent = "ACCOUNT STARTUP FAILED · REFRESH TO TRY AGAIN";
    if (loadingDetail) loadingDetail.textContent = "Account Startup Failed · Refresh to Try Again";
  });
}
