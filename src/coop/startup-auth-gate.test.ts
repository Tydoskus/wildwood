import { describe, expect, it, vi } from "vitest";
import { createStartupAuthGate, loadDeferredGameBundle, requestDeferredGameAssets, type StartupAuthElements } from "./startup-auth-gate";

class FakeElement {
  hidden = false;
  disabled = false;
  checked = false;
  textContent = "";
  value = "50";
  style = { display: "", width: "" };
  private classes = new Set<string>();
  private listeners = new Map<string, Set<(event: Event) => void>>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, active?: boolean) => {
      const enabled = active ?? !this.classes.has(name);
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
      return enabled;
    },
  };
  addEventListener(name: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, listener: (event: Event) => void) {
    this.listeners.get(name)?.delete(listener);
  }
  setAttribute() {}
  click() {
    for (const listener of this.listeners.get("click") ?? []) listener({ stopPropagation() {} } as Event);
  }
}

function elements() {
  return {
    start: new FakeElement(),
    connectionPanel: new FakeElement(),
    accountChoicePanel: new FakeElement(),
    accountCharacter: new FakeElement(),
    accountCharacterName: new FakeElement(),
    accountChoiceDetail: new FakeElement(),
    signInButton: new FakeElement(),
    guestButton: new FakeElement(),
    loadingDetail: new FakeElement(),
    loadingFill: new FakeElement(),
    legal: {
      panel: new FakeElement(),
      ageSlider: new FakeElement(),
      ageOutput: new FakeElement(),
      agreement: new FakeElement(),
      termsLink: new FakeElement(),
      continueButton: new FakeElement(),
      status: new FakeElement(),
    },
  } as unknown as StartupAuthElements & {
    signInButton: FakeElement;
    guestButton: FakeElement;
  };
}

