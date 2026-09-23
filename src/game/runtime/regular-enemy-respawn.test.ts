import { describe, expect, it, vi } from "vitest";
import type { SpawnSite } from "../world";
import {
  createRegularEnemyRespawnBoost,
  REGULAR_ENEMY_RESPAWN_SECONDS,
  REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS,
  REWARDED_RESPAWN_BOOST_BANK_MS,
} from "./regular-enemy-respawn";

function site(overrides: Partial<SpawnSite> = {}): SpawnSite {
  return {
    id: 0,
    x: 10,
    y: 20,
    campName: "Test camp",
    type: "Bramble",
    leashRange: 300,
    alive: true,
    respawnAt: 0,
    ...overrides,
  };
}

describe("regular enemy respawn boost", () => {
  it("schedules 20-second respawns until the bank is turned on, then 10-second ones", () => {
    let gameTime = 10;
    const first = site();
    const second = site({ id: 1 });
    const boost = createRegularEnemyRespawnBoost([first, second], () => gameTime);

    boost.schedule(first);
    expect(first).toMatchObject({ alive: false, respawnAt: gameTime + REGULAR_ENEMY_RESPAWN_SECONDS });

    gameTime = 20;
    expect(boost.grant()).toBe(true);
    // The ad has just been watched, so the bank is already spending.
    expect(boost.isActive()).toBe(true);
    boost.schedule(second);
    expect(second).toMatchObject({ alive: false, respawnAt: gameTime + REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS });
    expect(boost.respawnSeconds()).toBe(REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS);
  });

  it("supports a caller-scoped local test multiplier without changing defaults", () => {
    const localSite = site();
    const boost = createRegularEnemyRespawnBoost([localSite], () => 10, {}, 3);

    boost.schedule(localSite);
    expect(localSite.respawnAt).toBeCloseTo(10 + 20 / 3);
    expect(boost.respawnSeconds()).toBeCloseTo(20 / 3);
  });

  it("rebases pending timers to 10 seconds from their original defeat", () => {
    const pending = site({ alive: false, respawnAt: 40 });
    const boost = createRegularEnemyRespawnBoost([pending], () => 20, { remainingMs: REWARDED_RESPAWN_BOOST_BANK_MS });

    boost.setEnabled(true);

    expect(pending.respawnAt).toBe(30);
  });

  it("makes overdue boosted timers immediately eligible without changing live enemies", () => {
    const overdue = site({ alive: false, respawnAt: 40 });
    const alive = site({ id: 1, alive: true, respawnAt: 0 });
    const boost = createRegularEnemyRespawnBoost([overdue, alive], () => 35, { remainingMs: REWARDED_RESPAWN_BOOST_BANK_MS });

    boost.setEnabled(true);

    expect(overdue.respawnAt).toBe(35);
    expect(alive).toMatchObject({ alive: true, respawnAt: 0 });
  });

  it("restores pending timers to the full wait when the bank is switched off", () => {
    const pending = site({ alive: false, respawnAt: 40 });
    const boost = createRegularEnemyRespawnBoost([pending], () => 20, { remainingMs: REWARDED_RESPAWN_BOOST_BANK_MS });

    boost.setEnabled(true);
    expect(pending.respawnAt).toBe(30);
    boost.setEnabled(false);
    expect(pending.respawnAt).toBe(40);
    expect(boost.respawnSeconds()).toBe(REGULAR_ENEMY_RESPAWN_SECONDS);
  });

  it("refuses to enable an empty bank and never banks past thirty minutes", () => {
    const boost = createRegularEnemyRespawnBoost([], () => 0);

    expect(boost.setEnabled(true)).toBe(false);
    expect(boost.grant()).toBe(true);
    expect(boost.remainingMs()).toBe(REWARDED_RESPAWN_BOOST_BANK_MS);
    expect(boost.grant()).toBe(false);
  });

  it("spends a granted bank straight away, and stops when it is switched off", () => {
    const boost = createRegularEnemyRespawnBoost([], () => 0);
    boost.grant();

    // Granted means running: the player watched the ad to start it, not to be
    // handed a switch they still have to find.
    expect(boost.isActive()).toBe(true);
    boost.drain(60_000);
    expect(boost.remainingMs()).toBe(REWARDED_RESPAWN_BOOST_BANK_MS - 60_000);

    // The toggle still saves the rest for later.
    expect(boost.setEnabled(false)).toBe(false);
    boost.drain(60_000);
    expect(boost.remainingMs()).toBe(REWARDED_RESPAWN_BOOST_BANK_MS - 60_000);
    expect(boost.isActive()).toBe(false);
  });

  it("starts a bank that was reloaded paused when the player claims another", () => {
    const boost = createRegularEnemyRespawnBoost([], () => 0, { remainingMs: 60_000, enabled: false });
    expect(boost.isActive()).toBe(false);
    // Nothing was deposited, because the bank was not empty enough to refill.
    expect(boost.grant()).toBe(true);
    expect(boost.isActive()).toBe(true);
  });

  it("switches itself off and un-boosts pending timers when the bank runs dry", () => {
    const pending = site({ alive: false, respawnAt: 40 });
    const boost = createRegularEnemyRespawnBoost([pending], () => 20, { remainingMs: 5_000, enabled: true });

    expect(pending.respawnAt).toBe(40);
    boost.drain(5_000);

    expect(boost.remainingMs()).toBe(0);
    expect(boost.isEnabled()).toBe(false);
    expect(boost.respawnSeconds()).toBe(REGULAR_ENEMY_RESPAWN_SECONDS);
    expect(pending.respawnAt).toBe(50);
  });

  it("restores a saved bank and reports every change for persistence", () => {
    const onChanged = vi.fn();
    const boost = createRegularEnemyRespawnBoost([], () => 0, { remainingMs: 20_000, enabled: true }, 1, undefined, onChanged);

    expect(boost.snapshot()).toEqual({ remainingMs: 20_000, enabled: true });
    expect(boost.respawnSeconds()).toBe(REWARDED_REGULAR_ENEMY_RESPAWN_SECONDS);

    boost.drain(5_000);
    expect(onChanged).toHaveBeenLastCalledWith({ remainingMs: 15_000, enabled: true });
    boost.toggle();
    expect(onChanged).toHaveBeenLastCalledWith({ remainingMs: 15_000, enabled: false });
  });

  it("ignores a saved enabled flag with nothing left to spend", () => {
    const boost = createRegularEnemyRespawnBoost([], () => 0, { remainingMs: 0, enabled: true });

    expect(boost.isEnabled()).toBe(false);
    expect(boost.respawnSeconds()).toBe(REGULAR_ENEMY_RESPAWN_SECONDS);
  });
});
it('uses the current map configuration and halves it for rewarded respawns', () => {
  let seconds = 40;
  const target = site();
  const boost = createRegularEnemyRespawnBoost([target], () => 10, { remainingMs: REWARDED_RESPAWN_BOOST_BANK_MS }, 1, () => seconds);
  boost.schedule(target); expect(target.respawnAt).toBe(50);
  boost.setEnabled(true); expect(target.respawnAt).toBe(30);
  seconds = 60; expect(boost.respawnSeconds()).toBe(30);
});

it("applies the owner's enemy respawn research before the ad boost", () => {
  const boost = createRegularEnemyRespawnBoost([], () => 0, { remainingMs: 60_000 }, 1, () => 20, () => {}, () => 5);
  expect(boost.respawnSeconds()).toBe(17.5);
  boost.setEnabled(true);
  expect(boost.respawnSeconds()).toBe(8.75);
});
