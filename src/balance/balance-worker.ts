/// <reference lib="webworker" />

import {
  runBalanceSimulationWithStrategyComparisons,
  type BalanceSimulationConfig,
  type BalanceSimulationProgress,
} from "./simulator";

type SimulationRequest = {
  id: number;
  config: Partial<BalanceSimulationConfig>;
};

type SimulationResponse =
  | { id: number; ok: true; type: "progress"; progress: BalanceSimulationProgress }
  | { id: number; ok: true; type: "complete"; elapsedMs: number; result: ReturnType<typeof runBalanceSimulationWithStrategyComparisons> }
  | { id: number; ok: false; message: string };

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<SimulationRequest>) => {
  const startedAt = performance.now();
  try {
    const result = runBalanceSimulationWithStrategyComparisons(event.data.config, (progress) => {
      const response: SimulationResponse = {
        id: event.data.id,
        ok: true,
        type: "progress",
        progress,
      };
      worker.postMessage(response);
    });
    const response: SimulationResponse = {
      id: event.data.id,
      ok: true,
      type: "complete",
      elapsedMs: performance.now() - startedAt,
      result,
    };
    worker.postMessage(response);
  } catch (error) {
    const response: SimulationResponse = {
      id: event.data.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
    worker.postMessage(response);
  }
});

export {};
