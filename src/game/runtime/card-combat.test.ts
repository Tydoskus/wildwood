import { describe, expect, it } from "vitest";
import { cardTotals } from "../../../shared/card-effects";
import { createCardCombat, enemyCardControl } from "./card-combat";

type TestEnemy = { x: number; y: number; r: number; hp: number; maxHp: number; type: string; vx: number; vy: number; dead: boolean;
  definition: { elite?: boolean; ranged?: boolean }; cardStatus?: any };

function fight(cardIds: string[], options: { random?: number[]; mapId?: string } = {}) {
  let draw = 0;
  const randoms = options.random ?? [0];
  const player = { x: 0, y: 0, r: 10, hp: 100, maxHp: 100, moving: false };
  const enemies: TestEnemy[] = [];
  const struck: Array<{ target: TestEnemy; damage: number; reflected: boolean }> = [];
  let mapId = options.mapId ?? "tutorial_forest";
  const totals = cardTotals(cardIds);
  const combat = createCardCombat({
    cards: () => totals, player: player as any, enemies: enemies as any, random: () => randoms[Math.min(draw++, randoms.length - 1)],
    mapId: () => mapId, isDueling: () => false, spawnBurst: () => {},
    strike: (target, damage, _source, reflected) => {
      const enemy = target as unknown as TestEnemy;
      struck.push({ target: enemy, damage, reflected: reflected === true });
      enemy.hp -= damage;
      if (enemy.hp <= 0) enemy.dead = true;
    },
  });
  const enemy = (overrides: Partial<TestEnemy> = {}) => {
    const created: TestEnemy = { x: 30, y: 0, r: 10, hp: 100, maxHp: 100, type: "slime", vx: 0, vy: 0, dead: false, definition: {}, ...overrides };
    enemies.push(created);
    return created;
  };
  return { combat, player, enemies, enemy, struck, setMap: (next: string) => { mapId = next; } };
}

describe("card hits", () => {
  it("multiplies a weapon hit by each slayer and condition that applies, and nothing otherwise", () => {
    const elite = fight(["dread_warden_card"]);
    expect(elite.combat.hitMultiplier(elite.enemy({ definition: { elite: true } }) as any)).toBeCloseTo(1.09, 9);
    expect(elite.combat.hitMultiplier(elite.enemy() as any)).toBe(1);
    const ranged = fight(["nimbus_archer_card"]);
    expect(ranged.combat.hitMultiplier(ranged.enemy({ definition: { ranged: true } }) as any)).toBeCloseTo(1.09, 9);
    const race = fight(["dune_raider_card"]);
    expect(race.combat.hitMultiplier(race.enemy() as any)).toBe(1);
    race.setMap("beginner_desert");
    expect(race.combat.hitMultiplier(race.enemy() as any)).toBeCloseTo(1.09, 9);
    const execute = fight(["wastes_reaper_card"]);
    expect(execute.combat.hitMultiplier(execute.enemy({ hp: 20 }) as any)).toBeCloseTo(1.13, 9);
    expect(execute.combat.hitMultiplier(execute.enemy({ hp: 50 }) as any)).toBe(1);
    const opener = fight(["cinder_striker_card"]);
    expect(opener.combat.hitMultiplier(opener.enemy() as any)).toBeCloseTo(1.1, 9);
    expect(opener.combat.hitMultiplier(opener.enemy({ hp: 99 }) as any)).toBe(1);
    const berserk = fight(["ash_reaper_card"]);
    expect(berserk.combat.hitMultiplier(berserk.enemy() as any)).toBe(1);
    berserk.player.hp = 40;
    expect(berserk.combat.hitMultiplier(berserk.enemy() as any)).toBeCloseTo(1.11, 9);
    const steady = fight(["gear_prowler_card"]);
    expect(steady.combat.hitMultiplier(steady.enemy() as any)).toBeCloseTo(1.07, 9);
    steady.player.moving = true;
    expect(steady.combat.hitMultiplier(steady.enemy() as any)).toBe(1);
  });

  it("builds Momentum on kills, up to five stacks, gone a few seconds after", () => {
    const view = fight(["gale_prowler_card"]);
    for (let kill = 0; kill < 7; kill++) view.combat.onKill();
    expect(view.combat.hitMultiplier(view.enemy() as any)).toBeCloseTo(1.075, 9);
    view.combat.update(4.1);
    expect(view.combat.hitMultiplier(view.enemy() as any)).toBe(1);
  });

  it("makes each enemy's first hit a critical with Iaido, and only the first", () => {
    const view = fight(["koi_shogun_card"]);
    const first = view.enemy(), second = view.enemy();
    expect(view.combat.firstHitCrit(first as any)).toBe(true);
    first.hp = 80;
    expect(view.combat.firstHitCrit(first as any)).toBe(false);
    expect(view.combat.firstHitCrit(second as any)).toBe(true);
    expect(fight([]).combat.firstHitCrit(view.enemy() as any)).toBe(false);
  });
});

