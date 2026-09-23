import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountService } from "./account-service";
import { recordCarriedConnectionDiagnostic } from "./connection-diagnostic-runtime";
vi.mock("./connection-diagnostic-runtime", () => ({ recordConnectionDiagnostic: vi.fn(), recordCarriedConnectionDiagnostic: vi.fn() }));
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
  authTripKey: "auth-trip",
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
  protocolBlocked?: boolean;
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
  const disconnect = vi.fn();
  let connection = options.signedIn ? { isActive: true, reducers: { enterWorldWithTutorial: vi.fn(async () => {}) }, disconnect } : null;
  let worldEntryBlocked = false;
  const setWorldEntryBlocked = vi.fn((blocked: boolean) => { worldEntryBlocked = blocked; });
  const handleFailure = vi.fn();
  const drainPendingProgress = vi.fn(async () => true);
  const clearPendingProgress = vi.fn();
  const service = createAccountService({
    keys,
    updateResumeMode: null,
    updateResumeStore: createUpdateResumeStore(session, "update-resume"),
    notify,
    connection: () => connection as never,
    connectedSignedIn: () => Boolean(options.signedIn),
    hydrationReady: () => false,
    protocolBlocked: () => options.protocolBlocked ?? false,
    protocolReady: () => true,
    updating: () => false,
    worldEntryBlocked: () => worldEntryBlocked,
    setWorldEntryBlocked,
    requestWorldEntry,
    connect,
    restartConnectionForIdentityChange,
    scheduleReconnect: () => {},
    runWorldReducer: async (reducer) => reducer(),
    handleFailure,
    errorMessage: (error) => String(error),
    localIdentity: () => "guest-identity",
    localProfileReady: () => false,
    localDisplayName: () => "",
    localGender: () => 0,
    localProgress: () => null,
    drainPendingProgress,
    clearPendingProgress,
    disconnectVirtualPlayers: vi.fn(),
    validateAccountIdToken: options.validateAccountIdToken ?? (async (token, expectedNonce) => (
      inspectSpacetimeIdToken(token, { expectedNonce })
    )),
  });
  return { assign, connect, disconnect, local, session, notify, replaceState, requestWorldEntry, restartConnectionForIdentityChange, service,
    connection, setConnection: (value: typeof connection) => { connection = value; }, setWorldEntryBlocked, handleFailure,
    drainPendingProgress, clearPendingProgress };
}

describe("guest registration from both entry points", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each(["settings", "sign-in page"])("prepares and claims the same guest save from %s", async entry => {
    const f = setup({ guestToken: "existing-guest" });
    if (entry === "settings") f.service.api.continueAsGuest();
    else { await f.service.restoreKnownAccount(); expect(f.connect).toHaveBeenCalledOnce(); }
    const beginAccountLink = vi.fn(async () => {}), claimGuestAccount = vi.fn(async () => {});
    const connection = { isActive: true, disconnect: vi.fn(), reducers: { beginAccountLink, claimGuestAccount } };
    f.setConnection(connection as never);
    expect(await f.service.api.signIn()).toMatchObject({ ok: true, redirecting: true });
    expect(f.requestWorldEntry).toHaveBeenCalledOnce();
    expect(f.drainPendingProgress).toHaveBeenCalledOnce();
    expect(f.drainPendingProgress.mock.invocationCallOrder[0]).toBeLessThan(beginAccountLink.mock.invocationCallOrder[0]);
    expect(beginAccountLink.mock.invocationCallOrder[0]).toBeLessThan(f.assign.mock.invocationCallOrder[0]);
    const link = JSON.parse(f.session.getItem(keys.accountLinkKey)!);
    expect(link.guestIdentity).toBe("guest-identity");
    expect(beginAccountLink).toHaveBeenCalledWith({ code: link.code });
    expect(f.local.getItem(keys.guestTokenKey)).toBe("existing-guest");
    const state = f.session.getItem(keys.authStateKey), nonce = f.session.getItem(keys.authNonceKey);
    window.location.href = `https://wildstat.example/game?code=verified-code&state=${state}`;
    const token = accountToken({ nonce });
    stubTokenRequest(new FakeTokenRequest(200, { id_token: token }));
    await f.service.restoreKnownAccount();
    expect(f.local.getItem(keys.accountTokenKey)).toBe(token);
    expect(f.local.getItem(keys.guestTokenKey)).toBe("existing-guest");
    expect(await f.service.claimAccountLink(connection as never, true, () => true)).toBe(true);
    expect(claimGuestAccount).toHaveBeenCalledWith({ code: link.code });
    expect(f.clearPendingProgress).toHaveBeenCalledWith("guest-identity");
    expect(f.local.getItem(keys.guestTokenKey)).toBeNull();
    expect(f.session.getItem(keys.accountLinkKey)).toBeNull();
    await f.service.claimAccountLink(connection as never, true, () => true);
    expect(claimGuestAccount).toHaveBeenCalledOnce();
  });
  it("does not navigate away when saving the guest fails", async () => {
    const f = setup({ guestToken: "existing-guest" }), beginAccountLink = vi.fn();
    f.setConnection({ isActive: true, reducers: { beginAccountLink } } as never);
    f.drainPendingProgress.mockResolvedValue(false);
    expect(await f.service.api.signIn()).toMatchObject({ ok: false, error: "GUEST SAVE FAILED" });
    expect(f.assign).not.toHaveBeenCalled(); expect(beginAccountLink).not.toHaveBeenCalled();
    expect(f.local.getItem(keys.guestTokenKey)).toBe("existing-guest");
  });
  it.each(["Account link expired. Sign in again.", "This account already has Wildwood progress."])(
    "retains the guest save after a rejected claim: %s", async error => {
      const f = setup({ guestToken: "existing-guest", accountToken: accountToken() });
      f.session.setItem(keys.accountLinkKey, JSON.stringify({ code: "pending-link", guestIdentity: "guest-identity" }));
      const connection = { disconnect: vi.fn(), reducers: { claimGuestAccount: vi.fn().mockRejectedValue(error) } };
      await f.service.claimAccountLink(connection as never, true, () => true);
      expect(f.local.getItem(keys.guestTokenKey)).toBe("existing-guest");
      expect(f.clearPendingProgress).not.toHaveBeenCalled();
    });
});

