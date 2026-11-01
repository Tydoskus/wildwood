import { describe, expect, it, vi } from "vitest";
import { simPlayer } from "./harness/sim";
import { scenarioWorld } from "./harness/server";
import { TERMS_VERSION } from "../../shared/legal";
import { VIRTUAL_PLAYER_TICKET_HEX_LENGTH } from "../../shared/virtual-player-load-test";
import { distance, fromCamp, killSimPlayer, onlyStat, savedBuild } from "./harness/farm";
import { BASIC_PAPER_HAT, STARTER_STONE } from "../../shared/items";
import { GRADE_GOLD_PRICE } from "../../shared/gear-grades";
import { createStatTrackerModel, RUN_SETTLE_MS } from "../../src/ui/stat-tracker-model";

// Auto Farm played headless on the game's own frame step (tests/scenarios/harness/sim.ts);
// its shares and where it stands are in autofarm-shares.test.ts.
// Minutes of play take a few seconds each.
vi.setConfig({ testTimeout: 60_000 });

describe("Auto Farm interruptions (FARM-05)", () => {
  it("a held direction steers the player, and the farm takes its camp up again on release", async () => {
    const sim = simPlayer();
    const { player } = sim.parts;
    await sim.play(20, { autofarm: true });
    const farmed = sim.parts.autoFarm().state().selected!;
    const kills = sim.report().kills;
    expect(kills).toBeGreaterThan(0);

    // The player holds left for two seconds: the player goes left, wherever the farm wanted to go.
    const before = { x: player.x, y: player.y };
    await sim.walk(-1, 0, 2);
    expect(before.x - player.x).toBeGreaterThan(player.speed * 1.5);
    expect(Math.abs(player.y - before.y)).toBeLessThan(40);
    expect(sim.parts.autoFarm().state().active).toBe(true);

    // Let go: it walks back to the stat it was farming and kills there again.
    await sim.play(30, { autofarm: true });
    expect(sim.report().kills).toBeGreaterThan(kills);
    expect(fromCamp(sim, sim.parts.autoFarm().state().selected!)).toBeLessThan(300);
    expect(sim.parts.autoFarm().state().shares[farmed]).toBeGreaterThan(0);
  });

  it("holds through a death and farms the same stats after the respawn", async () => {
    const sim = simPlayer();
    const { player } = sim.parts;
    await sim.play(20, { autofarm: true });
    const shares = sim.parts.autoFarm().state().shares;

    killSimPlayer(sim);
    expect(sim.parts.running()).toBe(false);
    const fallen = { x: player.x, y: player.y };
    // Down: nobody moves the body.
    await sim.play(2, { autofarm: false });
    expect(distance(player, fallen)).toBe(0);

    // The death screen respawns the player at the start; the farm carries on by itself.
    await sim.play(4, { autofarm: false });
    expect(sim.parts.running()).toBe(true);
    const respawned = { x: player.x, y: player.y };
    const kills = sim.report().kills;
    await sim.play(40, { autofarm: false });
    expect(sim.parts.autoFarm().state()).toMatchObject({ active: true, shares });
    expect(distance(player, respawned)).toBeGreaterThan(100);
    expect(sim.report().kills).toBeGreaterThan(kills);
  });
});

