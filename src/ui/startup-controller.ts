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

type LoadingSequenceState =
  | { value: "loading"; stage: number }
  | { value: "completion-pending"; stage: number; timer: number }
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
  onShowConnecting: () => void;
  acceptLegalTerms: (age: number) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  onLegalAccepted: () => void;
  onContinueGuest: () => Promise<{ ok?: boolean; error?: string } | undefined> | { ok?: boolean; error?: string } | undefined;
  onBeginAdventure: (name: string) => void;
  signIn: () => Promise<{ ok?: boolean; redirecting?: boolean } | undefined> | undefined;
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
  const legalGatePanel = requiredElement("legalGatePanel");
  const newPlayerPanel = requiredElement("newPlayerPanel");
  const playerNameInput = requiredElement<HTMLInputElement>("newPlayerNameInput");
  const beginAdventureButton = requiredElement("beginAdventureBtn");

  let loadingSequence: LoadingSequenceState = { value: "loading", stage: 0 };
  const legalGate = createLegalGateController({
    accept: dependencies.acceptLegalTerms,
    onAccepted: dependencies.onLegalAccepted,
  });

  function showConnecting() {
    if (loadingSequence.value === "completion-pending") window.clearTimeout(loadingSequence.timer);
    loadingSequence = { value: "loading", stage: 0 };
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

  function showAccountChoice(detailOverride = "", actionPending = false) {
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
    signInButton.disabled = actionPending || !accountOptionsReady;
    guestButton.hidden = false;
    guestButton.disabled = actionPending;
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
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    connectionRetryButton.hidden = true;
    dependencies.onShowAccountChoice();
  }

  function showAccountAction(action: "sign-in" | "guest" | "takeover", detail: string) {
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
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    connectionRetryButton.hidden = true;
    refreshLoading();
  }

  function refreshLoading() {
    if (loadingSequence.value === "complete" || loadingSequence.value === "completion-pending") return;
    connectionRetryButton.hidden = true;
    const stages = dependencies.getLoadingStages();
    let stage = loadingSequence.stage;
    while (stage < stages.length - 1 && stages[stage][1]) stage += 1;
    loadingSequence = { value: "loading", stage };
    const [label, ready, percent] = stages[stage] ?? ["Starting WildStat", true, 100];
    loadingDetail.textContent = label;
    loadingFill.style.width = `${percent}%`;
    if (!ready || stage < stages.length - 1) return;
    const timer = window.setTimeout(() => {
      if (loadingSequence.value !== "completion-pending" || loadingSequence.timer !== timer) return;
      loadingSequence = { value: "complete" };
      dependencies.onLoadingComplete();
    }, 0);
    loadingSequence = { value: "completion-pending", stage, timer };
  }

  function showConnectionFailure(message: string) {
    accountChoicePanel.classList.remove("is-signing-in");
    start.style.display = "grid";
    connectionPanel.hidden = false;
    accountChoicePanel.hidden = true;
    legalGatePanel.hidden = true;
    newPlayerPanel.hidden = true;
    sessionTakeoverButton.hidden = true;
    sessionTakeoverNote.hidden = true;
    loadingDetail.textContent = loadingDescriptionCase(message);
    loadingFill.style.width = "12%";
    connectionRetryButton.hidden = false;
    connectionRetryButton.disabled = false;
  }

  function showNewPlayerIntro() {
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
    dependencies.onAccountActionStarted(
      "sign-in",
      characterFound ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…",
    );
    void (async () => {
      try {
        const result = await dependencies.signIn();
        if (result?.ok === false) {
          dependencies.onAccountActionFailed(characterFound
            ? "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN"
            : "REGISTRATION FAILED · TRY AGAIN OR USE GUEST LOGIN");
          return;
        }
        if (!result?.redirecting) dependencies.onAccountActionCompleted();
      } catch {
        dependencies.onAccountActionFailed("SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
      }
    })();
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
    hideStart: () => { start.style.display = "none"; },
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
