import { describe, expect, it, vi } from "vitest";
import { createStartupAuthGate, type StartupAuthElements } from "./startup-auth-gate";

class FakeElement {
  hidden = false;
  disabled = false;
  textContent = "";
  style = { display: "", width: "" };
  private classes = new Set<string>();
  private listeners = new Map<string, Set<() => void>>();
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
  addEventListener(name: string, listener: () => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }
  click() {
    for (const listener of this.listeners.get("click") ?? []) listener();
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
  } as unknown as StartupAuthElements & {
    signInButton: FakeElement;
    guestButton: FakeElement;
  };
}

describe("startup auth gate", () => {
  it("keeps the game unloaded while the player is choosing an identity", () => {
    const ui = elements();
    const loadGame = vi.fn(async () => {});
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "",
      signIn: async () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => ({ ok: true }),
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
    const gate = createStartupAuthGate({
      accountState: () => ({ signInReady: true }),
      knownCharacter: () => "ACCOUNT HERO",
      signIn: () => ({ ok: true, redirecting: true }),
      continueAsGuest: () => { order.push("guest"); return { ok: true }; },
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