describe("what a hit sets off", () => {
  it("heals with lifesteal; reaps a regular enemy under 10% a card, never an elite", () => {
    const view = fight(["abyss_archer_card", "dreadreaper_card"]);
    view.player.hp = 50;
    view.combat.afterHit(view.enemy({ hp: 9 }) as any, 100, 0);
    expect(view.player.hp).toBeCloseTo(50.64, 9);
    const low = view.enemy({ hp: 9 }), edge = view.enemy({ hp: 10 }), elite = view.enemy({ hp: 9, definition: { elite: true } });
    expect(view.combat.reap(edge as any)).toBe(false);
    expect(view.combat.reap(low as any)).toBe(true);
    expect(low.dead).toBe(true);
    expect(view.combat.reap(elite as any)).toBe(false);
    expect(elite.dead).toBe(false);
  });

  it("splashes the enemies near the target and arcs Chain Lightning from one to the next", () => {
    const splash = fight(["dragon_card"]);
    const target = splash.enemy({ x: 0 }), near = splash.enemy({ x: 60 }), far = splash.enemy({ x: 400 });
    splash.combat.afterHit(target as any, 40, 0);
    expect(splash.struck.map(hit => [hit.target, hit.damage])).toEqual([[near, 10]]);
    expect(far.hp).toBe(100);
    const chain = fight(["voltwarden_card"]);
    const start = chain.enemy({ x: 0 }), hops = [chain.enemy({ x: 100 }), chain.enemy({ x: 200 }), chain.enemy({ x: 300 }), chain.enemy({ x: 400 })];
    chain.combat.afterHit(start as any, 100, 0);
    expect(chain.struck.map(hit => hit.target)).toEqual(hops.slice(0, 3));
    expect(chain.struck[0].damage).toBeCloseTo(70, 9);
  });

  it("burns and poisons over time, a share of the hit, and poison weakens", () => {
    const view = fight(["cindermaw_card", "venom_guard_card"]);
    const target = view.enemy({ hp: 10_000, maxHp: 10_000 });
    view.combat.afterHit(target as any, 100, 0);
    expect(enemyCardControl(target as any).damage).toBeCloseTo(.85, 9);
    for (let tick = 0; tick < 100; tick++) view.combat.update(.05);
    const dealt = view.struck.reduce((sum, hit) => sum + hit.damage, 0);
    expect(dealt).toBeCloseTo(100 * .5 + 100 * .4, 6);
    expect(enemyCardControl(target as any)).toEqual({ move: 1, attack: 1, damage: 1 });
  });

  it("stuns, chills, weakens and knocks back regular enemies, each for its time", () => {
    const view = fight(["frostclaw_card", "frost_raider_card", "abyss_needle_card", "tide_raider_card"]);
    const target = view.enemy();
    view.combat.afterHit(target as any, 50, 0);
    expect(enemyCardControl(target as any)).toEqual({ move: 0, attack: 0, damage: .7 });
    expect(target.vx).toBeGreaterThan(0);
    view.combat.update(1.6);
    expect(enemyCardControl(target as any).move).toBeCloseTo(.6, 9);
    view.combat.update(3);
    expect(enemyCardControl(target as any)).toEqual({ move: 1, attack: 1, damage: 1 });
    expect(target.cardStatus).toBeUndefined();
  });

  it("rolls each proc on its own chance", () => {
    const view = fight(["cindermaw_card"], { random: [.99] });
    view.combat.afterHit(view.enemy() as any, 100, 0);
    view.combat.update(5);
    expect(view.struck).toEqual([]);
  });
});

