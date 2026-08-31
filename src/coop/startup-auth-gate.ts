import { createLegalGateController, legalGateElements, type LegalGateElements } from "../ui/legal-gate";

type StartupAccountState = {
  signedIn?: boolean;
  knownAccount?: boolean;
  signInRequired?: boolean;
  guestSessionApproved?: boolean;
  gameSessionApproved?: boolean;
  authInProgress?: boolean;
  returningFromSignIn?: boolean;
  signInReady?: boolean;
  notice?: string;
};

type StartupActionResult = {
  ok?: boolean;
  error?: string;
  redirecting?: boolean;
} | undefined;

type StartupAuthGateDependencies = {
  accountState: () => StartupAccountState;
  knownCharacter: () => string;
  signIn: () => Promise<StartupActionResult> | StartupActionResult;
  continueAsGuest: () => Promise<StartupActionResult> | StartupActionResult;
  legalConsentAccepted: () => boolean;
  acceptLegalTerms: (age: number) => Promise<StartupActionResult> | StartupActionResult;
  subscribe: (listener: () => void) => () => void;
  loadGame: () => Promise<void>;
  releaseNotes?: {
    show: () => void;
    hide: () => void;
    dispose: () => void;
  };
};

type StartupAuthElements = {
  start: HTMLElement;
  connectionPanel: HTMLElement;
  accountChoicePanel: HTMLElement;
  accountCharacter: HTMLElement;
  accountCharacterName: HTMLElement;
  accountChoiceDetail: HTMLElement;
  signInButton: HTMLButtonElement;
  guestButton: HTMLButtonElement;
  loadingDetail: HTMLElement;
  loadingFill: HTMLElement;
  legal: LegalGateElements;
};

function startupElements(documentValue: Document): StartupAuthElements {
  function requireElement<T extends HTMLElement>(id: string) {
    const element = documentValue.getElementById(id);
    if (!element) throw new Error(`Missing startup element #${id}`);
    return element as T;
  }
  return {
    start: requireElement("start"),
    connectionPanel: requireElement("connectionPanel"),
    accountChoicePanel: requireElement("accountChoicePanel"),
    accountCharacter: requireElement("accountCharacter"),
    accountCharacterName: requireElement("accountCharacterName"),
    accountChoiceDetail: requireElement("accountChoiceDetail"),
    signInButton: requireElement<HTMLButtonElement>("signInFromStartBtn"),
    guestButton: requireElement<HTMLButtonElement>("continueGuestBtn"),
    loadingDetail: requireElement("loadingDetail"),
    loadingFill: requireElement("loadingFill"),
    legal: legalGateElements(documentValue),
  };
}

function shouldStartGame(state: StartupAccountState) {
  return Boolean(state.signedIn || state.guestSessionApproved || state.gameSessionApproved);
}

