export type StartupInstallElements = {
  button: HTMLButtonElement;
  hint: HTMLElement;
};

type InstallChoice = {
  outcome?: string;
};

export type StartupInstallPromptEvent = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice?: Promise<InstallChoice>;
};

type StartupInstallWindow = {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  matchMedia: (query: string) => { matches: boolean };
};

type StartupInstallNavigator = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
};

type StartupInstallEnvironment = {
  windowValue?: StartupInstallWindow;
  navigatorValue?: StartupInstallNavigator;
};

function startupInstallElements(documentValue: Document): StartupInstallElements {
  const button = documentValue.getElementById("installAppBtn");
  const hint = documentValue.getElementById("installAppHint");
  if (!button || !hint) throw new Error("Missing startup install controls");
  return { button: button as HTMLButtonElement, hint };
}

function isIosDevice(value: StartupInstallNavigator) {
  return /iPad|iPhone|iPod/i.test(value.userAgent)
    || (/Mac/i.test(value.platform ?? "") && (value.maxTouchPoints ?? 0) > 1);
}

function isIosSafari(value: StartupInstallNavigator) {
  return isIosDevice(value)
    && /Safari/i.test(value.userAgent)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(value.userAgent);
}

/** Exposes browser-native installation when available and iOS Home Screen guidance otherwise. */
export function createStartupInstallControl(
  environment: StartupInstallEnvironment = {},
  elements = startupInstallElements(document),
) {
  const windowValue: StartupInstallWindow = environment.windowValue ?? window;
  const navigatorValue: StartupInstallNavigator = environment.navigatorValue
    ?? (navigator as Navigator & { standalone?: boolean });
  const iosDevice = isIosDevice(navigatorValue);
  const iosSafari = isIosSafari(navigatorValue);
  let installPrompt: StartupInstallPromptEvent | null = null;

  function isStandalone() {
    try {
      return navigatorValue.standalone === true || windowValue.matchMedia("(display-mode: standalone)").matches;
    } catch {
      return navigatorValue.standalone === true;
    }
  }

  function setHint(message: string) {
    elements.hint.textContent = message;
    elements.hint.hidden = !message;
  }

  function render() {
    if (isStandalone()) {
      elements.button.hidden = true;
      setHint("");
      return;
    }
    elements.button.hidden = !installPrompt && !iosDevice;
    elements.button.textContent = installPrompt ? "INSTALL WILDSTAT" : "ADD TO HOME SCREEN";
  }

  const onBeforeInstallPrompt: EventListener = (event) => {
    const candidate = event as StartupInstallPromptEvent;
    if (typeof candidate.prompt !== "function") return;
    candidate.preventDefault();
    installPrompt = candidate;
    setHint("");
    render();
  };

  const onAppInstalled: EventListener = () => {
    installPrompt = null;
    elements.button.hidden = true;
    setHint("");
  };

  async function onInstallClick() {
    setHint("");
    const pendingPrompt = installPrompt;
    if (!pendingPrompt) {
      if (!iosDevice) return;
      setHint(iosSafari
        ? "TAP SHARE, THEN ADD TO HOME SCREEN."
        : "OPEN THIS PAGE IN SAFARI, TAP SHARE, THEN ADD TO HOME SCREEN.");
      return;
    }

    installPrompt = null;
    elements.button.disabled = true;
    elements.button.textContent = "OPENING INSTALL…";
    try {
      const promptChoice = await pendingPrompt.prompt();
      const choice = promptChoice ?? (pendingPrompt.userChoice ? await pendingPrompt.userChoice : undefined);
      setHint(choice?.outcome === "accepted"
        ? "INSTALLING WILDSTAT…"
        : "INSTALL CANCELED. USE YOUR BROWSER MENU TO TRY AGAIN.");
    } catch {
      setHint("USE YOUR BROWSER MENU TO INSTALL WILDSTAT.");
    } finally {
      elements.button.disabled = false;
      render();
    }
  }

  windowValue.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  windowValue.addEventListener("appinstalled", onAppInstalled);
  elements.button.addEventListener("click", onInstallClick);
  render();

  return {
    dispose() {
      installPrompt = null;
      windowValue.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      windowValue.removeEventListener("appinstalled", onAppInstalled);
      elements.button.removeEventListener("click", onInstallClick);
    },
  };
}