describe("startup auth gate", () => {
  it("shows age and Terms immediately after Guest Login", async () => {
    const ui = elements();
    const loadGame = vi.fn(async () => {});
    let state = { signInReady: true, guestSessionApproved: false };
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "",
      signIn: async () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => {
        state = { ...state, guestSessionApproved: true };
        return { ok: true };
      },
      legalConsentAccepted: () => false,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame,
    }, ui);

    gate.start();
    expect(ui.accountChoicePanel.hidden).toBe(false);

    ui.guestButton.click();
    await Promise.resolve();

    expect(ui.legal.panel.hidden).toBe(false);
    expect(ui.accountChoicePanel.hidden).toBe(true);
    expect(loadGame).not.toHaveBeenCalled();
  });

  it("shows age and Terms immediately after registration returns", async () => {
    const ui = elements();
    const loadGame = vi.fn(async () => {});
    let state = { signInReady: true, gameSessionApproved: false };
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "",
      signIn: async () => {
        state = { ...state, gameSessionApproved: true };
        return { ok: true, redirecting: false };
      },
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => false,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame,
    }, ui);

    gate.start();
    ui.signInButton.click();
    await Promise.resolve();

    expect(ui.legal.panel.hidden).toBe(false);
    expect(ui.accountChoicePanel.hidden).toBe(true);
    expect(loadGame).not.toHaveBeenCalled();
  });

  it("keeps the game unloaded while the player is choosing an identity", () => {
    const ui = elements();
    const loadGame = vi.fn(async () => {});
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "",
      signIn: async () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame,
    }, ui);

    gate.start();

    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.connectionPanel.hidden).toBe(true);
    expect(loadGame).not.toHaveBeenCalled();
  });

  it("does not request game.js while OAuth is redirecting", async () => {
    const ui = elements();
    const loadGame = vi.fn(async () => {});
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "WANDERER",
      signIn: async () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame,
    }, ui);
    gate.start();

    ui.signInButton.click();
    await Promise.resolve();

    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.connectionPanel.hidden).toBe(true);
    expect(ui.accountChoiceDetail.textContent).toBe("Opening Sign-In…");
    expect(loadGame).not.toHaveBeenCalled();
  });

  it("re-enables account choices after an OAuth navigation is canceled", async () => {
    const ui = elements();
    let state = { signInReady: true, returningFromSignIn: false };
    let notify = () => {};
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "WANDERER",
      signIn: async () => {
        state = { ...state, returningFromSignIn: true };
        return { ok: true, redirecting: true };
      },
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: (listener) => { notify = listener; return () => {}; },
      loadGame: async () => {},
    }, ui);
    gate.start();

    ui.signInButton.click();
    await Promise.resolve();
    expect(ui.connectionPanel.hidden).toBe(true);

    state = { signInReady: true, returningFromSignIn: false };
    notify();

    expect(ui.connectionPanel.hidden).toBe(true);
    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.signInButton.disabled).toBe(false);
    expect(ui.guestButton.disabled).toBe(false);
  });

  it("keeps registration visible while OAuth opens", async () => {
    const ui = elements();
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "",
      signIn: async () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => {},
    }, ui);
    gate.start();

    ui.signInButton.click();
    await Promise.resolve();

    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.connectionPanel.hidden).toBe(true);
    expect(ui.accountChoiceDetail.textContent).toBe("Opening Registration…");
  });

  it("loads once after OAuth has approved the account session", () => {
    const ui = elements();
    let state = { signInReady: true, gameSessionApproved: false };
    let notify = () => {};
    const loadGame = vi.fn(async () => {});
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "WANDERER",
      signIn: () => ({ ok: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: (listener) => { notify = listener; return () => {}; },
      loadGame,
    }, ui);
    gate.start();

    state = { ...state, gameSessionApproved: true };
    notify();
    notify();

    expect(ui.connectionPanel.hidden).toBe(false);
    expect(ui.accountChoicePanel.hidden).toBe(true);
    expect(ui.loadingDetail.textContent).toBe("Loading Your Character");
    expect(loadGame).toHaveBeenCalledTimes(1);
  });

  it("keeps OAuth return on loading and hides release notes", () => {
    const ui = elements();
    const releaseNotes = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true, returningFromSignIn: true, authInProgress: true }),
      knownCharacter: () => "WANDERER",
      signIn: () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => {},
      releaseNotes,
    }, ui);

    gate.start();

    expect(ui.connectionPanel.hidden).toBe(false);
    expect(ui.accountChoicePanel.hidden).toBe(true);
    expect(ui.loadingDetail.textContent).toBe("Verifying Sign-In");
    expect(releaseNotes.hide).toHaveBeenCalled();
    expect(releaseNotes.show).not.toHaveBeenCalled();
  });

  it("shows release notes only while account choice is idle", async () => {
    const ui = elements();
    const releaseNotes = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "WANDERER",
      signIn: () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => {},
      releaseNotes,
    }, ui);

    gate.start();
    expect(releaseNotes.show).toHaveBeenCalledTimes(1);

    ui.signInButton.click();
    await Promise.resolve();
    expect(releaseNotes.hide).toHaveBeenCalled();
  });

  it("returns to account choice only when sign-in fails", async () => {
    const ui = elements();
    const releaseNotes = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "WANDERER",
      signIn: async () => ({ ok: false, error: "SIGN-IN FAILED" }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => {},
      releaseNotes,
    }, ui);
    gate.start();

    ui.signInButton.click();
    expect(ui.connectionPanel.hidden).toBe(true);
    await Promise.resolve();

    expect(ui.connectionPanel.hidden).toBe(true);
    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.accountChoiceDetail.textContent).toBe("SIGN-IN FAILED · TRY AGAIN OR USE GUEST LOGIN");
    expect(releaseNotes.show).toHaveBeenCalledTimes(2);
  });

  it("shows the callback timeout instead of replacing it with the normal sign-in prompt", () => {
    const ui = elements();
    const gate = createStartupAuthGate({
      accountState: () => ({
        knownAccount: true,
        signInReady: true,
        notice: "SIGN-IN TIMED OUT · TRY AGAIN",
      }),
      knownCharacter: () => "TACOMEL",
      signIn: () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => {},
    }, ui);

    gate.start();

    expect(ui.accountChoiceDetail.textContent).toBe("SIGN-IN TIMED OUT · TRY AGAIN OR USE GUEST LOGIN");
  });

  it("switches to Guest before loading the game", async () => {
    const ui = elements();
    const order: string[] = [];
    let state = { signInReady: true, guestSessionApproved: false };
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "ACCOUNT HERO",
      signIn: () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => {
        order.push("guest");
        state = { ...state, guestSessionApproved: true };
        return { ok: true };
      },
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: () => () => {},
      loadGame: async () => { order.push("game"); },
    }, ui);
    gate.start();

    ui.guestButton.click();
    await Promise.resolve();

    expect(order).toEqual(["guest", "game"]);
    expect(ui.loadingDetail.textContent).toBe("Loading Guest Profile");
  });
});

