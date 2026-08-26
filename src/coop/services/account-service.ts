import type { DbConnection } from "../../module_bindings";
import {
  PLAYER_GENDER_UNSET,
  isSelectedPlayerGender,
  normalizePlayerGender,
  type PlayerGender,
} from "../../../shared/player-gender";
import {
  SPACETIME_AUTH_CLIENT_ID,
  SPACETIME_AUTH_ISSUER,
} from "../../../shared/rules";
import { isGeneratedDisplayName } from "./profile-directory";
import {
  createUpdateResumeStore,
  type UpdateResumeMode,
} from "./update-resume-store";
import type { PlayerProgress } from "./progress";

type AccountKeys = {
  tokenKey: string;
  guestTokenKey: string;
  accountTokenKey: string;
  accountLinkKey: string;
  accountMigrationPendingKey: string;
  authStateKey: string;
  authVerifierKey: string;
  authRetryKey: string;
  knownAccountKey: string;
  knownAccountCharacterKey: string;
  knownAccountGenderKey: string;
  knownGuestCharacterKey: string;
  authReturnUiKey: string;
  authTabKey: string;
};

type AccountServiceDependencies = {
  keys: AccountKeys;
  updateResumeMode: UpdateResumeMode | null;
  updateResumeStore: ReturnType<typeof createUpdateResumeStore>;
  notify: () => void;
  connection: () => DbConnection | null;
  connectedSignedIn: () => boolean;
  hydrationReady: () => boolean;
  protocolBlocked: () => boolean;
  updating: () => boolean;
  worldEntryBlocked: () => boolean;
  setWorldEntryBlocked: (blocked: boolean) => void;
  resetWorldEntryGeneration: () => void;
  requestWorldEntry: () => Promise<boolean>;
  connect: () => void;
  scheduleReconnect: (delay?: number) => void;
  runWorldReducer: <T>(reducer: () => T | PromiseLike<T>) => Promise<T>;
  handleFailure: (action: string, error: unknown) => void;
  errorMessage: (error: unknown) => string;
  localIdentity: () => string;
  localProfileReady: () => boolean;
  localDisplayName: () => string;
  localGender: () => PlayerGender;
  localProgress: () => PlayerProgress | null;
  drainPendingProgress: () => Promise<boolean>;
  clearPendingProgress: (identity: string) => void;
  disconnectVirtualPlayers: () => void;
};

type AccountLinkTransaction = { code: string; guestIdentity: string };

const AUTHORIZATION_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/auth`;
const TOKEN_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/token`;
const AUTH_SCOPE = "openid profile email";

