import { describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createBalanceApologyGiftController } from '../../ui/balance-apology-gift-controller';
import { createGameBootstrap } from './game-bootstrap';
import { createEnemyLifecycle } from './enemy-lifecycle';
import { createAutoFarmController, autoFarmStandoff, AUTO_FARM_DEFEAT_LIMIT, AUTO_FARM_DEFEAT_WINDOW_MS, AUTO_FARM_REACH_MARGIN, PULL_WAIT_SECONDS } from './auto-farm-controller';
import { AUTO_FARM_RETRY_KEY } from './auto-farm-brain';
import { createEnemySimulation } from './enemy-simulation';
import { attackRangeWithResearch } from '../../../shared/utility-research';
import { createAutoFarmResumeStore } from '../../app/auto-farm-resume';
import type { SpawnSite } from '../world';
import { ENEMY_TYPES, type EnemyKind } from '../enemies';
import { AUTO_FARM_SHARES_KEY, decodeFarmPlan } from './auto-farm-plan';
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

  it('never ends a farm itself over defeats: with no map behind it, it farms on', () => {
    const s = setup(); s.add('Bramble', 1500, 500); s.farm.start('Bramble');
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT * 2; death += 1) { s.farm.defeated(); s.advance(20_000); }
    expect(s.farm.state().active).toBe(true);
    expect(s.tick().x).toBeGreaterThan(0);
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

describe('autofarm plans: sliders, the boss and the next map', () => {
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
    // A build that would beat any boss in seconds, unless a test says otherwise. Kiting and dodging are switched off in
    // the game for now (AUTO_FARM_EVASION); these tests keep their code working, on, unless a test says otherwise.
    const farm = createAutoFarmController({ ...state, mapId: () => map, unavailable: () => null, paused: () => false, bossDps: () => 1e9,
      speed: () => 300, obstacles: () => [], localIdentity: () => 'me', now: () => now, wallNow: () => now, resumeStore, priorityStorage: () => memory, evasion: true, ...extra });
    const tick = () => farm.movement(idle, 1 / 60);
    return { ...state, farm, add, tick, resumeStore, values, setMap: (value: string) => { map = value; }, advance: (ms: number) => { now += ms; } };
  }
  const health = `stat:${ENEMY_TYPES.Bramble.reward.type}`, speed = `stat:${ENEMY_TYPES.Needle.reward.type}`;

  it("on equal sliders moves on when a group is cleared, and comes back when it respawns", () => {
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

  it("tries the boss once the fight projects a win inside ten minutes, healed up; after losing, not before its wait", () => {
    let dps = 1;
    const boss = { x: 2500, y: 500, r: 80, hp: 1_000, maxHp: 1_000 };
    const s = planned({ bossDps: () => dps, mapBoss: () => boss });
    const mob = s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    // 1,000 seconds of fighting: not worth it.
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss Needs More Power');
    expect(s.farm.bossStatusReady()).toBe(false);
    // 500 seconds: worth it, but not at half health. It heals up first, going after nothing new meanwhile.
    dps = 2; s.advance(1_000);
    s.player.hp = s.player.maxHp / 2;
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state()).toMatchObject({ phase: 'farm', status: 'Healing for the boss' });
    // Something attacking it is still fought.
    mob.engaged = true;
    s.tick();
    expect(s.farm.state().status).not.toBe('Healing for the boss');
    mob.engaged = false;
    s.player.hp = s.player.maxHp;
    expect(s.farm.bossStatus()).toBe('Boss Next');
    expect(s.farm.bossStatusReady()).toBe(true);
    expect(s.tick().x).toBeGreaterThan(0);
    expect(s.farm.state().phase).toBe('boss');
    expect(s.farm.targetType()).toBeNull();
    // A fight under way goes on below the health a try needs.
    s.player.hp = s.player.maxHp * .6;
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
    // Beaten on the walk in: half a map's wait, then the same projection.
    s.farm.defeated();
    s.player.hp = s.player.maxHp;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss In 00:05');
    s.advance(5 * 60_000 - 2_000); s.tick();
    expect(s.farm.state().phase).toBe('farm');
    s.advance(2_000); s.tick();
    expect(s.farm.state().phase).toBe('boss');
    // A second loss waits twice as long: it can never loop.
    s.farm.defeated(); s.tick();
    expect(s.farm.bossStatus()).toBe('Boss In 00:10');
  });

  it('walks away from a boss fight it is losing before dying, and goes back once the fight as measured would be won', () => {
    const boss = { x: 650, y: 500, r: 60, hp: 1_000, maxHp: 1_000 };
    let damage = 100;
    const evaluate = () => ({ power: 100, stats: { damage, attackRate: 1, maxHp: 1_000, armor: 0, regen: 0 } });
    const s = planned({ evaluate, mapBoss: () => boss, bossUnlocksNext: () => true });
    s.add('Bramble', 500, 1500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    s.tick();
    expect(s.farm.state()).toMatchObject({ phase: 'boss', status: 'Fighting the boss' });
    // Three seconds in: the boss has lost 5%, the player 60%.
    s.advance(3_000);
    boss.hp = 950; s.player.hp = s.player.maxHp * .4;
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss In 00:05');
    // Dying on the way out is the same try: it waits no longer.
    s.farm.defeated();
    expect(s.farm.bossStatus()).toBe('Boss In 00:05');
    // The wait over and healed, the fight as measured is still lost: it farms on.
    s.player.hp = s.player.maxHp;
    s.advance(5 * 60_000); s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss Needs More Power');
    // Twenty times the damage: the boss would fall in about 3 seconds, before the player (5).
    damage = 2_000; s.advance(1_000); s.tick();
    expect(s.farm.state().phase).toBe('boss');
  });

  it('turns back from a walk to the boss that the camps on the way are winning, and measures nothing by it', () => {
    const boss = { x: 2_500, y: 500, r: 60, hp: 1_000, maxHp: 1_000 };
    const s = planned({ mapBoss: () => boss });
    s.add('Bramble', 500, 1500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    s.tick();
    expect(s.farm.state()).toMatchObject({ phase: 'boss', status: 'Moving to the boss' });
    s.advance(3_000);
    s.player.hp = s.player.maxHp * .45;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    // It never reached the boss: after the wait, the build's own projection sends it again.
    expect(s.farm.bossStatus()).toBe('Boss In 00:05');
    s.player.hp = s.player.maxHp;
    s.advance(5 * 60_000); s.tick();
    expect(s.farm.state().phase).toBe('boss');
  });

  it('stays in a boss fight it is winning, even low on health', () => {
    const boss = { x: 650, y: 500, r: 60, hp: 1_000, maxHp: 1_000 };
    const s = planned({ mapBoss: () => boss });
    s.add('Bramble', 500, 1500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    s.tick();
    s.advance(10_000);
    boss.hp = 100; s.player.hp = s.player.maxHp * .4;
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
  });

  it('walks away from a fight too slow to be worth it, once watched at the boss', () => {
    const boss = { x: 650, y: 500, r: 60, hp: 1_000, maxHp: 1_000 };
    const s = planned({ mapBoss: () => boss });
    s.add('Bramble', 500, 1500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
    // Half a minute at it: 1% of the boss gone, the player untouched. Fifty minutes to go.
    s.advance(30_000);
    boss.hp = 990;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss In 00:05');
  });

  it("parks in real attack range of every boss, from any side", () => {
    const bosses = createGameBootstrap().bosses;
    for (const kind of BOSS_KINDS) {
      const { r, ry, hitboxOffsetY } = bosses[kind] as { r: number; ry?: number; hitboxOffsetY?: number };
      for (let side = 0; side < 8; side += 1) {
        const boss = { x: 2_000, y: 2_000, r, ry, hitboxOffsetY, isBoss: true };
        const s = planned({ mapBoss: () => boss, equippedWeapon: () => 'starter_bow' });
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
    expect(s.resumeStore.read()).toMatchObject({ identity: 'me', map: 'beginner_desert' });
    expect(decodeFarmPlan(s.resumeStore.read()!.choice)![health]).toBe(100);
    // Without the switch, travel ends the farm as it always has.
    const off = planned({ nextPortal: () => ({ x: 200, y: 500, destination: 'beginner_desert' }) });
    off.add('Bramble', 900, 500); off.farm.start([]); off.tick();
    off.farm.travelStarted();
    expect(off.resumeStore.read()).toBeNull();
  });

  it("keeps the stats the player picked on the next map, and splits evenly where none of them is paid", () => {
    for (const [arrivals, expected] of [[['Needle', 'Bramble'], [health]], [['Needle'], [speed]]] as const) {
      const s = planned({ nextPortal: () => ({ x: 200, y: 500, destination: 'beginner_desert' }) });
      s.add('Bramble', 900, 500);
      s.farm.setAdvance(true);
      s.farm.start([health]);
      s.tick();
      s.farm.travelStarted();
      s.enemies.length = 0; s.spawnSites.length = 0;
      s.setMap('beginner_desert');
      arrivals.forEach((type, index) => s.add(type, 900 + index * 200, 900));
      s.tick(); s.advance(1_000); s.tick();
      expect(Object.keys(s.farm.state().shares).filter(key => s.farm.state().shares[key] > 0)).toEqual(expected);
    }
  });

  it("remembers one pick for every map: an older pick on the next map, or a map without the stat, does not replace it", () => {
    let next = 'beginner_desert';
    const s = planned({ nextPortal: () => ({ x: 200, y: 500, destination: next }) });
    const travel = (to: string, arrivals: EnemyKind[]) => {
      next = to;
      s.tick(); s.tick();
      expect(s.farm.state().phase).toBe('portal');
      s.farm.travelStarted();
      s.enemies.length = 0; s.spawnSites.length = 0;
      s.setMap(to);
      arrivals.forEach((type, index) => s.add(type, 900 + index * 200, 900));
      s.tick(); s.advance(1_000); s.tick();
    };
    // The next map was farmed for Speed before the player picked Health.
    s.setMap('beginner_desert'); s.add('Needle', 900, 500); s.farm.start([speed]);
    s.enemies.length = 0; s.spawnSites.length = 0;
    s.setMap('forest'); s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    const farming = () => Object.keys(s.farm.state().shares).filter(key => s.farm.state().shares[key] > 0);
    const saved = () => { const shares = s.farm.savedShares(); return Object.keys(shares).filter(key => shares[key] > 0); };
    travel('beginner_desert', ['Needle', 'Bramble']);
    expect(farming()).toEqual([health]);
    // No Health here: an even split for this map, and Health is still the pick.
    travel('intermediate_snowlands', ['Needle']);
    expect(s.farm.state()).toMatchObject({ active: true, shares: { [speed]: 100 } });
    expect(JSON.parse(s.values.get(AUTO_FARM_SHARES_KEY)!)).toEqual({ [health]: 100 });
    travel('beginner_desert', ['Bramble']);
    expect(farming()).toEqual([health]);
    // Walked out by hand, the window offers the same pick.
    s.farm.stop();
    expect(saved()).toEqual([health]);
  });

  it("splits farming time by the sliders: 80 / 10 / 10, and a 0% group is never farmed", () => {
    const s = planned();
    const damage = `stat:${ENEMY_TYPES.Spitter.reward.type}`;
    // Enemies that never die, side by side, so every group always has some alive.
    s.add('Spitter', 700, 500); s.add('Bramble', 700, 560); s.add('Needle', 700, 620); s.add('Mossback', 700, 680);
    const zero = s.farm.choices().map(choice => choice.key).find(key => ![damage, health, speed].includes(key))!;
    expect(s.farm.choices()).toHaveLength(4);
    expect(s.farm.start({ [damage]: 80, [health]: 10, [speed]: 10, [zero]: 0 })).toBe(true);
    const time = new Map<string, number>();
    let switches = 0, last = s.farm.state().selected;
    // Two hours at ten frames a second.
    for (let step = 0; step < 72_000; step++) {
      s.farm.movement(idle, .1);
      const at = s.farm.state().selected!;
      time.set(at, (time.get(at) ?? 0) + .1);
      if (at !== last) { switches++; last = at; }
    }
    expect((time.get(damage) ?? 0) / 7_200).toBeCloseTo(.8, 1);
    expect((time.get(health) ?? 0) / 7_200).toBeCloseTo(.1, 1);
    expect((time.get(speed) ?? 0) / 7_200).toBeCloseTo(.1, 1);
    expect(time.get(zero)).toBeUndefined();
    // It stays with a group between looks (every twenty seconds), not a hop every kill.
    expect(switches).toBeLessThan(7_200 / 20);
  });

  it("farms exactly the groups and shares set: 100% of one stat farms only it, and Pull brings only the group farmed", () => {
    const s = planned();
    const damage = `stat:${ENEMY_TYPES.Spitter.reward.type}`;
    const mob = [s.add('Spitter', 700, 500), s.add('Bramble', 700, 560), s.add('Needle', 700, 620), s.add('Mossback', 700, 680)];
    const keys = s.farm.choices().map(choice => choice.key);
    expect(keys).toHaveLength(4);
    s.farm.setPullAll(true);
    // 100% Damage alone: nothing else is ever farmed or pulled.
    expect(s.farm.start({ [damage]: 100, ...Object.fromEntries(keys.filter(key => key !== damage).map(key => [key, 0])) })).toBe(true);
    for (let step = 0; step < 6_000; step++) {
      s.advance(100); s.farm.movement(idle, .1);
      expect(s.farm.state().selected).toBe(damage);
      expect(mob.filter(enemy => s.farm.pulls(enemy)).map(enemy => enemy.type)).toEqual(['Spitter']);
    }
    // Every slider even: Pull brings the group being farmed, not every group but one.
    s.farm.start(Object.fromEntries(keys.map(key => [key, 25])));
    for (let step = 0; step < 600; step++) {
      s.advance(100); s.farm.movement(idle, .1);
      // Never another group: at most the farmed group's own enemy.
      const farmedKinds = s.farm.choices().find(choice => choice.key === s.farm.state().selected)!.kinds;
      const pulledNow = mob.filter(enemy => s.farm.pulls(enemy));
      expect(pulledNow.length).toBeLessThanOrEqual(1);
      expect(pulledNow.every(enemy => farmedKinds.includes(enemy.type))).toBe(true);
    }
  });

  it("leaves a group that runs empty for the next one behind its share, and waits where it is when every group is empty", () => {
    const s = planned();
    const bramble = s.add('Bramble', 900, 500), needle = s.add('Needle', 600, 900);
    s.farm.start({ [health]: 67, [speed]: 33 });
    s.tick();
    expect(s.farm.state().selected).toBe(health);
    bramble.dead = true;
    s.tick();
    expect(s.farm.state().selected).toBe(speed);
    needle.dead = true;
    for (let frame = 0; frame < 60 * 30; frame++) s.tick();
    expect(s.farm.state().selected).toBe(speed);
    // With every slider at 0% there is nothing to farm.
    expect(s.farm.start({ [health]: 0, [speed]: 0 })).toBe(false);
  });

  it("Pull On brings the whole group while autofarm fights standing, however weak the build; only the kite fed a strong one in a few at a time", () => {
    const pulledFor = (evasion: boolean) => {
      const s = planned({ evasion, evaluate: () => ({ power: 1 }), farmDps: () => 1e-3 });
      s.player.maxHp = 10; s.player.hp = 10; s.player.regen = 0; s.player.armor = 0;
      const damage = `stat:${ENEMY_TYPES.Spitter.reward.type}`;
      const mob = Array.from({ length: 6 }, (_, index) => s.add('Spitter', 700 + index * 30, 500));
      s.farm.setPullAll(true);
      expect(s.farm.start({ [damage]: 100 })).toBe(true);
      s.tick();
      return mob.filter(enemy => s.farm.pulls(enemy)).length;
    };
    expect(pulledFor(false)).toBe(6);
    expect(pulledFor(true)).toBeLessThan(6);
  });

  it('stands still while a pulled group walks in; with Pull short of the farmed groups it goes out to one that never arrives', () => {
    // Pull covers every farmed group: it stands its ground, however long the group takes.
    const s = planned();
    const far = s.add('Bramble', 2500, 500);
    s.farm.setPullAll(true);
    s.farm.start([health]);
    far.engaged = true;
    expect(s.tick()).toEqual(idle);
    expect(s.farm.state().status).toBe('Pulling');
    for (let frame = 0; frame < 60 * PULL_WAIT_SECONDS + 5; frame++) s.tick();
    expect(s.tick()).toEqual(idle);
    // Two groups farmed, one pulled: it walks out to a pulled group that never arrives.
    const t = planned();
    const away = t.add('Bramble', 2500, 500);
    t.add('Needle', 600, 2500);
    t.farm.setPullAll(true);
    t.farm.start([health, `stat:${ENEMY_TYPES.Needle.reward.type}`]);
    away.engaged = true;
    expect(t.tick()).toEqual(idle);
    for (let frame = 0; frame < 60 * PULL_WAIT_SECONDS + 5; frame++) t.tick();
    expect(t.tick().x).toBeGreaterThan(0);
  });

  it('in Reflect Only walks into the enemy instead of shooting from range, and leaves the boss alone', () => {
    const s = planned({ reflectOnly: () => true, mapBoss: () => ({ x: 3000, y: 500, r: 80 }) });
    const mob = s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    for (let frame = 0; frame < 200; frame++) { const step = s.tick(); s.player.x += step.x * 5; s.player.y += step.y * 5; }
    expect(s.farm.state().phase).toBe('farm');
    expect(Math.hypot(mob.x - s.player.x, mob.y - s.player.y)).toBeLessThan(s.player.r + mob.r + 30);
    expect(s.farm.bossStatus()).toBe('Off In Reflect Only');
  });

  /** Walks the farm `seconds`, moving the player as the game does. */
  const walk = (s: ReturnType<typeof planned>, seconds: number) => {
    for (let frame = 0; frame < seconds * 60; frame++) { const step = s.tick(); s.player.x += step.x * 5; s.player.y += step.y * 5; }
  };

  it("steps out of a boss attack about to land, keeps shooting from reach, and steps back in after it", () => {
    for (const weapon of ['starter_bow', 'wooden_sword']) {
      const boss = { x: 900, y: 500, r: 60, ry: 60, isBoss: true, hp: 1_000, maxHp: 1_000 };
      // A ring of ground landing in a second around where the player stands at the boss, counted down as the frames go.
      let hazard: { x: number; y: number; r: number; at: number } | null = null;
      const s = planned({ mapBoss: () => boss, equippedWeapon: () => weapon,
        bossDanger: (x, y, pad) => hazard && Math.hypot(x - hazard.x, y - hazard.y) <= hazard.r + pad ? Math.max(0, hazard.at - frames / 60) : Infinity });
      let frames = 0;
      const seen = new Set<string>();
      const play = (seconds: number) => {
        for (let frame = 0; frame < seconds * 60; frame++, frames++) { const step = s.tick(); s.player.x += step.x * 5; s.player.y += step.y * 5; seen.add(s.farm.state().status); }
      };
      s.add('Bramble', 200, 1500);
      s.farm.setAdvance(true);
      s.farm.start([]);
      play(4);
      expect(s.farm.state().status, weapon).toBe('Fighting the boss');
      hazard = { x: s.player.x, y: s.player.y, r: 70, at: frames / 60 + 1 };
      // It keeps fighting while there is time, then steps out before it lands.
      play(.2);
      expect(s.farm.state().status, weapon).toBe('Fighting the boss');
      seen.clear();
      play(.75);
      expect(seen.has('Dodging'), weapon).toBe(true);
      expect(Math.hypot(s.player.x - hazard.x, s.player.y - hazard.y), weapon).toBeGreaterThan(70);
      // A bow stays in reach of the boss while it waits the attack out.
      if (weapon === 'starter_bow') expect(bossSurfaceDistance(s.player.x - boss.x, s.player.y - boss.y, boss.r, boss.ry)).toBeLessThanOrEqual(200);
      hazard = null;
      play(2);
      expect(s.farm.state().status, weapon).toBe('Fighting the boss');
    }
  });

  it("waits for an attack to land rather than walking into it", () => {
    const boss = { x: 1_500, y: 500, r: 60, hp: 1_000, maxHp: 1_000 };
    const hazard = { x: 1_000, y: 500, r: 120 };
    let landed = false;
    const s = planned({ mapBoss: () => boss, bossDanger: (x, y, pad) => !landed && Math.hypot(x - hazard.x, y - hazard.y) <= hazard.r + pad ? .8 : Infinity });
    s.add('Bramble', 200, 1500);
    s.farm.setAdvance(true);
    s.farm.start([]);
    walk(s, 1.6);
    expect(s.farm.state().status).toBe('Waiting out an attack');
    expect(Math.hypot(s.player.x - hazard.x, s.player.y - hazard.y)).toBeGreaterThan(hazard.r);
    landed = true;
    walk(s, 4);
    expect(s.farm.state().status).toBe('Fighting the boss');
  });

  it("fights standing while kiting and dodging are off: no circle, no step out of a shot or a boss attack", () => {
    const s = planned({ evasion: undefined });
    const mob = s.add('Bramble', 540, 500);
    mob.engaged = true;
    s.farm.start([health]);
    s.player.hp = s.player.maxHp * .5;
    s.enemyShots.push({ x: 400, y: 500, vx: 495, vy: 0, r: 6, damage: s.player.maxHp * .2, life: 4 });
    for (let frame = 0; frame < 30; frame++) s.tick();
    expect(s.farm.state().status).not.toBe('Kiting');
    expect(s.farm.state().status).not.toBe('Dodging');
  });

  it("steps off the line of an enemy shot that would bite, or of any once hurt; never in Reflect Only, which takes every hit", () => {
    for (const [reflectOnly, damage, health, dodges] of [[false, 20, 1, true], [false, 1, 1, false], [false, 1, .9, true], [true, 20, .9, false]] as const) {
      const s = planned({ reflectOnly: () => reflectOnly });
      s.add('Brood', 700, 500);
      s.farm.start([`stat:${ENEMY_TYPES.Brood.reward.type}`]);
      s.player.hp = s.player.maxHp * health;
      s.enemyShots.push({ x: 400, y: 500, vx: 495, vy: 0, r: 6, damage: s.player.maxHp * damage / 100, life: 4 });
      const step = s.tick();
      const label = `reflect ${reflectOnly}, ${damage}% shot at ${health * 100}% health`;
      expect(s.farm.state().status === 'Dodging', label).toBe(dodges);
      if (dodges) expect(Math.abs(step.y), label).toBeGreaterThan(0);
    }
  });

  it("with a bow, circles a melee enemy closing in and keeps it in reach; never with a sword or in Reflect Only", () => {
    for (const [weapon, reflectOnly, kites] of [['starter_bow', false, true], ['wooden_sword', false, false], ['starter_bow', true, false]] as const) {
      const s = planned({ equippedWeapon: () => weapon, reflectOnly: () => reflectOnly });
      const mob = s.add('Bramble', 540, 500);
      mob.engaged = true;
      s.farm.start([health]);
      s.tick();
      expect(s.farm.state().status === 'Kiting', `${weapon} ${reflectOnly}`).toBe(kites);
      if (kites) {
        // It runs a circle round where the fight is, never once stopping: the enemy chasing it never lands a blow, and stays in reach.
        let hits = 0, clock = 0, still = 0, furthest = 0;
        const start = { x: s.player.x, y: s.player.y };
        const simulation = createEnemySimulation(s.enemies, () => {}, s.player, () => ({ width: 1200, height: 800, zoom: 1 }),
          createEnemyLifecycle(s.enemies, s.spawnSites, () => {}).engageEnemy, () => { hits++; return true; },
          { playerMovementSpeed: () => 300, serverNowMs: () => clock, localIdentity: () => 'me', currentMapId: () => 'forest' });
        for (let frame = 0; frame < 600; frame++) {
          const step = s.tick();
          if (!step.x && !step.y) still++;
          s.player.x += step.x * 5; s.player.y += step.y * 5;
          simulation.update(1 / 60);
          clock += 1000 / 60;
          furthest = Math.max(furthest, Math.hypot(s.player.x - start.x, s.player.y - start.y));
          expect(Math.hypot(s.player.x - mob.x, s.player.y - mob.y)).toBeLessThanOrEqual(200);
        }
        expect(still).toBe(0);
        expect(hits).toBeLessThanOrEqual(1);
        expect(s.farm.state().status).toBe('Kiting');
        expect(furthest).toBeLessThan(400);
      } else {
        walk(s, .5);
        expect(s.farm.state().status, `${weapon} ${reflectOnly}`).not.toBe('Kiting');
      }
    }
    // One whose blows regeneration more than puts back is left to them: standing costs nothing. Once they out-hit it, it is kited.
    const scratch = planned();
    const weak = scratch.add('Bramble', 540, 500);
    weak.engaged = true;
    scratch.player.regen = weak.damage * 2;
    scratch.farm.start([health]);
    scratch.tick();
    expect(scratch.farm.state().status).not.toBe('Kiting');
    scratch.player.regen = weak.damage / 4;
    // It looks again a few frames on (the build is read twice a second).
    scratch.advance(600);
    for (let frame = 0; frame < 12; frame++) scratch.tick();
    expect(scratch.farm.state().status).toBe('Kiting');
    // A ranged enemy is shot from where it stands, not kited.
    const archer = planned();
    archer.add('Brood', 540, 500).engaged = true;
    archer.farm.start([`stat:${ENEMY_TYPES.Brood.reward.type}`]);
    archer.tick();
    expect(archer.farm.state().status).not.toBe('Kiting');
  });

  it("with Reflect, stands and takes the blows it can stand, and the shots: they are its damage; circles once they would take it to its reserve", () => {
    const tank = planned({ tankPerks: () => ({ reflect: .1, secondWind: 0 }) });
    const mob = tank.add('Bramble', 540, 500);
    mob.engaged = true;
    tank.player.regen = 0;
    // Arrows that take the Bramble down while it costs about a tenth of max health: well within the reserve at full health.
    const blows = mob.damage * (mob.definition ?? ENEMY_TYPES[mob.type]).attackSpeed;
    tank.player.damage = mob.hp / (tank.player.maxHp * .1 / blows) * tank.player.attackRate;
    tank.farm.start([health]);
    tank.tick();
    expect(tank.farm.state().status).not.toBe('Kiting');
    // A shot that would bite another build is taken while far from the reserve.
    tank.player.hp = tank.player.maxHp * .9;
    tank.enemyShots.push({ x: 400, y: 500, vx: 495, vy: 0, r: 6, damage: tank.player.maxHp * .2, life: 4 });
    tank.advance(600);
    tank.tick();
    expect(tank.farm.state().status).not.toBe('Dodging');
    // Near the reserve, the blows are only a cost again: it circles.
    tank.enemyShots.length = 0;
    tank.player.hp = tank.player.maxHp * .36;
    tank.advance(600);
    for (let frame = 0; frame < 12; frame++) tank.tick();
    expect(tank.farm.state().status).toBe('Kiting');
  });

  it("circles clear of other camps, where it is fought: backing straight off is caught again and again, far across the map", () => {
    for (const mode of ['circle', 'back-off'] as const) {
      const s = planned({ kite: { mode } });
      Object.assign(s.player, { x: 1_500, y: 1_500 });
      // A Bramble chasing from the east; another camp's Needle to the north, just outside its aggro, and one to the west.
      const mob = s.add('Bramble', 1_600, 1_500);
      mob.engaged = true;
      const north = s.add('Needle', 1_500, 1_160), west = s.add('Needle', 1_160, 1_500);
      s.farm.start([health]);
      let clock = 0, hits = 0;
      const simulation = createEnemySimulation(s.enemies, () => {}, s.player, () => ({ width: 1200, height: 800, zoom: 1 }),
        createEnemyLifecycle(s.enemies, s.spawnSites, () => {}).engageEnemy, () => { hits++; return true; },
        { playerMovementSpeed: () => 300, serverNowMs: () => clock, localIdentity: () => 'me', currentMapId: () => 'forest' });
      for (let frame = 0; frame < 900; frame++) {
        const step = s.tick();
        s.player.x += step.x * 5; s.player.y += step.y * 5;
        simulation.update(1 / 60);
        clock += 1000 / 60;
      }
      const travelled = Math.hypot(s.player.x - 1_500, s.player.y - 1_500);
      if (mode === 'circle') {
        expect(north.engaged || north.leashing, 'north').toBe(false);
        expect(west.engaged || west.leashing, 'west').toBe(false);
        expect(hits).toBeLessThanOrEqual(1);
        expect(travelled).toBeLessThan(300);
      } else {
        // Backing off (the fallback with no safe circle) outruns nothing: it is caught again and again, far across the map.
        expect(hits).toBeGreaterThan(2);
        expect(travelled).toBeGreaterThan(1_000);
      }
    }
  });

  it("stands within reach of a campaign boss's hitbox, and of an Endless boss's centre", () => {
    for (const boss of [
      { x: 2500, y: 500, r: 150, ry: 90, isBoss: true, hitboxOffsetY: 0 },
      { x: 2500, y: 500, r: 60 },
    ]) {
      const s = planned({ mapBoss: () => ({ ...boss }) });
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

  it('walks back a map after repeated defeats instead of stopping, and asks more power of the map it leaves', () => {
    const s = planned({ power: () => 500, previousPortal: () => ({ x: 200, y: 500, destination: 'tutorial_forest' }) });
    s.add('Bramble', 900, 500);
    s.farm.start([health]);
    s.tick();
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT; death++) s.farm.defeated();
    expect(s.farm.state().active).toBe(true);
    expect(s.tick().x).toBeLessThan(0);
    expect(s.farm.state()).toMatchObject({ phase: 'portal', status: 'Moving back a map' });
    s.farm.travelStarted();
    expect(s.resumeStore.read()).toMatchObject({ map: 'tutorial_forest' });
    expect(JSON.parse(s.values.get(AUTO_FARM_RETRY_KEY)!)).toEqual({ me: { forest: [600, 500, 1, 10 * 60_000] } });
    // Without a map behind it, or in Reflect Only (which never walks forward again), it farms on.
    for (const extra of [{}, { reflectOnly: () => true, previousPortal: () => ({ x: 200, y: 500, destination: 'tutorial_forest' }) }]) {
      const stay = planned(extra);
      stay.add('Bramble', 900, 500); stay.farm.start([health]); stay.tick();
      for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT; death++) stay.farm.defeated();
      stay.tick();
      expect(stay.farm.state()).toMatchObject({ active: true, phase: 'farm' });
    }
  });

  it('leaves a beaten boss alone once the next map is open: it pays no stats', () => {
    let locked = true;
    const s = planned({ mapBoss: () => ({ x: 2500, y: 500, r: 80 }), bossUnlocksNext: () => locked });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
    locked = false;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss Beaten');
  });

  it('never fights again a boss whose win opened nothing: the way on stays shut for something else', () => {
    let boss: { x: number; y: number; r: number; dead?: boolean } | null = { x: 2500, y: 500, r: 80 };
    const s = planned({ mapBoss: () => boss, bossUnlocksNext: () => true });
    s.add('Bramble', 900, 500);
    s.farm.setAdvance(true);
    s.farm.start([health]);
    s.tick();
    expect(s.farm.state().phase).toBe('boss');
    // Won: the boss is gone, and the way on is still shut a few seconds later.
    boss = null;
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    s.advance(6_000); s.tick();
    // It comes back, and is left alone.
    boss = { x: 2500, y: 500, r: 80 };
    s.advance(10 * 60_000);
    for (let frame = 0; frame < 30; frame++) s.tick();
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Boss Beaten');
  });

  /** A farm on 'forest' with a way on to 'beginner_desert' and back, and a power it controls. */
  function twoMaps() {
    const power = { value: 1_000 };
    let map = 'forest';
    const s = planned({
      power: () => power.value,
      nextPortal: () => map === 'forest' ? { x: 200, y: 500, destination: 'beginner_desert' } : null,
      previousPortal: () => map === 'beginner_desert' ? { x: 200, y: 500, destination: 'forest' } : null,
    });
    s.add('Bramble', 900, 500);
    const travel = (to: string) => {
      s.farm.travelStarted();
      map = to; s.setMap(to);
      s.tick(); s.advance(1_000); s.tick();
      expect(s.farm.state().active).toBe(true);
    };
    /** Farms for `minutes`, the power growing `perMinute`, looking every five seconds. */
    const farmFor = (minutes: number, perMinute: number) => {
      for (let step = 0; step < minutes * 12; step++) { s.advance(5_000); power.value += perMinute / 12; s.tick(); }
    };
    return { s, power, travel, farmFor };
  }

  it('rides out deaths on a new map; five in three minutes sends it back, and the map then waits for more power and time', () => {
    const { s, power, travel } = twoMaps();
    s.farm.setAdvance(true);
    s.farm.start([health]);
    s.tick();
    expect(s.farm.state().phase).toBe('portal');
    travel('beginner_desert');
    expect(s.farm.bossStatus()).toBe('Trying Next Map · 00:09');
    for (let death = 1; death < AUTO_FARM_DEFEAT_LIMIT; death++) s.farm.defeated();
    s.tick();
    expect(s.farm.state().phase).toBe('farm');
    s.farm.defeated();
    expect(s.tick().x).toBeLessThan(0);
    expect(s.farm.state()).toMatchObject({ phase: 'portal', status: 'Moving back a map' });
    expect(s.farm.bossStatus()).toBe('Moving Back A Map');
    travel('forest');
    // Back where it was: the map it left needs 20% more power, then ten minutes.
    expect(s.farm.state().phase).toBe('farm');
    expect(s.farm.bossStatus()).toBe('Next Map At 1.20k');
    power.value = 1_200;
    s.advance(1_000);
    expect(s.farm.bossStatus()).toBe('Next Map In 00:09');
    s.advance(10 * 60_000);
    expect(s.farm.bossStatus()).toBe('Next Map Open');
    expect(s.farm.bossStatusReady()).toBe(true);
    s.tick();
    expect(s.farm.state().phase).toBe('portal');
    // Beaten again: twenty minutes this time.
    travel('beginner_desert');
    for (let death = 0; death < AUTO_FARM_DEFEAT_LIMIT; death++) s.farm.defeated();
    s.tick();
    travel('forest');
    power.value = 2_000;
    s.advance(1_000);
    expect(s.farm.bossStatus()).toBe('Next Map In 00:19');
  });

  it("goes back after ten minutes on a new map that grows the build slower than the last, and keeps one that doesn't", () => {
    for (const [rate, kept] of [[50, false], [95, true]] as const) {
      const { s, travel, farmFor } = twoMaps();
      s.farm.start([health]);
      farmFor(10, 100);
      s.farm.setAdvance(true);
      s.tick();
      travel('beginner_desert');
      farmFor(9.5, rate);
      expect(s.farm.bossStatus()).toBe('Trying Next Map · 00:29');
      farmFor(1, rate);
      expect(s.farm.state().phase, `${rate}`).toBe(kept ? 'farm' : 'portal');
      expect(s.farm.bossStatus(), `${rate}`).toBe(kept ? '' : 'Moving Back A Map');
    }
  });

  it('remembers the push setting', () => {
    const s = planned();
    expect(s.farm.push()).toBe('normal');
    s.farm.setPush('safe');
    expect(s.values.get('wildstat:autofarm-push:v1')).toBe('safe');
  });
});
