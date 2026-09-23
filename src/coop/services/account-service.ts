import { DEFEAT_REAUTH } from "../../../shared/defeat-session";
import { AccountRenewalRequired, createAccountTokenRenewal } from "./account-token-renewal";
import { accountLogoutUrl } from "./account-logout";
import { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import { recordCarriedConnectionDiagnostic, recordConnectionDiagnostic } from "./connection-diagnostic-runtime";
import { syncResearchNotification } from "../../app/native-research-notifications";
import type { DbConnection } from "../../module_bindings";
import { NATIVE_AUTH_CANCEL, NATIVE_AUTH_REDIRECT, nativeAuth } from "../../app/native-auth";
import { isNativePreview } from "../../app/native-preview";
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
import { createLegalConsentService } from "./legal-consent-service";
import {
  inspectSpacetimeIdToken,
  OidcIdTokenError,
  type ValidatedIdTokenClaims,
} from "../security/oidc-id-token";

type AccountKeys = {
  tokenKey: string;
  guestTokenKey: string;
  accountTokenKey: string;
  accountLinkKey: string;
  accountMigrationPendingKey: string;
  authStateKey: string;
  authVerifierKey: string;
  authNonceKey: string;
  authTripKey: string;
  authRetryKey: string;
  knownAccountKey: string;
  knownAccountCharacterKey: string;
  knownAccountGenderKey: string;
  knownGuestCharacterKey: string;
  authReturnUiKey: string;
  authTabKey: string;
  legalConsentKey: string;
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
  protocolReady: () => boolean;
  updating: () => boolean;
  worldEntryBlocked: () => boolean;
  setWorldEntryBlocked: (blocked: boolean) => void;
  requestWorldEntry: () => Promise<boolean>;
  connect: () => void;
  restartConnectionForIdentityChange: (bypassOnlineHint?: boolean) => void;
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
  validateAccountIdToken: (token: string, expectedNonce: string) => Promise<ValidatedIdTokenClaims>;
};

type AccountLinkTransaction = { code: string; guestIdentity: string };

const AUTHORIZATION_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/auth`;
const TOKEN_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/token`;
const AUTH_SCOPE = "openid profile email offline_access";
// Asking for any max_age makes SpacetimeAuth put auth_time in every ID token,
// refreshed ones included; the kill-report re-auth check reads it. A year
// never forces a login on its own.
const AUTH_MAX_AGE_SECONDS = String(365 * 86_400);

/** Why a player was sent to SpacetimeAuth, reported when they come back. */
type SignInReason = "known-account" | "register" | "guest-link" | "update-resume"
  | "renewal-no-grant" | "renewal-grant-rejected" | "token-rejected" | "defeat-reauth";
const TOKEN_EXCHANGE_TIMEOUT_MS = 15_000;

type TokenResponse = {
  id_token?: unknown;
  refresh_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

class TokenExchangeRequestError extends Error {
  constructor(readonly reason: "network" | "timeout" | "response") {
    super(`Token exchange ${reason}`);
    this.name = "TokenExchangeRequestError";
  }
}

function authValuesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Uses the browser's long-established form request path for the small OAuth
 * exchange. Some mobile browser tabs can leave a fetch POST pending while
 * other startup resources are being decoded; XMLHttpRequest has an independent
 * native timeout and preserves the same CORS + PKCE security properties.
 */
function exchangeAuthorizationCode(body: URLSearchParams) {
  return new Promise<{ ok: boolean; result: TokenResponse }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const rejectOnce = (reason: TokenExchangeRequestError["reason"]) => {
      if (settled) return;
      settled = true;
      reject(new TokenExchangeRequestError(reason));
    };
    try {
      request.open("POST", TOKEN_ENDPOINT, true);
      request.timeout = TOKEN_EXCHANGE_TIMEOUT_MS;
      request.setRequestHeader("content-type", "application/x-www-form-urlencoded");
      request.onload = () => {
        if (settled) return;
        let result: TokenResponse;
        try {
          result = JSON.parse(request.responseText) as TokenResponse;
        } catch {
          rejectOnce("response");
          return;
        }
        settled = true;
        resolve({ ok: request.status >= 200 && request.status < 300, result });
      };
      request.onerror = () => rejectOnce("network");
      request.ontimeout = () => rejectOnce("timeout");
      request.onabort = () => rejectOnce("network");
      request.send(body.toString());
    } catch {
      rejectOnce("network");
    }
  });
}