describe("deferred game assets", () => {
  it("checks the deployed version when an old hashed game bundle fails", async () => {
    const listeners = new Map<string, () => void>();
    const script = {
      id: "", src: "", async: true, remove: vi.fn(),
      addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    };
    const checkForUpdate = vi.fn();
    const doc = {
      body: { classList: { add: vi.fn() }, append: vi.fn() },
      querySelectorAll: () => [],
      getElementById: (id: string) => id === "wildstatCoopScript" ? { dataset: { gameSrc: "assets/wildstat/game.oldhash.js" } } : null,
      createElement: () => script,
    } as unknown as Document;
    const loading = loadDeferredGameBundle(doc, checkForUpdate);
    const failed = expect(loading).rejects.toThrow("Failed to load assets/wildstat/game.oldhash.js");
    listeners.get("error")!();
    await failed;
    expect(script.remove).toHaveBeenCalledOnce();
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it("requests game-only images when the loading screen hands off to game.js", () => {
    const addClass = vi.fn();
    const image = { dataset: { gameSrc: "assets/wildstat/gender/male-v2.png" }, src: "" };
    requestDeferredGameAssets({
      body: { classList: { add: addClass } },
      querySelectorAll: () => [image],
    } as unknown as Document);

    expect(addClass).toHaveBeenCalledWith("is-loading-game-assets");
    expect(image.src).toBe("assets/wildstat/gender/male-v2.png");
    expect(image.dataset.gameSrc).toBeUndefined();
  });
});

describe("outbound sign-in presentation", () => {
  it("keeps the account screen visible until navigation instead of flashing verification first", async () => {
    const ui = elements();
    let notify = () => {};
    let state = { signInReady: true, returningFromSignIn: false };
    let finish!: (result: { ok: boolean; redirecting: boolean }) => void;
    const gate = createStartupAuthGate({
      accountState: () => state,
      knownCharacter: () => "Player",
      signIn: () => new Promise(resolve => { finish = resolve; }),
      continueAsGuest: () => ({ ok: true }),
      legalConsentAccepted: () => true,
      acceptLegalTerms: async () => ({ ok: true }),
      subscribe: listener => { notify = listener; return () => {}; },
      loadGame: async () => {},
    }, ui);
    gate.start();
    ui.signInButton.click();
    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.connectionPanel.hidden).toBe(true);
    expect(ui.signInButton.disabled).toBe(true);
    state = { ...state, returningFromSignIn: true };
    notify();
    expect(ui.accountChoicePanel.hidden).toBe(false);
    expect(ui.connectionPanel.hidden).toBe(true);
    finish({ ok: true, redirecting: true });
    await Promise.resolve();
    expect(ui.connectionPanel.hidden).toBe(true);
    gate.dispose();
  });
});