describe("Auto Farm, the boss and the next map (FARM-03)", () => {
  it("fights the Dragon only once the fight projects a win, wins it, and walks on into the Desert", async () => {
    // Short of the Dragon: Move On farms the Forest and never starts the fight.
    const short = simPlayer({ advance: true, readiness: true, base: savedBuild(80, 4_000) });
    let report = await short.play(120, { autofarm: true });
    expect(report.bossAttempts).toEqual([]);
    expect(report.combat.hits.boss ?? 0).toBe(0);
    expect(report.endMap).toBe("tutorial_forest");
    short.dispose();

    // Ready for it: it goes for the Dragon, beats it, and takes the portal it opens.
    const ready = simPlayer({ advance: true, readiness: true, base: savedBuild(500, 50_000) });
    report = await ready.play(120, { autofarm: true });
    expect(report.bossAttempts.map(attempt => [attempt.map, attempt.outcome])).toEqual([["tutorial_forest", "won"]]);
    expect(report.travels.map(travel => [travel.from, travel.to])).toEqual([["tutorial_forest", "beginner_desert"]]);
    expect(report.endMap).toBe("beginner_desert");
    ready.dispose();

    // Move At 10x asks for ten times the strength: the same build waits.
    const careful = simPlayer({ advance: true, readiness: true, moveAt: 10, base: savedBuild(500, 50_000) });
    report = await careful.play(120, { autofarm: true });
    expect(report.bossAttempts).toEqual([]);
    expect(report.endMap).toBe("tutorial_forest");
  });

  it("starts the fight the moment the build it farms grows ready, not before", async () => {
    const growing = simPlayer({ advance: true, readiness: true, base: savedBuild(200, 20_000), economy: true });
    const report = await growing.play(240, { autofarm: true });
    expect(report.bossAttempts).toHaveLength(1);
    expect(report.bossAttempts[0]).toMatchObject({ map: "tutorial_forest", outcome: "won" });
    // It farmed first: the power it set off with is more than it started with.
    expect(report.bossAttempts[0].t).toBeGreaterThan(10);
    expect(report.bossAttempts[0].power).toBeGreaterThan(report.startPower);
    expect(report.deaths.filter(death => death.map === "tutorial_forest")).toEqual([]);
  });

  it("with Move On off, farms on beside a boss it could beat", async () => {
    const stay = simPlayer({ advance: false, readiness: true, base: savedBuild(500, 50_000) });
    const report = await stay.play(90, { autofarm: true });
    expect(report.bossAttempts).toEqual([]);
    expect(report.endMap).toBe("tutorial_forest");
    expect(report.kills).toBeGreaterThan(0);
  });

  it("past a beaten boss, walks into the next map only once ready for its enemies", async () => {
    const weak = simPlayer({ advance: true, readiness: true, bossBeaten: true, base: savedBuild(30, 1_500) });
    let report = await weak.play(90, { autofarm: true });
    expect(report.travels).toEqual([]);
    weak.dispose();
    const ready = simPlayer({ advance: true, readiness: true, bossBeaten: true, base: savedBuild(500, 50_000) });
    report = await ready.play(90, { autofarm: true });
    // The Dragon is already down: no fight, straight through its portal.
    expect(report.bossAttempts).toEqual([]);
    expect(report.travels[0]).toMatchObject({ from: "tutorial_forest", to: "beginner_desert", direction: "forward" });
    ready.dispose();

    // The server refuses the crossing: it farms on and tries again a minute later, not every few seconds.
    let tries = 0;
    const refused = simPlayer({ advance: true, readiness: true, bossBeaten: true, base: savedBuild(500, 50_000) }, { changeMap: () => { tries++; return false; } });
    report = await refused.play(90, { autofarm: true });
    expect(report.endMap).toBe("tutorial_forest");
    expect(tries).toBeGreaterThanOrEqual(1);
    expect(tries).toBeLessThanOrEqual(2);
    expect(report.kills).toBeGreaterThan(0);
  });
});

describe("A Forest run (FARM-01)", () => {
  it("kills, grows its power, and buys the Smith's grades with the gold and Mastery its kills pay", async () => {
    const before = Date.now();
    const sim = simPlayer({ weapon: STARTER_STONE, head: BASIC_PAPER_HAT, gold: 3_400, masteryPoints: { archery: 10 }, economy: true, seed: 2 });
    const report = await sim.play(90, { autofarm: true });
    expect(report.kills).toBeGreaterThan(0);
    expect(report.endPower).toBeGreaterThan(report.startPower);
    // Every grade the gold pays for, cheapest first: the bow, then the armour.
    expect(report.purchases.map(entry => entry.itemId)).toEqual(["crude_bow", "crude_light_armor", "crude_light_helmet", "crude_ranger_boots"]);
    expect(report.gold).toBeGreaterThanOrEqual(3_400 - 4 * GRADE_GOLD_PRICE.crude);
    // Each kill is a Mastery point for the bow's school.
    expect(report.masteryPoints.archery).toBe(10 + report.kills);
    // A minute and a half of play took no real time, and the real clock is back once it is put away.
    sim.dispose();
    expect(Math.abs(Date.now() - before)).toBeLessThan(60_000);
  });
});