it("approves a cryptographically verified callback even when the UI return marker is missing", async () => {
  const token = accountToken();
  stubTokenRequest(new FakeTokenRequest(200, { id_token: token }));
  // Simulate a callback reaching a service initialized before the native bridge
  // restored tab state: it did not start with session approval.
  const fresh = setup();
  fresh.session.setItem(keys.authStateKey, "expected-state");
  fresh.session.setItem(keys.authVerifierKey, "expected-verifier");
  fresh.session.setItem(keys.authNonceKey, "expected-nonce");
  window.location.href = "https://wildstat.example/game?code=one&state=expected-state";
  await fresh.service.restoreKnownAccount();
  expect(fresh.service.isSessionApproved()).toBe(true);
  expect(fresh.connect).toHaveBeenCalledOnce();
});

describe("explicit session takeover", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function freshConnection() {
    return { isActive: true, disconnect: vi.fn(), reducers: { enterWorldWithTutorial: vi.fn(async () => {}) } };
  }
  it("restarts even a nominally active socket and takes over once on the fresh connection", async () => {
    const f = setup({ signedIn: true, accountToken: accountToken(), knownAccount: true });
    f.setWorldEntryBlocked(true);
    await f.service.api.takeOverSession(); await f.service.api.takeOverSession();
    expect(f.connection!.reducers.enterWorldWithTutorial).not.toHaveBeenCalled();
    expect(f.restartConnectionForIdentityChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.service.canConnect()).toBe(true);
    const fresh = freshConnection(); f.setConnection(fresh);
    expect(await f.service.handlePendingTakeover(fresh as never, () => true)).toBe(true);
    expect(fresh.reducers.enterWorldWithTutorial).toHaveBeenCalledExactlyOnceWith({ tabId: f.service.tabId(), forceTakeover: true });
    expect(fresh.disconnect).not.toHaveBeenCalled();
    expect(f.service.api.accountState().sessionConflict).toBe(false);
    await f.service.handlePendingTakeover(fresh as never, () => true);
    expect(fresh.reducers.enterWorldWithTutorial).toHaveBeenCalledTimes(1);
  });
  it("also reconnects disconnected accounts and guests without falling back to account choice", async () => {
    for (const options of [{ accountToken: accountToken(), knownAccount: true }, { guestToken: "guest" }]) {
      const f = setup(options);
      await f.service.api.takeOverSession();
      expect(f.restartConnectionForIdentityChange).toHaveBeenCalledWith(true);
      expect(f.service.canConnect()).toBe(true);
      expect(f.service.api.accountState().gameSessionApproved).toBe(true);
    }
  });
  it("ignores a late failure from an abandoned connection and retains the request for its replacement", async () => {
    const f = setup({ guestToken: "guest" }); await f.service.api.takeOverSession();
    const stale = freshConnection(); let reject!: (error: Error) => void;
    stale.reducers.enterWorldWithTutorial.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    let current = true;
    const pending = f.service.handlePendingTakeover(stale as never, () => current);
    current = false; reject(new Error("Connection closed"));
    expect(await pending).toBe(false);
    expect(f.handleFailure).not.toHaveBeenCalled();
    const fresh = freshConnection();
    expect(await f.service.handlePendingTakeover(fresh as never, () => true)).toBe(true);
    expect(fresh.reducers.enterWorldWithTutorial).toHaveBeenCalledTimes(1);
  });
  it("retries a closed transport without turning it into another session conflict", async () => {
    const f = setup({ guestToken: "guest" }); await f.service.api.takeOverSession();
    const closed = freshConnection(); closed.isActive = false;
    closed.reducers.enterWorldWithTutorial.mockRejectedValue(new Error("Connection closed"));
    expect(await f.service.handlePendingTakeover(closed as never, () => true)).toBe(false);
    expect(f.restartConnectionForIdentityChange).toHaveBeenCalledTimes(2);
    expect(f.service.api.accountState().sessionConflict).toBe(false);
    expect(await f.service.handlePendingTakeover(freshConnection() as never, () => true)).toBe(true);
  });
  it("makes a rejected takeover retryable", async () => {
    const f = setup({ guestToken: "guest" }); await f.service.api.takeOverSession();
    const conn = freshConnection(); conn.reducers.enterWorldWithTutorial.mockRejectedValueOnce(new Error("Rejected"));
    expect(await f.service.handlePendingTakeover(conn as never, () => true)).toBe(false);
    expect(f.service.api.accountState().sessionConflict).toBe(true);
    await f.service.api.takeOverSession();
    expect(await f.service.handlePendingTakeover(conn as never, () => true)).toBe(true);
  });
  it("cancels a pending takeover on sign-out and ignores its eventual response", async () => {
    const f = setup({ guestToken: "guest" }); await f.service.api.takeOverSession();
    const conn = freshConnection(); let finish!: () => void;
    conn.reducers.enterWorldWithTutorial.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.service.handlePendingTakeover(conn as never, () => true);
    await f.service.api.signOut(); finish();
    expect(await pending).toBe(false);
    expect(f.service.notice()).toBe("SIGNED OUT");
    const next = freshConnection(); await f.service.handlePendingTakeover(next as never, () => true);
    expect(next.reducers.enterWorldWithTutorial).not.toHaveBeenCalled();
    expect(await f.service.api.takeOverSession()).toEqual({ ok: false, error: "SIGNING OUT" });
  });
  it("does not restart when the game requires an update", async () => {
    const f = setup({ guestToken: "guest", protocolBlocked: true });
    expect(await f.service.api.takeOverSession()).toEqual({ ok: false, error: "UPDATE REQUIRED" });
    expect(f.restartConnectionForIdentityChange).not.toHaveBeenCalled();
  });
});

