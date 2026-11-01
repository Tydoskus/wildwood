import { markGameScript } from "./game-script-gate";
import { enforceLatestVersion } from "../app/version";
import { GAME_VERSION } from "../game/runtime/game-settings";
import { createDiscordLink } from "../ui/discord-link";
import { createLoadingProgress } from "../ui/loading-progress";
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
  /** Use Another Account: ends the provider session, then asks which account. */
  switchAccount?: () => Promise<StartupActionResult> | StartupActionResult;
  continueAsGuest: () => Promise<StartupActionResult> | StartupActionResult;
  subscribe: (listener: () => void) => () => void;
  loadGame: () => Promise<void>;
  /** game.js downloading from the first frame (preloadDeferredGameBundle), or null under Data Saver. */
  gameDownload?: Promise<void> | null;
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
  switchAccountButton?: HTMLButtonElement | null;
  loadingDetail: HTMLElement;
  loadingFill: HTMLElement;
};

function startupElements(documentValue: Document): StartupAuthElements {
  const signInButton = documentValue.getElementById("signInFromStartBtn");
  if (signInButton && !documentValue.getElementById("accountSignInHint")) {
    const hint = documentValue.createElement("p");
    hint.id = "accountSignInHint"; hint.className = "account-sign-in-hint";
    const detail = documentValue.createElement("span");
    detail.textContent = "Google and Spacetime Email links can open different characters.";
    hint.replaceChildren("Use your original sign-in method.", detail);
    // Behind a Sign-in Help line, so the card does not read as a wall of
    // account rules to someone who only wants to play.
    hint.hidden = true;
    const help = documentValue.createElement("button");
    help.id = "accountSignInHelp"; help.className = "account-sign-in-help"; help.type = "button";
    help.textContent = "Sign-in Help";
    help.setAttribute("aria-expanded", "false");
    help.setAttribute("aria-controls", hint.id);
    help.addEventListener("click", () => {
      hint.hidden = !hint.hidden;
      help.setAttribute("aria-expanded", String(!hint.hidden));
    });
    // Inside the card with the rest of the sign-in copy. Before it existed
    // this sat loose above the button, which is where it lands if the markup
    // ever drops the card.
    const card = documentValue.querySelector(".account-note-card");
    if (card) card.append(help, hint);
    else signInButton.before(help, hint);
  }
  const muteButton = documentValue.getElementById("signInMuteButton");
  if (muteButton && !documentValue.getElementById("signInDiscordLink")) {
    const discord = createDiscordLink(documentValue, "signin-mute-button signin-discord-link");
    discord.id = "signInDiscordLink";
    muteButton.after(discord);
  }
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
    switchAccountButton: documentValue.getElementById("useAnotherAccountBtn") as HTMLButtonElement | null,
    loadingDetail: requireElement("loadingDetail"),
    loadingFill: requireElement("loadingFill"),
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
  // The shell's share of the one loading bar is game.js: 0 to 30%. The game's own stages carry on from there.
  const progress = createLoadingProgress(elements.loadingFill);
  let gameDownloaded = false;
  dependencies.gameDownload?.then(() => {
    gameDownloaded = true;
    if (!detached) render();
  }, () => {
    // The script tag fetches it again on Play and reports a real failure there.
  });
  /** game.js is downloading, then about to run: the shell's part of the bar. */
  function showBundleProgress() {
    if (gameDownloaded) progress.advance(30, 38);
    else progress.advance(3, 30);
  }

  function showLoading(detail = "Loading Your Character") {
    dependencies.releaseNotes?.hide();
    elements.start.style.display = "grid";
    elements.accountChoicePanel.classList.remove("is-signing-in");
    elements.accountChoicePanel.hidden = true;
    elements.connectionPanel.hidden = false;
    elements.loadingDetail.textContent = detail;
    showBundleProgress();
  }

  function showAccountChoice(detailOverride = "", interactive = true) {
    const state = dependencies.accountState();
    const name = dependencies.knownCharacter().trim();
    const knownAccount = Boolean(state.knownAccount);
    const ready = state.signInReady !== false;
    elements.start.style.display = "grid";
    elements.connectionPanel.hidden = true;
    elements.accountChoicePanel.hidden = false;
    elements.accountChoicePanel.classList.remove("is-signing-in");
    elements.accountCharacterName.textContent = name || "none";
    elements.accountCharacter.classList.toggle("is-empty", !name);
    // A known character: one Sign In, with Play as Guest as the small way out.
    elements.accountChoicePanel.classList.toggle("is-sign-in", Boolean(name || knownAccount));
    elements.signInButton.textContent = name || knownAccount ? "Sign In" : "Register";
    elements.signInButton.disabled = !ready;
    elements.guestButton.disabled = false;
    // Whenever a character is offered: Sign In reuses whoever the browser last signed in as.
    if (elements.switchAccountButton) {
      elements.switchAccountButton.hidden = !(name || knownAccount) || !dependencies.switchAccount;
      elements.switchAccountButton.disabled = false;
    }
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
    if (elements.switchAccountButton) elements.switchAccountButton.disabled = true;
  }

  function detach() {
    if (detached) return;
    detached = true;
    unsubscribe();
    unsubscribe = () => {};
    elements.signInButton.removeEventListener("click", onSignIn);
    elements.guestButton.removeEventListener("click", onGuest);
    elements.switchAccountButton?.removeEventListener("click", onSwitchAccount);
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
      // game.js now owns the bar and carries it on from here.
      progress.stop();
      machine.dispatch({ type: "dispose" });
    }).catch((error) => {
      progress.stop();
      console.error("WildStat game bundle failed to load:", error);
      const transition = machine.dispatch({ type: "fail-game-load", message: "Game Load Failed · Refresh to Try Again" });
      renderState(transition.state, transition.changed);
    });
  }

  function renderState(state: StartupState, changed = true) {
    switch (state.value) {
      case "guest-start":
        // A new or returning guest who has agreed: the same path as the Guest button, without the tap.
        void onGuest();
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
        progress.set(100);
        return;
      case "loading-shell":
        showLoading("Starting WildStat");
        return;
      case "loading-runtime":
      case "legal-consent":
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
    // The shell never asks for the Terms (the game does, once loaded), so it reports none.
    const transition = machine.sync({
      account: dependencies.accountState(),
      legalAccepted: false,
      shellReady: true,
    });
    renderState(transition.state, transition.changed);
  }

  function onSignIn() {
    const state = dependencies.accountState();
    const name = dependencies.knownCharacter().trim();
    const signingIn = name || state.knownAccount;
    return beginSignIn(dependencies.signIn, signingIn ? "Opening Sign-In…" : "Opening Registration…");
  }

  function onSwitchAccount() {
    if (!dependencies.switchAccount) return;
    return beginSignIn(dependencies.switchAccount, "Opening Sign-In…");
  }

  async function beginSignIn(action: () => Promise<StartupActionResult> | StartupActionResult, detail: string) {
    if (machine.state().value !== "account-choice") return;
    preparingSignIn = true;
    preparingDetail = detail;
    renderState(machine.dispatch({ type: "begin-account-action", action: "sign-in", detail }).state);
    try {
      const result = await action();
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
    const from = machine.state().value;
    if (from !== "account-choice" && from !== "guest-start") return;
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
    elements.switchAccountButton?.addEventListener("click", onSwitchAccount);
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

/**
 * Starts downloading game.js on the first frame, beside the Terms and Play,
 * so Play waits only for it to run. A real fetch the script tag then reuses.
 * Skipped under Data Saver, where game.js loads after Play, and once it is loading.
 */
export function preloadDeferredGameBundle(documentValue = document, saveData = Boolean((navigator as { connection?: { saveData?: boolean } }).connection?.saveData)) {
  if (saveData || documentValue.getElementById("wildstatGameScript")) return null;
  // signin-auth-detect.js usually started it from the head and marks how it ended.
  const started = documentValue.getElementById("wildstatGamePreload") as HTMLLinkElement | null;
  if (started) return preloadSettled(started);
  const source = (documentValue.getElementById("wildstatCoopScript") as HTMLScriptElement | null)?.dataset.gameSrc;
  if (!source) return null;
  const link = documentValue.createElement("link");
  const downloaded = preloadSettled(link);
  link.id = "wildstatGamePreload";
  link.rel = "preload";
  link.as = "script";
  link.href = source;
  documentValue.head.append(link);
  return downloaded;
}

function preloadSettled(link: HTMLLinkElement) {
  return new Promise<void>((resolve, reject) => {
    const failed = () => reject(new Error(`Failed to preload ${link.href}`));
    if (link.dataset.state === "loaded") return resolve();
    if (link.dataset.state === "failed") return failed();
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", failed, { once: true });
  });
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
    markGameScript(script);
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