/** Owns the account screen before the much larger game bundle is requested. */
export function createStartupAuthGate(
  dependencies: StartupAuthGateDependencies,
  elements = startupElements(document),
) {
  let pendingAction: "sign-in" | "guest" | null = null;
  let gameLoading = false;
  let unsubscribe = () => {};
  const legalGate = createLegalGateController({
    accept: dependencies.acceptLegalTerms,
    onAccepted: render,
  }, elements.legal);

  function showLoading(detail = "Loading Your Character") {
    dependencies.releaseNotes?.hide();
    elements.start.style.display = "grid";
    elements.accountChoicePanel.classList.remove("is-signing-in");
    elements.accountChoicePanel.hidden = true;
    legalGate.hide();
    elements.connectionPanel.hidden = false;
    elements.loadingDetail.textContent = detail;
    elements.loadingFill.style.width = "8%";
  }

  function showAccountChoice(detailOverride = "") {
    const state = dependencies.accountState();
    const name = dependencies.knownCharacter().trim();
    const knownAccount = Boolean(state.knownAccount);
    const ready = state.signInReady !== false;
    elements.start.style.display = "grid";
    elements.connectionPanel.hidden = true;
    legalGate.hide();
    elements.accountChoicePanel.hidden = false;
    elements.accountChoicePanel.classList.remove("is-signing-in");
    elements.accountCharacterName.textContent = name || "none";
    elements.accountCharacter.classList.toggle("is-empty", !name);
    elements.signInButton.textContent = name || knownAccount ? "SIGN IN" : "REGISTER";
    elements.signInButton.disabled = Boolean(pendingAction) || !ready;
    elements.guestButton.disabled = Boolean(pendingAction);
    if (pendingAction) dependencies.releaseNotes?.hide();
    else dependencies.releaseNotes?.show();
    elements.accountChoiceDetail.textContent = detailOverride || (pendingAction === "sign-in"
      ? (name || knownAccount ? "OPENING SIGN-IN…" : "OPENING REGISTRATION…")
      : !ready
        ? "PREPARING YOUR SAVED GUEST…"
        : name
          ? "SIGN IN TO THIS CHARACTER"
          : knownAccount
            ? "SIGN IN TO LOAD YOUR CHARACTER"
            : "REGISTER OR PLAY AS GUEST");
  }

  function showLegalGate() {
    dependencies.releaseNotes?.hide();
    elements.start.style.display = "grid";
    elements.connectionPanel.hidden = true;
    elements.accountChoicePanel.hidden = true;
    legalGate.show();
  }

  function dispose() {
    unsubscribe();
    unsubscribe = () => {};
    elements.signInButton.removeEventListener("click", onSignIn);
    elements.guestButton.removeEventListener("click", onGuest);
    legalGate.dispose();
    dependencies.releaseNotes?.dispose();
  }

  function beginGameLoading(detail = "Loading Your Character") {
    if (gameLoading) return;
    gameLoading = true;
    showLoading(detail);
    dispose();
    void dependencies.loadGame().catch((error) => {
      console.error("Wildstat game bundle failed to load:", error);
      elements.loadingDetail.textContent = "Game Load Failed · Refresh to Try Again";
      elements.loadingFill.style.width = "100%";
    });
  }

  function render() {
    if (gameLoading) return;
    const state = dependencies.accountState();
    if (shouldStartGame(state)) {
      if (!dependencies.legalConsentAccepted()) {
        showLegalGate();
        return;
      }
      beginGameLoading(state.guestSessionApproved ? "Loading Guest Profile" : "Loading Your Character");
      return;
    }
    if (state.authInProgress || state.returningFromSignIn) {
      showLoading("Verifying Sign-In");
      return;
    }
    showAccountChoice();
  }

  async function onSignIn() {
    if (pendingAction || gameLoading) return;
    pendingAction = "sign-in";
    const state = dependencies.accountState();
    const name = dependencies.knownCharacter().trim();
    showLoading(name || state.knownAccount ? "Opening Sign-In…" : "Opening Registration…");
    try {
      const result = await dependencies.signIn();
      if (result?.ok === false) {
        pendingAction = null;
        showAccountChoice(result.error === "WAIT FOR SERVER"
          ? "PREPARING YOUR SAVED GUEST…"
          : "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
        return;
      }
      if (!result?.redirecting) {
        pendingAction = null;
        render();
      }
    } catch {
      pendingAction = null;
      showAccountChoice("SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
    }
  }

  async function onGuest() {
    if (pendingAction || gameLoading) return;
    pendingAction = "guest";
    showLoading("Loading Guest Profile");
    try {
      const result = await dependencies.continueAsGuest();
      if (result?.ok === false) throw new Error(result.error || "Guest startup failed");
      pendingAction = null;
      render();
    } catch {
      pendingAction = null;
      showAccountChoice("GUEST LOGIN FAILED · TRY AGAIN");
    }
  }

  function start() {
    elements.signInButton.addEventListener("click", onSignIn);
    elements.guestButton.addEventListener("click", onGuest);
    unsubscribe = dependencies.subscribe(render);
    render();
  }

  return { dispose, render, start };
}

/** Loads game.js only after the auth gate has selected an account identity. */
export function requestDeferredGameAssets(documentValue = document) {
  documentValue.body.classList.add("is-loading-game-assets");
  for (const image of documentValue.querySelectorAll<HTMLImageElement>("img[data-game-src]")) {
    const source = image.dataset.gameSrc;
    if (!source) continue;
    image.src = source;
    delete image.dataset.gameSrc;
  }
}

export function loadDeferredGameBundle(documentValue = document) {
  requestDeferredGameAssets(documentValue);
  const existing = documentValue.getElementById("wildstatGameScript") as HTMLScriptElement | null;
  if (existing) return Promise.resolve();
  const bootstrapScript = documentValue.getElementById("wildstatCoopScript") as HTMLScriptElement | null;
  const source = bootstrapScript?.dataset.gameSrc;
  if (!source) return Promise.reject(new Error("Missing deferred game bundle source"));
  return new Promise<void>((resolve, reject) => {
    const script = documentValue.createElement("script");
    script.id = "wildstatGameScript";
    script.src = source;
    script.async = false;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${source}`)), { once: true });
    documentValue.body.append(script);
  });
}

export type { StartupAccountState, StartupActionResult, StartupAuthElements };
