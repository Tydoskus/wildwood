import { createLegalGateController, legalGateElements, type LegalGateElements } from "../ui/legal-gate";
import { enforceLatestVersion } from "../app/version";
import { GAME_VERSION } from "../game/runtime/game-settings";
import {
  createStartupStateMachine,
  type StartupAccountSnapshot,
  type StartupState,
} from "./startup-state-machine";

type StartupAccountState = StartupAccountSnapshot & {
  knownAccount?: boolean;
  signInRequired?: boolean;
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

/** Owns the account screen before the much larger game bundle is requested. */
export function createStartupAuthGate(
  dependencies: StartupAuthGateDependencies,
  elements = startupElements(document),
) {
  const machine = createStartupStateMachine("auth-shell");
  let unsubscribe = () => {};
  let detached = false;
  let preparingSignIn = false;
  let preparingDetail = "Opening Sign-In…";
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

  function showAccountChoice(detailOverride = "", interactive = true) {
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
    elements.signInButton.disabled = !ready;
    elements.guestButton.disabled = false;
    if (interactive) dependencies.releaseNotes?.show();
    else dependencies.releaseNotes?.hide();
    const callbackFailure = /^(?:SIGN-IN (?:CHECK FAILED|FAILED|NETWORK FAILED|TIMED OUT)|AUTO SIGN-IN UNAVAILABLE)/.test(state.notice || "")
      ? `${state.notice}${/TRY AGAIN/.test(state.notice || "") ? "" : " · TRY AGAIN"} OR USE GUEST LOGIN`
      : "";
    elements.accountChoiceDetail.textContent = detailOverride || callbackFailure || (!ready
        ? "PREPARING YOUR SAVED GUEST…"
        : name
          ? "SIGN IN TO THIS CHARACTER"
          : knownAccount
            ? "SIGN IN TO LOAD YOUR CHARACTER"
            : "REGISTER OR PLAY AS GUEST");
  }

  function showSignInPreparation() {
    showAccountChoice(preparingDetail, false);
    elements.signInButton.disabled = true;
    elements.guestButton.disabled = true;
  }

  function showLegalGate() {
    dependencies.releaseNotes?.hide();
    elements.start.style.display = "grid";
    elements.connectionPanel.hidden = true;
    elements.accountChoicePanel.hidden = true;
    legalGate.show();
  }

  function detach() {
    if (detached) return;
    detached = true;
    unsubscribe();
    unsubscribe = () => {};
    elements.signInButton.removeEventListener("click", onSignIn);
    elements.guestButton.removeEventListener("click", onGuest);
    legalGate.dispose();
    dependencies.releaseNotes?.dispose();
  }

  function dispose() {
    detach();
    machine.dispatch({ type: "dispose" });
  }

  function beginGameLoading(detail = "Loading Your Character") {
    const current = machine.state();
    if (current.value === "loading-game" && current.status === "loading") return;
    machine.dispatch({ type: "begin-game-load" });
    showLoading(detail);
    detach();
    void dependencies.loadGame().then(() => {
      machine.dispatch({ type: "dispose" });
    }).catch((error) => {
      console.error("WildStat game bundle failed to load:", error);
      const transition = machine.dispatch({ type: "fail-game-load", message: "Game Load Failed · Refresh to Try Again" });
      renderState(transition.state, transition.changed);
    });
  }

  function renderState(state: StartupState, changed = true) {
    switch (state.value) {
      case "legal-consent":
        showLegalGate();
        return;
      case "loading-game":
        if (state.status === "ready") beginGameLoading(dependencies.accountState().guestSessionApproved ? "Loading Guest Profile" : "Loading Your Character");
        return;
      case "session-conflict":
        beginGameLoading("Opening Session Recovery");
        return;
      case "verifying-sign-in":
        if (preparingSignIn) showSignInPreparation();
        else showLoading("Verifying Sign-In");
        return;
      case "account-action":
        if (state.action === "sign-in") showSignInPreparation();
        else showLoading(state.detail);
        return;
      case "account-choice":
        showAccountChoice(state.detail);
        return;
      case "failed":
        showLoading(state.message);
        elements.loadingFill.style.width = "100%";
        return;
      case "loading-shell":
      case "loading-runtime":
        showLoading();
        return;
      case "connection-failed":
        showLoading(state.message);
        return;
      case "new-player":
      case "entering-game":
      case "running":
      case "updating":
      case "disposed":
        if (changed && state.value === "disposed") detach();
        return;
    }
  }

  function render() {
    const transition = machine.sync({
      account: dependencies.accountState(),
      legalAccepted: dependencies.legalConsentAccepted(),
      shellReady: true,
    });
    renderState(transition.state, transition.changed);
  }

  async function onSignIn() {
    if (machine.state().value !== "account-choice") return;
    preparingSignIn = true;
    const state = dependencies.accountState();
    const name = dependencies.knownCharacter().trim();
    const detail = name || state.knownAccount ? "Opening Sign-In…" : "Opening Registration…";
    preparingDetail = detail;
    renderState(machine.dispatch({ type: "begin-account-action", action: "sign-in", detail }).state);
    try {
      const result = await dependencies.signIn();
      if (result?.ok === false) {
        preparingSignIn = false;
        const failure = result.error === "WAIT FOR SERVER"
          ? "PREPARING YOUR SAVED GUEST…"
          : "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN";
        renderState(machine.dispatch({ type: "fail-account-action", detail: failure }).state);
        return;
      }
      preparingSignIn = Boolean(result?.redirecting);
      machine.dispatch({ type: "complete-account-action" });
      if (!result?.redirecting) render();
    } catch {
      preparingSignIn = false;
      renderState(machine.dispatch({
        type: "fail-account-action",
        detail: "SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN",
      }).state);
    }
  }

  async function onGuest() {
    if (machine.state().value !== "account-choice") return;
    renderState(machine.dispatch({
      type: "begin-account-action",
      action: "guest",
      detail: "Loading Guest Profile",
    }).state);
    try {
      const result = await dependencies.continueAsGuest();
      if (result?.ok === false) throw new Error(result.error || "Guest startup failed");
      machine.dispatch({ type: "complete-account-action" });
      render();
    } catch {
      renderState(machine.dispatch({
        type: "fail-account-action",
        detail: "GUEST LOGIN FAILED · TRY AGAIN",
      }).state);
    }
  }

  function start() {
    elements.signInButton.addEventListener("click", onSignIn);
    elements.guestButton.addEventListener("click", onGuest);
    unsubscribe = dependencies.subscribe(render);
    render();
  }

  return { dispose, render, start, state: machine.state };
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

export function loadDeferredGameBundle(documentValue = document, checkForUpdate = () => enforceLatestVersion(GAME_VERSION)) {
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
    script.addEventListener("error", () => {
      script.remove();
      // A tab left at sign-in across a deployment may reference a retired
      // content hash. Only reload if the server confirms a newer release.
      checkForUpdate();
      reject(new Error(`Failed to load ${source}`));
    }, { once: true });
    documentValue.body.append(script);
  });
}

export type { StartupAccountState, StartupActionResult, StartupAuthElements };
