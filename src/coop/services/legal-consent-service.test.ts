import { describe, expect, it, vi } from "vitest";
import {
  AGE_BAND_ADULT,
  AGE_BAND_TEEN,
  TERMS_VERSION,
  playerAgeBand,
} from "../../../shared/legal";
import { createLegalConsentService, legalConsentInternals } from "./legal-consent-service";

describe("legal consent", () => {
  it("classifies ages without retaining an exact birthday", () => {
    expect(() => playerAgeBand(0)).toThrow();
    expect(playerAgeBand(12)).toBe(0);
    expect(playerAgeBand(13)).toBe(AGE_BAND_TEEN);
    expect(playerAgeBand(17)).toBe(AGE_BAND_TEEN);
    expect(playerAgeBand(18)).toBe(AGE_BAND_ADULT);
  });

  it("ignores stale or malformed stored acceptance", () => {
    expect(legalConsentInternals.parseStoredConsent("not json")).toBeNull();
    expect(legalConsentInternals.parseStoredConsent(JSON.stringify({ termsVersion: "old", ageBand: 2 }))).toBeNull();
    expect(legalConsentInternals.parseStoredConsent(JSON.stringify({ termsVersion: TERMS_VERSION, ageBand: 0 }))).toBeNull();
  });

  it("blocks under-13 selection before any server call", async () => {
    const reducers = { acceptTerms: vi.fn() };
    const values = new Map<string, string>();
    const service = createLegalConsentService({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
      },
      storageKey: "legal",
      connection: () => ({ isActive: true, reducers } as never),
      protocolReady: () => true,
      shouldEnterWorld: () => true,
      requestWorldEntry: vi.fn(async () => true),
      notify: vi.fn(),
      handleFailure: vi.fn(),
    });

    await expect(service.acceptAge(12)).resolves.toMatchObject({ ok: false });
    expect(reducers.acceptTerms).not.toHaveBeenCalled();
    expect(values.has("legal")).toBe(false);
  });
});
