import {
  SPACETIME_AUTH_CLIENT_ID,
  SPACETIME_AUTH_ISSUER,
} from "../../../shared/rules";

const JWKS_ENDPOINT = `${SPACETIME_AUTH_ISSUER}/jwks`;
const JWKS_TIMEOUT_MS = 10_000;
const CLOCK_SKEW_SECONDS = 60;
const MINIMUM_TOKEN_LIFETIME_SECONDS = 30;
const MAX_TOKEN_LENGTH = 32_768;

type JsonObject = Record<string, unknown>;

export type ValidatedIdTokenClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
};

export class OidcIdTokenError extends Error {
  constructor(readonly reason: "format" | "claims" | "keys" | "signature") {
    super(`OIDC ID token ${reason} validation failed`);
    this.name = "OidcIdTokenError";
  }
}

type ParsedIdToken = {
  header: JsonObject;
  claims: JsonObject;
  signingInput: Uint8Array;
  signature: Uint8Array;
};

type JwksResponse = {
  keys?: unknown;
};

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64Url(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new OidcIdTokenError("format");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new OidcIdTokenError("format");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value: string) {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value));
    const parsed: unknown = JSON.parse(decoded);
    if (!isJsonObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch (error) {
    if (error instanceof OidcIdTokenError) throw error;
    throw new OidcIdTokenError("format");
  }
}

function parseIdToken(token: string): ParsedIdToken {
  if (!token || token.length > MAX_TOKEN_LENGTH) throw new OidcIdTokenError("format");
  const parts = token.split(".");
  if (parts.length !== 3) throw new OidcIdTokenError("format");
  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const claims = decodeJsonPart(encodedClaims);
  const signature = decodeBase64Url(encodedSignature);
  if (!signature.length) throw new OidcIdTokenError("format");
  return {
    header,
    claims,
    signingInput: new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    signature,
  };
}

function stringsMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function numericDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Performs the synchronous half of ID-token validation. This deliberately
 * rejects opaque or malformed values before they can be offered to the
 * SpacetimeDB client. Signature verification is performed by
 * validateSpacetimeIdToken before a callback token is persisted.
 */
export function inspectSpacetimeIdToken(
  token: string,
  options: { expectedNonce?: string; nowMs?: number } = {},
): ValidatedIdTokenClaims {
  const { header, claims } = parseIdToken(token);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256) {
    throw new OidcIdTokenError("format");
  }
  if (header.typ !== undefined && header.typ !== "JWT") throw new OidcIdTokenError("format");
  if (header.crit !== undefined) throw new OidcIdTokenError("format");

  const issuer = claims.iss;
  const subject = claims.sub;
  const audience = claims.aud;
  const expiresAt = numericDate(claims.exp);
  const issuedAt = numericDate(claims.iat);
  if (
    issuer !== SPACETIME_AUTH_ISSUER ||
    typeof subject !== "string" || !subject || subject.length > 512 ||
    expiresAt === null || issuedAt === null
  ) {
    throw new OidcIdTokenError("claims");
  }

  const audiences = typeof audience === "string"
    ? [audience]
    : Array.isArray(audience) && audience.every((entry) => typeof entry === "string")
      ? audience
      : [];
  if (!audiences.includes(SPACETIME_AUTH_CLIENT_ID)) throw new OidcIdTokenError("claims");
  if (audiences.length > 1 && claims.azp !== SPACETIME_AUTH_CLIENT_ID) throw new OidcIdTokenError("claims");
  if (claims.azp !== undefined && claims.azp !== SPACETIME_AUTH_CLIENT_ID) throw new OidcIdTokenError("claims");

  const nowSeconds = (options.nowMs ?? Date.now()) / 1_000;
  if (expiresAt <= nowSeconds + MINIMUM_TOKEN_LIFETIME_SECONDS) throw new OidcIdTokenError("claims");
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS || issuedAt >= expiresAt) throw new OidcIdTokenError("claims");
  const notBefore = numericDate(claims.nbf);
  if (claims.nbf !== undefined && (notBefore === null || notBefore > nowSeconds + CLOCK_SKEW_SECONDS)) {
    throw new OidcIdTokenError("claims");
  }

  if (options.expectedNonce !== undefined) {
    if (typeof claims.nonce !== "string" || !stringsMatch(claims.nonce, options.expectedNonce)) {
      throw new OidcIdTokenError("claims");
    }
  }

  return {
    sub: subject,
    iss: issuer,
    aud: audience as string | string[],
    exp: expiresAt,
    iat: issuedAt,
    ...(typeof claims.nonce === "string" ? { nonce: claims.nonce } : {}),
  };
}

async function requestSigningKeys() {
  const abortController = new AbortController();
  const timeout = globalThis.setTimeout(() => abortController.abort(), JWKS_TIMEOUT_MS);
  try {
    const response = await fetch(JWKS_ENDPOINT, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: abortController.signal,
    });
    if (!response.ok) throw new OidcIdTokenError("keys");
    const result: unknown = await response.json();
    if (!isJsonObject(result)) throw new OidcIdTokenError("keys");
    return result as JwksResponse;
  } catch (error) {
    if (error instanceof OidcIdTokenError) throw error;
    throw new OidcIdTokenError("keys");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function matchingSigningKey(jwks: JwksResponse, kid: string) {
  if (!Array.isArray(jwks.keys)) throw new OidcIdTokenError("keys");
  const matches = jwks.keys.filter((candidate): candidate is JsonWebKey => {
    if (!isJsonObject(candidate)) return false;
    return candidate.kid === kid &&
      candidate.kty === "RSA" &&
      candidate.use === "sig" &&
      candidate.alg === "RS256" &&
      typeof candidate.n === "string" &&
      typeof candidate.e === "string";
  });
  if (matches.length !== 1) throw new OidcIdTokenError("keys");
  return matches[0];
}

export async function verifySpacetimeIdToken(
  token: string,
  options: {
    expectedNonce: string;
    nowMs?: number;
    jwks?: JwksResponse;
    subtle?: SubtleCrypto;
  },
) {
  const parsed = parseIdToken(token);
  const claims = inspectSpacetimeIdToken(token, options);
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) throw new OidcIdTokenError("signature");
  const jwks = options.jwks ?? await requestSigningKeys();
  const key = matchingSigningKey(jwks, parsed.header.kid as string);
  try {
    const cryptoKey = await subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      parsed.signature,
      parsed.signingInput,
    );
    if (!verified) throw new OidcIdTokenError("signature");
  } catch (error) {
    if (error instanceof OidcIdTokenError) throw error;
    throw new OidcIdTokenError("signature");
  }
  return claims;
}

export function validateSpacetimeIdToken(token: string, expectedNonce: string) {
  return verifySpacetimeIdToken(token, { expectedNonce });
}
