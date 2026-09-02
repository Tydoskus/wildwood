import { describe, expect, it } from "vitest";
import {
  createStartupStateMachine,
  deriveStartupState,
} from "./startup-state-machine";

const runtimeBase = {
  legalAccepted: true,
  shellReady: true,
  runtimeReady: false,
  started: false,
  startupKind: null,
};

describe("startup state derivation", () => {
  it("keeps identity choice ahead of legal consent", () => {
    expect(deriveStartupState("game-runtime", {
      ...runtimeBase,
      legalAccepted: false,
      account: {},
    })).toEqual({ value: "account-choice", detail: "" });
  });

  it("shows callback verification before account choice", () => {
    expect(deriveStartupState("auth-shell", {
      account: { returningFromSignIn: true },
      legalAccepted: false,
      shellReady: true,
    })).toEqual({ value: "verifying-sign-in" });
  });

  it("loads the game bundle only after identity and legal approval", () => {
    expect(deriveStartupState("auth-shell", {
      account: { guestSessionApproved: true },
      legalAccepted: true,
      shellReady: true,
    })).toEqual({ value: "loading-game", status: "ready" });
  });

  it("waits for runtime readiness before choosing the character path", () => {
    const account = { signedIn: true };
    expect(deriveStartupState("game-runtime", { ...runtimeBase, account, startupKind: "returning" })).toEqual({ value: "loading-runtime" });
    expect(deriveStartupState("game-runtime", { ...runtimeBase, account, runtimeReady: true, startupKind: "new" })).toEqual({ value: "new-player" });
    expect(deriveStartupState("game-runtime", { ...runtimeBase, account, runtimeReady: true, startupKind: "returning" })).toEqual({ value: "entering-game" });
  });

  it("models a retryable runtime connection failure explicitly", () => {
    expect(deriveStartupState("game-runtime", {
      ...runtimeBase,
      account: { guestSessionApproved: true },
      connectionIssue: { message: "World sync timed out" },
    })).toEqual({ value: "connection-failed", message: "World sync timed out" });
  });

  it("gives session conflict and an already running game highest precedence", () => {
    expect(deriveStartupState("game-runtime", {
      ...runtimeBase,
      account: { signedIn: true, sessionConflict: true },
      started: true,
    })).toEqual({ value: "session-conflict" });
    expect(deriveStartupState("game-runtime", {
      ...runtimeBase,
      account: { signedIn: true },
      started: true,
    })).toEqual({ value: "running" });
  });

  it("returns an already-started game to account recovery only after approval is lost", () => {
    expect(deriveStartupState("game-runtime", { ...runtimeBase, account: {}, started: true })).toEqual({ value: "account-choice", detail: "" });
    expect(deriveStartupState("game-runtime", {
      ...runtimeBase,
      account: { gameSessionApproved: true },
      started: true,
    })).toEqual({ value: "running" });
  });
});

