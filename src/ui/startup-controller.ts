import { requiredElement } from "../game/runtime/dom";
import { appendPlayerGenderIcon } from "./player-gender";
import type { PlayerGender } from "../../shared/player-gender";
import { createLegalGateController } from "./legal-gate";

type AccountState = {
  signedIn?: boolean;
  authInProgress?: boolean;
  returningFromSignIn?: boolean;
  signInRequired?: boolean;
  knownAccount?: boolean;
  notice?: string;
  connectionIssue?: { message: string } | null;
};

type LoadingStage = readonly [label: string, ready: boolean, percent: number];

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
  isSignInScreenReady: () => boolean;
  getLoadingStages: () => LoadingStage[];
  onLoadingComplete: () => void;
  onShowAccountChoice: () => void;
  onShowConnecting: () => void;
  legalConsentAccepted: () => boolean;
  acceptLegalTerms: (age: number) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  onLegalAccepted: () => void;
  onContinueGuest: () => void;
  onBeginAdventure: (name: string) => void;
  signIn: () => Promise<{ ok?: boolean; redirecting?: boolean } | undefined> | undefined;
  takeOverSession: () => Promise<{ ok?: boolean } | undefined> | undefined;
  retryConnection: () => boolean | void;
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
  const legalGatePanel = requiredElement("legalGatePanel");
  const newPlayerPanel = requiredElement("newPlayerPanel");
  const playerNameInput = requiredElement<HTMLInputElement>("newPlayerNameInput");
  const beginAdventureButton = requiredElement("beginAdventureBtn");

  let loadingStage = 0;
  let loadingSequenceComplete = false;
  let loadingCompletionPending = false;
  let loadingCompletionTimer: number | null = null;
  let signInPending = false;
  const legalGate = createLegalGateController({
    accept: dependencies.acceptLegalTerms,
    onAccepted: dependencies.onLegalAccepted,
  });

  function showConnecting() {
    if (loadingCompletionTimer !== null) window.clearTimeout(loadingCompletionTimer);
    loadingStage = 0;
    loadingSequenceComplete = false;
    loadingCompletionPending = false;
    loadingCompletionTimer = null;
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverButton.disabled = false;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
    connectionRetryButton.disabled = false;
    dependencies.onShowConnecting();
    refreshLoading();
  }

  function showSessionConflict() {
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    loadingDetail.textContent = loadingDescriptionCase(dependencies.accountState()?.notice || "Logged In on Another Tab");
    loadingFill.style.width = "100%";
    sessionTakeoverButton.hidden = false;
    sessionTakeoverNote.hidden = false;
    connectionRetryButton.hidden = true;
  }

  function showAccountChoice(detailOverride = "") {
    if (!dependencies.isSignInScreenReady()) {
      if (connectionPanel.hidden) showConnecting();
      return;
    }
    const account = dependencies.accountState();
    accountChoicePanel.classList.remove("is-signing-in");
    const accountOptionsReady = dependencies.connected() || Boolean(account?.signInRequired);
    const knownAccount = Boolean(account?.knownAccount);
    const name = dependencies.knownCharacter().trim();
    const characterFound = Boolean(name);
    accountCharacterName.textContent = characterFound ? name : "none";
    if (characterFound) appendPlayerGenderIcon(accountCharacterName, dependencies.knownCharacterGender());
    accountCharacter.classList.toggle("is-empty", !characterFound);
    signInButton.hidden = false;
    signInButton.textContent = characterFound || knownAccount ? "SIGN IN" : "REGISTER";
    signInButton.disabled = signInPending || !accountOptionsReady;
    guestButton.hidden = false;
    guestButton.disabled = signInPending;
    accountChoiceDetail.textContent = detailOverride || (signInPending
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
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    connectionRetryButton.hidden = true;
    dependencies.onShowAccountChoice();
  }

  function showSigningIn(detail = "Loading Your Character…") {
    showAccountChoice(detail);
  }

  /** Switch an authenticated account back to progress loading without restarting its timer sequence. */
  function showLoading() {
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
    refreshLoading();
  }

  function refreshLoading() {
    if (loadingSequenceComplete) return;
    const account = dependencies.accountState();
    const connectionNotice = account?.notice || "";
    if (/active in another tab|logged in on another tab|signing out other tab|takeover failed/i.test(connectionNotice)) {
      connectionRetryButton.hidden = true;
      loadingDetail.textContent = loadingDescriptionCase(connectionNotice);
      loadingFill.style.width = "100%";
      return;
    }
    if (account?.connectionIssue && !dependencies.connected()) {
      loadingDetail.textContent = loadingDescriptionCase(account.connectionIssue.message);
      loadingFill.style.width = "12%";
      connectionRetryButton.hidden = false;
      connectionRetryButton.disabled = false;
      return;
    }
    connectionRetryButton.hidden = true;
    const stages = dependencies.getLoadingStages();
    while (loadingStage < stages.length - 1 && stages[loadingStage][1]) loadingStage += 1;
    const [label, ready, percent] = stages[loadingStage] ?? ["Starting WildStat", true, 100];
    loadingDetail.textContent = label;
    loadingFill.style.width = `${percent}%`;
    if (!ready || loadingStage < stages.length - 1 || loadingSequenceComplete || loadingCompletionPending) return;
    loadingCompletionPending = true;
    loadingCompletionTimer = window.setTimeout(() => {
      loadingCompletionTimer = null;
      loadingCompletionPending = false;
      loadingSequenceComplete = true;
      dependencies.onLoadingComplete();
    }, 0);
  }

  function showNewPlayerIntro() {
    if (!dependencies.legalConsentAccepted()) {
      showLegalGate();
      return;
    }
    accountChoicePanel.classList.remove("is-signing-in");
    if (!playerNameInput.value) playerNameInput.value = dependencies.defaultPlayerName() || "WANDERER";
    start.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = true;
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = false;
    connectionRetryButton.hidden = true;
    requestAnimationFrame(() => playerNameInput.focus());
  }

  function showLegalGate() {
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = true;
    accountChoicePanel.hidden = true;
    legalGate.show();
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

  signInButton.addEventListener("click", () => {
    const characterFound = Boolean(dependencies.knownCharacter());
    signInPending = true;
    showSigningIn(characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…");
    void dependencies.signIn()?.then((result) => {
      if (result?.ok !== false) {
        if (!result?.redirecting) showLoading();
        return;
      }
      signInPending = false;
      showAccountChoice(characterFound
        ? "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN"
        : "REGISTRATION FAILED · TRY AGAIN OR USE GUEST LOGIN");
    }).catch(() => {
      signInPending = false;
      showAccountChoice("SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
    });
  });
  guestButton.addEventListener("click", () => {
    guestButton.disabled = true;
    showLoading();
    dependencies.onContinueGuest();
  });
  sessionTakeoverButton.addEventListener("click", () => {
    sessionTakeoverButton.disabled = true;
    loadingDetail.textContent = "Signing Out Other Tab…";
    void dependencies.takeOverSession()?.then((result) => {
      if (result?.ok === false) {
        sessionTakeoverButton.disabled = false;
        loadingDetail.textContent = "Takeover Failed · Try Again";
        return;
      }
      showConnecting();
    }).catch(() => {
      sessionTakeoverButton.disabled = false;
      loadingDetail.textContent = "Takeover Failed · Try Again";
    });
  });
  connectionRetryButton.addEventListener("click", () => {
    connectionRetryButton.disabled = true;
    loadingDetail.textContent = "Retrying Connection…";
    dependencies.retryConnection();
  });
  beginAdventureButton.addEventListener("click", beginAdventure);
  playerNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") beginAdventure();
  });
  return {
    clearSignInPending: () => { signInPending = false; },
    hideStart: () => { start.style.display = "none"; },
    isLoadingSequenceComplete: () => loadingSequenceComplete,
    refreshLoading,
    showAccountChoice,
    showConnecting,
    showLoading,
    showLegalGate,
    showNewPlayerIntro,
    showSessionConflict,
  };
}
