import { describe, expect, it } from "vitest";
import { simPlayer } from "./harness/sim";
import { killsWhilePlaying, serverPays } from "./harness/combat-bounds";
import { weaponAttackRange } from "../../src/game/weapon-combat";
import { bossStateForMap } from "../../src/game/runtime/boss/boss-registry";
import { BOSS_RESPAWN_SECONDS, MAP_IDS as CAMPAIGN_MAP_IDS } from "../../shared/rules";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../src/game/runtime/enemies/regular-enemy-respawn";
import { portalUsePoint } from "../../shared/map-gateways";
import { runtimeMapBalance } from "../../shared/map-balance-runtime";
import { personalBossDefinition } from "../../shared/personal-bosses";
import { PROCEDURAL_BOSS_RESPAWN_SECONDS } from "../../shared/procedural-map-core";
import { bossAbilityTimelineAt } from "../../shared/boss-simulation";

/** A build that hurts nothing and outlasts anything: for watching enemies. */
const HARMLESS = { damage: 0, maxHp: 1e9, armor: 0, regen: 0, attackRate: 1 };
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** A build that outclasses the map: it can stand anywhere and kill anything. */
const STRONG = { damage: 2_000, maxHp: 1e7, armor: 0, regen: 0, attackRate: 1 };

describe("boss fights", { timeout: 60_000 }, () => {
  it("a campaign boss telegraphs its opener, runs its cycle, hurts enemies in its blasts and opens the next map once", async () => {
    const sim = simPlayer({ startMap: "intermediate_snowlands", highestUnlocked: 2, base: STRONG });
    const { parts } = sim;
    const frostclaw = parts.bosses.frostclaw;
    sim.prepareDuel({ bossShare: 1, playerShare: 1 });
    // Ann deals nothing for now, so the boss's own blasts are all that hurt anything.
    parts.player.damage = 0;
    const bystander = sim.enemiesNear()[0];
    Object.assign(bystander, { x: parts.player.x + 30, y: parts.player.y, homeX: parts.player.x + 30, homeY: parts.player.y });
    const bystanderHp = bystander.hp;

    const start = parts.clock.ms;
    const seconds = () => (parts.clock.ms - start) / 1000;
    let warnedAt: number | null = null, firstHitAt: number | null = null;
    const attacks = new Set<string>();
    while (seconds() < 16) {
      await sim.play(.05);
      if (frostclaw.roar) attacks.add("roar");
      if (frostclaw.rift) attacks.add("rift");
      if (parts.bossHazards.frostclaw.length) attacks.add("icefall");
      if (attacks.size && warnedAt === null) warnedAt = seconds();
      if (sim.report().combat.hits.boss && firstHitAt === null) firstHitAt = seconds();
    }
    // Every attack is drawn before it lands; the cycle runs all three.
    expect(warnedAt).not.toBeNull();
    expect(firstHitAt! - warnedAt!).toBeGreaterThanOrEqual(.8);
    expect([...attacks].sort()).toEqual(["icefall", "rift", "roar"]);
    // The blasts that hit Ann hit the enemy beside her too, and a kill by the boss is no kill of hers.
    expect(bystander.hp).toBeLessThan(bystanderHp);
    expect(sim.report().kills).toBe(0);

    // Ann fights back and the boss falls: the way on opens once.
    const defeats: string[] = [];
    parts.onBossDefeated(mapId => defeats.push(mapId));
    const config = parts.mapConfig.intermediate_snowlands as { portal: unknown; secondaryPortal?: unknown };
    const portal = [config.portal, config.secondaryPortal].find(gate => (gate as { destination?: string })?.destination === "advanced_lava_wastes");
    expect(portal).toBeDefined();
    expect(parts.mapController.portalIsUnlocked(portal as never)).toBe(false);
    parts.player.damage = STRONG.damage;
    for (let step = 0; step < 120 && sim.bossAlive(); step++) await sim.play(.5);
    expect(sim.bossAlive()).toBe(false);
    await sim.play(10);
    expect(defeats).toEqual(["intermediate_snowlands"]);
    expect(parts.mapController.portalIsUnlocked(portal as never)).toBe(true);
  });

  it.each(CAMPAIGN_MAP_IDS.map((mapId, index) => [mapId, index] as const))("%s's boss strikes a player at it and falls once, opening the way on", async (mapId, index) => {
    const sim = simPlayer({ startMap: mapId, highestUnlocked: index, base: { ...STRONG, maxHp: 1e9 } });
    const { parts } = sim;
    const next = CAMPAIGN_MAP_IDS[index + 1];
    const config = parts.mapConfig[mapId as keyof typeof parts.mapConfig] as { portal: unknown; secondaryPortal?: unknown };
    const forward = [config.portal, config.secondaryPortal].find(gate => (gate as { destination?: string })?.destination === next);
    if (next) expect(forward && parts.mapController.portalIsUnlocked(forward as never)).toBe(false);
    const defeats: string[] = [];
    parts.onBossDefeated(defeated => defeats.push(defeated));
    expect(sim.prepareDuel({ bossShare: 1, playerShare: 1 })).toBe(true);
    // Fifteen or so hits to kill, whatever the map.
    parts.player.damage = bossStateForMap(parts.bosses, mapId)!.maxHp / 15;
    for (let step = 0; step < 240 && sim.bossAlive(); step++) await sim.play(.5);
    expect(sim.bossAlive()).toBe(false);
    expect(sim.report().combat.hits.boss ?? 0).toBeGreaterThan(0);
    await sim.play(5);
    expect(defeats).toEqual([mapId]);
    if (next) expect(parts.mapController.portalIsUnlocked(forward as never)).toBe(true);
  });

  it("an Endless boss is one boss at a time: it falls once, opens the way on and comes back when due", async () => {
    // Endless bosses are far tougher than the campaign's.
    const sim = simPlayer({ startMap: "endless_1", base: { ...STRONG, damage: 1e8, maxHp: 1e13 } });
    const { parts } = sim;
    const bossesStanding = () => parts.enemies.filter(enemy => enemy.generatedBoss && !enemy.dead).length;
    const defeats: string[] = [];
    parts.onBossDefeated(mapId => defeats.push(mapId));
    await sim.play(1);
    expect(bossesStanding()).toBe(1);
    const boss = parts.enemies.find(enemy => enemy.generatedBoss)!;
    Object.assign(parts.player, { x: boss.x, y: boss.y + boss.r + 35 });
    let most = 0;
    for (let step = 0; step < 120 && sim.bossAlive(); step++) { await sim.play(.5); most = Math.max(most, bossesStanding()); }
    expect(most).toBe(1);
    expect(sim.bossAlive()).toBe(false);
    await sim.play(5);
    expect(bossesStanding()).toBe(0);
    expect(defeats).toEqual(["endless_1"]);
    // Its respawn time on, one boss again.
    await sim.play(PROCEDURAL_BOSS_RESPAWN_SECONDS);
    expect(bossesStanding()).toBe(1);
    expect(defeats).toEqual(["endless_1"]);
  });

  it("a player who arrives partway into a boss attack still gets its whole warning", async () => {
    // Late enough into a roar that a fresh client would otherwise see it half drawn.
    let at = Date.UTC(2026, 9, 7, 12) + 60_000;
    while (bossAbilityTimelineAt({ kind: "frostclaw", serverNowMs: at }).ability !== "roar") at += 250;
    const roar = bossAbilityTimelineAt({ kind: "frostclaw", serverNowMs: at });
    const sim = simPlayer({ startMap: "intermediate_snowlands", highestUnlocked: 2, base: STRONG });
    sim.prepareDuel({ bossShare: 1, playerShare: 1 });
    sim.parts.clock.ms = roar.startedAtMs + 800;
    await sim.play(.02);
    const warning = sim.parts.bosses.frostclaw.roar;
    expect(warning).not.toBeNull();
    expect(warning!.windup).toBeGreaterThan(.8);
  });
});

