import type { createConnectionLifecycle } from "./connection-lifecycle";
import type { createReconnectScheduler } from "./reconnect-scheduler";
import { connectionGateState } from "./connection-gate-state";
export function createConnectionStatusApi(options: {
  lifecycle: ReturnType<typeof createConnectionLifecycle>;
  reconnect: ReturnType<typeof createReconnectScheduler>;
  connected: () => boolean;
  flags: () => [boolean, boolean, boolean];
  latency: () => number | null;
}) {
  return {
    connectionDiagnostics: () => ({ ...options.lifecycle.snapshot(),
      retryAttempt: options.reconnect.attemptCount(), retryScheduled: options.reconnect.isScheduled(),
      retryDelayMs: options.reconnect.pendingDelayMs(),
    }),
    isConnected: options.connected,
    isReconnectingAfterWake: () => connectionGateState(...options.flags()).reconnecting,
    latencyMs: options.latency,
  };
}
