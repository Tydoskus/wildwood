import { movementSpeedsMatch } from "../../../shared/rules";

export const SPEED_SYNC_RETRY_DELAY_MS = 250;

/** Tracks acknowledged speed so server-side presentation rewrites are repaired without per-frame traffic. */
export function createSpeedSyncTracker() {
  let confirmed: number | null = null;
  let inFlight: number | null = null;
  let retryAt = 0;

  return {
    reset() {
      confirmed = null;
      inFlight = null;
      retryAt = 0;
    },
    observe(speed: number) {
      confirmed = Number.isFinite(speed) ? speed : null;
      retryAt = 0;
    },
    begin(speed: number, now: number) {
      if (!Number.isFinite(speed) || inFlight !== null || now < retryAt || movementSpeedsMatch(confirmed, speed)) return false;
      inFlight = speed;
      return true;
    },
    accept(speed: number) {
      if (!movementSpeedsMatch(inFlight, speed)) return;
      confirmed = speed;
      inFlight = null;
      retryAt = 0;
    },
    reject(speed: number, now: number) {
      if (!movementSpeedsMatch(inFlight, speed)) return;
      inFlight = null;
      retryAt = now + SPEED_SYNC_RETRY_DELAY_MS;
    },
  };
}