describe("enemies", { timeout: 60_000 }, () => {
  it("a group camp comes as one when a player walks up, and the other camps stay put", async () => {
    const sim = simPlayer({ startMap: "beginner_desert", highestUnlocked: 1, base: HARMLESS });
    const { parts } = sim;
    await sim.play(.5);
    const groupCamp = parts.spawnSites.find(site => site.groupAggro)!.campName;
    const members = () => parts.enemies.filter(enemy => enemy.campName === groupCamp && !enemy.dead);
    const first = members()[0];
    Object.assign(parts.player, { x: first.x + 650, y: first.y });
    const engaged = () => parts.enemies.filter(enemy => enemy.engaged && !enemy.dead);
    for (let step = 0; step < 60 && !engaged().length; step++) await sim.walk(-1, 0, .1);
    expect(engaged().length).toBeGreaterThan(1);
    // Every member within its leash of her comes; nothing from any other camp does.
    expect(new Set(engaged())).toEqual(new Set(members().filter(enemy => gap(enemy, parts.player) <= enemy.leashRange)));

    // Standing still among them, they spread round the player rather than stacking.
    await sim.play(4);
    const crowd = engaged();
    for (const [i, a] of crowd.entries()) for (const b of crowd.slice(i + 1)) expect(gap(a, b)).toBeGreaterThan(Math.min(a.r, b.r));
  });

  it("a forest Bramble chases a step ahead of a beginner, and goes home when outrun past its leash", async () => {
    const sim = simPlayer({ base: HARMLESS });
    const { parts } = sim;
    await sim.play(.5);
    const bramble = parts.enemies.find(enemy => enemy.type === "Bramble" && !enemy.dead)!;
    const home = { x: bramble.homeX, y: bramble.homeY };
    Object.assign(parts.player, { x: bramble.x + 150, y: bramble.y });
    await sim.play(.5);
    expect(bramble.engaged).toBe(true);
    expect(sim.parts.enemies.filter(enemy => enemy.engaged && !enemy.dead)).toEqual([bramble]);

    // Ann runs: it gains on her, a little faster than she moves.
    const speed = parts.player.speed;
    let fastest = 0;
    let last = { x: bramble.x, y: bramble.y };
    parts.setInput(1, 0);
    for (let step = 0; step < 240; step++) {
      await sim.play(1 / 60);
      fastest = Math.max(fastest, gap(bramble, last) * 60);
      last = { x: bramble.x, y: bramble.y };
    }
    parts.setInput(0, 0);
    expect(fastest).toBeGreaterThan(speed + 15);
    expect(fastest).toBeLessThan(speed + 35);

    // Far past its leash it gives up and walks home.
    Object.assign(parts.player, { x: home.x + 2_500, y: home.y });
    await sim.play(15);
    expect(bramble.engaged).toBe(false);
    expect(gap(bramble, home)).toBeLessThan(60);
  });

  it("ranged enemies close in to fire from inside the player's reach and never back away", async () => {
    for (const weapon of ["starter_bow", "wooden_sword"]) {
      const sim = simPlayer({ startMap: "beginner_desert", highestUnlocked: 1, base: HARMLESS, weapon });
      const { parts } = sim;
      await sim.play(.5);
      const archer = parts.enemies.find(enemy => enemy.type === "Dune Archer" && !enemy.dead)!;
      Object.assign(parts.player, { x: archer.x + 450, y: archer.y });
      await sim.play(6);
      expect(archer.engaged).toBe(true);
      // Where it stands to shoot, the player's weapon reaches it back.
      const reach = weaponAttackRange(weapon, parts.player.attackRange);
      expect(gap(archer, parts.player) - archer.r, weapon).toBeLessThanOrEqual(reach);
      expect(sim.report().combat.hits.shots ?? 0, weapon).toBeGreaterThan(0);
      // Walking at it, it holds its ground.
      let before = gap(archer, parts.player);
      for (let step = 0; step < 20; step++) {
        await sim.walk((archer.x - parts.player.x) / before, (archer.y - parts.player.y) / before, .05);
        const now = gap(archer, parts.player);
        // Once touching, bodies push apart a little; that is not backing away.
        expect(now, weapon).toBeLessThanOrEqual(Math.max(before, parts.player.r + archer.r) + 1);
        before = now;
      }
      sim.dispose();
    }
  });

  it("another player's fight shows as a ghost that can die, never touching the observer's own enemy or paying them", async () => {
    const sim = simPlayer({ base: HARMLESS });
    const { parts } = sim;
    await sim.play(.5);
    const bramble = parts.enemies.find(enemy => enemy.type === "Bramble" && !enemy.dead)!;
    // Ann watches from nearby, out of its reach.
    Object.assign(parts.player, { x: bramble.x - 450, y: bramble.y });
    parts.addRemotePlayer({ id: "bob", name: "Bob", power: 500, x: bramble.x + 30, y: bramble.y, simulationX: bramble.x + 30, simulationY: bramble.y,
      speed: 180, facing: 0, moving: false, feetItem: "", headItem: "", chestItem: "", rightHandItem: "starter_bow", leftHandItem: "" } as never,
      { damage: 1_000, maxHp: 220, armor: 0, regen: 0, attackInterval: .5, projectileSpeed: 780, projectileCount: 1, attackRange: 280, criticalChance: 0, criticalDamageMultiplier: 1.05 } as never);
    await sim.play(.1);
    const ghosts = parts.enemySimulation.remoteCombatGhosts();
    expect(ghosts.map(ghost => ghost.siteId)).toContain(bramble.siteId);
    // Bob kills it; the ghost falls and goes, and Ann's own Bramble is untouched.
    await sim.play(3);
    expect(parts.enemySimulation.remoteCombatGhosts().filter(ghost => ghost.siteId === bramble.siteId)).toEqual([]);
    expect(bramble).toMatchObject({ dead: false, hp: bramble.maxHp, engaged: false });
    expect(sim.report().kills).toBe(0);
  });
});

