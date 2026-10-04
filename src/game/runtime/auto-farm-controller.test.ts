import { describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createBalanceApologyGiftController } from '../../ui/balance-apology-gift-controller';
import { createGameBootstrap } from './game-bootstrap';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { createAutoFarmController, autoFarmStandoff, AUTO_FARM_DEFEAT_LIMIT, AUTO_FARM_DEFEAT_WINDOW_MS, AUTO_FARM_REACH_MARGIN, PULL_WAIT_SECONDS } from './auto-farm-controller';
import { createEnemySimulation } from './enemy-simulation';
import { attackRangeWithResearch } from '../../../shared/utility-research';
import { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import type { SpawnSite } from '../world';
import { ENEMY_TYPES, type EnemyKind } from '../enemies';
import type { Circle } from './types';
import { BOSS_KINDS } from './boss-registry';
import { bossSurfaceDistance } from '../../../shared/boss-hitbox';
import { weaponAttackRange } from '../weapon-combat';
import type { Movement } from './player-input-controller';
const idle: Movement = { x: 0, y: 0, source: 'none' };

function setup(obstacles: Circle[] = [], weapon = "starter_bow", resumeStore?: ReturnType<typeof createAutoFarmResumeStore>) {
  const state = createGameBootstrap();
  state.enemies.length = 0;
  state.spawnSites.length = 0;
  Object.assign(state.player, { x: 500, y: 500, attackRange: 200, speed: 300 });
  let map = 'forest', unavailable: string | null = null, paused = false;
  let connection: 'ready' | 'recovering' | 'ended' = 'ready';
  let identity: string | undefined = 'local-player', now = 0;
  const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
  const add = (type: EnemyKind, x: number, y: number) => {
    const site: SpawnSite = { id: state.spawnSites.length, type, x, y, campName: type, leashRange: 500, alive: false, respawnAt: 0 };
    state.spawnSites.push(site);
    lifecycle.spawnFromSite(site);
    return state.enemies[state.enemies.length - 1];
  };
  const farm = createAutoFarmController({
    ...state, mapId: () => map, unavailable: () => unavailable, paused: () => paused,
    speed: () => state.player.speed, obstacles: () => obstacles, equippedWeapon: () => weapon,
    connection: () => connection, localIdentity: () => identity, now: () => now,
    resumeStore,
  });
  const tick = () => {
    const movement = farm.movement(idle, 1 / 60);
    state.player.x += movement.x * state.player.speed / 60;
    state.player.y += movement.y * state.player.speed / 60;
    return movement;
  };
  return { ...state, farm, tick, add,
    setMap: (value: string) => { map = value; },
    setUnavailable: (value: string | null) => { unavailable = value; },
    setPaused: (value: boolean) => { paused = value; },
    setConnection: (value: typeof connection) => { connection = value; },
    setIdentity: (value: string | undefined) => { identity = value; },
    advance: (ms: number) => { now += ms; },
  };
}

describe('autofarm', () => {
  it('keeps pulling the whole group while the player steers by hand', () => {
    const s = setup();
    const mob = s.add('Bramble', 1500, 500);
    s.farm.setPullAll(true);
    s.farm.start('Bramble');
    s.tick();
    expect(s.farm.pulls(mob)).toBe(true);
    s.farm.movement({ x: 1, y: 0, source: 'keyboard' } as Movement, 1 / 60);
    expect(s.farm.pulls(mob)).toBe(true);
    s.farm.setPullAll(false);
    expect(s.farm.pulls(mob)).toBe(false);
  });

  it('keeps moving while a 15-gem gift is visible, acknowledging, and dismissed', async () => {
    const s = setup();
    s.add('Bramble', 1500, 500);
    s.farm.start('Bramble');
    const { document } = parseHTML('<div id="gift"><h1></h1><button>Continue</button></div>');
    const overlay = document.querySelector('div')!;
    const button = document.querySelector('button')!;
    let finish!: (value: { ok: boolean }) => void;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
    try {
      const gift = createBalanceApologyGiftController({ overlay, title: document.querySelector('h1')!, continueButton: button }, {
        canShow: () => true, amount: () => 15n,
        acknowledge: () => new Promise(resolve => { finish = resolve; }),
        showMessage: () => {}, afterDismiss: () => {},
      });
      expect(gift.isOpen()).toBe(true);
      expect(s.tick().x).toBeGreaterThan(0);
      button.click();
      expect(button.disabled).toBe(true);
      expect(s.tick().x).toBeGreaterThan(0);
      finish({ ok: true });
      await Promise.resolve(); await Promise.resolve();
      expect(gift.isOpen()).toBe(false);
      expect(s.tick().x).toBeGreaterThan(0);
      expect(s.farm.targetType()).toBe('stat:health');
    } finally { vi.unstubAllGlobals(); }
  });

  it('keeps same-species generated camps apart by the stat they pay', () => {
    const s = setup(); s.setMap('endless_1');
    const armor = s.add('Bramble', 550, 500), health = s.add('Bramble', 1500, 500);
    armor.campName = s.spawnSites[0].campName = 'Armor Camp';
    health.campName = s.spawnSites[1].campName = 'Health Camp';
    const armorDefinition = { ...armor.definition ?? ENEMY_TYPES.Bramble, reward: { type: 'armor' as const, amount: 3 } };
    armor.definition = s.spawnSites[0].definition = armorDefinition;
    const choices = s.farm.choices();
    expect(choices.map(c => c.key).sort()).toEqual(['stat:armor', 'stat:health']);
    expect(s.farm.start('stat:health')).toBe(true);
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.targetType()).toBe('stat:health');
    health.dead = true;
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it("farms a camp's regulars and elites, and every camp paying the stat, as one choice", () => {
    const s = setup();
    s.add('Cindermaw', 900, 500); s.add('Dread Warden', 1400, 500); s.add('Bramble', 600, 500);
    expect(ENEMY_TYPES.Cindermaw.reward.type).toBe(ENEMY_TYPES['Dread Warden'].reward.type);
    const damage = s.farm.choices().find(c => c.key === `stat:${ENEMY_TYPES.Cindermaw.reward.type}`)!;
    expect(damage.total).toBe(2);
    expect(damage.kinds.sort()).toEqual(['Cindermaw', 'Dread Warden']);
    // An old saved choice by kind still finds its stat.
    expect(s.farm.start('Dread Warden')).toBe(true);
    expect(s.farm.state().selected).toBe(damage.key);
  });

  it('never detours toward an engaged generated boss', () => {
    const s = setup(); s.setMap('endless_1');
    const target = s.add('Bramble', 1500, 500);
    target.campName = s.spawnSites[0].campName = 'Health Camp';
    const boss = s.add('Bramble', 500, 900);
    Object.assign(boss, { generatedBoss: true, engaged: true, aggroTargetId: null, campName: 'Warden' });
    s.spawnSites.pop(); // Bosses are not regular respawning camp sites.
    expect(s.farm.choices()).toHaveLength(1);
    s.farm.start(s.farm.choices()[0].key);
    expect(s.tick()).toEqual({ x: 1, y: 0, source: 'steer' });
    target.dead = true;
    expect(s.tick().y).toBe(0);
  });

  it('walks to the selected type at ordinary speed and stops inside attack range', () => {
    const s = setup();
    s.add('Needle', 500, 520);
    s.add('Bramble', 1500, 500);
    expect(s.farm.start('Bramble')).toBe(true);
    const first = s.tick();
    expect(first).toEqual({ x: 1, y: 0, source: 'steer' });
    for (let i = 0; i < 300; i++) s.tick();
    // Holds at the edge of its 200 reach: inside it, and no further in than the margin and one step.
    expect(1500 - s.player.x).toBeLessThan(200);
    expect(1500 - s.player.x).toBeGreaterThan(200 - AUTO_FARM_REACH_MARGIN - 6);
    expect(s.player.y).toBe(500);
    expect(s.farm.state().status).toBe('Farming');
    expect(s.farm.targetType()).toBe('stat:health');
  });

  it('stops to fight an attacker of another type, then resumes its original farm route', () => {
    const s = setup();
    s.add('Bramble', 1500, 500);
    const attacker = s.add('Needle', 500, 550);
    s.farm.start('Bramble');
    expect(s.tick().x).toBeGreaterThan(0);
    attacker.engaged = true;
    attacker.aggroTargetId = 'local-player';
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state()).toMatchObject({ active: true, selected: 'stat:health', status: 'Defending' });
    attacker.dead = true;
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.targetType()).toBe('stat:health');
  });

  it('does not detour for enemies fighting someone else or returning to their spawn', () => {
    const s = setup(); s.add('Bramble', 1500, 500);
    const attacker = s.add('Needle', 500, 550);
    attacker.engaged = true;
    attacker.aggroTargetId = 'another-player';
    s.farm.start('Bramble');
    expect(s.tick().x).toBeGreaterThan(0);
    attacker.aggroTargetId = 'local-player'; attacker.leashing = true;
    expect(s.tick().x).toBeGreaterThan(0);
    attacker.leashing = false; attacker.remoteCombatGhost = true;
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it('reaches firing range even when the nearest firing position is inside an obstacle', () => {
    const obstacle = { x: 950, y: 500, r: 100 };
    const s = setup([obstacle]); s.add('Bramble', 1100, 500); s.farm.start('Bramble');
    for (let i = 0; i < 300; i++) {
      s.tick();
      expect(Math.hypot(s.player.x - obstacle.x, s.player.y - obstacle.y)).toBeGreaterThanOrEqual(obstacle.r - .001);
    }
    expect(s.farm.state().status).toBe('Farming');
  });

  it('reacquires after a kill, waits at a spawn, and resumes when an enemy respawns', () => {
    const s = setup();
    const first = s.add('Bramble', 600, 500), second = s.add('Bramble', 1200, 500);
    s.farm.start('Bramble'); s.tick();
    expect(s.farm.state().status).toBe('Farming');
    first.dead = true;
    expect(s.tick().x).toBeGreaterThan(0);
    second.dead = true;
    s.tick();
    expect(s.farm.state().status).toBe('Waiting for respawn');
    second.dead = false;
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.choices()[0]).toMatchObject({ type: 'Bramble', alive: 1, total: 2 });
  });

  it('excludes presentation ghosts and retains a living target instead of oscillating', () => {
    const s = setup();
    const a = s.add('Bramble', 900, 500), b = s.add('Bramble', 500, 1000);
    const ghost = s.add('Bramble', 500, 510); ghost.remoteCombatGhost = true;
    s.farm.start('Bramble');
    expect(s.tick().x).toBeGreaterThan(0);
    b.y = 700;
    expect(s.tick().x).toBeGreaterThan(0);
    a.dead = true;
    expect(s.tick().y).toBeGreaterThan(0);
  });

  it('manual movement takes priority and autofarm resumes on release', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    const manual: Movement = { x: -.4, y: .2, source: 'touch' };
    expect(s.farm.movement(manual, 1 / 60)).toBe(manual);
    expect(s.farm.targetType()).toBeNull();
    expect(s.farm.targetCamp()).toBeNull();
    expect(s.farm.state()).toMatchObject({ active: true, status: 'Manual control' });
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.targetType()).toBe('stat:health');
    expect(s.farm.state().active).toBe(true);
  });

  it('pauses movement while a window is open and resumes on close', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    s.setPaused(true);
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state()).toMatchObject({ active: true, status: 'Paused' });
    s.setPaused(false);
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it('keeps farming through a death: holds while the player is down and picks the camp up again after the respawn', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    expect(s.tick().x).toBeGreaterThan(0);
    s.farm.defeated(); s.setConnection('recovering'); s.farm.refresh();      // the session stops running while dead
    expect(s.farm.state().active).toBe(true);
    expect(s.tick()).toEqual(idle);
    s.setConnection('ready'); s.farm.refresh(); s.advance(1_000); s.farm.refresh();
    expect(s.farm.state().active).toBe(true);
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it('ends a farm that keeps dying, so an unattended player cannot die in a loop all night', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    for (let death = 1; death < AUTO_FARM_DEFEAT_LIMIT; death += 1) { s.farm.defeated(); s.advance(20_000); }
    expect(s.farm.state().active).toBe(true);
    s.farm.defeated();
    expect(s.farm.state()).toMatchObject({ active: false, status: `Autofarm stopped after ${AUTO_FARM_DEFEAT_LIMIT} defeats in a row` });
  });

  it('forgets old defeats, so dying now and then over a long session never ends the farm', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT * 3; death += 1) { s.farm.defeated(); s.advance(AUTO_FARM_DEFEAT_WINDOW_MS / 2); }
    expect(s.farm.state().active).toBe(true);
  });

  it('stops on map changes, unavailable gameplay, and rejects enemies absent from the map', () => {
    const s = setup(); s.add('Bramble', 1500, 500);
    expect(s.farm.start('Needle')).toBe(false);
    s.farm.start('Bramble'); s.setMap('desert');
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state().active).toBe(false);
    s.farm.start('Bramble'); s.setUnavailable('Disconnected'); s.farm.refresh();
    expect(s.farm.state()).toMatchObject({ active: false, status: 'Disconnected' });
    expect(s.farm.start('Bramble')).toBe(false);
  });

  it('retains the selected camp through disconnects and reacquires a fresh world after reconnecting', () => {
    const s = setup(); s.setMap('endless_1');
    const old = s.add('Bramble', 1500, 500);
    old.campName = s.spawnSites[0].campName = 'Health Camp';
    s.farm.start('Bramble:Health Camp');
    expect(s.tick().x).toBeGreaterThan(0);
    s.setConnection('recovering'); s.setPaused(true);
    // Hydration can temporarily remove saved unlocks/equipment and identity.
    s.setUnavailable('Equip a weapon to farm'); s.setIdentity(undefined);
    s.farm.refresh(); s.advance(120_000);
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state()).toMatchObject({ active: true, status: 'Reconnecting · farming will resume' });
    expect(s.farm.targetType()).toBe('stat:health');
    s.enemies.length = 0; s.spawnSites.length = 0;
    const fresh = s.add('Bramble', s.player.x, 1500);
    fresh.campName = s.spawnSites[0].campName = 'Health Camp';
    s.setIdentity('local-player'); s.setUnavailable(null); s.setConnection('ready');
    s.farm.refresh(); s.advance(1_000);
    // An open chat window still pauses movement after the connection recovers.
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state().status).toBe('Paused');
    s.setPaused(false);
    expect(s.tick()).toEqual({ x: 0, y: 1, source: 'steer' });
  });

  it('waits for a stable connection and never runs movement during recovery', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    s.setConnection('recovering');
    expect(s.farm.movement({ x: 1, y: 0, source: 'touch' }, 1 / 60)).toEqual(idle);
    for (let i = 0; i < 3; i++) {
      s.setConnection('ready'); s.farm.refresh(); s.advance(999);
      expect(s.tick()).toEqual(idle);
      s.setConnection('recovering'); s.farm.refresh();
    }
    s.setConnection('ready'); s.farm.refresh(); s.advance(1_000);
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it.each(['stop', 'map', 'character', 'sign-in', 'unavailable'] as const)(
    'does not restart after %s interrupts recovery', interrupt => {
      const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
      s.setConnection('recovering'); s.farm.refresh();
      if (interrupt === 'stop') s.farm.stop();
      if (interrupt === 'map') s.setMap('desert');
      if (interrupt === 'character') s.setIdentity('another-player');
      if (interrupt === 'sign-in') s.setConnection('ended');
      if (interrupt === 'unavailable') { s.setConnection('ready'); s.setUnavailable('Autofarm stopped after defeat'); }
      s.farm.refresh();
      s.setConnection('ready'); s.farm.refresh(); s.advance(1_000); s.farm.refresh();
      s.setConnection('ready'); s.setUnavailable(null); s.advance(60_000);
      expect(s.tick()).toEqual(idle);
      expect(s.farm.state().active).toBe(false);
    },
  );

  it('rejects a new start while disconnected and stops if the restored map has no selected enemies', () => {
    const s = setup(); s.add('Bramble', 1500, 500);
    s.setConnection('recovering'); expect(s.farm.start('Bramble')).toBe(false);
    s.setConnection('ready'); s.farm.start('Bramble');
    s.setConnection('recovering'); s.farm.refresh();
    s.enemies.length = 0; s.spawnSites.length = 0;
    s.setConnection('ready'); s.farm.refresh(); s.advance(1_000);
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state()).toMatchObject({ active: false, status: 'No matching enemies in this map' });
  });
});

