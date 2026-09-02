import { describe, expect, it } from "vitest";
import {
  STARTUP_TELEMETRY_MAX_ATTEMPT,
  STARTUP_TELEMETRY_MAX_DURATION_MS,
  normalizeStartupTelemetrySample,
} from "./startup-telemetry";

const validSample = {
  stage: "hydrating",
  outcome: "failure",
  issueCode: "subscription-error",
  durationMs: 1250.6,
  attempt: 2.9,
  clientVersion: "0.591",
  connectivity: "online",
};

describe("startup telemetry contract", () => {
  it("copies only allowlisted fields and normalizes bounded numbers", () => {
    expect(normalizeStartupTelemetrySample({
      ...validSample,
      durationMs: STARTUP_TELEMETRY_MAX_DURATION_MS + 10_000,
      attempt: STARTUP_TELEMETRY_MAX_ATTEMPT + 10,
      token: "must-not-survive",
      url: "https://example.test/?code=secret",
      error: "free-form server detail",
    })).toEqual({
      stage: "hydrating",
      outcome: "failure",
      issueCode: "subscription-error",
      durationMs: STARTUP_TELEMETRY_MAX_DURATION_MS,
      attempt: STARTUP_TELEMETRY_MAX_ATTEMPT,
      clientVersion: "0.591",
      connectivity: "online",
    });
  });

  it("rejects arbitrary strings and malformed versions", () => {
    expect(normalizeStartupTelemetrySample({ ...validSample, stage: "https://example.test/?code=secret" })).toBeNull();
    expect(normalizeStartupTelemetrySample({ ...validSample, issueCode: "server said token=secret" })).toBeNull();
    expect(normalizeStartupTelemetrySample({ ...validSample, clientVersion: "0.591?code=secret" })).toBeNull();
  });

  it("requires successful samples to have no issue and failures to have one", () => {
    expect(normalizeStartupTelemetrySample({ ...validSample, outcome: "success" })).toBeNull();
    expect(normalizeStartupTelemetrySample({ ...validSample, issueCode: "none" })).toBeNull();
    expect(normalizeStartupTelemetrySample({
      ...validSample,
      outcome: "success",
      issueCode: "none",
    })).toMatchObject({ outcome: "success", issueCode: "none" });
  });
});
