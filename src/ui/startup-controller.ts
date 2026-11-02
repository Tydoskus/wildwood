import { requiredElement } from "../game/runtime/dom";
import { appendPlayerGenderIcon } from "../game/player-gender-icon";
import type { PlayerGender } from "../../shared/player-gender";
import { createLegalGateController } from "./legal-gate";
import { createLoadingProgress } from "./loading-progress";

type AccountState = {
  signedIn?: boolean;
  authInProgress?: boolean;
  returningFromSignIn?: boolean;
  signInRequired?: boolean;
  /** Registration needs no connection; only a saved guest waits for the server (account-service). */
  signInReady?: boolean;
  knownAccount?: boolean;
  /** A guest started from nothing on this page, before the Terms: the window offers Sign In. */
  newVisitor?: boolean;
  notice?: string;
  connectionIssue?: { message: string } | null;
};

type LoadingStage = readonly [label: string, ready: boolean, percent: number];

type LoadingSequenceState =
  | { value: "loading"; stage: number; shownAt: number | null }
  | { value: "complete" };

export function loadingDescriptionCase(value: string) {
  if (!value || value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/[a-z]+(?:-[a-z]+)*/g, (word) =>
    word.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("-"),
  );
}

type StartupDependencies = {
  accountState: () => AccountState | undefined;
  connected: () => boolean;
  knownCharacter: () => string;
  knownCharacterGender: () => PlayerGender;
  defaultPlayerName: () => string;
  getLoadingStages: () => LoadingStage[];
  onLoadingComplete: () => void;
  onShowAccountChoice: () => void;
  acceptLegalTerms: () => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  ageBlocked?: () => boolean;
  onLegalAccepted: () => void;
  onContinueGuest: () => Promise<{ ok?: boolean; error?: string } | undefined> | { ok?: boolean; error?: string } | undefined;
  onBeginAdventure: (name: string) => void;
  signIn: () => Promise<{ ok?: boolean; redirecting?: boolean } | undefined> | undefined;
  /** Use Another Account: ends the provider session, then asks which account. */
  switchAccount?: () => Promise<{ ok?: boolean; redirecting?: boolean } | undefined> | undefined;
  takeOverSession: () => Promise<{ ok?: boolean } | undefined> | undefined;
  onAccountActionStarted: (action: "sign-in" | "guest" | "takeover", detail: string) => void;
  onAccountActionCompleted: () => void;
  onAccountActionFailed: (detail: string) => void;
  onRetryConnection: () => void;
  showMessage: (message: string, color: string) => void;
};