describe('autofarm update handoff', () => {
  function store() {
    const values = new Map<string, string>();
    return createAutoFarmResumeStore(() => ({ getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  }
  it('restores the same character and camp after a reload, ignoring incomplete hydration', () => {
    const memory = store(), before = setup([], 'starter_bow', memory);
    before.setMap('endless_40'); before.add('Bramble', 1000, 500);
    before.spawnSites[0].campName = 'Armor Camp';
    before.farm.start('Bramble:Armor Camp');
    const after = setup([], 'starter_bow', memory);
    after.setConnection('recovering'); after.setIdentity(undefined);
    after.setUnavailable('Equip a weapon to farm');
    expect(after.tick()).toEqual(idle);
    after.setMap('endless_40'); after.setIdentity('local-player');
    const enemy = after.add('Bramble', 1000, 500);
    enemy.campName = after.spawnSites[0].campName = 'Armor Camp';
    after.setConnection('ready'); after.farm.refresh(); after.advance(999);
    expect(after.tick()).toEqual(idle);
    after.setUnavailable(null); after.advance(1);
    expect(after.tick().x).toBeGreaterThan(0);
    expect(after.farm.targetType()).toBe('stat:health');
  });
  it('ignores a temporary default map during an ordinary reconnect', () => {
    const s = setup(); s.add('Bramble', 1000, 500); s.farm.start('Bramble');
    s.setConnection('recovering'); s.setMap('home'); s.farm.refresh();
    s.setConnection('ready'); s.setUnavailable('Equip a weapon to farm'); s.farm.refresh();
    s.setMap('forest'); s.setUnavailable(null); s.advance(1000);
    expect(s.tick().x).toBeGreaterThan(0);
  });
  it.each(['stop', 'character', 'map', 'sign-in'] as const)('does not resurrect farming after %s', change => {
    const memory = store(), before = setup([], 'starter_bow', memory);
    before.add('Bramble', 1000, 500); before.farm.start('Bramble');
    if (change === 'stop') before.farm.stop();
    const after = setup([], 'starter_bow', memory); after.add('Bramble', 1000, 500);
    if (change === 'character') after.setIdentity('another-player');
    if (change === 'map') after.setMap('desert');
    if (change === 'sign-in') after.setConnection('ended');
    after.farm.refresh(); after.advance(1000); after.farm.refresh();
    expect(after.farm.state().active).toBe(false);
    expect(memory.read()).toBeNull();
  });
});

it("closes to sword reach without changing the player camera range", () => {
  const s = setup([], "wooden_sword"), enemy = s.add("Spitter", 800, 500);
  s.farm.start("Spitter");
  for (let i = 0; i < 300; i++) s.tick();
  expect(Math.hypot(enemy.x - s.player.x, enemy.y - s.player.y) - enemy.r).toBeLessThan(75);
  expect(s.player.attackRange).toBe(200);
});

describe("autofarm against a ranged enemy with researched attack range", () => {
  // Drives the real enemy simulation: a hit engages the enemy, which walks in
  // to its own range and holds there.
  function farmBrood(attackRange: number) {
    const s = setup();
    s.player.attackRange = attackRange;
    const brood = s.add("Brood", 1500, 500);
    brood.hp = brood.maxHp = 1e9;
    const lifecycle = createEnemyLifecycle(s.enemies, s.spawnSites, () => {});
    let serverNow = 0;
    const simulation = createEnemySimulation(s.enemies, () => {}, s.player,
      () => ({ width: 1200, height: 800, zoom: 1 }), lifecycle.engageEnemy, () => false,
      { playerMovementSpeed: () => s.player.speed, serverNowMs: () => serverNow, currentMapId: () => "forest" });
    s.farm.start("Brood");
    let arrived = false, walkStarts = 0, walking = true;
    for (let frame = 0; frame < 600; frame++) {
      serverNow += 1000 / 60;
      const movement = s.tick();
      const nowWalking = Boolean(movement.x || movement.y);
      if (!nowWalking) arrived = true;
      if (arrived && nowWalking && !walking) walkStarts++;
      walking = nowWalking;
      // Standing in weapon range means the player is shooting it.
      if (Math.hypot(brood.x - s.player.x, brood.y - s.player.y) <= attackRange && !brood.engaged) {
        lifecycle.engageEnemy(brood, "local-player");
      }
      simulation.update(1 / 60);
    }
    return { walkStarts, distance: Math.hypot(brood.x - s.player.x, brood.y - s.player.y), brood };
  }

  it.each([1, 2, 3, 4, 5])("stands still and keeps the ranged enemy in range at range rank %i", rank => {
    const range = attackRangeWithResearch(rank);
    const { walkStarts, distance, brood } = farmBrood(range);
    expect(brood.engaged).toBe(true);
    expect(walkStarts).toBeLessThanOrEqual(1);
    expect(distance).toBeLessThanOrEqual(range);
  });

  it("stops at the edge of full reach, research and Long Shot included, never further in", () => {
    const at = (range: number) => autoFarmStandoff({ weaponRange: range, playerAttackRange: range, melee: false, playerRadius: 18,
      destination: { x: 0, y: 0, r: 16, type: "Bramble" }, enemy: true });
    expect(at(200).stop).toBeCloseTo(200 - AUTO_FARM_REACH_MARGIN);
    for (let rank = 1; rank <= 5; rank++) {
      const range = attackRangeWithResearch(rank);
      expect(range - at(range).stop).toBeCloseTo(200 - at(200).stop);
      expect(at(range).resume).toBeGreaterThan(at(range).stop);
      expect(at(range).resume).toBeLessThan(range);
    }
  });
  it("gives a melee weapon its researched range on top of its own reach", () => {
    const standoff = autoFarmStandoff({ weaponRange: 75 + 50, playerAttackRange: 250, melee: true, playerRadius: 18,
      destination: { x: 0, y: 0, r: 16, type: "Bramble" }, enemy: true });
    expect(standoff.stop).toBeCloseTo(75 + 50 + 16 - AUTO_FARM_REACH_MARGIN);
  });
});

describe('autofarm target priority', () => {
  it('walks toward the most wounded enemy when Lowest HP is chosen, and remembers the choice', () => {
    const s = setup();
    const near = s.add('Bramble', 900, 500);   // to the right
    const wounded = s.add('Bramble', 100, 500); // to the left
    wounded.hp = 1;
    expect(near.hp).toBeGreaterThan(1);
    s.farm.start('Bramble');
    expect(s.tick().x).toBeGreaterThan(0);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const farm = createAutoFarmController({ ...s, mapId: () => 'forest', unavailable: () => null, paused: () => false,
      speed: () => s.player.speed, obstacles: () => [], equippedWeapon: () => 'starter_bow', priorityStorage: () => storage });
    farm.setPriority('lowest');
    farm.start('Bramble');
    expect(farm.movement(idle, 1 / 60).x).toBeLessThan(0);
    const reloaded = createAutoFarmController({ ...s, mapId: () => 'forest', unavailable: () => null, paused: () => false,
      speed: () => s.player.speed, obstacles: () => [], priorityStorage: () => storage });
    expect(reloaded.priority()).toBe('lowest');
  });
});

describe('autofarm plans: camp order, the boss and the next map', () => {
  function planned(extra: Partial<Parameters<typeof createAutoFarmController>[0]> = {}) {
    const state = createGameBootstrap();
    state.enemies.length = 0; state.spawnSites.length = 0;
    Object.assign(state.player, { x: 500, y: 500, attackRange: 200, speed: 300 });
    let map = 'forest', now = 0;
    const values = new Map<string, string>();
    const memory = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const resumeStore = createAutoFarmResumeStore(() => memory);
    const lifecycle = createEnemyLifecycle(state.enemies, state.spawnSites, () => {});
    const add = (type: EnemyKind, x: number, y: number) => {
      const site: SpawnSite = { id: state.spawnSites.length, type, x, y, campName: type, leashRange: 500, alive: false, respawnAt: 0 };
      state.spawnSites.push(site); lifecycle.spawnFromSite(site);
      return state.enemies[state.enemies.length - 1];
    };
    const farm = createAutoFarmController({ ...state, mapId: () => map, unavailable: () => null, paused: () => false,
      speed: () => 300, obstacles: () => [], localIdentity: () => 'me', now: () => now, resumeStore, priorityStorage: () => memory, ...extra });
    const tick = () => farm.movement(idle, 1 / 60);
    return { ...state, farm, add, tick, resumeStore, setMap: (value: string) => { map = value; }, advance: (ms: number) => { now += ms; } };
  }
  const health = `stat:${ENEMY_TYPES.Bramble.reward.type}`, speed = `stat:${ENEMY_TYPES.Needle.reward.type}`;

  it("farms the player's camps in order, moving on when one is cleared and looping back", () => {
    const s = planned();
    const bramble = s.add('Bramble', 1500, 500), needle = s.add('Needle', 600, 900);
    expect(s.farm.start([health, speed])).toBe(true);
    s.tick();
    expect(s.farm.state().selected).toBe(health);
    bramble.dead = true;
    s.tick();
    expect(s.farm.state().selected).toBe(speed);
    needle.dead = true; bramble.dead = false; bramble.hp = bramble.maxHp;
    s.tick();
    expect(s.farm.state().selected).toBe(health);
  });

  it('fights the boss once the build is ready, and comes back to it later after dying there', () => {
    let ready = false;
    const s = planned({
      evaluate: () => ({ power: 1, fightSeconds: ready ? 30 : 400, hitShare: .1, fightDamageShare: .1 }),
      mapBoss: () => ({ x: 2500, y: 500, r: 80 }),
    });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    ready = true;
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.state().phase).toBe('boss');
    expect(s.farm.targetType()).toBeNull();
    s.farm.defeated();
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    s.advance(5 * 60_000);
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
  });

  it("parks in real attack range of every boss, from any side", () => {
    const bosses = createGameBootstrap().bosses;
    for (const kind of BOSS_KINDS) {
      const { r, ry, hitboxOffsetY } = bosses[kind] as { r: number; ry?: number; hitboxOffsetY?: number };
      for (let side = 0; side < 8; side += 1) {
        const boss = { x: 2_000, y: 2_000, r, ry, hitboxOffsetY, isBoss: true };
        const s = planned({ mapBoss: () => boss, equippedWeapon: () => 'starter_bow',
          evaluate: () => ({ power: 1, fightSeconds: 30, hitShare: .1, fightDamageShare: .1 }) });
        s.add('Bramble', 200, 200);
        s.farm.setAdvance(true);
        s.farm.start([]);
        const angle = side * Math.PI / 4;
        Object.assign(s.player, { x: boss.x + Math.cos(angle) * 1_200, y: boss.y + Math.sin(angle) * 1_200 });
        for (let step = 0; step < 600 && s.farm.state().status !== 'Fighting the boss'; step += 1) {
          const move = s.tick();
          s.player.x += move.x * 300 / 60; s.player.y += move.y * 300 / 60;
        }
        expect(s.farm.state().status, `${kind} side ${side}`).toBe('Fighting the boss');
        const gap = bossSurfaceDistance(s.player.x - boss.x, s.player.y - boss.y, r, ry, hitboxOffsetY);
        expect(gap, `${kind} side ${side}`).toBeLessThan(weaponAttackRange('starter_bow', s.player.attackRange));
      }
    }
  });

  it("walks into the next map's portal and carries the farm across on Auto", () => {
    const s = planned({ nextPortal: () => ({ x: 200, y: 500, destination: 'beginner_desert' }) });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    expect(s.tick().x).toBeLessThan(0);
    expect(s.farm.state()).toMatchObject({ phase: 'portal', status: 'Heading to the next map' });
    s.farm.travelStarted();
    expect(s.farm.state()).toMatchObject({ active: false, status: 'Moving to the next map' });
    expect(s.resumeStore.read()).toEqual({ identity: 'me', map: 'beginner_desert', choice: 'auto' });
    // Without the switch, travel ends the farm as it always has.
    const off = planned({ nextPortal: () => ({ x: 200, y: 500, destination: 'beginner_desert' }) });
    off.add('Bramble', 900, 500); off.farm.start([]); off.tick();
    off.farm.travelStarted();
    expect(off.resumeStore.read()).toBeNull();
  });

  it("moves along a route after a camp's worth of kills, even while that camp keeps respawning", () => {
    const s = planned();
    const first = s.add('Bramble', 900, 500);
    s.add('Needle', 600, 900);
    s.farm.start([health, speed]);
    s.tick();
    expect(s.farm.state().selected).toBe(health);
    // Killed and straight back (a respawn): one kill of a one-enemy camp is its worth.
    first.dead = true; s.tick();
    first.dead = false; first.hp = first.maxHp; s.tick();
    expect(s.farm.state().selected).toBe(speed);
  });

  it('stands still while a pulled group walks in, and only goes out to it if it never arrives', () => {
    const s = planned();
    const far = s.add('Bramble', 2500, 500);
    s.farm.setPullAll(true);
    s.farm.start([health]);
    far.engaged = true;
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state().status).toBe('Pulling');
    for (let frame = 0; frame < 60 * PULL_WAIT_SECONDS + 5; frame++) s.tick();
    expect(s.tick().x).toBeGreaterThan(0);
  });

  it('in Reflect Only walks into the enemy instead of shooting from range, and leaves the boss alone', () => {
    const s = planned({ reflectOnly: () => true, evaluate: () => ({ power: 1, fightSeconds: 1, hitShare: 0, fightDamageShare: 0 }), mapBoss: () => ({ x: 3000, y: 500, r: 80 }) });
    const mob = s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    for (let frame = 0; frame < 200; frame++) { const step = s.tick(); s.player.x += step.x * 5; s.player.y += step.y * 5; }
    expect(s.farm.state().phase).toBe('farm');
    expect(Math.hypot(mob.x - s.player.x, mob.y - s.player.y)).toBeLessThan(s.player.r + mob.r + 30);
    expect(s.farm.bossStatus()).toBe('Off in Reflect Only');
  });

  it("stands within reach of a campaign boss's hitbox, and of an Endless boss's centre", () => {
    for (const boss of [
      { x: 2500, y: 500, r: 150, ry: 90, isBoss: true, hitboxOffsetY: 0 },
      { x: 2500, y: 500, r: 60 },
    ]) {
      const s = planned({ evaluate: () => ({ power: 1, fightSeconds: 10, hitShare: .1, fightDamageShare: .1 }), mapBoss: () => ({ ...boss }) });
      s.add('Bramble', 600, 900);
      s.farm.setAdvance(true);
      s.farm.start([]);
      for (let frame = 0; frame < 2000; frame++) { const step = s.tick(); s.player.x += step.x * 5; s.player.y += step.y * 5; }
      expect(s.farm.state().phase).toBe('boss');
      const gap = 'isBoss' in boss ? bossSurfaceDistance(s.player.x - boss.x, s.player.y - boss.y, boss.r, boss.ry, boss.hitboxOffsetY)
        : Math.hypot(boss.x - s.player.x, boss.y - s.player.y);
      expect(gap).toBeLessThan(200);
    }
  });

  it("farms a pipped camp for that many camps' worth before moving along the route", () => {
    const s = planned();
    const first = s.add('Bramble', 900, 500);
    s.add('Needle', 600, 900);
    s.farm.start([`${health}*2`, speed]);
    s.tick();
    const respawn = () => { first.dead = true; s.tick(); first.dead = false; first.hp = first.maxHp; s.tick(); };
    respawn();
    expect(s.farm.state().selected).toBe(health);
    respawn();
    expect(s.farm.state().selected).toBe(speed);
    expect(s.farm.state().plan).toEqual([`${health}*2`, speed]);
  });

  it('walks back a map after repeated defeats instead of stopping', () => {
    const s = planned({ previousPortal: () => ({ x: 200, y: 500, destination: 'tutorial_forest' }) });
    s.add('Bramble', 900, 500);
    s.farm.start([health]);
    s.tick();
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT; death++) s.farm.defeated();
    expect(s.farm.state().active).toBe(true);
    expect(s.tick().x).toBeLessThan(0);
    expect(s.farm.state()).toMatchObject({ phase: 'portal', status: 'Moving back a map' });
    s.farm.travelStarted();
    expect(s.resumeStore.read()).toMatchObject({ map: 'tutorial_forest' });
    // Without a map behind it, it stops as before.
    const first = planned();
    first.add('Bramble', 900, 500); first.farm.start([health]); first.tick();
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT; death++) first.farm.defeated();
    expect(first.farm.state().active).toBe(false);
  });

  it('keeps Auto off a camp that would kill it', () => {
    const s = planned({ campDanger: (group: string) => group === health ? 2 : .2 });
    s.add('Bramble', 900, 500);
    s.add('Needle', 600, 900);
    s.farm.start([]);
    s.tick();
    expect(s.farm.state().selected).toBe(speed);
  });

  it('leaves a beaten boss alone once the next map is open: it pays no stats', () => {
    let locked = true;
    const s = planned({
      evaluate: () => ({ power: 1, fightSeconds: 10, hitShare: .1, fightDamageShare: .1 }),
      mapBoss: () => ({ x: 2500, y: 500, r: 80 }), bossUnlocksNext: () => locked,
    });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
    locked = false;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss beaten');
  });

  it('walks straight back after two defeats soon after moving forward', () => {
    const s = planned({
      nextPortal: () => ({ x: 200, y: 500, destination: 'beginner_desert' }),
      previousPortal: () => ({ x: 200, y: 500, destination: 'tutorial_forest' }),
    });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    s.tick();
    s.farm.travelStarted();
    // The farm picks up on the new map (the fixture keeps one map id, so start it again there).
    s.farm.start([health]);
    s.tick();
    s.farm.defeated();
    expect(s.farm.state().status).not.toBe('Too strong here · moving back a map');
    s.farm.defeated();
    expect(s.farm.state().active).toBe(true);
    expect(s.tick().x).toBeLessThan(0);
    expect(s.farm.state()).toMatchObject({ phase: 'portal', status: 'Moving back a map' });
  });
});