describe("card defense", () => {
  it("dodges on its chance and lowers a hit by the guards for its attacker", () => {
    const dodge = fight(["petal_regent_card"], { random: [0] });
    expect(dodge.combat.incoming(50, dodge.enemy() as any)).toBeNull();
    const miss = fight(["petal_regent_card"], { random: [.5] });
    expect(miss.combat.incoming(50, miss.enemy() as any)).toBe(50);
    const guard = fight(["glacier_archer_card"]);
    expect(guard.combat.incoming(50, guard.enemy({ definition: { ranged: true } }) as any)).toBeCloseTo(47, 9);
    expect(guard.combat.incoming(50, guard.enemy() as any)).toBe(50);
  });

  it("soaks hits with a shield that refills after a quiet spell", () => {
    const view = fight(["glacier_regent_card"]);
    view.combat.update(.016);
    expect(view.combat.shield()).toEqual({ amount: 5, max: 5 });
    expect(view.combat.absorb(3)).toBe(0);
    // The hit that breaks it is soaked whole, however big: a one-shot is stopped.
    expect(view.combat.absorb(1_000)).toBe(0);
    expect(view.combat.shield().amount).toBe(0);
    expect(view.combat.absorb(4)).toBe(4);
    view.combat.update(7);
    expect(view.combat.shield().amount).toBe(0);
    view.combat.update(1.1);
    expect(view.combat.shield().amount).toBe(5);
  });

  it("catches one killing blow a map visit, heals in a panic and webs the attacker", () => {
    const view = fight(["gloomroot_card", "inferno_oracle_card", "desert_spider_card"], { random: [0] });
    const attacker = view.enemy();
    view.combat.update(.016);
    view.player.hp = -5;
    view.combat.afterHurt(attacker as any);
    expect(view.player.hp).toBeCloseTo(50, 9);
    expect(enemyCardControl(attacker as any).move).toBeCloseTo(.6, 9);
    view.player.hp = -5;
    view.combat.afterHurt(attacker as any);
    expect(view.player.hp).toBe(-5);
    view.setMap("beginner_desert");
    view.combat.update(.016);
    view.player.hp = 20;
    view.combat.afterHurt(attacker as any);
    expect(view.player.hp).toBeCloseTo(40, 9);
  });

  it("splashes a reflected hit onto the enemies near its attacker with Prism, as reflected damage", () => {
    const view = fight(["prismshell_card"]);
    const attacker = view.enemy({ x: 0 }), beside = view.enemy({ x: 40 });
    view.combat.afterReflect(attacker as any, 30);
    expect(view.struck).toEqual([{ target: beside, damage: 30, reflected: true }]);
  });

  it("splashes a reflected hit onto the four nearest of a pack, not all of it", () => {
    const view = fight(["prismshell_card"]);
    const attacker = view.enemy({ x: 0 });
    const pack = Array.from({ length: 10 }, (_, index) => view.enemy({ x: 10 + index * 5 }));
    view.combat.afterReflect(attacker as any, 30);
    expect(view.struck.map(hit => hit.target)).toEqual(pack.slice(0, 4));
  });

  it("passes over an enemy Prism struck in the last second, so a pack's reflects do not stack on its middle", () => {
    const view = fight(["prismshell_card"]);
    const attacker = view.enemy({ x: 0 });
    const pack = Array.from({ length: 6 }, (_, index) => view.enemy({ x: 10 + index * 5 }));
    view.combat.afterReflect(attacker as any, 30);
    view.struck.length = 0;
    view.combat.update(.5);
    view.combat.afterReflect(attacker as any, 30);
    expect(view.struck.map(hit => hit.target)).toEqual(pack.slice(4));
    view.struck.length = 0;
    view.combat.update(.6);
    view.combat.afterReflect(attacker as any, 30);
    expect(view.struck.map(hit => hit.target)).toEqual(pack.slice(0, 4));
  });
});
