import type { SpawnSite } from "../world";

export { REGULAR_ENEMY_RESPAWN_SECONDS, REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS } from "../../../shared/rules";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../../shared/rules";
/** One ad fills the bank. It holds thirty minutes and no more. */
export const REWARDED_RESPAWN_BOOST_BANK_MS = 30 * 60 * 1_000;
/** How much spending may go unsaved between writes. */
const BANK_SAVE_INTERVAL_MS = 5_000;

export type RespawnBoostBank = { remainingMs: number; enabled: boolean };

export type RegularEnemyRespawnBoost = {
  /** Fills the bank from an earned ad. False when it is already full. */
  grant: () => boolean;
  /** Turns the bank on or off. Returns the state actually reached. */
  setEnabled: (enabled: boolean) => boolean;
  toggle: () => boolean;
  isEnabled: () => boolean;
  /** Enabled and holding time: the respawn clock is halved right now. */
  isActive: () => boolean;
  remainingMs: () => number;
  /** Spends elapsed play time from the bank; call once per frame. */
  drain: (elapsedMs: number) => void;
  /** Persists the current bank now, however little has been spent since. */
  flush: () => void;
  respawnSeconds: () => number;
  schedule: (site: SpawnSite) => void;
  snapshot: () => RespawnBoostBank;
};

function sanitizeRemaining(value: unknown) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.min(REWARDED_RESPAWN_BOOST_BANK_MS, milliseconds);
}

/**
 * Owns regular-enemy respawn timing. Boss respawns remain server-owned and
 * never pass through this service.
 *
 * The boost is a bank, not a countdown: an ad deposits thirty minutes and the
 * player spends it when they choose. It drains against play time, so closing
 * the tab or standing in Home keeps what is left instead of burning it.
 */
export function createRegularEnemyRespawnBoost(
  spawnSites: SpawnSite[],
  getGameTime: () => number,
  initialBank: Partial<RespawnBoostBank> = {},
  respawnSpeedMultiplier = 1,
  baseRespawnSeconds = () => REGULAR_ENEMY_RESPAWN_SECONDS,
  onChanged: (bank: RespawnBoostBank) => void = () => {},
): RegularEnemyRespawnBoost {
  let bankMs = sanitizeRemaining(initialBank.remainingMs);
  let enabled = Boolean(initialBank.enabled) && bankMs > 0;
  let unsavedDrainMs = 0;
  const speedMultiplier = Number.isFinite(respawnSpeedMultiplier)
    ? Math.max(1, respawnSpeedMultiplier)
    : 1;
  const regularRespawnSeconds = () => baseRespawnSeconds() / speedMultiplier;
  const rewardedRespawnSeconds = () => regularRespawnSeconds() / 2;

  function snapshot(): RespawnBoostBank {
    // Frame deltas leave sub-millisecond dust; whole milliseconds are what the
    // timer shows and what gets written to storage.
    return { remainingMs: Math.round(bankMs), enabled };
  }

  function publish() {
    unsavedDrainMs = 0;
    onChanged(snapshot());
  }

  function remainingMs() {
    return bankMs;
  }

  function isEnabled() {
    return enabled;
  }

  function isActive() {
    return enabled && bankMs > 0;
  }

  function respawnSeconds() {
    return isActive() ? rewardedRespawnSeconds() : regularRespawnSeconds();
  }

  function schedule(site: SpawnSite) {
    site.alive = false;
    site.respawnAt = getGameTime() + respawnSeconds();
  }

  /** Halve pending timers from the original defeat; never lengthen a shorter one. */
  function rescaleTimers(toBoosted: boolean) {
    const gameTime = getGameTime();
    const from = toBoosted ? regularRespawnSeconds() : rewardedRespawnSeconds();
    const to = toBoosted ? rewardedRespawnSeconds() : regularRespawnSeconds();
    for (const site of spawnSites) {
      if (site.alive || site.respawnAt <= 0) continue;
      const defeatedAt = site.respawnAt - from;
      const rescaled = Math.max(gameTime, defeatedAt + to);
      site.respawnAt = toBoosted ? Math.min(site.respawnAt, rescaled) : Math.max(site.respawnAt, rescaled);
    }
  }

  function setEnabled(next: boolean) {
    const wanted = next && bankMs > 0;
    if (wanted === enabled) return enabled;
    enabled = wanted;
    rescaleTimers(enabled);
    publish();
    return enabled;
  }

  function grant() {
    if (bankMs >= REWARDED_RESPAWN_BOOST_BANK_MS) return false;
    bankMs = REWARDED_RESPAWN_BOOST_BANK_MS;
    publish();
    return true;
  }

  function drain(elapsedMs: number) {
    if (!isActive()) return;
    const spent = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    if (!spent) return;
    bankMs = Math.max(0, bankMs - spent);
    if (bankMs > 0) {
      // Storage is not a per-frame sink. Save on a coarse cadence and let the
      // caller flush the remainder when the page is going away.
      unsavedDrainMs += spent;
      if (unsavedDrainMs >= BANK_SAVE_INTERVAL_MS) publish();
      return;
    }
    // An empty bank switches itself off, and the enemies still waiting go back
    // to the unboosted clock exactly as a manual toggle would leave them.
    enabled = false;
    rescaleTimers(false);
    publish();
  }

  return {
    grant,
    flush: () => { if (unsavedDrainMs > 0) publish(); },
    setEnabled,
    toggle: () => setEnabled(!enabled),
    isEnabled,
    isActive,
    remainingMs,
    drain,
    respawnSeconds,
    schedule,
    snapshot,
  };
}