describe("Pull and Aggro switches (FARM-10)", () => {
  /** Farms Max Health for a minute; returns the kinds pulled, how far the player walked after settling, and the closest a pulled enemy came. */
  async function farmHealth(profile: Parameters<typeof simPlayer>[0]) {
    const sim = simPlayer({ base: savedBuild(20, 1_000), ...profile });
    const farm = sim.parts.autoFarm();
    farm.start(onlyStat("stat:health"));
    const kinds = new Set<string>();
    let walked = 0, closest = Infinity, last = { x: sim.parts.player.x, y: sim.parts.player.y };
    for (let second = 0; second < 60; second++) {
      await sim.play(1, { autofarm: false });
      for (const enemy of sim.parts.enemies) if (farm.pulls(enemy)) {
        kinds.add(enemy.type);
        closest = Math.min(closest, distance(enemy, sim.parts.player));
      }
      if (second >= 20) walked += distance(last, sim.parts.player);
      last = { x: sim.parts.player.x, y: sim.parts.player.y };
    }
    return { kinds: [...kinds].sort(), walked, closest, kills: sim.report().kills, healthKinds: farm.choices().find(choice => choice.key === "stat:health")!.kinds };
  }

  it("Pull brings the farmed stat's whole camp to a player who stands and fights; off, nothing comes", async () => {
    const pulling = await farmHealth({ pull: true });
    expect(pulling.kinds.length).toBeGreaterThan(0);
    for (const kind of pulling.kinds) expect(pulling.healthKinds).toContain(kind);
    expect(pulling.closest).toBeLessThan(100);
    expect(pulling.walked).toBeLessThan(50);
    expect(pulling.kills).toBeGreaterThan(0);

    const walking = await farmHealth({ pull: false });
    expect(walking.kinds).toEqual([]);
    expect(walking.walked).toBeGreaterThan(200);
  });

  it("Target Lowest HP heads for the most wounded enemy of the stat across the map, where Closest takes the nearest", async () => {
    const walkFor = async (priority: "lowest" | "closest") => {
      const sim = simPlayer();
      const start = { x: sim.parts.player.x, y: sim.parts.player.y };
      // The King Slime across the map (it pays health too) is down to its last point; the Brambles are nearer.
      const wounded = sim.parts.enemies.find(enemy => enemy.type === "King Slime")!;
      wounded.hp = 1;
      sim.parts.autoFarm().setPriority(priority);
      sim.parts.autoFarm().start(onlyStat("stat:health"));
      await sim.play(8, { autofarm: false });
      return distance(wounded, start) - distance(wounded, sim.parts.player);
    };
    const lowest = await walkFor("lowest"), closest = await walkFor("closest");
    expect(lowest).toBeGreaterThan(1_200);
    expect(closest).toBeLessThan(lowest / 2);
  });

  it("an Aggro run's groups chase the player from arrival, as many as the run asks for, and Pull brings nothing else", async () => {
    for (const count of [1, 2]) {
      const sim = simPlayer({ aggro: count, pull: true, base: savedBuild(20, 1_000) });
      const farm = sim.parts.autoFarm();
      const chasing = new Set<string>();
      for (let second = 0; second < 10; second++) {
        await sim.play(1, { autofarm: true });
        for (const enemy of sim.parts.enemies) if (farm.forced(enemy)) chasing.add(enemy.type);
        expect(sim.parts.enemies.filter(enemy => farm.pulls(enemy) && !farm.forced(enemy))).toEqual([]);
      }
      const groups = new Set([...chasing].map(kind => farm.choices().find(choice => choice.kinds.includes(kind))!.key));
      expect(groups.size).toBe(count);
      sim.dispose();
    }
  });

  it("a stat switched to Aggro is pulled while another is farmed", async () => {
    const aggro = await farmHealth({ aggroGroups: ["stat:speed"] });
    expect(aggro.kinds).toEqual(["Needle"]);
    expect(aggro.closest).toBeLessThan(100);
  });
});

describe("Map changes Auto Farm did not make (FARM-06)", () => {
  it("walked through a portal by hand, it farms the next map with the same shares and stays there", async () => {
    const sim = simPlayer({ bossBeaten: true, base: savedBuild(60, 5_000) });
    const farm = sim.parts.autoFarm();
    farm.start(onlyStat("stat:damage"));
    await sim.play(10, { autofarm: false });
    // The player steers into the Forest's portal to the Desert while the farm runs.
    const portal = sim.parts.mapController.activePortal()!;
    for (let step = 0; step < 60 && sim.mapId() === "tutorial_forest"; step++) {
      const { player } = sim.parts, length = distance(portal, player);
      await sim.walk((portal.x - player.x) / length, (portal.y - player.y) / length, .5);
    }
    expect(sim.mapId()).toBe("beginner_desert");
    const arrival = { x: sim.parts.player.x, y: sim.parts.player.y };
    await sim.play(30, { autofarm: false });
    expect(farm.state()).toMatchObject({ active: true, selected: "stat:damage" });
    expect(farm.state().shares["stat:health"]).toBe(0);
    expect(distance(sim.parts.player, arrival)).toBeGreaterThan(200);
    expect(sim.mapId()).toBe("beginner_desert");
  });
});

