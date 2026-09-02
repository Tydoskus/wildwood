import { describe, expect, it } from "vitest";
import { resolveStartupRoute } from "./startup-route";

const runtimeBase = {
  mode: "game-runtime" as const,
  legalAccepted: true,
  shellReady: true,
  runtimeReady: false,
  started: false,
  startupKind: null,
};

describe("startup route", () => {
  it("keeps identity choice ahead of legal consent", () => {
    expect(resolveStartupRoute({
      ...runtimeBase,
      legalAccepted: false,
      account: {},
    })).toBe("account-choice");
  });

  it("shows callback verification before account choice", () => {
    expect(resolveStartupRoute({
      mode: "auth-shell",
      account: { returningFromSignIn: true },
      legalAccepted: false,
      shellReady: true,
    })).toBe("verifying-sign-in");
  });

  it("loads the game bundle only after identity and legal approval", () => {
    expect(resolveStartupRoute({
      mode: "auth-shell",
      account: { guestSessionApproved: true },
      legalAccepted: true,
      shellReady: true,
    })).toBe("load-game");
  });

  it("waits for runtime readiness before choosing the character path", () => {
    const account = { signedIn: true };
    expect(resolveStartupRoute({ ...runtimeBase, account, startupKind: "returning" })).toBe("loading");
    expect(resolveStartupRoute({ ...runtimeBase, account, runtimeReady: true, startupKind: "new" })).toBe("new-player");
    expect(resolveStartupRoute({ ...runtimeBase, account, runtimeReady: true, startupKind: "returning" })).toBe("enter-game");
  });

  it("gives session conflict and an already running game highest precedence", () => {
    expect(resolveStartupRoute({
      ...runtimeBase,
      account: { signedIn: true, sessionConflict: true },
      started: true,
    })).toBe("session-conflict");
    expect(resolveStartupRoute({ ...runtimeBase, account: { signedIn: true }, started: true })).toBe("running");
  });

  it("returns an already-started game to account recovery only after approval is lost", () => {
    expect(resolveStartupRoute({ ...runtimeBase, account: {}, started: true })).toBe("account-choice");
    expect(resolveStartupRoute({
      ...runtimeBase,
      account: { gameSessionApproved: true },
      started: true,
    })).toBe("running");
  });
});
