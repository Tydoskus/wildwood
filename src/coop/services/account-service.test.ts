import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountService } from "./account-service";
import { createUpdateResumeStore } from "./update-resume-store";
import { inspectSpacetimeIdToken, OidcIdTokenError } from "../security/oidc-id-token";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

class FakeTokenRequest {
  timeout = 0;
  status: number;
  responseText: string;
  onload: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  ontimeout: ((event: ProgressEvent) => void) | null = null;
  onabort: ((event: ProgressEvent) => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

  constructor(status = 200, response: unknown = {}, autoLoad = true) {
    this.status = status;
    this.responseText = JSON.stringify(response);
    if (autoLoad) this.send.mockImplementation(() => queueMicrotask(() => this.onload?.({} as ProgressEvent)));
  }
}

function stubTokenRequest(request: FakeTokenRequest) {
  vi.stubGlobal("XMLHttpRequest", vi.fn(function XMLHttpRequestMock() { return request; }));
}

const keys = {
  tokenKey: "token",
  guestTokenKey: "guest-token",
  accountTokenKey: "account-token",
  accountLinkKey: "account-link",
  accountMigrationPendingKey: "migration",
  authStateKey: "auth-state",
  authVerifierKey: "auth-verifier",
  authNonceKey: "auth-nonce",
  authRetryKey: "auth-retry",
  knownAccountKey: "known-account",
  knownAccountCharacterKey: "known-account-character",
  knownAccountGenderKey: "known-account-gender",
  knownGuestCharacterKey: "known-guest-character",
  authReturnUiKey: "auth-return",
  authTabKey: "auth-tab",
  legalConsentKey: "legal-consent",
};

function encodeJson(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function accountToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return `${encodeJson({ alg: "RS256", kid: "test-key", typ: "JWT" })}.${encodeJson({
    iss: SPACETIME_AUTH_ISSUER,
    aud: SPACETIME_AUTH_CLIENT_ID,
    sub: "account-subject",
    iat: now - 30,
    exp: now + 3_600,
    nonce: "expected-nonce",
    ...overrides,
  })}.c2lnbmF0dXJl`;
}

function setup(options: {
  accountToken?: string;
  guestToken?: string;
  knownAccount?: boolean;
  signedIn?: boolean;
  authCallback?: boolean;
  validateAccountIdToken?: (token: string, expectedNonce: string) => Promise<ReturnType<typeof inspectSpacetimeIdToken>>;
} = {}) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  if (options.accountToken) local.setItem(keys.accountTokenKey, options.accountToken);
  if (options.guestToken) local.setItem(keys.guestTokenKey, options.guestToken);
  if (options.knownAccount) local.setItem(keys.knownAccountKey, "true");
  if (options.authCallback) {
    session.setItem(keys.authStateKey, "expected-state");
    session.setItem(keys.authVerifierKey, "expected-verifier");
    session.setItem(keys.authNonceKey, "expected-nonce");
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
    validateAccountIdToken: options.validateAccountIdToken ?? (async (token, expectedNonce) => (
      inspectSpacetimeIdToken(token, { expectedNonce })
    )),
  });
  return { assign, connect, local, session, notify, replaceState, requestWorldEntry, restartConnectionForIdentityChange, service };
}