describe("weapon skills in a pack", { timeout: 60_000 }, () => {
  /** A Desert pack, one hit each, three seconds between attacks: kills a skill adds stand out. */
  async function packFight(weapon: string, skills?: Record<string, number>) {
    const sim = simPlayer({ startMap: "beginner_desert", highestUnlocked: 1, weapon, bowSkills: skills as never,
      base: { damage: 1, maxHp: 1e9, armor: 0, regen: 0, attackRate: 3 } });
    await sim.play(.5);
    const camp = sim.parts.spawnSites.find(site => site.groupAggro)!;
    Object.assign(sim.parts.player, { x: camp.x, y: camp.y });
    sim.parts.player.damage = Math.max(...sim.parts.enemies.filter(enemy => enemy.campName === camp.campName).map(enemy => enemy.maxHp)) * 1.1;
    const kills = await killsWhilePlaying(sim, 30);
    const { shots, landed } = sim.report().combat;
    const result = { kills, total: Object.values(kills).reduce((sum, count) => sum + count, 0), perAttack: landed / shots, damage: sim.parts.player.damage };
    sim.dispose();
    return result;
  }

  it.each([
    ["starter_bow", { arrowStorm: 15, ricochet: 15, piercingShot: 15 }],
    ["wooden_sword", { whirlwind: 15, deflect: 15, shockwave: 15 }],
    ["starter_staff", { meteor: 15, chain: 15, frostNova: 15 }],
  ] as const)("%s's skills reach more of the pack than the weapon alone, and the server pays every kill they make", async (weapon, skills) => {
    const plain = await packFight(weapon);
    const skilled = await packFight(weapon, skills);
    expect(skilled.perAttack).toBeGreaterThan(plain.perAttack);
    expect(skilled.total).toBeGreaterThanOrEqual(plain.total);
    const answer = serverPays({ mapId: "beginner_desert", weapon, damage: skilled.damage, attackRate: 3, skills }, skilled.kills, 30.5);
    expect(answer).toEqual({ paid: skilled.total, error: null });
  });
});