export function createAccountService(dependencies: AccountServiceDependencies) {
  const { keys } = dependencies;
  let notice = "";
  let guestSessionExplicit = dependencies.updateResumeMode === "guest";
  let callbackPending = new URL(window.location.href).searchParams.has("code") ||
    new URL(window.location.href).searchParams.has("error");
  let returnPending = callbackPending && (() => {
    try { return sessionStorage.getItem(keys.authReturnUiKey) === "true"; } catch { return false; }
  })();
  let outboundAuthNavigationPending = false;
  let signInPreparing = false;
  let signingOut = false;
  let sessionApproved = returnPending || dependencies.updateResumeMode === "account";
  let updateResumePending = dependencies.updateResumeMode !== null;
  let lastPlayableSessionMode: UpdateResumeMode | null = null;
  let takeoverRequested = false;
  let takeoverRevision = 0;
  const renewal = createAccountTokenRenewal(localStorage, keys.accountTokenKey);

  function accountToken() {
    try {
      const token = renewal.stored();
      if (!token) return null;
      inspectSpacetimeIdToken(token);
      return token;
    } catch {
      return null;
    }
  }

  const legalConsent = createLegalConsentService({
    storage: localStorage,
    storageKey: keys.legalConsentKey,
    connection: dependencies.connection,
    protocolReady: dependencies.protocolReady,
    shouldEnterWorld: () => dependencies.connectedSignedIn() || guestSessionExplicit,
    requestWorldEntry: dependencies.requestWorldEntry,
    notify: dependencies.notify,
    handleFailure: dependencies.handleFailure,
  });

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

  function clearAuthTransaction() {
    clearTabValue(keys.authStateKey);
    clearTabValue(keys.authVerifierKey);
    clearTabValue(keys.authNonceKey);
  }

  // The round trip's length separates a silent return (a second or two) from
  // one where the player had to log in, which for email means a magic link.
  function finishSignInTrip(outcome: "success" | "failed" | "abandoned") {
    const saved = readTabValue(keys.authTripKey);
    clearTabValue(keys.authTripKey);
    let trip: { reason?: unknown; prompt?: unknown; at?: unknown } = {};
    try { trip = JSON.parse(saved ?? "{}"); } catch {}
    if (typeof trip.reason !== "string" || typeof trip.at !== "number") return;
    const seconds = Math.max(0, Math.round((Date.now() - trip.at) / 1000));
    recordCarriedConnectionDiagnostic("session-blocked", {
      detail: `sign-in-return:${outcome}:${trip.reason}:${trip.prompt ? "prompt" : "silent"}:${seconds}s`,
    });
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
    outboundAuthNavigationPending = false;
    try { sessionStorage.removeItem(keys.authReturnUiKey); } catch {}
  }

  function cancelAbandonedSignIn() {
    const url = new URL(window.location.href);
    const hasCallback = url.searchParams.has("code") || url.searchParams.has("error");
    if (!outboundAuthNavigationPending || !returnPending || callbackPending || hasCallback) return false;
    if (readAccountLinkTransaction()) clearAccountMigrationPending();
    clearAccountReturnPending();
    clearAuthTransaction();
    finishSignInTrip("abandoned");
    sessionApproved = false;
    updateResumePending = false;
    notice = "";
    dependencies.notify();
    return true;
  }

  if (isNativePreview()) window.addEventListener?.(NATIVE_AUTH_CANCEL, cancelAbandonedSignIn);

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
    return isNativePreview() ? NATIVE_AUTH_REDIRECT : `${window.location.origin}${window.location.pathname}`;
  }

  async function completeAccountCallback(): Promise<"none" | "success" | "failed"> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const authError = url.searchParams.get("error");
    if (!code && !authError) return "none";
    const state = url.searchParams.get("state");
    const responseIssuer = url.searchParams.get("iss");
    const expectedState = readTabValue(keys.authStateKey);
    const verifier = readTabValue(keys.authVerifierKey);
    const expectedNonce = readTabValue(keys.authNonceKey);
    const cleanUrl = `${url.pathname}${url.hash}`;
    if (
      !state || !expectedState || !authValuesMatch(state, expectedState) ||
      !verifier || !expectedNonce ||
      (responseIssuer !== null && responseIssuer !== SPACETIME_AUTH_ISSUER)
    ) {
      callbackPending = false;
      clearAccountReturnPending();
      notice = "SIGN-IN CHECK FAILED";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearAuthTransaction();
      history.replaceState({}, "", cleanUrl);
      return "failed";
    }
    if (authError) {
      callbackPending = false;
      clearAccountReturnPending();
      notice = authError === "login_required" ? "AUTO SIGN-IN UNAVAILABLE" : "SIGN-IN FAILED";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearAuthTransaction();
      history.replaceState({}, "", cleanUrl);
      return "failed";
    }
    if (!code) return "failed";

    let outcome: "success" | "failed" = "failed";
    try {
      const { ok, result } = await exchangeAuthorizationCode(new URLSearchParams({
        grant_type: "authorization_code",
        client_id: SPACETIME_AUTH_CLIENT_ID,
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }));
      if (!ok || typeof result.id_token !== "string") {
        const detail = typeof result.error_description === "string"
          ? result.error_description
          : typeof result.error === "string"
            ? result.error
            : "Token exchange failed";
        throw new Error(detail);
      }
      await dependencies.validateAccountIdToken(result.id_token, expectedNonce);
      // A late OAuth response must not restore credentials after Sign Out.
      if (signingOut) return "failed";
      renewal.save(result.id_token, result.refresh_token);
      defeatSignInBlocked = false;
      rememberAccount();
      // Successful state/PKCE/nonce/token verification approves this session.
      // A missing UI-return marker after native activity recreation must not
      // send an authenticated player straight back to the sign-in screen.
      sessionApproved = true;
      returnPending = true;
      outboundAuthNavigationPending = false;
      notice = "SIGNED IN";
      outcome = "success";
    } catch (error) {
      notice = error instanceof TokenExchangeRequestError && error.reason === "timeout"
        ? "SIGN-IN TIMED OUT · TRY AGAIN"
        : error instanceof TokenExchangeRequestError && error.reason === "network"
          ? "SIGN-IN NETWORK FAILED · TRY AGAIN"
          : error instanceof OidcIdTokenError && error.reason === "keys"
            ? "SIGN-IN CHECK UNAVAILABLE · TRY AGAIN"
            : error instanceof OidcIdTokenError
              ? "SIGN-IN CHECK FAILED · TRY AGAIN"
              : "SIGN-IN FAILED · TRY AGAIN";
      if (readAccountLinkTransaction()) clearAccountMigrationPending();
      clearAccountReturnPending();
      console.warn("WildStat account sign-in failed:", error);
    } finally {
      callbackPending = false;
      clearAuthTransaction();
      history.replaceState({}, "", cleanUrl);
    }
    return outcome;
  }

  async function startAccountSignIn(reason: SignInReason, forceLogin = false) {
    // Lock before PKCE hashing yields, so startup and taps share one transaction.
    if (signingOut || outboundAuthNavigationPending || callbackPending) return;
    outboundAuthNavigationPending = true;
    try {
      try {
        sessionStorage.setItem(keys.authReturnUiKey, "true");
        returnPending = true;
      } catch {}
      const verifier = randomUrlSafe(48);
      const state = randomUrlSafe(24);
      const nonce = randomUrlSafe(24);
      const challenge = await sha256UrlSafe(verifier);
      if (signingOut) return;
      writeTabValue(keys.authStateKey, state);
      writeTabValue(keys.authVerifierKey, verifier);
      writeTabValue(keys.authNonceKey, nonce);
      writeTabValue(keys.authTripKey, JSON.stringify({ reason, prompt: forceLogin, at: Date.now() }));
      const url = new URL(AUTHORIZATION_ENDPOINT);
      url.search = new URLSearchParams({
        client_id: SPACETIME_AUTH_CLIENT_ID,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: AUTH_SCOPE,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
        max_age: AUTH_MAX_AGE_SECONDS,
      }).toString();
      // A new account or guest link lets the player choose email or Google;
      // the kill-report re-auth needs a login newer than the revocation. Any
      // prompt also makes SpacetimeAuth drop offline_access, so a forced login
      // returns no refresh token. Everything else reuses the provider session,
      // which for an email account is the difference from a magic link.
      if (forceLogin) { url.searchParams.set("prompt", "login"); url.searchParams.set("max_age", "0"); }
      dependencies.notify();
      if (isNativePreview()) {
        try {
          const bridge = nativeAuth();
          if (!bridge) throw new Error("Native sign-in unavailable");
          await bridge.open(url.toString(), [keys.authStateKey, keys.authVerifierKey, keys.authNonceKey, keys.authTripKey,
            keys.authReturnUiKey, keys.accountLinkKey, keys.authTabKey, keys.authRetryKey]);
        } catch (error) {
          cancelAbandonedSignIn();
          throw error;
        }
      } else window.location.assign(url.toString());
    } catch (error) {
      clearAccountReturnPending();
      throw error;
    }
  }

  async function restoreKnownAccount() {
    const bridge = nativeAuth();
    if (bridge && await bridge.ready) return;
    const callbackOutcome = await completeAccountCallback();
    if (callbackOutcome !== "none") finishSignInTrip(callbackOutcome);
    if (signingOut) return;
    // Callback failures and invalid/expired OAuth state must repaint the
    // lightweight sign-in shell instead of leaving it on "Verifying Sign-In".
    dependencies.notify();
    if (callbackOutcome === "failed") return;
    const token = renewal.stored();
    if (!token && hasKnownAccount() && !guestSessionExplicit) {
      if (dependencies.updateResumeMode === "account") {
        notice = "REOPENING SIGN-IN";
        dependencies.notify();
        try {
          await startAccountSignIn("update-resume");
        } catch (error) {
          updateResumePending = false;
          sessionApproved = false;
          clearAccountReturnPending();
          notice = "SIGN-IN FAILED · TRY AGAIN";
          console.warn("WildStat update sign-in failed:", error);
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
    // A brand-new visitor should be able to choose OAuth before we create even
    // a temporary guest connection. Returning guests still connect here so an
    // eventual account registration can safely link their existing save.
    if (token || guestSessionExplicit || guestToken()) dependencies.connect();
  }

  async function connectionToken(token: string, force = false) {
    if (signingOut) throw new Error("Signed out");
    if (token === guestToken()) return token;
    try { return await renewal.resolve(token, force); }
    catch (error) {
      if (error instanceof AccountRenewalRequired && sessionApproved && !outboundAuthNavigationPending) {
        notice = "RESTORING SIGN-IN";
        await startAccountSignIn(`renewal-${error.reason}`);
      }
      throw error;
    }
  }

  const defeatCooldownKey = `${keys.guestTokenKey}:defeat-block-until`;
  let defeatCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  let defeatSignInBlocked = false;
  function waitForDefeatCooldown(until: number) {
    if (defeatCooldownTimer !== null) clearTimeout(defeatCooldownTimer);
    dependencies.setWorldEntryBlocked(true);
    notice = until - Date.now() > 30_000
      ? `ACCOUNT SUSPENDED UNTIL ${new Date(until).toLocaleString()}`
      : "KILL REPORT EXCEEDED LIMIT · RECONNECTING IN 30 SECONDS";
    defeatCooldownTimer = setTimeout(() => {
      defeatCooldownTimer = null;
      try { localStorage.removeItem(defeatCooldownKey); } catch {}
      if (defeatSignInBlocked || signingOut) return;
      dependencies.setWorldEntryBlocked(false);
      notice = "RECONNECTING";
      dependencies.notify();
      dependencies.scheduleReconnect(0);
    }, Math.max(1, until - Date.now()));
  }
  function handleDefeatRestriction(error: unknown) {
    const message = dependencies.errorMessage(error);
    const reauth = message.includes(DEFEAT_REAUTH);
    const cooldown = message.match(/DEFEAT_SESSION_COOLDOWN:(\d+)/);
    if (!reauth && !cooldown) return false;
    if (reauth && defeatSignInBlocked) return true;
    if (reauth) {
      defeatSignInBlocked = true;
      clearStoredToken(keys.accountTokenKey); // In-flight renewals verify this token is unchanged.
      renewal.clear();
      sessionApproved = false; guestSessionExplicit = false; updateResumePending = false;
      lastPlayableSessionMode = null; takeoverRequested = false;
      clearAccountReturnPending(); clearAuthTransaction();
      clearTabValue(keys.accountLinkKey); clearAccountMigrationPending();
      dependencies.updateResumeStore.clear();
      dependencies.setWorldEntryBlocked(true);
      notice = "KILL REPORT EXCEEDED LIMIT · SIGN IN AGAIN";
    } else {
      const until = Date.now() + Math.min(7 * 86_400_000, Math.max(1, Number(cooldown![1]) - Date.now()));
      try { localStorage.setItem(defeatCooldownKey, String(until)); } catch {}
      waitForDefeatCooldown(until);
    }
    createAutoFarmResumeStore(() => localStorage).clear();
    dependencies.disconnectVirtualPlayers();
    // Keep the guest token and all saved progress. A retry must use this account.
    dependencies.connection()?.disconnect();
    dependencies.notify();
    return true;
  }

  const api = {
    accountState() {
      const signedIn = !signingOut && Boolean(dependencies.connection()?.isActive && dependencies.connectedSignedIn());
      return {
        signedIn,
        knownAccount: hasKnownAccount(),
        signInRequired: hasKnownAccount() && !signedIn && !guestSessionExplicit,
        guestSessionApproved: guestSessionExplicit,
        gameSessionApproved: guestSessionExplicit || Boolean(sessionApproved && (renewal.stored() || returnPending)),
        authInProgress: callbackPending,
        returningFromSignIn: returnPending || updateResumePending,
        signInReady: hasKnownAccount() || !guestToken() || Boolean(dependencies.connection()?.isActive),
        hydrated: dependencies.hydrationReady(),
        updating: dependencies.updating(),
        sessionConflict: dependencies.worldEntryBlocked(),
        notice,
      };
    },
    legalConsentAccepted: legalConsent.accepted,
    acceptLegalTerms: legalConsent.acceptAge,
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
      if (signingOut) return { ok: false, error: "SIGNING OUT" };
      if (signInPreparing || outboundAuthNavigationPending || callbackPending) {
        return { ok: true, redirecting: true };
      }
      signInPreparing = true;
      try {
        if (isNativePreview() && !nativeAuth()) {
          notice = "APP SIGN-IN UNAVAILABLE · USE GUEST LOGIN";
          dependencies.notify();
          return { ok: false, error: notice };
        }
        if (dependencies.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.connection();
        if (connection?.isActive && dependencies.connectedSignedIn()) return { ok: true, redirecting: false };
        clearTabValue(keys.authRetryKey);
        if (renewal.stored() && hasKnownAccount()) {
          sessionApproved = true;
          notice = "OPENING CHARACTER";
          dependencies.notify();
          dependencies.connect();
          return { ok: true, redirecting: false };
        }
        if (hasKnownAccount() && !connection) {
          notice = "OPENING SIGN-IN";
          dependencies.notify();
          // Same account continuing: only the kill-report re-auth must log in.
          await startAccountSignIn(defeatSignInBlocked ? "defeat-reauth" : "known-account", defeatSignInBlocked);
          return { ok: true, redirecting: true };
        }
        if (!connection) {
          if (!guestToken()) {
            notice = "OPENING REGISTRATION";
            dependencies.notify();
            await startAccountSignIn("register", true);
            return { ok: true, redirecting: true };
          }
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
        await startAccountSignIn("guest-link", true);
        return { ok: true, redirecting: true };
      } finally {
        signInPreparing = false;
      }
    },
    async takeOverSession() {
      if (signingOut) return { ok: false, error: "SIGNING OUT" };
      if (dependencies.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
      if (takeoverRequested) return { ok: true };
      // Start a new, timed connection attempt instead of sending through a
      // blocked socket whose reducer response may never arrive. The normal
      // handshake renews credentials and registers the protocol before takeover.
      takeoverRequested = true;
      takeoverRevision++;
      if (renewal.stored()) sessionApproved = true;
      else guestSessionExplicit = true;
      dependencies.setWorldEntryBlocked(false);
      notice = "RECONNECTING TO SIGN OUT OTHER TAB…";
      dependencies.restartConnectionForIdentityChange(true);
      dependencies.notify();
      return { ok: true };
    },
    async signOut() {
      if (signingOut) return;
      createAutoFarmResumeStore().clear();
      signingOut = true;
      takeoverRequested = false; takeoverRevision++;
      const idToken = renewal.stored();
      recordConnectionDiagnostic("user-sign-out", { intentional: true });
      // Notification plugins must never hold account sign-out open.
      void syncResearchNotification(null);
      nativeAuth()?.cancel();
      dependencies.disconnectVirtualPlayers();
      sessionApproved = false;
      guestSessionExplicit = false;
      updateResumePending = false;
      lastPlayableSessionMode = null;
      renewal.clear();
      try {
        localStorage.removeItem(keys.accountTokenKey);
        localStorage.removeItem(keys.knownAccountKey);
        localStorage.removeItem(keys.accountMigrationPendingKey);
        localStorage.removeItem(keys.knownAccountCharacterKey);
        localStorage.removeItem(keys.knownAccountGenderKey);
      } catch {}
      clearTabValue(keys.accountLinkKey);
      clearAuthTransaction();
      clearTabValue(keys.authRetryKey);
      clearAccountReturnPending();
      dependencies.updateResumeStore.clear();
      dependencies.connection()?.disconnect();
      notice = "SIGNED OUT";
      dependencies.notify();
      const url = accountLogoutUrl(idToken, redirectUri(), isNativePreview() ? randomUrlSafe(24) : undefined);
      if (isNativePreview()) {
        try { await nativeAuth()?.signOut?.(url); }
        catch { /* Local credentials are already cleared; explicit login prompts again. */ }
        window.location.reload();
      } else window.location.assign(url);
    },
    continueAsGuest() {
      if (signingOut) return { ok: false, error: "SIGNING OUT" };
      takeoverRequested = false; takeoverRevision++;
      void syncResearchNotification(null);
      nativeAuth()?.cancel();
      const mustChangeIdentity = Boolean(
        dependencies.connection()?.isActive && dependencies.connectedSignedIn(),
      ) || Boolean(accountToken());
      dependencies.disconnectVirtualPlayers();
      renewal.clear();
      clearStoredToken(keys.accountTokenKey);
      clearTabValue(keys.accountLinkKey);
      clearAuthTransaction();
      clearAccountMigrationPending();
      clearAccountReturnPending();
      callbackPending = false;
      sessionApproved = false;
      updateResumePending = false;
      guestSessionExplicit = true;
      notice = "GUEST SESSION";
      if (mustChangeIdentity) dependencies.restartConnectionForIdentityChange();
      else if (dependencies.connection()?.isActive && legalConsent.accepted()) void dependencies.requestWorldEntry();
      else dependencies.connect();
      dependencies.notify();
      return { ok: true };
    },
  };

  return {
    api,
    handleDefeatRestriction,
    accountToken,
    connectionToken,
    connectionCredential: renewal.stored,
    guestToken,
    hasKnownAccount,
    isGuestSessionExplicit: () => guestSessionExplicit,
    isSessionApproved: () => sessionApproved,
    shouldEnterWorld: (signedIn: boolean) => signedIn || guestSessionExplicit,
    legalConsentAccepted: legalConsent.accepted,
    syncLegalConsent: legalConsent.syncConnection,
    watchLegalConsent: legalConsent.watch,
    tabId: authTabId,
    notice: () => notice,
    setNotice(value: string) { notice = value; },
    setGuestSessionExplicit(value: boolean) { guestSessionExplicit = value; },
    rememberedCharacter: (signedIn: boolean) => signedIn ? rememberedAccountCharacter() : rememberedGuestCharacter(),
    rememberConfirmedCharacter,
    rememberConfirmedGender,
    completeAccountReturnWhenReady,
    clearAccountReturnPending,
    cancelAbandonedSignIn,
    clearRetry() { clearTabValue(keys.authRetryKey); },
    storeGuestToken(token: string) {
      try { localStorage.setItem(keys.guestTokenKey, token); } catch {}
    },
    markPlayable(signedIn: boolean) {
      lastPlayableSessionMode = signedIn ? "account" : "guest";
      // Keep an already admitted account in the game while transport recovers.
      // Otherwise a restored-token login falls back to sign-in on retry.
      if (signedIn) sessionApproved = true;
    },
    prepareUpdateReload(version: string) {
      recordConnectionDiagnostic("update-reload", { intentional: true, detail: `version:${version}` });
      return lastPlayableSessionMode ? dependencies.updateResumeStore.write(version, lastPlayableSessionMode) : false;
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
        if (/already has (?:wildstat|wildwood) progress/i.test(message)) {
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
      const revision = takeoverRevision;
      const isCurrentTakeover = () => isCurrent() && revision === takeoverRevision && takeoverRequested && !signingOut;
      if (!isCurrentTakeover()) return false;
      notice = "SIGNING OUT OTHER TAB…";
      dependencies.notify();
      try {
        await connection.reducers.enterWorldWithTutorial({ tabId: authTabId(), forceTakeover: true });
        if (!isCurrentTakeover()) return false;
        takeoverRequested = false;
        dependencies.setWorldEntryBlocked(false);
        notice = "OPENING CHARACTER";
        return true;
      } catch (error) {
        if (!isCurrentTakeover()) return false;
        // A closed transport is retried by connection recovery. Keep the
        // explicit intent until an active connection acknowledges or rejects it.
        if (!connection.isActive) {
          dependencies.restartConnectionForIdentityChange(true);
          return false;
        }
        takeoverRequested = false;
        dependencies.setWorldEntryBlocked(true);
        notice = "TAKEOVER FAILED · TRY AGAIN";
        dependencies.handleFailure("session takeover", error);
        dependencies.notify();
        return false;
      }
    },
    canConnect() {
      if (!renewal.stored()) {
        let until = 0;
        try { until = Number(localStorage.getItem(defeatCooldownKey)) || 0; } catch {}
        if (until > Date.now()) { if (defeatCooldownTimer === null) waitForDefeatCooldown(until); return false; }
      }
      if (signingOut) return false;
      if (outboundAuthNavigationPending || callbackPending) return false;
      if (!renewal.stored() && !guestToken() && !guestSessionExplicit) return false;
      if (renewal.stored() && hasKnownAccount() && !sessionApproved) {
        notice = "SIGN-IN REQUIRED";
        dependencies.notify();
        return false;
      }
      if (!renewal.stored() && hasKnownAccount() && !guestSessionExplicit) {
        notice = "SIGN-IN REQUIRED";
        dependencies.notify();
        return false;
      }
      return true;
    },
    onConnectError(signedIn: boolean, error: Error) {
      if (handleDefeatRestriction(error)) return true;
      const rejectedToken = /\b401\b|\b403\b|unauthorized|forbidden|invalid token/i.test(String(error?.message || error));
      if (!rejectedToken) return false;
      recordConnectionDiagnostic("session-blocked", { detail: `authentication-rejected: ${error.message}` });
      clearStoredToken(signedIn ? keys.accountTokenKey : keys.guestTokenKey);
      if (signedIn && hasKnownAccount()) {
        const alreadyRetried = readTabValue(keys.authRetryKey) === "true";
        if (sessionApproved && !alreadyRetried) {
          writeTabValue(keys.authRetryKey, "true");
          notice = "REOPENING SIGN-IN";
          void startAccountSignIn("token-rejected").catch((signInError) => {
            clearAccountReturnPending();
            sessionApproved = false;
            notice = "SIGN-IN FAILED · TRY AGAIN";
            console.warn("WildStat account reauthentication failed:", signInError);
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
      console.warn("WildStat token rejected; reconnecting with a fresh guest session.");
      dependencies.notify();
      dependencies.scheduleReconnect(100);
      return true;
    },
    accountMigrationPending,
    handleStorageEvent(event: StorageEvent) {
      if (event.oldValue === event.newValue) return;
      if (event.key === keys.accountTokenKey) {
        try {
          if (event.oldValue && event.newValue &&
            inspectSpacetimeIdToken(event.oldValue, { allowExpired: true }).sub === inspectSpacetimeIdToken(event.newValue).sub) return;
        } catch {}
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
