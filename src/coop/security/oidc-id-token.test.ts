import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../../shared/rules";
import {
  inspectSpacetimeIdToken,
  OidcIdTokenError,
  validateSpacetimeIdToken,
  verifySpacetimeIdToken,
} from "./oidc-id-token";

const TEST_NOW_MS = 1_800_000_000_000;
const TEST_NOW_SECONDS = TEST_NOW_MS / 1_000;
const TEST_KEY_ID = "wildstat-test-key";
let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string; use: string; alg: string };

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signedToken(options: {
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
} = {}) {
  const encodedHeader = encodeJson({ alg: "RS256", kid: TEST_KEY_ID, typ: "JWT", ...options.header });
  const encodedClaims = encodeJson({
    iss: SPACETIME_AUTH_ISSUER,
    aud: SPACETIME_AUTH_CLIENT_ID,
    sub: "test-subject",
    iat: TEST_NOW_SECONDS - 10,
    exp: TEST_NOW_SECONDS + 3_600,
    nonce: "expected-nonce",
    ...options.claims,
  });
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicJwk = {
    ...await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    kid: TEST_KEY_ID,
    use: "sig",
    alg: "RS256",
  };
});

describe("Spacetime Auth ID-token validation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("verifies the RS256 signature and required OIDC claims", async () => {
    const token = await signedToken();

    await expect(verifySpacetimeIdToken(token, {
      expectedNonce: "expected-nonce",
      nowMs: TEST_NOW_MS,
      jwks: { keys: [publicJwk] },
    })).resolves.toMatchObject({
      iss: SPACETIME_AUTH_ISSUER,
      aud: SPACETIME_AUTH_CLIENT_ID,
      sub: "test-subject",
      nonce: "expected-nonce",
    });
  });

  it("loads only the pinned provider JWKS endpoint when validating a callback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW_MS);
    const token = await signedToken();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateSpacetimeIdToken(token, "expected-nonce")).resolves.toBeTruthy();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.spacetimedb.com/oidc/jwks",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("rejects a token whose payload changed after signing", async () => {
    const token = await signedToken();
    const [header, _claims, signature] = token.split(".");
    const tampered = `${header}.${encodeJson({
      iss: SPACETIME_AUTH_ISSUER,
      aud: SPACETIME_AUTH_CLIENT_ID,
      sub: "attacker",
      iat: TEST_NOW_SECONDS - 10,
      exp: TEST_NOW_SECONDS + 3_600,
      nonce: "expected-nonce",
    })}.${signature}`;

    await expect(verifySpacetimeIdToken(tampered, {
      expectedNonce: "expected-nonce",
      nowMs: TEST_NOW_MS,
      jwks: { keys: [publicJwk] },
    })).rejects.toMatchObject({ reason: "signature" });
  });

  it.each([
    ["wrong issuer", { iss: "https://attacker.example/oidc" }],
    ["wrong audience", { aud: "different-client" }],
    ["expired", { exp: TEST_NOW_SECONDS - 1 }],
    ["near expiration", { exp: TEST_NOW_SECONDS + 10 }],
    ["future issued-at", { iat: TEST_NOW_SECONDS + 120 }],
    ["missing subject", { sub: "" }],
    ["wrong nonce", { nonce: "different-nonce" }],
  ])("rejects %s claims before signature verification", async (_label, claims) => {
    const token = await signedToken({ claims });

    expect(() => inspectSpacetimeIdToken(token, {
      expectedNonce: "expected-nonce",
      nowMs: TEST_NOW_MS,
    })).toThrowError(OidcIdTokenError);
  });

  it("requires an authorized party when an ID token has multiple audiences", async () => {
    const token = await signedToken({
      claims: { aud: [SPACETIME_AUTH_CLIENT_ID, "another-client"] },
    });

    expect(() => inspectSpacetimeIdToken(token, {
      expectedNonce: "expected-nonce",
      nowMs: TEST_NOW_MS,
    })).toThrowError(OidcIdTokenError);
  });

  it("rejects algorithm substitution and an unknown signing key", async () => {
    const wrongAlgorithm = await signedToken({ header: { alg: "none" } });
    expect(() => inspectSpacetimeIdToken(wrongAlgorithm, { nowMs: TEST_NOW_MS })).toThrowError(OidcIdTokenError);

    const token = await signedToken();
    await expect(verifySpacetimeIdToken(token, {
      expectedNonce: "expected-nonce",
      nowMs: TEST_NOW_MS,
      jwks: { keys: [{ ...publicJwk, kid: "different-key" }] },
    })).rejects.toMatchObject({ reason: "keys" });
  });

  it("returns non-sensitive validation errors", () => {
    const secret = "secret-token-value";
    try {
      inspectSpacetimeIdToken(secret);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