describe("a fast clock", { timeout: 60_000 }, () => {
  it("a client whose clock runs three times fast is paid no more than real time allows", async () => {
    // A slow, one-hit build by the Forest's Spitters: its own attacks, not the camp, set how fast it can kill.
    const build = { mapId: "tutorial_forest", weapon: "starter_bow", damage: 1_000, attackRate: 6 };
    const sim = simPlayer({ base: { damage: build.damage, maxHp: 1e9, armor: 0, regen: 0, attackRate: build.attackRate } });
    await sim.play(.5);
    const spitter = sim.enemiesNear().find(enemy => enemy.type === "Spitter")!;
    Object.assign(sim.parts.player, { x: spitter.x - 120, y: spitter.y });
    // Its clock runs three times fast: two minutes of fighting in forty real seconds.
    const kills = await killsWhilePlaying(sim, 120);
    const claimed = Object.values(kills).reduce((sum, count) => sum + count, 0);
    // The most forty honest seconds could be paid, whatever was claimed.
    const most = serverPays(build, { Spitter: 1_000 }, 40).paid;
    const paid = serverPays(build, kills, 120, 40).paid;
    expect(claimed).toBeGreaterThan(most);
    expect(paid).toBeLessThanOrEqual(most);
  });
});

describe("what a refresh remembers", { timeout: 60_000 }, () => {
  const SNOW = { startMap: "intermediate_snowlands", highestUnlocked: 2, base: { ...STRONG, maxHp: 1e9 } };

  it("a wounded boss stays wounded through a death and a reload, and is whole again after deliberate travel or for another character", async () => {
    let sim = simPlayer(SNOW);
    sim.prepareDuel({ bossShare: 1, playerShare: 1 });
    sim.parts.player.damage = bossStateForMap(sim.parts.bosses, "intermediate_snowlands")!.maxHp / 12;
    while (sim.bossShare() > .55) await sim.play(.25);
    sim.parts.player.damage = 0;
    // Ann falls; three seconds on she is back, and so is the wound.
    sim.parts.playerCombat().damagePlayer(1e12);
    await sim.play(5);
    expect(sim.parts.running()).toBe(true);
    expect(sim.bossShare()).toBeLessThan(.65);
    // The page reloads (an update): the fight picks up where it was.
    sim = sim.reload();
    await sim.play(.5);
    expect(sim.bossShare()).toBeLessThan(.65);
    // Another character in the same browser meets a whole boss.
    const bob = sim.reload({ name: "bob" });
    await bob.play(.5);
    expect(bob.bossShare()).toBe(1);
    // Ann walks to the Desert and back: a new fight.
    sim = bob.reload({ name: "sim" });
    await sim.play(.5);
    expect(sim.bossShare()).toBeLessThan(.65);
    const gates = sim.parts.mapConfig as unknown as Record<string, { portal?: Parameters<typeof portalUsePoint>[0]; secondaryPortal?: Parameters<typeof portalUsePoint>[0] }>;
    const through = async (from: string, to: string) => {
      const gate = [gates[from].portal, gates[from].secondaryPortal].find(portal => portal?.destination === to)!;
      Object.assign(sim.parts.player, portalUsePoint(gate));
      for (let step = 0; step < 20 && sim.mapId() === from; step++) await sim.walk(0, -1, .1);
      expect(sim.mapId()).toBe(to);
      await sim.play(1);
    };
    await through("intermediate_snowlands", "beginner_desert");
    await through("beginner_desert", "intermediate_snowlands");
    expect(sim.bossShare()).toBe(1);
  });

  it("dead enemies and a dead boss stay dead across a refresh and come back only when due", async () => {
    let sim = simPlayer(SNOW);
    const at = () => sim.parts.clock.ms / 1000;
    // The boss falls, then the enemy nearest it.
    sim.prepareDuel({ bossShare: 1, playerShare: 1 });
    sim.parts.player.damage = 1e15;
    while (sim.bossAlive()) await sim.play(.1);
    const bossDiedAt = at();
    const victim = sim.enemiesNear().find(enemy => !enemy.generatedBoss)!;
    const site = victim.siteId;
    Object.assign(sim.parts.player, { x: victim.x + 60, y: victim.y });
    while (!victim.dead) await sim.play(.05);
    const enemyDiedAt = at();
    sim.parts.player.damage = 0;
    const alive = () => sim.parts.enemies.some(enemy => enemy.siteId === site && !enemy.dead);
    const balance = runtimeMapBalance("intermediate_snowlands")!;
    const enemyDue = balance.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS;
    const bossDue = personalBossDefinition("intermediate_snowlands")!.respawnSeconds;
    expect(bossDue).toBeGreaterThan(enemyDue + 4);

    // Reloaded at once: both still dead.
    sim = sim.reload();
    await sim.play(.5);
    expect(sim.bossAlive()).toBe(false);
    expect(alive()).toBe(false);
    // Each comes back when its time is up, not before.
    await sim.play(enemyDiedAt + enemyDue - 1 - at());
    expect(alive()).toBe(false);
    await sim.play(2);
    expect(alive()).toBe(true);
    await sim.play(bossDiedAt + bossDue - 1 - at());
    expect(sim.bossAlive()).toBe(false);
    await sim.play(2);
    expect(sim.bossAlive()).toBe(true);
  });

  it("broken browser storage never stops play", async () => {
    // The game's own memory of dead enemies and boss fights cannot be read or written.
    const values = new Map<string, string>(), memory = (key: string) => /respawns|boss-fight/.test(key);
    const broken = {
      getItem: (key: string) => memory(key) ? "{broken" : values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (memory(key)) throw new Error("full"); values.set(key, value); },
      removeItem: (key: string) => { if (memory(key)) throw new Error("blocked"); values.delete(key); },
    };
    const sim = simPlayer({ base: { damage: 1_000, maxHp: 1e9, armor: 0, regen: 0, attackRate: 1 } }, { storage: broken });
    const spitter = sim.enemiesNear().find(enemy => enemy.type === "Spitter")!;
    Object.assign(sim.parts.player, { x: spitter.x - 120, y: spitter.y });
    const kills = await killsWhilePlaying(sim, 10);
    expect(kills.Spitter).toBeGreaterThan(0);
  });
});