describe("startup state machine", () => {
  it("keeps an account action explicit until it completes", () => {
    const machine = createStartupStateMachine("auth-shell");
    const snapshot = { account: {}, legalAccepted: true, shellReady: true };
    machine.sync(snapshot);

    machine.dispatch({ type: "begin-account-action", action: "sign-in", detail: "Opening Sign-In…" });
    expect(machine.state()).toEqual({ value: "account-action", action: "sign-in", detail: "Opening Sign-In…" });
    machine.sync(snapshot);
    expect(machine.state().value).toBe("account-action");

    machine.dispatch({ type: "fail-account-action", detail: "SIGN-IN FAILED · TRY AGAIN" });
    expect(machine.state()).toEqual({ value: "account-choice", detail: "SIGN-IN FAILED · TRY AGAIN" });
  });

  it("lets a session conflict preempt an in-flight account action", () => {
    const machine = createStartupStateMachine("auth-shell");
    machine.sync({ account: {}, legalAccepted: true, shellReady: true });
    machine.dispatch({ type: "begin-account-action", action: "guest", detail: "Loading Guest Profile" });

    machine.sync({ account: { sessionConflict: true }, legalAccepted: true, shellReady: true });

    expect(machine.state()).toEqual({ value: "session-conflict" });
  });

  it("keeps an explicit takeover action over its source conflict and returns on failure", () => {
    const machine = createStartupStateMachine("game-runtime");
    const snapshot = {
      ...runtimeBase,
      account: { signedIn: true, sessionConflict: true },
    };
    machine.sync(snapshot);
    machine.dispatch({ type: "begin-account-action", action: "takeover", detail: "Signing Out Other Tab…" });
    machine.sync(snapshot);
    expect(machine.state()).toEqual({
      value: "account-action",
      action: "takeover",
      detail: "Signing Out Other Tab…",
    });

    machine.dispatch({ type: "fail-account-action", detail: "TAKEOVER FAILED · TRY AGAIN" });
    expect(machine.state()).toEqual({ value: "session-conflict" });
  });

  it("lets an OAuth navigation state replace the opening action and return cleanly", () => {
    const machine = createStartupStateMachine("auth-shell");
    const base = { legalAccepted: true, shellReady: true };
    machine.sync({ ...base, account: {} });
    machine.dispatch({ type: "begin-account-action", action: "sign-in", detail: "Opening Sign-In…" });

    machine.sync({ ...base, account: { returningFromSignIn: true } });
    expect(machine.state()).toEqual({ value: "verifying-sign-in" });

    machine.sync({ ...base, account: {} });
    expect(machine.state()).toEqual({ value: "account-choice", detail: "" });
  });

  it("clears a transient account failure detail on the next external snapshot", () => {
    const machine = createStartupStateMachine("auth-shell");
    const snapshot = { account: {}, legalAccepted: true, shellReady: true };
    machine.sync(snapshot);
    machine.dispatch({ type: "begin-account-action", action: "sign-in", detail: "Opening Sign-In…" });
    machine.dispatch({ type: "fail-account-action", detail: "SIGN-IN FAILED · TRY AGAIN" });

    machine.sync(snapshot);

    expect(machine.state()).toEqual({ value: "account-choice", detail: "" });
  });

  it("does not request the deferred game bundle twice", () => {
    const machine = createStartupStateMachine("auth-shell");
    const snapshot = {
      account: { guestSessionApproved: true },
      legalAccepted: true,
      shellReady: true,
    };
    expect(machine.sync(snapshot).state).toEqual({ value: "loading-game", status: "ready" });
    machine.dispatch({ type: "begin-game-load" });
    expect(machine.sync(snapshot).state).toEqual({ value: "loading-game", status: "loading" });
  });

  it("keeps update and game-load failures terminal for the current page", () => {
    const runtime = createStartupStateMachine("game-runtime");
    runtime.dispatch({ type: "update-detected", version: "0.600" });
    runtime.sync({ account: { signedIn: true }, legalAccepted: true, shellReady: true, runtimeReady: true, started: true });
    expect(runtime.state()).toEqual({ value: "updating", version: "0.600" });

    const auth = createStartupStateMachine("auth-shell");
    auth.sync({ account: { signedIn: true }, legalAccepted: true, shellReady: true });
    auth.dispatch({ type: "begin-game-load" });
    auth.dispatch({ type: "fail-game-load", message: "Game Load Failed · Refresh to Try Again" });
    auth.sync({ account: {}, legalAccepted: true, shellReady: true });
    expect(auth.state().value).toBe("failed");
  });

  it("ignores events that are illegal for the current state", () => {
    const machine = createStartupStateMachine("auth-shell");
    expect(machine.dispatch({ type: "begin-game-load" }).changed).toBe(false);
    expect(machine.dispatch({ type: "fail-account-action", detail: "no action" }).changed).toBe(false);
    expect(machine.state()).toEqual({ value: "loading-shell" });
  });
});
