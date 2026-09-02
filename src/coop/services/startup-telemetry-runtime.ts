import { SPACETIME_AUTH_ISSUER } from "../../../shared/rules";
import type {
  StartupTelemetryIssueCode,
  StartupTelemetryOutcome,
  StartupTelemetryStage,
} from "../../../shared/startup-telemetry";
import {
  createStartupTelemetry,
  type ConnectionTelemetryAttempt,
  type StartupStageTimer,
  type StartupTelemetrySubmit,
} from "./startup-telemetry";

type AuthActionResult = {
  ok?: boolean;
  error?: string;
  redirecting?: boolean;
} | undefined;

type StartupTelemetryRuntimeOptions = {
  clientVersion: string;
  authStateKey: string;
  submit: () => StartupTelemetrySubmit | null;
};

/**
 * Coordinates the browser collector across navigation, auth, connection, and
 * deferred-game boundaries without leaking those concerns into the facade.
 */
export function createStartupTelemetryRuntime(options: StartupTelemetryRuntimeOptions) {
  const telemetry = createStartupTelemetry({ clientVersion: options.clientVersion });
  const initialAuthUrl = new URL(window.location.href);
  const initialAuthCode = initialAuthUrl.searchParams.get("code");
  const initialAuthError = initialAuthUrl.searchParams.get("error");
  const initialAuthState = initialAuthUrl.searchParams.get("state");
  const initialAuthIssuer = initialAuthUrl.searchParams.get("iss");
  const initialExpectedAuthState = (() => {
    try {
      return sessionStorage.getItem(options.authStateKey) ?? localStorage.getItem(options.authStateKey);
    } catch {
      return null;
    }
  })();
  let connectionTelemetry: {
    generation: number;
    attempt: ConnectionTelemetryAttempt;
  } | null = null;
  let outboundAuthTelemetry: StartupStageTimer | null = null;

  function flush() {
    const submit = options.submit();
    if (submit) void telemetry.flush(submit);
  }

  function beginStage(stage: StartupTelemetryStage): StartupStageTimer {
    const timer = telemetry.beginStage(stage);
    return {
      finish(
        outcome: StartupTelemetryOutcome = "success",
        issueCode: StartupTelemetryIssueCode = outcome === "success" ? "none" : "startup-error",
      ) {
        const sample = timer.finish(outcome, issueCode);
        if (sample) flush();
        return sample;
      },
    };
  }

  const authCallbackTelemetry = initialAuthCode || initialAuthError
    ? beginStage("authentication")
    : null;

  function authCallbackOutcome(notice: string): readonly [StartupTelemetryOutcome, StartupTelemetryIssueCode] {
    const stateInvalid = !initialAuthState || !initialExpectedAuthState ||
      initialAuthState !== initialExpectedAuthState ||
      (initialAuthIssuer !== null && initialAuthIssuer !== SPACETIME_AUTH_ISSUER);
    if (stateInvalid) return ["failure", "auth-state-mismatch"];
    if (initialAuthError) {
      return initialAuthError === "access_denied"
        ? ["cancelled", "auth-cancelled"]
        : ["failure", "auth-exchange-error"];
    }
    if (notice === "SIGNED IN") return ["success", "none"];
    if (/TIMED OUT/.test(notice)) return ["timeout", "auth-timeout"];
    if (/NETWORK|CHECK UNAVAILABLE/.test(notice)) return ["failure", "auth-network-error"];
    if (/CHECK FAILED/.test(notice)) return ["failure", "auth-token-invalid"];
    return ["failure", "auth-exchange-error"];
  }

  async function restoreKnownAccount(restore: () => Promise<void>, notice: () => string) {
    const restoreTelemetry = beginStage("account-restore");
    try {
      await restore();
      restoreTelemetry.finish();
      if (authCallbackTelemetry) {
        const [outcome, issueCode] = authCallbackOutcome(notice());
        authCallbackTelemetry.finish(outcome, issueCode);
      }
    } catch (error) {
      restoreTelemetry.finish("failure", "account-restore-error");
      authCallbackTelemetry?.finish("failure", "startup-error");
      throw error;
    }
  }

  async function signIn(action: () => Promise<AuthActionResult> | AuthActionResult) {
    const authTelemetry = outboundAuthTelemetry ?? beginStage("authentication");
    outboundAuthTelemetry = authTelemetry;
    try {
      const result = await action();
      if (!result?.redirecting) {
        authTelemetry.finish(
          result?.ok === false ? "failure" : "success",
          result?.ok === false ? "startup-error" : "none",
        );
        if (outboundAuthTelemetry === authTelemetry) outboundAuthTelemetry = null;
      }
      return result;
    } catch (error) {
      authTelemetry.finish("failure", "startup-error");
      if (outboundAuthTelemetry === authTelemetry) outboundAuthTelemetry = null;
      throw error;
    }
  }

  return {
    beginConnectionAttempt(generation: number, attemptNumber: number) {
      connectionTelemetry = {
        generation,
        attempt: telemetry.beginConnectionAttempt(attemptNumber),
      };
    },
    beginStage,
    cancelAbandonedSignIn(canceled: boolean) {
      if (!canceled) return;
      outboundAuthTelemetry?.finish("cancelled", "auth-cancelled");
      outboundAuthTelemetry = null;
    },
    advanceConnection(stage: "preparing-session" | "hydrating", generation: number) {
      if (connectionTelemetry?.generation === generation) connectionTelemetry.attempt.advance(stage);
    },
    completeConnection(generation: number) {
      if (!connectionTelemetry || connectionTelemetry.generation !== generation) return;
      connectionTelemetry.attempt.ready();
      connectionTelemetry = null;
    },
    failConnection(issueCode: StartupTelemetryIssueCode, generation?: number) {
      if (!connectionTelemetry || (generation !== undefined && connectionTelemetry.generation !== generation)) return;
      connectionTelemetry.attempt.fail(issueCode);
      connectionTelemetry = null;
    },
    flush,
    restoreKnownAccount,
    signIn,
    startPageLoadMeasurement() {
      const record = () => {
        const sample = telemetry.record({
          stage: "page-load",
          outcome: "success",
          issueCode: "none",
          durationMs: performance.now(),
        });
        if (sample) flush();
      };
      if (document.readyState === "complete") record();
      else window.addEventListener("load", record, { once: true });
    },
  };
}