/** Startup, account choice, sign-in, session conflict, and new-player UI flow. */
export function createStartupController(dependencies: StartupDependencies) {
  const start = requiredElement("start");
  const connectionPanel = requiredElement("connectionPanel");
  const sessionTakeoverButton = requiredElement<HTMLButtonElement>("sessionTakeoverBtn");
  const sessionTakeoverNote = requiredElement("sessionTakeoverNote");
  const loadingDetail = requiredElement("loadingDetail");
  const loadingFill = requiredElement("loadingFill");
  const connectionRetryButton = requiredElement<HTMLButtonElement>("connectionRetryBtn");
  const accountChoicePanel = requiredElement("accountChoicePanel");
  const accountChoiceDetail = requiredElement("accountChoiceDetail");
  const accountCharacter = requiredElement("accountCharacter");
  const accountCharacterName = requiredElement("accountCharacterName");
  const signInButton = requiredElement<HTMLButtonElement>("signInFromStartBtn");
  const guestButton = requiredElement<HTMLButtonElement>("continueGuestBtn");
  const switchAccountButton = document.getElementById("useAnotherAccountBtn") as HTMLButtonElement | null;
  const newPlayerPanel = requiredElement("newPlayerPanel");
  const playerNameInput = requiredElement<HTMLInputElement>("newPlayerNameInput");
  const beginAdventureButton = requiredElement("beginAdventureBtn");
  const consentSignInButton = document.getElementById("consentSignInBtn") as HTMLButtonElement | null;
  const progress = createLoadingProgress(loadingFill);

  // Long enough to read a label that flashes past, short enough not to be the wait itself.
  const stageDurationMs = 80;
  let loadingSequence: LoadingSequenceState = { value: "loading", stage: 0, shownAt: null };
  let stageTimer: number | null = null;

  function pauseLoading() {
    if (stageTimer !== null) window.clearTimeout(stageTimer);
    stageTimer = null;
    progress.stop();
    if (loadingSequence.value === "loading") loadingSequence.shownAt = null;
  }
  const legalGate = createLegalGateController({
    accept: dependencies.acceptLegalTerms,
    onAccepted: () => {
      if (consentSignInButton) consentSignInButton.hidden = true;
      dependencies.onLegalAccepted();
    },
    askAge: false,
    blocked: () => dependencies.ageBlocked?.() === true,
    keepOpen: true,
  });
  /** The Terms window, once open, stays over the loaded screen until the game or another screen replaces it. */
  let termsOpen = false;
  function hideTerms() {
    termsOpen = false;
    legalGate.hide();
  }

  function showConnecting() {
    pauseLoading();
    progress.set(0);
    loadingSequence = { value: "loading", stage: 0, shownAt: null };
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    hideTerms();
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverButton.disabled = false;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
    connectionRetryButton.disabled = false;
    refreshLoading();
  }

  function showSessionConflict() {
    pauseLoading();
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    hideTerms();
    newPlayerPanel.hidden = true;
    loadingDetail.textContent = loadingDescriptionCase(dependencies.accountState()?.notice || "Logged In on Another Tab");
    progress.set(100);
    sessionTakeoverButton.hidden = false;
    sessionTakeoverNote.hidden = false;
    connectionRetryButton.hidden = true;
  }

  function showAccountChoice(detailOverride = "", actionPending = false) {
    pauseLoading();
    const account = dependencies.accountState();
    accountChoicePanel.classList.remove("is-signing-in");
    // Without a guest save no connection is ever made, so REGISTER must not wait for one.
    const accountOptionsReady = dependencies.connected() || Boolean(account?.signInRequired) || account?.signInReady === true;
    const knownAccount = Boolean(account?.knownAccount);
    const name = dependencies.knownCharacter().trim();
    const characterFound = Boolean(name);
    accountCharacterName.textContent = characterFound ? name : "none";
    if (characterFound) appendPlayerGenderIcon(accountCharacterName, dependencies.knownCharacterGender());
    accountCharacter.classList.toggle("is-empty", !characterFound);
    signInButton.hidden = false;
    // A known character: one Sign In, with Play as Guest as the small way out.
    accountChoicePanel.classList.toggle("is-sign-in", characterFound || knownAccount);
    signInButton.textContent = characterFound || knownAccount ? "Sign In" : "Register";
    signInButton.disabled = actionPending || !accountOptionsReady;
    guestButton.hidden = false;
    guestButton.disabled = actionPending;
    // Whenever a character is offered: Sign In reuses whoever the browser last signed in as.
    if (switchAccountButton) {
      switchAccountButton.hidden = !(characterFound || knownAccount) || !dependencies.switchAccount;
      switchAccountButton.disabled = actionPending || !accountOptionsReady;
    }
    accountChoiceDetail.textContent = detailOverride || (actionPending
      ? "OPENING SIGN-IN…"
      : !accountOptionsReady
        ? "CONNECTING ACCOUNT OPTIONS…"
        : characterFound
          ? "SIGN IN TO THIS CHARACTER"
          : knownAccount
            ? "SIGN IN TO LOAD YOUR CHARACTER"
            : "REGISTER OR PLAY AS GUEST");
    start.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = false;
    hideTerms();
    newPlayerPanel.hidden = true;
    connectionRetryButton.hidden = true;
    dependencies.onShowAccountChoice();
  }

  function showAccountAction(action: "sign-in" | "guest" | "takeover", detail: string) {
    if (action === "sign-in" && termsOpen) {
      // Sign In from the Terms window: its progress shows there.
      legalGate.notice(loadingDescriptionCase(detail));
      if (consentSignInButton) consentSignInButton.disabled = true;
      return;
    }
    if (action === "takeover") {
      showConnecting();
      loadingDetail.textContent = detail;
      return;
    }
    showAccountChoice(detail, true);
  }

  /** Switch an authenticated account back to progress loading without restarting its timer sequence. */
  function showLoading() {
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    // Accepted and starting, or a failed start to retry: the window stays until the game replaces it.
    if (!termsOpen) hideTerms();
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
    refreshLoading();
  }

  function refreshLoading() {
    if (loadingSequence.value === "complete" || connectionPanel.hidden || start.style.display === "none") return;
    connectionRetryButton.hidden = true;
    const stages = dependencies.getLoadingStages();
    const state = loadingSequence;
    state.shownAt ??= performance.now();
    const [label, ready, percent] = stages[state.stage] ?? ["Starting WildStat", true, 100];
    loadingDetail.textContent = label;
    // What the earlier stages finished is shown; this one creeps until it is done too.
    progress.advance(stages[state.stage - 1]?.[2] ?? 0, percent);
    if (!ready || stageTimer !== null) return;
    // Real work proceeds normally; only the visible presentation is paced.
    const timer = window.setTimeout(() => {
      if (stageTimer !== timer || loadingSequence !== state) return;
      stageTimer = null;
      const currentStages = dependencies.getLoadingStages();
      if (!(currentStages[state.stage]?.[1] ?? true)) return;
      if (state.stage < currentStages.length - 1) {
        loadingSequence = { value: "loading", stage: state.stage + 1, shownAt: null };
        refreshLoading();
      } else {
        loadingSequence = { value: "complete" };
        progress.set(100);
        dependencies.onLoadingComplete();
      }
    }, Math.max(0, stageDurationMs - (performance.now() - state.shownAt)));
    stageTimer = timer;
  }

  function showConnectionFailure(message: string) {
    pauseLoading();
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    hideTerms();
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    loadingDetail.textContent = loadingDescriptionCase(message);
    connectionRetryButton.hidden = false;
    connectionRetryButton.disabled = false;
  }

  function showNewPlayerIntro() {
    pauseLoading();
    accountChoicePanel.classList.remove("is-signing-in");
    if (!playerNameInput.value) playerNameInput.value = dependencies.defaultPlayerName() || "WANDERER";
    start.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = true;
    hideTerms();
    newPlayerPanel.hidden = false;
    connectionRetryButton.hidden = true;
    requestAnimationFrame(() => playerNameInput.focus());
  }

  /** The Terms window over the loaded screen: loading has finished, and Play enters the world. */
  function showLegalGate() {
    pauseLoading();
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    if (!termsOpen) legalGate.notice("");
    termsOpen = true;
    legalGate.show();
    // Only a new visitor's guest can still become a sign-in; anyone else has chosen already.
    if (consentSignInButton) {
      consentSignInButton.hidden = !dependencies.accountState()?.newVisitor || dependencies.ageBlocked?.() === true;
      consentSignInButton.disabled = false;
    }
    loadingDetail.textContent = "Ready to Play";
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
  }

  function beginAdventure() {
    const name = playerNameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
      dependencies.showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
      return;
    }
    dependencies.onBeginAdventure(name);
  }

  function beginSignIn(action: () => ReturnType<StartupDependencies["signIn"]>, characterFound: boolean) {
    const fromTerms = termsOpen;
    dependencies.onAccountActionStarted(
      "sign-in",
      characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…",
    );
    const failed = (detail: string) => {
      // The window comes back with Play and Sign In, and says what happened.
      if (fromTerms) legalGate.notice("Sign-In Failed · Try Again");
      dependencies.onAccountActionFailed(detail);
    };
    void (async () => {
      try {
        const result = await action();
        if (result?.ok === false) {
          failed(characterFound
            ? "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN"
            : "REGISTRATION FAILED · TRY AGAIN OR USE GUEST LOGIN");
          return;
        }
        if (!result?.redirecting) dependencies.onAccountActionCompleted();
      } catch {
        failed("SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
      }
    })();
  }

  signInButton.addEventListener("click", () => beginSignIn(dependencies.signIn, Boolean(dependencies.knownCharacter())));
  consentSignInButton?.addEventListener("click", () => beginSignIn(dependencies.signIn, true));
  switchAccountButton?.addEventListener("click", () => {
    if (dependencies.switchAccount) beginSignIn(dependencies.switchAccount, true);
  });
  guestButton.addEventListener("click", () => {
    dependencies.onAccountActionStarted("guest", "LOADING GUEST PROFILE…");
    void (async () => {
      try {
        const result = await dependencies.onContinueGuest();
        if (result?.ok === false) {
          dependencies.onAccountActionFailed("GUEST LOGIN FAILED · TRY AGAIN");
          return;
        }
        dependencies.onAccountActionCompleted();
      } catch {
        dependencies.onAccountActionFailed("GUEST LOGIN FAILED · TRY AGAIN");
      }
    })();
  });
  sessionTakeoverButton.addEventListener("click", () => {
    dependencies.onAccountActionStarted("takeover", "SIGNING OUT OTHER TAB…");
    void (async () => {
      try {
        const result = await dependencies.takeOverSession();
        if (result?.ok === false) {
          dependencies.onAccountActionFailed("TAKEOVER FAILED · TRY AGAIN");
          return;
        }
        dependencies.onAccountActionCompleted();
      } catch {
        dependencies.onAccountActionFailed("TAKEOVER FAILED · TRY AGAIN");
      }
    })();
  });
  connectionRetryButton.addEventListener("click", () => {
    connectionRetryButton.disabled = true;
    loadingDetail.textContent = "Retrying Connection…";
    dependencies.onRetryConnection();
  });
  beginAdventureButton.addEventListener("click", beginAdventure);
  playerNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") beginAdventure();
  });
  return {
    hideStart: () => { pauseLoading(); hideTerms(); start.style.display = "none"; },
    isLoadingSequenceComplete: () => loadingSequence.value === "complete",
    refreshLoading,
    showAccountChoice,
    showAccountAction,
    showConnectionFailure,
    showConnecting,
    showLoading,
    showLegalGate,
    showNewPlayerIntro,
    showSessionConflict,
  };
}