describe("The stat tracker's session (FARM-12)", () => {
  // The tracker's own model over a stored session and a clock, as the HUD card runs it each second.
  const stats = { power: 1_000, hp: 500, damage: 100, armor: 20, regen: 5, attackSpeed: 10, critDamage: 10, kills: 50 };
  const gains = (result: ReturnType<ReturnType<typeof createStatTrackerModel>["update"]>) => Object.fromEntries(result!.rows.map(row => [row.stat, row.gain]));
  function browser() {
    const saved = new Map<string, string>();
    let time = 1_000;
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    return { open: () => createStatTrackerModel(storage, () => time), wait: (ms: number) => { time += ms; } };
  }

  it("an hour's gains survive a reload, and a gear swap never reads as a loss", async () => {
    const tab = browser();
    let tracker = tab.open();
    tracker.update("ann", stats, 0, { run: "main", basePower: 900 });
    tab.wait(1_800_000);
    let now = tracker.update("ann", { ...stats, damage: 100.25, kills: 60, power: 1_050 }, 0, { run: "main", basePower: 950 })!;
    expect(gains(now)).toMatchObject({ damage: .25, kills: 10, power: 50 });
    expect(now.rows.find(row => row.stat === "kills")!.perHour).toBe(20);
    tracker.save();
    // Reloaded: the same session, and another character's is its own.
    tracker = tab.open();
    expect(gains(tracker.update("bob", { ...stats, power: 9_000 })!).power).toBe(0);
    now = tracker.update("ann", { ...stats, damage: 100.25, kills: 60, power: 1_050 }, 0, { run: "main", basePower: 950 })!;
    expect(now.elapsedMs).toBe(1_800_000);
    expect(gains(now).kills).toBe(10);
    // Weaker gear: power and damage fall below where the session began, and show no gain, never a loss.
    now = tracker.update("ann", { ...stats, damage: 90, power: 900, kills: 61 }, 0, { run: "main", basePower: 950 })!;
    expect(gains(now)).toMatchObject({ damage: 0, power: 0, kills: 11 });
    expect(now.rows.every(row => row.gain >= 0 && row.perHour >= 0)).toBe(true);
  });

  it("starts over for a prestige (unless told to carry on), a challenge and an Aggro run started again after a death", async () => {
    const tab = browser();
    const tracker = tab.open();
    tracker.update("ann", stats, 1, { run: "main", basePower: 900 });
    tab.wait(60_000);
    // A prestige: the level goes up and the session starts over.
    expect(tracker.update("ann", { ...stats, damage: 4, kills: 60 }, 2, { run: "main", basePower: 50 })!.elapsedMs).toBe(0);
    // Reflect Only starts: once the new run has held a moment, its gains are its own.
    tab.wait(60_000);
    tracker.update("ann", { ...stats, power: 50, kills: 70 }, 2, { run: "reflect", basePower: 40 });
    tab.wait(RUN_SETTLE_MS);
    expect(tracker.update("ann", { ...stats, power: 50, kills: 70 }, 2, { run: "reflect", basePower: 40 })!.elapsedMs).toBe(0);
    // An Aggro run that dies starts again from its starting build: so does the session.
    tracker.update("ann", { ...stats, power: 50, kills: 70 }, 2, { run: "aggro", basePower: 40 });
    tab.wait(RUN_SETTLE_MS);
    tracker.update("ann", { ...stats, power: 400, kills: 90 }, 2, { run: "aggro", basePower: 300 });
    tab.wait(600_000);
    tracker.update("ann", { ...stats, power: 50, kills: 90 }, 2, { run: "aggro", basePower: 40 });
    tab.wait(RUN_SETTLE_MS);
    expect(tracker.update("ann", { ...stats, power: 50, kills: 90 }, 2, { run: "aggro", basePower: 40 })!.elapsedMs).toBe(0);

    // With "reset on prestige" off, a prestige carries the gains on and the timer runs on.
    const carrying = browser(), kept = carrying.open();
    kept.setResetOnPrestige(false);
    kept.update("ann", stats, 1, { run: "main", basePower: 1_000 });
    carrying.wait(1_800_000);
    kept.update("ann", { ...stats, damage: 150, kills: 80 }, 1, { run: "main", basePower: 1_500 });
    kept.update("ann", { ...stats, damage: 10, kills: 80 }, 2, { run: "main", basePower: 100 });
    carrying.wait(RUN_SETTLE_MS);
    kept.update("ann", { ...stats, damage: 10, kills: 80 }, 2, { run: "main", basePower: 100 });
    const carried = kept.update("ann", { ...stats, damage: 30, kills: 90 }, 2, { run: "main", basePower: 200 })!;
    expect(carried.elapsedMs).toBe(1_800_000 + RUN_SETTLE_MS);
    expect(gains(carried)).toMatchObject({ damage: 70, kills: 40 });
  });
});