export function createAccountService(dependencies: AccountServiceDependencies) {
  const { keys } = dependencies;
  let notice = "";
  let guestSessionExplicit = dependencies.updateResumeMode === "guest";
  let callbackPending = new URL(window.location.href).searchParams.has("code") ||
    new URL(window.location.href).searchParams.has("error");
  let returnPending = callbackPending && (() => {
    try { return sessionStorage.getItem(keys.authReturnUiKey) === "true"; } catch { return false; }
  })();
  let sessionApproved = returnPending || dependencies.updateResumeMode === "account";
  let updateResumePending = dependencies.updateResumeMode !== null;
  let lastPlayableSessionMode: UpdateResumeMode | null = null;
  let takeoverRequested = false;

  function accountToken() {
    try {
      const token = localStorage.getItem(keys.accountTokenKey);
      if (!token) return null;
      const payloadPart = token.split(".")[1];
      if (payloadPart) {
        try {
          const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          const payload = JSON.parse(atob(padded)) as { exp?: unknown };
          if (typeof payload.exp === "number" && payload.exp * 1_000 <= Date.now() + 30_000) {
            localStorage.removeItem(keys.accountTokenKey);
            return null;
          }
        } catch {
          // Let SpacetimeDB validate unfamiliar token formats.
        }
      }
      return token;
    } catch {
      return null;
    }
  }

  function readTabValue(key: string) {
    try {
      const current = sessionStorage.getItem(key);
      if (current !== null) return current;
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        sessionStorage.setItem(key, legacy);
        localStorage.removeItem(key);
      }
      return legacy;
    } catch {
      return null;
    }
  }

  function writeTabValue(key: string, value: string) {
    sessionStorage.setItem(key, value);
    try { localStorage.removeItem(key); } catch {}
  }

  function clearTabValue(key: string) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {}
  }

  function readAccountLinkTransaction(): AccountLinkTransaction | null {
    const stored = readTabValue(keys.accountLinkKey);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as Partial<AccountLinkTransaction>;
      if (typeof parsed.code === "string" && typeof parsed.guestIdentity === "string") {
        return { code: parsed.code, guestIdentity: parsed.guestIdentity };
      }
    } catch {
      if (/^[A-Za-z0-9_-]{32,128}$/.test(stored)) return { code: stored, guestIdentity: "" };
    }
    clearTabValue(keys.accountLinkKey);
    return null;
  }

  function writeAccountLinkTransaction(transaction: AccountLinkTransaction) {
    writeTabValue(keys.accountLinkKey, JSON.stringify(transaction));
  }

  function clearStoredToken(key: string) {
    try { localStorage.removeItem(key); } catch {}
  }

  function hasKnownAccount() {
    try { return localStorage.getItem(keys.knownAccountKey) === "true"; } catch { return false; }
  }

  function rememberAccount() {
    try { localStorage.setItem(keys.knownAccountKey, "true"); } catch {}
  }

  function rememberedAccountCharacter() {
    try {
      const displayName = localStorage.getItem(keys.knownAccountCharacterKey)?.trim() || "";
      return isGeneratedDisplayName(displayName) ? "" : displayName;
    } catch { return ""; }
  }

  function rememberAccountCharacter(displayName: string) {
    if (!displayName) return;
    try { localStorage.setItem(keys.knownAccountCharacterKey, displayName); } catch {}
  }

  function rememberedAccountGender() {
    try { return normalizePlayerGender(localStorage.getItem(keys.knownAccountGenderKey)); } catch { return PLAYER_GENDER_UNSET; }
  }

  function rememberConfirmedGender(gender: PlayerGender) {
    if (!(dependencies.connection()?.isActive ? dependencies.connectedSignedIn() : Boolean(accountToken()))) return;
    try {
      if (isSelectedPlayerGender(gender)) localStorage.setItem(keys.knownAccountGenderKey, String(gender));
      else localStorage.removeItem(keys.knownAccountGenderKey);
    } catch {}
  }

  function rememberedGuestCharacter() {
    try {
      const displayName = localStorage.getItem(keys.knownGuestCharacterKey)?.trim() || "";
      return isGeneratedDisplayName(displayName) ? "" : displayName;
    } catch { return ""; }
  }

  function rememberConfirmedCharacter(displayName: string) {
    if (!displayName || isGeneratedDisplayName(displayName)) return;
    if (dependencies.connection()?.isActive ? dependencies.connectedSignedIn() : Boolean(accountToken())) {
      rememberAccountCharacter(displayName);
      return;
    }
    try { localStorage.setItem(keys.knownGuestCharacterKey, displayName); } catch {}
  }

  function clearAccountReturnPending() {
    returnPending = false;
    try { sessionStorage.removeItem(keys.authReturnUiKey); } catch {}
  }

  function randomUrlSafe(bytes = 32) {
    const values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function authTabId() {
    try {
      const existing = sessionStorage.getItem(keys.authTabKey);
      if (existing) return existing;
      const created = randomUrlSafe(12);
      sessionStorage.setItem(keys.authTabKey, created);
      return created;
    } catch { return "current-tab"; }
  }

  function readMigrationBarriers() {
    try {
      const stored = localStorage.getItem(keys.accountMigrationPendingKey);
      if (!stored) return {} as Record<string, number>;
      const legacyTimestamp = Number(stored);
      if (Number.isFinite(legacyTimestamp) && legacyTimestamp > 0) return { legacy: legacyTimestamp };
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const barriers: Record<string, number> = {};
      for (const [tab, startedAt] of Object.entries(parsed)) {
        if (Number.isFinite(startedAt) && Date.now() - Number(startedAt) < 15 * 60_000) barriers[tab] = Number(startedAt);
      }
      return barriers;
    } catch { return {} as Record<string, number>; }
  }

  function markAccountMigrationPending() {
    try {
      const barriers = readMigrationBarriers();
      barriers[authTabId()] = Date.now();
      localStorage.setItem(keys.accountMigrationPendingKey, JSON.stringify(barriers));
    } catch {}
  }

  function accountMigrationPending() {
    return Object.keys(readMigrationBarriers()).length > 0;
  }

  function clearAccountMigrationPending() {
    try {
      const barriers = readMigrationBarriers();
      delete barriers[authTabId()];
      delete barriers.legacy;
      if (Object.keys(barriers).length) localStorage.setItem(keys.accountMigrationPendingKey, JSON.stringify(barriers));
      else localStorage.removeItem(keys.accountMigrationPendingKey);
    } catch {}
  }

  function completeAccountReturnWhenReady() {
    if (!returnPending || !accountToken() || !dependencies.localProfileReady() || !dependencies.localProgress()) return;
    clearAccountReturnPending();
  }

  function guestToken() {
    try {
      const saved = localStorage.getItem(keys.guestTokenKey);
      if (saved) return saved;
      const legacy = localStorage.getItem(keys.tokenKey);
      if (legacy) {
        localStorage.setItem(keys.guestTokenKey, legacy);
        localStorage.removeItem(keys.tokenKey);
        return legacy;
      }
    } catch {}
    return null;
  }

  async function sha256UrlSafe(value: string) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function redirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function completeAccountCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const authError = url.searchParams.get("error");
    if (!code && !authError) return;
    const state = url.searchParams.get("state");
    const expectedState = readTabValue(keys.authStateKey);
    const verifier = readTabValue(keys.authVerifierKey);
    const cleanUrl = `${url.pathname}${url.hash}`;
    if (!state || state !== expectedState || !verifier) {
      callbackPending = false;
      clearAccountReturnPending();
      notice = "SIGN-IN CHECK FAILED";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearTabValue(keys.authStateKey);
      clearTabValue(keys.authVerifierKey);
      history.replaceState({}, "", cleanUrl);
      return;
    }
    if (authError) {
      callbackPending = false;
      clearAccountReturnPending();
      notice = authError === "login_required" ? "AUTO SIGN-IN UNAVAILABLE" : "SIGN-IN FAILED";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearTabValue(keys.authStateKey);
      clearTabValue(keys.authVerifierKey);
      history.replaceState({}, "", cleanUrl);
      return;
    }
    if (!code) return;

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: SPACETIME_AUTH_CLIENT_ID,
          code,
          redirect_uri: redirectUri(),
          code_verifier: verifier,
        }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.id_token !== "string") {
        throw new Error(result.error_description || result.error || "Token exchange failed");
      }
      localStorage.setItem(keys.accountTokenKey, result.id_token);
      rememberAccount();
      notice = "SIGNED IN";
    } catch (error) {
      notice = "SIGN-IN FAILED";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearAccountReturnPending();
      console.warn("Wildwood account sign-in failed:", error);
    } finally {
      callbackPending = false;
      clearTabValue(keys.authStateKey);
      clearTabValue(keys.authVerifierKey);
      history.replaceState({}, "", cleanUrl);
    }
  }

  async function startAccountSignIn() {
    try {
      sessionStorage.setItem(keys.authReturnUiKey, "true");
      returnPending = true;
    } catch {}
    const verifier = randomUrlSafe(48);
    const state = randomUrlSafe(24);
    const challenge = await sha256UrlSafe(verifier);
    writeTabValue(keys.authStateKey, state);
    writeTabValue(keys.authVerifierKey, verifier);
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: SPACETIME_AUTH_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: AUTH_SCOPE,
      state,
      nonce: randomUrlSafe(24),
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    window.location.assign(url.toString());
  }

  async function restoreKnownAccount() {
    await completeAccountCallback();
    const token = accountToken();
    if (!token && hasKnownAccount() && !guestSessionExplicit) {
      if (dependencies.updateResumeMode === "account") {
        notice = "REOPENING SIGN-IN";
        dependencies.notify();
        try {
          await startAccountSignIn();
        } catch (error) {
          updateResumePending = false;
          sessionApproved = false;
          clearAccountReturnPending();
          notice = "SIGN-IN FAILED · TRY AGAIN";
          console.warn("Wildwood update sign-in failed:", error);
          dependencies.notify();
        }
        return;
      }
      notice = "SIGN-IN REQUIRED";
      dependencies.notify();
      return;
    }
    if (token && hasKnownAccount() && !sessionApproved) {
      notice = "SIGN-IN REQUIRED";
      dependencies.notify();
      return;
    }
    dependencies.connect();
  }

  const api = {
    accountState() {
      const signedIn = Boolean(dependencies.connection()?.isActive && dependencies.connectedSignedIn());
      return {
        signedIn,
        knownAccount: hasKnownAccount(),
        signInRequired: hasKnownAccount() && !signedIn && !guestSessionExplicit,
        guestSessionApproved: guestSessionExplicit,
        authInProgress: callbackPending,
        returningFromSignIn: returnPending || updateResumePending,
        hydrated: dependencies.hydrationReady(),
        updating: dependencies.updating(),
        sessionConflict: dependencies.worldEntryBlocked(),
        notice,
      };
    },
    knownCharacter() {
      const accountCharacter = rememberedAccountCharacter();
      const signedIn = dependencies.connection()?.isActive ? dependencies.connectedSignedIn() : Boolean(accountToken());
      if (!signedIn && (accountCharacter || hasKnownAccount())) return accountCharacter;
      const currentDisplayName = dependencies.localDisplayName();
      const currentCharacter = dependencies.localProfileReady() && dependencies.localProgress()?.introComplete && !isGeneratedDisplayName(currentDisplayName)
        ? currentDisplayName.trim()
        : "";
      const rememberedCharacter = signedIn ? accountCharacter : rememberedGuestCharacter();
      return currentCharacter || rememberedCharacter;
    },
    knownCharacterGender() {
      const signedIn = dependencies.connection()?.isActive ? dependencies.connectedSignedIn() : Boolean(accountToken());
      if (!signedIn && hasKnownAccount()) return rememberedAccountGender();
      const currentGender = dependencies.localProfileReady() ? dependencies.localGender() : undefined;
      return currentGender ?? rememberedAccountGender();
    },
    async signIn() {
      if (dependencies.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
      const connection = dependencies.connection();
      if (connection?.isActive && dependencies.connectedSignedIn()) return { ok: true };
      clearTabValue(keys.authRetryKey);
      if (accountToken() && hasKnownAccount()) {
        sessionApproved = true;
        notice = "OPENING CHARACTER";
        dependencies.notify();
        dependencies.connect();
        return { ok: true };
      }
      if (hasKnownAccount() && !connection) {
        notice = "OPENING SIGN-IN";
        dependencies.notify();
        await startAccountSignIn();
        return { ok: true };
      }
      if (!connection) {
        notice = "WAIT FOR SERVER";
        dependencies.notify();
        return { ok: false, error: "WAIT FOR SERVER" };
      }
      if (!await dependencies.requestWorldEntry()) {
        notice = "PLAYER START FAILED · TRY AGAIN";
        dependencies.notify();
        return { ok: false, error: "PLAYER START FAILED" };
      }
      notice = "SAVING GUEST";
      dependencies.notify();
      if (!await dependencies.drainPendingProgress()) {
        notice = "GUEST SAVE FAILED · TRY AGAIN";
        dependencies.notify();
        return { ok: false, error: "GUEST SAVE FAILED" };
      }
      const code = randomUrlSafe(40);
      writeAccountLinkTransaction({ code, guestIdentity: dependencies.localIdentity() });
      try {
        await dependencies.runWorldReducer(() => connection.reducers.beginAccountLink({ code }));
      } catch (error) {
        clearTabValue(keys.accountLinkKey);
        notice = "SIGN-IN NOT READY";
        dependencies.handleFailure("sign-in preparation", error);
        dependencies.notify();
        return { ok: false, error: "SIGN-IN NOT READY" };
      }
      markAccountMigrationPending();
      notice = "PREPARING SIGN-IN";
      dependencies.notify();
      await startAccountSignIn();
      return { ok: true };
    },
    async takeOverSession() {
      if (dependencies.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
      takeoverRequested = true;
      const connection = dependencies.connection();
      if (!connection?.isActive) {
        dependencies.setWorldEntryBlocked(false);
        notice = "RECONNECTING TO SIGN OUT OTHER TAB…";
        dependencies.connect();
        dependencies.notify();
        return { ok: true };
      }
      notice = "SIGNING OUT OTHER TAB…";
      dependencies.notify();
      try {
        await connection.reducers.takeOverSession({ tabId: authTabId() });
        if (dependencies.connection() !== connection) return { ok: false, error: "CONNECTION CHANGED" };
        takeoverRequested = false;
        dependencies.setWorldEntryBlocked(false);
        dependencies.resetWorldEntryGeneration();
        notice = "OPENING CHARACTER";
        connection.disconnect();
        dependencies.scheduleReconnect(100);
        dependencies.notify();
        return { ok: true };
      } catch (error) {
        takeoverRequested = false;
        const message = dependencies.errorMessage(error);
        dependencies.setWorldEntryBlocked(true);
        notice = "TAKEOVER FAILED · TRY AGAIN";
        dependencies.handleFailure("session takeover", error);
        dependencies.notify();
        return { ok: false, error: message };
      }
    },
    signOut() {
      dependencies.disconnectVirtualPlayers();
      try {
        localStorage.removeItem(keys.accountTokenKey);
        localStorage.removeItem(keys.knownAccountKey);
        localStorage.removeItem(keys.accountMigrationPendingKey);
      } catch {}
      clearTabValue(keys.accountLinkKey);
      clearTabValue(keys.authStateKey);
      clearTabValue(keys.authVerifierKey);
      window.location.reload();
    },
    continueAsGuest() {
      guestSessionExplicit = true;
      notice = "GUEST SESSION";
      if (dependencies.connection()?.isActive) void dependencies.requestWorldEntry();
      else dependencies.connect();
      dependencies.notify();
    },
  };

  return {
    api,
    accountToken,
    guestToken,
    hasKnownAccount,
    isGuestSessionExplicit: () => guestSessionExplicit,
    isSessionApproved: () => sessionApproved,
    shouldEnterWorld: (signedIn: boolean) => signedIn || guestSessionExplicit,
    tabId: authTabId,
    notice: () => notice,
    setNotice(value: string) { notice = value; },
    setGuestSessionExplicit(value: boolean) { guestSessionExplicit = value; },
    rememberedCharacter: (signedIn: boolean) => signedIn ? rememberedAccountCharacter() : rememberedGuestCharacter(),
    rememberConfirmedCharacter,
    rememberConfirmedGender,
    completeAccountReturnWhenReady,
    clearAccountReturnPending,
    clearRetry() { clearTabValue(keys.authRetryKey); },
    storeGuestToken(token: string) {
      try { localStorage.setItem(keys.guestTokenKey, token); } catch {}
    },
    markPlayable(signedIn: boolean) { lastPlayableSessionMode = signedIn ? "account" : "guest"; },
    prepareUpdateReload(version: string) {
      if (lastPlayableSessionMode) dependencies.updateResumeStore.write(version, lastPlayableSessionMode);
    },
    finishHydration() { updateResumePending = false; },
    async claimAccountLink(connection: DbConnection, signedIn: boolean, isCurrent: () => boolean) {
      const accountLink = signedIn ? readAccountLinkTransaction() : null;
      if (!accountLink || dependencies.protocolBlocked()) return true;
      notice = "LINKING ACCOUNT SAVE";
      dependencies.notify();
      try {
        await connection.reducers.claimGuestAccount({ code: accountLink.code });
        if (!isCurrent()) return false;
        clearTabValue(keys.accountLinkKey);
        clearAccountMigrationPending();
        if (accountLink.guestIdentity) dependencies.clearPendingProgress(accountLink.guestIdentity);
        clearStoredToken(keys.guestTokenKey);
        notice = "ACCOUNT SAVE LINKED";
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        const message = dependencies.errorMessage(error);
        clearTabValue(keys.accountLinkKey);
        if (/already has wildwood progress/i.test(message)) {
          clearAccountMigrationPending();
          notice = "ACCOUNT CHARACTER LOADED";
          return true;
        }
        clearStoredToken(keys.accountTokenKey);
        clearAccountMigrationPending();
        guestSessionExplicit = true;
        clearAccountReturnPending();
        notice = "GUEST SAVE NOT LINKED";
        dependencies.handleFailure("account migration", error);
        connection.disconnect();
        return false;
      }
    },
    async handlePendingTakeover(connection: DbConnection, isCurrent: () => boolean) {
      if (!takeoverRequested) return true;
      notice = "SIGNING OUT OTHER TAB…";
      dependencies.notify();
      try {
        await connection.reducers.takeOverSession({ tabId: authTabId() });
        if (!isCurrent()) return false;
        takeoverRequested = false;
        dependencies.setWorldEntryBlocked(false);
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        takeoverRequested = false;
        dependencies.setWorldEntryBlocked(true);
        notice = "TAKEOVER FAILED · TRY AGAIN";
        dependencies.handleFailure("session takeover", error);
        dependencies.notify();
        return false;
      }
    },
    canConnect() {
      if (accountToken() && hasKnownAccount() && !sessionApproved) {
        notice = "SIGN-IN REQUIRED";
        dependencies.notify();
        return false;
      }
      if (!accountToken() && hasKnownAccount() && !guestSessionExplicit) {
        notice = "SIGN-IN REQUIRED";
        dependencies.notify();
        return false;
      }
      return true;
    },
    onConnectError(signedIn: boolean, error: Error) {
      const rejectedToken = /401|unauthorized|verify token/i.test(String(error?.message || error));
      if (!rejectedToken) return false;
      clearStoredToken(signedIn ? keys.accountTokenKey : keys.guestTokenKey);
      if (signedIn && hasKnownAccount()) {
        const alreadyRetried = readTabValue(keys.authRetryKey) === "true";
        if (sessionApproved && !alreadyRetried) {
          writeTabValue(keys.authRetryKey, "true");
          notice = "REOPENING SIGN-IN";
          void startAccountSignIn().catch((signInError) => {
            clearAccountReturnPending();
            sessionApproved = false;
            notice = "SIGN-IN FAILED · TRY AGAIN";
            console.warn("Wildwood account reauthentication failed:", signInError);
            dependencies.notify();
          });
          dependencies.notify();
          return true;
        }
        sessionApproved = false;
        notice = "SIGN-IN REQUIRED";
        clearAccountReturnPending();
        dependencies.notify();
        return true;
      }
      console.warn("Wildwood token rejected; reconnecting with a fresh guest session.");
      dependencies.notify();
      dependencies.scheduleReconnect(100);
      return true;
    },
    accountMigrationPending,
    handleStorageEvent(event: StorageEvent) {
      if (event.oldValue === event.newValue) return;
      if (event.key === keys.accountTokenKey) {
        if (!accountMigrationPending()) window.location.reload();
        return;
      }
      if (event.key === keys.accountMigrationPendingKey && event.newValue === null) {
        const shouldBeSignedIn = Boolean(accountToken());
        if (!dependencies.connection()?.isActive || shouldBeSignedIn !== dependencies.connectedSignedIn()) window.location.reload();
      }
    },
    restoreKnownAccount,
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
