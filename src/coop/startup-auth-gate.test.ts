import { describe, expect, it, vi } from "vitest";
import { createStartupAuthGate, type StartupAuthElements } from "./startup-auth-gate";

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
    expect(loadGame).not.toHaveBeenCalled();
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
    expect(ui.loadingDetail.textContent).toBe("LOADING YOUR CHARACTER");
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
    expect(ui.loadingDetail.textContent).toBe("VERIFYING SIGN-IN");
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
    expect(ui.loadingDetail.textContent).toBe("LOADING GUEST PROFILE");
  });
});