describe("Autofarm puppets on the server and load-test bots (FARM-13)", () => {
  it("holds one plan per visible farmer, anchored where the server last placed them; a repeat or a flicker within seconds writes nothing", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    ann.call("setMultiplayerEnabled", { enabled: true });
    const puppet = () => world.db.playerAutoFarmPuppet.identity.find(ann.identity);
    const at = world.db.player.identity.find(ann.identity);
    ann.call("setAutoFarmPuppet", { group: "stat:damage", camp: "" });
    expect(puppet()).toMatchObject({ mapId: at.mapId, group: "stat:damage", x: at.x, y: at.y });
    const first = puppet().startedAt.microsSinceUnixEpoch;
    // Every write goes to the whole map: the same plan a second later, or a new one straight after, is dropped.
    world.advance(1_000);
    ann.call("setAutoFarmPuppet", { group: "stat:damage", camp: "" });
    ann.call("setAutoFarmPuppet", { group: "stat:health", camp: "" });
    expect(puppet()).toMatchObject({ group: "stat:damage" });
    expect(puppet().startedAt.microsSinceUnixEpoch).toBe(first);
    world.advance(5_000);
    ann.call("setAutoFarmPuppet", { group: "stat:health", camp: "" });
    expect(puppet()).toMatchObject({ group: "stat:health" });
    // Stopping ends it at once; so does leaving.
    ann.call("setAutoFarmPuppet", { group: "", camp: "" });
    expect(puppet()).toBeFalsy();
    world.advance(5_000);
    ann.call("setAutoFarmPuppet", { group: "stat:damage", camp: "" });
    ann.disconnect();
    expect(puppet()).toBeFalsy();
  });

  it("a bot enters the world on its developer's Terms consent, and loses it when the test is cleared", () => {
    const world = scenarioWorld();
    const dev = world.join("Dev", { kind: "developer" });
    const ticket = "a".repeat(VIRTUAL_PLAYER_TICKET_HEX_LENGTH);
    dev.call("devBeginVirtualPlayerLoadTest", { ticket, maxCount: 2 });
    // The load generator connects a fresh identity: nobody accepts the Terms for it.
    const bot = world.player("Bot-1").connect();
    bot.call("joinVirtualPlayerLoadTest", { owner: dev.identity, ticket, mapId: "tutorial_forest", x: 900, y: 900 });
    expect(bot.row("playerLegalConsent")).toMatchObject({ termsVersion: TERMS_VERSION });
    // Joined again, it is lent nothing new.
    const lent = bot.row("playerLegalConsent").acceptedAt.microsSinceUnixEpoch;
    bot.call("joinVirtualPlayerLoadTest", { owner: dev.identity, ticket, mapId: "tutorial_forest", x: 900, y: 900 });
    expect(bot.row("playerLegalConsent").acceptedAt.microsSinceUnixEpoch).toBe(lent);
    expect(bot.refusal("enterWorldWithTutorial", { tabId: `tab-${bot.hex.slice(0, 12)}`, forceTakeover: false })).toBeNull();

    dev.call("devClearVirtualPlayers");
    expect(bot.row("playerLegalConsent")).toBeFalsy();
    expect(dev.row("playerLegalConsent")).toMatchObject({ termsVersion: TERMS_VERSION });
  });

  it("a bot is lent nothing when its developer's consent is out of date", () => {
    const world = scenarioWorld();
    const dev = world.join("Dev", { kind: "developer" });
    dev.patch("playerLegalConsent", { termsVersion: "2001-01-01" });
    const ticket = "b".repeat(VIRTUAL_PLAYER_TICKET_HEX_LENGTH);
    dev.call("devBeginVirtualPlayerLoadTest", { ticket, maxCount: 1 });
    const bot = world.player("Bot-2").connect();
    bot.call("joinVirtualPlayerLoadTest", { owner: dev.identity, ticket, mapId: "tutorial_forest", x: 900, y: 900 });
    expect(bot.row("playerLegalConsent")).toBeFalsy();
  });
});