describe("account service startup identity selection", () => {
  it("keeps native preview sign-in from navigating or starting a guest link", async () => {
    const { service, assign, requestWorldEntry, session, local } = setup({ guestToken: "guest" });
    Object.assign(window, { WILDSTAT_NATIVE_PREVIEW: true });
    expect(await service.api.signIn()).toEqual({ ok: false, error: "APP SIGN-IN UNAVAILABLE · USE GUEST LOGIN" });
    expect(assign).not.toHaveBeenCalled();
    expect(requestWorldEntry).not.toHaveBeenCalled();
    expect(session.getItem(keys.authStateKey)).toBeNull();
    expect(local.getItem(keys.guestTokenKey)).toBe("guest");
  });

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

  it("keeps overlapping native sign-ins on one PKCE transaction", async () => {
    const { service, session } = setup();
    const open = vi.fn(async () => {});
    Object.assign(window, { WILDSTAT_NATIVE_PREVIEW: true, wildstatNativeAuth: { ready: Promise.resolve(false), open, cancel: vi.fn() } });
    await Promise.all([service.api.signIn(), service.api.signIn()]);
    const state = session.getItem(keys.authStateKey);
    const verifier = session.getItem(keys.authVerifierKey);
    await service.api.signIn();
    expect(open).toHaveBeenCalledTimes(1);
    expect(session.getItem(keys.authStateKey)).toBe(state);
    expect(session.getItem(keys.authVerifierKey)).toBe(verifier);
  });

  it("allows another native sign-in after opening fails", async () => {
    const { service } = setup();
    const open = vi.fn().mockRejectedValueOnce(new Error("Unable to start sign-in")).mockResolvedValue(undefined);
    Object.assign(window, { WILDSTAT_NATIVE_PREVIEW: true, wildstatNativeAuth: { ready: Promise.resolve(false), open, cancel: vi.fn() } });
    await expect(service.api.signIn()).rejects.toThrow("Unable to start sign-in");
    await expect(service.api.signIn()).resolves.toMatchObject({ ok: true, redirecting: true });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("opens native OAuth with the hosted callback and preserves PKCE state", async () => {
    const { assign, service, session } = setup();
    const open = vi.fn(async () => {});
    Object.assign(window, { WILDSTAT_NATIVE_PREVIEW: true, wildstatNativeAuth: { ready: Promise.resolve(false), open, cancel: vi.fn() } });
    expect(await service.api.signIn()).toMatchObject({ ok: true, redirecting: true });
    expect(assign).not.toHaveBeenCalled();
    const [raw, savedKeys] = open.mock.calls[0] as unknown as [string, string[]];
    const url = new URL(raw);
    expect(url.searchParams.get("redirect_uri")).toBe("https://wildstatmmo.com/app-auth/");
    expect(url.searchParams.get("state")).toBe(session.getItem(keys.authStateKey));
    expect(savedKeys).toContain(keys.authVerifierKey);
    expect(savedKeys).toContain(keys.accountLinkKey);
    expect(savedKeys).not.toContain(keys.accountTokenKey);
  });

  it("starts OAuth directly for a fresh registration without loading a guest", async () => {
    const { assign, connect, service, session } = setup();

    const result = await service.api.signIn();

    expect(result).toMatchObject({ ok: true, redirecting: true });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    const authorizationUrl = new URL(assign.mock.calls[0][0]);
    expect(authorizationUrl.searchParams.get("nonce")).toBe(session.getItem(keys.authNonceKey));
    expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
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

describe("complete account sign-out", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("clears account credentials, cancels update resume, disconnects, and ends the provider session", async () => {
    const token = accountToken();
    const { service, local, session, disconnect, assign } = setup({ accountToken: token, knownAccount: true, signedIn: true, guestToken: "guest-save" });
    local.setItem(`${keys.accountTokenKey}:refresh`, "refresh-secret");
    local.setItem(keys.knownAccountCharacterKey, "Previous Character");
    session.setItem(keys.authReturnUiKey, "true");
    session.setItem(keys.authRetryKey, "true");
    session.setItem(keys.authNonceKey, "nonce");
    session.setItem(keys.accountLinkKey, "pending-link");
    service.markPlayable(true);
    expect(service.prepareUpdateReload("test-version")).toBe(true);

    await service.api.signOut();
    await service.api.signOut();

    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(local.getItem(`${keys.accountTokenKey}:refresh`)).toBeNull();
    expect(local.getItem(keys.knownAccountKey)).toBeNull();
    expect(local.getItem(keys.knownAccountCharacterKey)).toBeNull();
    expect(local.getItem(keys.guestTokenKey)).toBe("guest-save");
    for (const key of [keys.authReturnUiKey, keys.authRetryKey, keys.authNonceKey, keys.accountLinkKey, "update-resume"]) expect(session.getItem(key)).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(service.canConnect()).toBe(false);
    await expect(service.connectionToken(token)).rejects.toThrow("Signed out");
    expect(service.api.accountState()).toMatchObject({ signedIn: false, gameSessionApproved: false });
    expect(assign).toHaveBeenCalledOnce();
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(`${SPACETIME_AUTH_ISSUER}/session/end`);
    expect(url.searchParams.get("id_token_hint")).toBe(token);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://wildstat.example/game");
    expect(url.searchParams.get("client_id")).toBe(SPACETIME_AUTH_CLIENT_ID);
    expect(url.href).not.toContain("refresh-secret");
  });

  it("does not wait for a stuck notification plugin before signing out on mobile", async () => {
    const { service, local, assign } = setup({ accountToken: accountToken(), knownAccount: true, signedIn: true });
    const signOut = vi.fn(async (_url: string) => {});
    Object.assign(window, {
      WILDSTAT_NATIVE_PREVIEW: true,
      wildstatResearchNotifications: { sync: () => new Promise(() => {}) },
      wildstatNativeAuth: { ready: Promise.resolve(false), open: vi.fn(), cancel: vi.fn(), signOut },
    });
    await service.api.signOut();
    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalledOnce();
    const url = new URL(signOut.mock.calls[0][0] as string);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://wildstatmmo.com/app-auth/");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("cannot restore a token from a callback that completes after sign-out", async () => {
    const request = new FakeTokenRequest(200, { id_token: accountToken() }, false);
    stubTokenRequest(request);
    const { service, local, connect } = setup({ authCallback: true });
    const restoring = service.restoreKnownAccount();
    await service.api.signOut();
    request.onload?.({} as ProgressEvent);
    await restoring;
    expect(local.getItem(keys.accountTokenKey)).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(service.canConnect()).toBe(false);
  });

  it("cannot finish preparing a new sign-in after the player signs out", async () => {
    const { service, assign, session } = setup();
    const starting = service.api.signIn();
    await service.api.signOut();
    await starting;
    expect(assign).toHaveBeenCalledOnce();
    expect(new URL(assign.mock.calls[0][0]).pathname).toBe("/oidc/session/end");
    expect(session.getItem(keys.authVerifierKey)).toBeNull();
    expect(session.getItem(keys.authStateKey)).toBeNull();
  });
});

it("keeps an admitted account approved while a portal reconnects without approving a signed-out session", () => {
  const { service } = setup({ accountToken: accountToken(), knownAccount: true });
  expect(service.api.accountState().gameSessionApproved).toBe(false);
  service.markPlayable(true);
  expect(service.api.accountState()).toMatchObject({ signedIn: false, gameSessionApproved: true });
});

it.each([true, false])("preserves the admitted session for a recovery reload (account=%s)", signedIn => {
  const { service, session } = setup({ accountToken: signedIn ? accountToken() : undefined, knownAccount: signedIn });
  expect(service.prepareUpdateReload("0.681")).toBe(false);
  service.markPlayable(signedIn);
  expect(service.prepareUpdateReload("0.681")).toBe(true);
  const store = createUpdateResumeStore(session, "update-resume");
  expect(store.consume("0.681")).toBe(signedIn ? "account" : "guest");
  expect(store.consume("0.681")).toBeNull();
});


describe("connection authentication failures", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["Failed to verify token: Bad Gateway", "Failed to verify token: HTTP 503 Service Unavailable", "Failed to fetch"])("keeps saved credentials for temporary failure: %s", message => {
    const token = accountToken();
    const { service, local } = setup({ accountToken: token, knownAccount: true });
    expect(service.onConnectError(true, new Error(message))).toBe(false);
    expect(local.getItem(keys.accountTokenKey)).toBe(token);
  });
  it("still requires sign-in for an explicit unauthorized response", () => {
    const { service, local } = setup({ accountToken: accountToken(), knownAccount: true });
    expect(service.onConnectError(true, new Error("Failed to verify token: HTTP 401 Unauthorized"))).toBe(true);
    expect(local.getItem(keys.accountTokenKey)).toBeNull();
  });
});

it("retains an admitted account and its expired credential during wake recovery", () => {
  const token = accountToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  const { service, local } = setup({ accountToken: token, knownAccount: true });
  service.markPlayable(true);
  expect(service.accountToken()).toBeNull();
  expect(service.connectionCredential()).toBe(token);
  expect(service.canConnect()).toBe(true);
  expect(service.api.accountState().gameSessionApproved).toBe(true);
  expect(local.getItem(keys.accountTokenKey)).toBe(token);
});

it("does not reload gameplay when another tab renews the same account", () => {
  const old = accountToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  const { service } = setup({ accountToken: accountToken(), knownAccount: true });
  service.handleStorageEvent({ key: keys.accountTokenKey, oldValue: old, newValue: accountToken() } as StorageEvent);
  expect(window.location.reload).not.toHaveBeenCalled();
  service.handleStorageEvent({ key: keys.accountTokenKey, oldValue: old, newValue: accountToken({ sub: "someone-else" }) } as StorageEvent);
  expect(window.location.reload).toHaveBeenCalledOnce();
});

it("stores a refresh grant after a verified callback and removes it on switching to guest", async () => {
  const { service, local } = setup({ authCallback: true });
  stubTokenRequest(new FakeTokenRequest(200, { id_token: accountToken(), refresh_token: "refresh-grant" }));
  await service.restoreKnownAccount();
  expect(JSON.parse(local.getItem(`${keys.accountTokenKey}:refresh`)!)).toMatchObject({ subject: "account-subject", token: "refresh-grant", nonce: "expected-nonce" });
  service.api.continueAsGuest();
  expect(local.getItem(`${keys.accountTokenKey}:refresh`)).toBeNull();
});

describe("sign-in round trips", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.mocked(recordCarriedConnectionDiagnostic).mockClear(); });
  it("reuses the provider session for a returning account instead of forcing a new login", async () => {
    const f = setup({ knownAccount: true });
    await f.service.api.signIn();
    const url = new URL(f.assign.mock.calls[0][0]);
    expect(url.searchParams.get("prompt")).toBeNull();
    // Any max_age puts auth_time in every token; a year never forces a login.
    expect(url.searchParams.get("max_age")).toBe(String(365 * 86_400));
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });
  it("reports why the player left and how long the trip took once they return", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const f = setup({ knownAccount: true });
    await f.service.api.signIn();
    const state = f.session.getItem(keys.authStateKey)!;
    vi.setSystemTime(1_042_000);
    f.session.setItem(keys.authNonceKey, "expected-nonce");
    stubTokenRequest(new FakeTokenRequest(200, { id_token: accountToken(), refresh_token: "grant" }));
    window.location.href = `https://wildstat.example/game?code=one&state=${state}`;
    await f.service.restoreKnownAccount();
    expect(recordCarriedConnectionDiagnostic).toHaveBeenCalledWith("session-blocked", { detail: "sign-in-return:success:known-account:silent:42s" });
    expect(f.session.getItem(keys.authTripKey)).toBeNull();
  });
});

