/// <reference lib="webworker" />

import { runBalanceSimulation, type BalanceSimulationConfig } from "./simulator";

type SimulationRequest = {
  id: number;
  config: Partial<BalanceSimulationConfig>;
};

type SimulationResponse =
  | { id: number; ok: true; elapsedMs: number; result: ReturnType<typeof runBalanceSimulation> }
  | { id: number; ok: false; message: string };

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<SimulationRequest>) => {
  const startedAt = performance.now();
  try {
    const result = runBalanceSimulation(event.data.config);
    const response: SimulationResponse = {
      id: event.data.id,
      ok: true,
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
