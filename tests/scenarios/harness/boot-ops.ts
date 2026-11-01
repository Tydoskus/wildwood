import { vi } from "vitest";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";
import { storageKeys, type GameTab } from "./game";

/**
 * A stand-in for SpacetimeAuth, the sign-in provider: it signs real RS256 ID
 * tokens with its own key, serves that key at /jwks, answers the code exchange
 * (an XMLHttpRequest) and refresh grants (fetch), and turns a sign-in page
 * visit into the return address the provider would send the browser back to.
 * A booted game connects such a token as the account its `sub` names.
 */
export async function fakeSpacetimeAuth() {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const kid = "scenario-key";
  const publicJwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid, use: "sig", alg: "RS256" };
  const codes = new Map<string, { sub: string; nonce: string }>();
  const refreshTokens = new Map<string, string>();
  let nextCode = 1;
  /** What the provider was asked: code exchanges, refreshes, key fetches. */
  const requests: string[] = [];
  /** While set, the code exchange answers with this error (as the provider refusing the code). */
  let refuseExchange: string | null = null;
  /** Code exchanges waiting for the provider to answer (holdExchanges). */
  let held: (() => void)[] | null = null;

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  async function idToken(sub: string, options: { nonce?: string; lifetimeSeconds?: number; issuedAtMs?: number } = {}) {
    const iat = Math.floor((options.issuedAtMs ?? Date.now()) / 1000);
    const claims = { iss: SPACETIME_AUTH_ISSUER, aud: SPACETIME_AUTH_CLIENT_ID, sub, iat, auth_time: iat, exp: iat + (options.lifetimeSeconds ?? 3600), ...(options.nonce ? { nonce: options.nonce } : {}) };
    const input = `${encode({ alg: "RS256", kid, typ: "JWT" })}.${encode(claims)}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  }

  async function grant(sub: string, nonce?: string) {
    const refresh = `refresh-${sub}-${nextCode++}`;
    refreshTokens.set(refresh, sub);
    return { id_token: await idToken(sub, { nonce }), refresh_token: refresh, token_type: "Bearer", scope: "openid email offline_access" };
  }

  /** The code exchange: a form POST the client sends with XMLHttpRequest. */
  class TokenRequest {
    status = 0;
    responseText = "";
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private url = "";
    open(_method: string, url: string) { this.url = url; }
    setRequestHeader() {}
    getResponseHeader() { return null; }
    abort() { this.onabort?.(); }
    send(body: string) {
      const form = new URLSearchParams(body);
      requests.push(`exchange:${form.get("grant_type")}`);
      const answer = async () => {
        const issued = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        if (this.url !== `${SPACETIME_AUTH_ISSUER}/token` || !issued || refuseExchange) {
          this.status = 400;
          this.responseText = JSON.stringify({ error: refuseExchange ?? "invalid_grant" });
        } else {
          this.status = 200;
          this.responseText = JSON.stringify(await grant(issued.sub, issued.nonce));
        }
        this.onload?.();
      };
      if (held) held.push(() => { void answer(); }); else void answer();
    }
  }
  vi.stubGlobal("XMLHttpRequest", TokenRequest);

  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  /** For bootGame's `route`: the provider's key set and refresh grants. */
  function route(url: URL, init?: RequestInit): Response | Promise<Response> | null {
    if (url.href === `${SPACETIME_AUTH_ISSUER}/jwks`) { requests.push("jwks"); return json({ keys: [publicJwk] }); }
    if (url.href === `${SPACETIME_AUTH_ISSUER}/token`) return refresh(String(init?.body ?? ""));
    return null;
  }
  async function refresh(body: string) {
    const form = new URLSearchParams(body);
    requests.push(`refresh:${form.get("grant_type")}`);
    const sub = refreshTokens.get(form.get("refresh_token") ?? "");
    if (!sub) return json({ error: "invalid_grant" }, 400);
    refreshTokens.delete(form.get("refresh_token")!);
    return json(await grant(sub));
  }

  return {
    route, requests, idToken,
    refuseCodeExchange(error: string | null) { refuseExchange = error; },
    /** The provider is slow: code exchanges wait until `answerExchanges()`. */
    holdExchanges() { held ??= []; },
    answerExchanges() { const waiting = held ?? []; held = null; waiting.forEach(send => send()); },
    /**
     * The player finishes the provider's sign-in page as `sub`: the address it
     * sends the browser back to, from the page's own sign-in request.
     */
    signInAs(authorizeUrl: string, sub: string) {
      const request = new URL(authorizeUrl);
      if (`${request.origin}${request.pathname}` !== `${SPACETIME_AUTH_ISSUER}/auth`) throw new Error(`Not a sign-in page: ${authorizeUrl}`);
      const code = `code-${nextCode++}`;
      codes.set(code, { sub, nonce: request.searchParams.get("nonce") ?? "" });
      const back = new URL(request.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", code);
      back.searchParams.set("state", request.searchParams.get("state") ?? "");
      back.searchParams.set("iss", SPACETIME_AUTH_ISSUER);
      return back.href;
    },
    /** The provider's page is closed or cancelled: it sends the browser back with an error. */
    cancelled(authorizeUrl: string, error = "access_denied") {
      const request = new URL(authorizeUrl);
      const back = new URL(request.searchParams.get("redirect_uri")!);
      back.searchParams.set("error", error);
      back.searchParams.set("state", request.searchParams.get("state") ?? "");
      return back.href;
    },
    /**
     * A browser that signed in as `sub` on an earlier visit: its stored ID token
     * (and refresh grant) and the remembered-account flag, as a sign-in leaves them.
     */
    async rememberSignIn(storage: Storage, sub: string, options: { lifetimeSeconds?: number; issuedAtMs?: number; refresh?: boolean } = {}) {
      const token = await idToken(sub, options);
      storage.setItem(storageKeys.accountTokenKey, token);
      storage.setItem(storageKeys.knownAccountKey, "true");
      if (options.refresh !== false) {
        const refreshToken = `refresh-${sub}-${nextCode++}`;
        refreshTokens.set(refreshToken, sub);
        const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { sub: string };
        storage.setItem(`${storageKeys.accountTokenKey}:refresh`, JSON.stringify({ subject: claims.sub, token: refreshToken, savedAt: Date.now(), chainAt: Date.now() }));
      }
      return token;
    },
  };
}
export type FakeSpacetimeAuth = Awaited<ReturnType<typeof fakeSpacetimeAuth>>;

/** A Storage kept in memory, for a browser profile a scenario prepares before the first boot. */
export function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
  };
}

/** The browser's Back button returns to this page from another site, restored from the back-forward cache. */
export function returnFromAnotherSite(tab: GameTab) {
  const event = new (tab.window as any).Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  tab.window.dispatchEvent(event);
}

/**
 * Lets `ms` pass with nobody touching the game and no frames drawn: every
 * timer fires and every reply lands as it would, at a fraction of play()'s
 * cost. For the long waits of update polls and cooldowns.
 */
export async function idle(tab: GameTab, ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await tab.play(100);
}

/**
 * The hidden page is frozen, as a phone or a browser does to a background tab:
 * no timer of it runs while the clock moves `ms` on.
 */
export function freeze(tab: GameTab, ms: number) {
  if (!tab.document.hidden) throw new Error("Only a hidden tab is frozen");
  vi.setSystemTime(Date.now() + ms);
}
