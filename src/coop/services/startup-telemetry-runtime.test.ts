import { afterEach, describe, expect, it, vi } from "vitest";
import type { StartupTelemetrySample } from "../../../shared/startup-telemetry";
import { createStartupTelemetryRuntime } from "./startup-telemetry-runtime";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function installBrowser(href: string, authState?: string) {
  const storage = new MemoryStorage();
  if (authState) storage.setItem("auth-state", authState);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("performance", { now: () => 125 });
  vi.stubGlobal("document", { readyState: "loading" });
  vi.stubGlobal("window", {
    location: { href },
    addEventListener: vi.fn(),
  });
}

describe("startup telemetry runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("classifies a validated OAuth callback without recording callback data", async () => {
    installBrowser(
      "https://example.test/?code=secret&state=expected&iss=https%3A%2F%2Fauth.spacetimedb.com%2Foidc",
      "expected",
    );
    const submitted: StartupTelemetrySample[] = [];
    const runtime = createStartupTelemetryRuntime({
      clientVersion: "0.591",
      authStateKey: "auth-state",
      submit: () => async (samples) => { submitted.push(...samples); },
    });

    await runtime.restoreKnownAccount(async () => {}, () => "SIGNED IN");

    expect(submitted.map(({ stage, outcome, issueCode }) => ({ stage, outcome, issueCode }))).toEqual([
      { stage: "account-restore", outcome: "success", issueCode: "none" },
      { stage: "authentication", outcome: "success", issueCode: "none" },
    ]);
    expect(JSON.stringify(submitted)).not.toContain("secret");
    expect(JSON.stringify(submitted)).not.toContain("example.test");
  });

  it("records a canceled outbound sign-in and connection phase timings", async () => {
    installBrowser("https://example.test/");
    const submitted: StartupTelemetrySample[] = [];
    let available = false;
    const runtime = createStartupTelemetryRuntime({
      clientVersion: "0.591",
      authStateKey: "auth-state",
      submit: () => available
        ? async (samples) => { submitted.push(...samples); }
        : null,
    });

    await runtime.signIn(() => ({ ok: true, redirecting: true }));
    runtime.cancelAbandonedSignIn(true);
    runtime.beginConnectionAttempt(4, 2);
    runtime.advanceConnection("preparing-session", 4);
    runtime.completeConnection(4);
    available = true;
    runtime.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(submitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "authentication", outcome: "cancelled", issueCode: "auth-cancelled" }),
      expect.objectContaining({ stage: "connecting", outcome: "success", attempt: 2 }),
      expect.objectContaining({ stage: "preparing-session", outcome: "success", attempt: 2 }),
    ]));
  });
});