describe("account service startup identity selection", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a fresh browser from Verifying Sign-In after a rejected OAuth callback", async () => {
    stubTokenRequest(new FakeTokenRequest(400, { error: "invalid_grant" }));
    const { notify, replaceState, service } = setup({ authCallback: true, knownAccount: true });

    await service.restoreKnownAccount();

    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "SIGN-IN FAILED · TRY AGAIN",
    });
    expect(notify).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith({}, "", "/game");
  });

  it("times out a stalled OAuth token exchange instead of verifying forever", async () => {
    const request = new FakeTokenRequest(0, {}, false);
    stubTokenRequest(request);
    const { notify, service } = setup({ authCallback: true, knownAccount: true });

    const restore = service.restoreKnownAccount();
    expect(request.timeout).toBe(15_000);
    request.ontimeout?.({} as ProgressEvent);
    await restore;

    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "SIGN-IN TIMED OUT · TRY AGAIN",
    });
    expect(notify).toHaveBeenCalled();
  });

  it("exchanges the callback with a form POST before connecting the account", async () => {
    const freshToken = accountToken();
    const request = new FakeTokenRequest(200, { id_token: freshToken });
    stubTokenRequest(request);
    const validateAccountIdToken = vi.fn(async (token: string, expectedNonce: string) => (
      inspectSpacetimeIdToken(token, { expectedNonce })
    ));
    const { connect, local, service } = setup({ authCallback: true, validateAccountIdToken });

    await service.restoreKnownAccount();

    expect(request.open).toHaveBeenCalledWith("POST", "https://auth.spacetimedb.com/oidc/token", true);
    expect(request.setRequestHeader).toHaveBeenCalledWith("content-type", "application/x-www-form-urlencoded");
    expect(request.send).toHaveBeenCalledWith(expect.stringContaining("code_verifier=expected-verifier"));
    expect(validateAccountIdToken).toHaveBeenCalledWith(freshToken, "expected-nonce");
    expect(local.getItem(keys.accountTokenKey)).toBe(freshToken);
    expect(service.api.accountState().notice).toBe("SIGNED IN");
    expect(connect).toHaveBeenCalledOnce();
  });

  it("rejects a callback ID token whose nonce does not match the initiating tab", async () => {
    const request = new FakeTokenRequest(200, { id_token: accountToken({ nonce: "attacker-nonce" }) });
    stubTokenRequest(request);
    const { connect, local, service } = setup({ authCallback: true });

    await service.restoreKnownAccount();

    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "SIGN-IN CHECK FAILED · TRY AGAIN",
    });
  });

  it("rejects a callback that identifies a different authorization issuer", async () => {
    const { connect, local, service } = setup({ authCallback: true });
    window.location.href = "https://wildstat.example/game?code=authorization-code&state=expected-state&iss=https%3A%2F%2Fattacker.example%2Foidc";

    await service.restoreKnownAccount();

    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(service.api.accountState().notice).toBe("SIGN-IN CHECK FAILED");
  });

  it("shows a retryable security-check state when signing keys are unavailable", async () => {
    stubTokenRequest(new FakeTokenRequest(200, { id_token: accountToken() }));
    const { connect, local, service } = setup({
      authCallback: true,
      validateAccountIdToken: async () => { throw new OidcIdTokenError("keys"); },
    });

    await service.restoreKnownAccount();

    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(service.api.accountState().notice).toBe("SIGN-IN CHECK UNAVAILABLE · TRY AGAIN");
  });

  it.each(["WildStat", "Wildstat", "Wildwood"])("keeps an existing signed-in save after a %s account-link rejection", async (name) => {
    const existingAccountToken = accountToken();
    const { local, session, service } = setup({
      accountToken: existingAccountToken,
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
    expect(local.getItem(keys.accountTokenKey)).toBe(existingAccountToken);
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
    const { assign, connect, service, session } = setup();

    const result = await service.api.signIn();

    expect(result).toMatchObject({ ok: true, redirecting: true });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    const authorizationUrl = new URL(assign.mock.calls[0][0]);
    expect(authorizationUrl.searchParams.get("nonce")).toBe(session.getItem(keys.authNonceKey));
    expect(session.getItem(keys.authNonceKey)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("clears a malformed persisted account token before connection", async () => {
    const { connect, local, service } = setup({
      accountToken: "not-a-jwt",
      knownAccount: true,
    });

    await service.restoreKnownAccount();

    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(service.api.accountState().notice).toBe("SIGN-IN REQUIRED");
  });

  it("cancels an outbound OAuth flow restored from the back-forward cache without a callback", async () => {
    const { notify, session, service } = setup();

    await service.api.signIn();
    expect(service.api.accountState().returningFromSignIn).toBe(true);
    expect(session.getItem(keys.authReturnUiKey)).toBe("true");

    expect(service.cancelAbandonedSignIn()).toBe(true);
    expect(service.api.accountState()).toMatchObject({
      authInProgress: false,
      returningFromSignIn: false,
      notice: "",
    });
    expect(service.isSessionApproved()).toBe(false);
    expect(session.getItem(keys.authReturnUiKey)).toBeNull();
    expect(session.getItem(keys.authStateKey)).toBeNull();
    expect(session.getItem(keys.authVerifierKey)).toBeNull();
    expect(session.getItem(keys.authNonceKey)).toBeNull();
    expect(notify).toHaveBeenCalled();
  });

  it("does not cancel a genuine OAuth callback", () => {
    const { session, service } = setup({ authCallback: true });

    expect(service.cancelAbandonedSignIn()).toBe(false);
    expect(service.api.accountState()).toMatchObject({
      authInProgress: true,
      returningFromSignIn: true,
    });
    expect(session.getItem(keys.authReturnUiKey)).toBe("true");
  });

  it("connects a returning guest in the auth layer so their save can be linked", async () => {
    const { connect, service } = setup({ guestToken: "guest-token-value" });

    await service.restoreKnownAccount();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(service.api.accountState().signInReady).toBe(false);
  });

  it("silently clears account auth but preserves the remembered account when Guest is chosen", () => {
    const { local, restartConnectionForIdentityChange, service } = setup({
      accountToken: accountToken(),
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