describe("kill-report session enforcement", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("clears account credentials and requires interactive authentication without erasing the guest save", async () => {
    const f = setup({ accountToken: accountToken(), knownAccount: true, signedIn: true, guestToken: "saved-guest" });
    expect(f.service.handleDefeatRestriction("DEFEAT_SESSION_REAUTH")).toBe(true);
    expect(f.local.getItem(keys.accountTokenKey)).toBeNull();
    expect(f.local.getItem(keys.guestTokenKey)).toBe("saved-guest");
    expect(f.service.canConnect()).toBe(false);
    expect(f.disconnect).toHaveBeenCalledOnce();
    f.setConnection(null as never);
    await f.service.api.signIn();
    const url = new URL(f.assign.mock.calls[0][0]);
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("max_age")).toBe("0");
  });
  it("holds a guest for 30 seconds, preserving their token and pending progress", () => {
    vi.useFakeTimers();
    const f = setup({ guestToken: "same-guest" });
    const until = Date.now() + 30_000;
    expect(f.service.handleDefeatRestriction(`DEFEAT_SESSION_COOLDOWN:${until}`)).toBe(true);
    expect(f.service.canConnect()).toBe(false);
    expect(f.local.getItem(keys.guestTokenKey)).toBe("same-guest");
    expect(f.clearPendingProgress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999); expect(f.service.canConnect()).toBe(false);
    vi.advanceTimersByTime(1); expect(f.service.canConnect()).toBe(true);
    expect(f.setWorldEntryBlocked).toHaveBeenLastCalledWith(false);
    expect(f.local.getItem(keys.guestTokenKey)).toBe("same-guest");
  });
  it("respects a seven-day administrative suspension without retrying every 30 seconds", () => {
    vi.useFakeTimers();
    const f = setup({ guestToken: "same-guest" });
    const week = 7 * 86_400_000;
    f.service.handleDefeatRestriction(`DEFEAT_SESSION_COOLDOWN:${Date.now() + week}`);
    expect(f.service.api.accountState().notice).toContain("ACCOUNT SUSPENDED UNTIL");
    vi.advanceTimersByTime(30_000);
    expect(f.service.canConnect()).toBe(false);
    vi.advanceTimersByTime(week - 30_000);
    expect(f.service.canConnect()).toBe(true);
  });
  it("keeps a persisted cooldown on reload and does not classify it as an invalid guest token", () => {
    vi.useFakeTimers();
    const f = setup({ guestToken: "same-guest" });
    f.local.setItem(`${keys.guestTokenKey}:defeat-block-until`, String(Date.now() + 12_000));
    expect(f.service.canConnect()).toBe(false);
    expect(f.service.onConnectError(false, new Error(`DEFEAT_SESSION_COOLDOWN:${Date.now() + 12_000}`))).toBe(true);
    vi.advanceTimersByTime(12_000);
    expect(f.service.canConnect()).toBe(true);
    expect(f.local.getItem(keys.guestTokenKey)).toBe("same-guest");
  });
});
