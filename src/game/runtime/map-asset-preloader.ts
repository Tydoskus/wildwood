import { scheduleBackgroundTask } from "./scheduler";

type PortalDestination<MapKey extends string> = { destination: MapKey };
type MapPreloadEntry<MapKey extends string> = {
  portal: PortalDestination<MapKey>;
  secondaryPortal?: PortalDestination<MapKey>;
};

export type MapPreloadAvailability = "ready" | "wait" | "disabled";

type BackgroundMapPreloadState = {
  running: boolean;
  lowPerformanceMode: boolean;
  documentHidden: boolean;
  gameplayBusy: boolean;
  workFps: number;
  saveData: boolean;
  effectiveConnectionType?: string;
};

type CancelScheduledTask = () => void;
type PreloadScheduler = (callback: () => void, delayMs: number) => CancelScheduledTask;

type IdleCallbackWindow = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Prioritizes a map's forward portal, then its return portal. */
export function adjacentMapDestinations<MapKey extends string>(
  mapConfig: Record<MapKey, MapPreloadEntry<MapKey>>,
  currentMapId: MapKey,
) {
  const entry = mapConfig[currentMapId];
  if (!entry) return [];
  const candidates = [entry.secondaryPortal?.destination, entry.portal.destination];
  return candidates.filter((mapId, index): mapId is MapKey => Boolean(
    mapId
      && mapId !== currentMapId
      && mapId in mapConfig
      && candidates.indexOf(mapId) === index,
  ));
}

export function backgroundMapPreloadAvailability(state: BackgroundMapPreloadState): MapPreloadAvailability {
  const connectionType = state.effectiveConnectionType?.toLowerCase();
  if (state.saveData || connectionType === "slow-2g" || connectionType === "2g") return "disabled";
  if (!state.running || state.lowPerformanceMode || state.documentHidden || state.gameplayBusy) return "wait";
  if (!Number.isFinite(state.workFps) || state.workFps < 50) return "wait";
  return "ready";
}

function scheduleBrowserIdleTask(callback: () => void, delayMs: number): CancelScheduledTask {
  const idleWindow = globalThis as IdleCallbackWindow;
  let cancelled = false;
  let idleHandle: number | null = null;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(() => {
        idleHandle = null;
        if (!cancelled) callback();
      }, { timeout: 2_000 });
      return;
    }
    scheduleBackgroundTask(() => {
      if (!cancelled) callback();
    });
  }, delayMs);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}

/**
 * Warms only directly connected maps, one at a time. Re-queuing after travel
 * abandons the old route; existing in-flight image promises remain reusable.
 */
export function createAdjacentMapAssetPreloader<MapKey extends string>(options: {
  mapConfig: Record<MapKey, MapPreloadEntry<MapKey>>;
  mapAssetsReady: (mapId: MapKey) => boolean;
  prepareMapAssets: (mapId: MapKey) => Promise<void>;
  availability: () => MapPreloadAvailability;
  schedule?: PreloadScheduler;
  initialDelayMs?: number;
  betweenMapsDelayMs?: number;
  retryDelayMs?: number;
}) {
  const schedule = options.schedule ?? scheduleBrowserIdleTask;
  const initialDelayMs = options.initialDelayMs ?? 3_000;
  const betweenMapsDelayMs = options.betweenMapsDelayMs ?? 1_500;
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  let generation = 0;
  let cancelScheduledTask: CancelScheduledTask | null = null;

  function cancel() {
    generation += 1;
    cancelScheduledTask?.();
    cancelScheduledTask = null;
  }

  function queueFrom(currentMapId: MapKey) {
    cancel();
    const queueGeneration = generation;
    const destinations = adjacentMapDestinations(options.mapConfig, currentMapId);
    let destinationIndex = 0;

    const scheduleNext = (delayMs: number) => {
      cancelScheduledTask = schedule(() => {
        cancelScheduledTask = null;
        void runNext();
      }, delayMs);
    };

    const runNext = async () => {
      if (generation !== queueGeneration) return;
      const availability = options.availability();
      if (availability === "disabled") return;
      if (availability === "wait") {
        scheduleNext(retryDelayMs);
        return;
      }
      while (destinationIndex < destinations.length && options.mapAssetsReady(destinations[destinationIndex])) {
        destinationIndex += 1;
      }
      const destination = destinations[destinationIndex];
      if (!destination) return;
      destinationIndex += 1;
      try {
        await options.prepareMapAssets(destination);
      } catch {
        // Portal travel retains its normal retry/error handling if a warmup fails.
      }
      if (generation === queueGeneration && destinationIndex < destinations.length) {
        scheduleNext(betweenMapsDelayMs);
      }
    };

    if (destinations.length > 0) scheduleNext(initialDelayMs);
  }

  return { queueFrom, cancel };
}
