import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountService } from "./account-service";
import { createUpdateResumeStore } from "./update-resume-store";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const keys = {
  tokenKey: "token",
  guestTokenKey: "guest-token",
  accountTokenKey: "account-token",
  accountLinkKey: "account-link",
  accountMigrationPendingKey: "migration",
  authStateKey: "auth-state",
  authVerifierKey: "auth-verifier",
  authRetryKey: "auth-retry",
  knownAccountKey: "known-account",
  knownAccountCharacterKey: "known-account-character",
  knownAccountGenderKey: "known-account-gender",
  knownGuestCharacterKey: "known-guest-character",
  authReturnUiKey: "auth-return",
  authTabKey: "auth-tab",
  legalConsentKey: "legal-consent",
};

function setup(options: { accountToken?: string; guestToken?: string; knownAccount?: boolean; signedIn?: boolean; authCallback?: boolean } = {}) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  if (options.accountToken) local.setItem(keys.accountTokenKey, options.accountToken);
  if (options.guestToken) local.setItem(keys.guestTokenKey, options.guestToken);
  if (options.knownAccount) local.setItem(keys.knownAccountKey, "true");
  if (options.authCallback) {
    session.setItem(keys.authStateKey, "expected-state");
    session.setItem(keys.authVerifierKey, "expected-verifier");
    session.setItem(keys.authReturnUiKey, "true");
  }
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  const assign = vi.fn();
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: options.authCallback
        ? "https://wildstat.example/game?code=authorization-code&state=expected-state"
        : "https://wildstat.example/game",
      origin: "https://wildstat.example",
      pathname: "/game",
      assign,
      reload: vi.fn(),
    },
  });
  vi.stubGlobal("history", { replaceState });
  const connect = vi.fn();
  const notify = vi.fn();
  const restartConnectionForIdentityChange = vi.fn();
  const requestWorldEntry = vi.fn(async () => true);
  const connection = options.signedIn ? { isActive: true, reducers: {} } : null;
  const service = createAccountService({
    keys,
    updateResumeMode: null,
    updateResumeStore: createUpdateResumeStore(session, "update-resume"),
    notify,
    connection: () => connection as never,
    connectedSignedIn: () => Boolean(options.signedIn),
    hydrationReady: () => false,
    protocolBlocked: () => false,
    protocolReady: () => true,
    updating: () => false,
    worldEntryBlocked: () => false,
    setWorldEntryBlocked: () => {},
    resetWorldEntryGeneration: () => {},
    requestWorldEntry,
    connect,
    restartConnectionForIdentityChange,
    scheduleReconnect: () => {},
    runWorldReducer: async (reducer) => reducer(),
    handleFailure: () => {},
    errorMessage: (error) => String(error),
    localIdentity: () => "guest-identity",
    localProfileReady: () => false,
    localDisplayName: () => "",
    localGender: () => 0,
    localProgress: () => null,
    drainPendingProgress: async () => true,
    clearPendingProgress: () => {},
    disconnectVirtualPlayers: vi.fn(),
  });
  return { assign, connect, local, session, notify, replaceState, requestWorldEntry, restartConnectionForIdentityChange, service };
}

describe("account service startup identity selection", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a fresh browser from Verifying Sign-In after a rejected OAuth callback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "invalid_grant" }),
    })));
    const { notify, replaceState, service } = setup({ authCallback: true });

    await service.restoreKnownAccount();

    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "SIGN-IN FAILED",
    });
    expect(notify).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith({}, "", "/game");
  });

  it("times out a stalled OAuth token exchange instead of verifying forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const { notify, service } = setup({ authCallback: true });

    const restore = service.restoreKnownAccount();
    await vi.advanceTimersByTimeAsync(15_000);
    await restore;

    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "SIGN-IN FAILED",
    });
    expect(notify).toHaveBeenCalled();
  });

  it.each(["Wildstat", "Wildwood"])("keeps an existing signed-in save after a %s account-link rejection", async (name) => {
    const { local, session, service } = setup({
      accountToken: "existing-account-token",
      guestToken: "existing-guest-token",
      knownAccount: true,
      signedIn: true,
    });
    session.setItem(keys.accountLinkKey, JSON.stringify({ code: "private-link", guestIdentity: "guest-identity" }));
    session.setItem(keys.authTabKey, "test-tab");
    local.setItem(keys.accountMigrationPendingKey, JSON.stringify({ "test-tab": Date.now() }));
    const disconnect = vi.fn();
    const connection = {
      reducers: { claimGuestAccount: vi.fn().mockRejectedValue(new Error(`This account already has ${name} progress.`)) },
      disconnect,
    };

    await expect(service.claimAccountLink(connection as never, true, () => true)).resolves.toBe(true);
    expect(local.getItem(keys.accountTokenKey)).toBe("existing-account-token");
    expect(session.getItem(keys.accountLinkKey)).toBeNull();
    expect(local.getItem(keys.accountMigrationPendingKey)).toBeNull();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("does not create a guest connection before a fresh visitor chooses", async () => {
    const { connect, service } = setup();

    await service.restoreKnownAccount();

    expect(connect).not.toHaveBeenCalled();
    expect(service.api.accountState().signInReady).toBe(true);
    expect(service.canConnect()).toBe(false);
  });

  it("starts OAuth directly for a fresh registration without loading a guest", async () => {
    const { assign, connect, service } = setup();

    const result = await service.api.signIn();

    expect(result).toMatchObject({ ok: true, redirecting: true });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects a returning guest in the auth layer so their save can be linked", async () => {
    const { connect, service } = setup({ guestToken: "guest-token-value" });

    await service.restoreKnownAccount();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(service.api.accountState().signInReady).toBe(false);
  });

  it("silently clears account auth but preserves the remembered account when Guest is chosen", () => {
    const { local, restartConnectionForIdentityChange, service } = setup({
      accountToken: "opaque-account-token",
      guestToken: "guest-token-value",
      knownAccount: true,
    });

    const result = service.api.continueAsGuest();

    expect(result).toEqual({ ok: true });
    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(local.getItem(keys.knownAccountKey)).toBe("true");
    expect(service.api.accountState().guestSessionApproved).toBe(true);
    expect(restartConnectionForIdentityChange).toHaveBeenCalledTimes(1);
  });
});
