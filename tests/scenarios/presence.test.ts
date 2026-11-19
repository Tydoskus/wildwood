import { describe, expect, it } from "vitest";
import { ScheduleAt } from "spacetimedb";
import { gameWorld, playAs, type GameTab } from "./harness/game";
import { scenarioWorld } from "./harness/server";
import type { ScenarioPlayer, ScenarioWorld } from "./harness/server";
import { replayRemoteMotion, type MotionDelivery } from "../../scripts/profiling/remote-motion-trace";

/** Where `who` is drawn on Ann's screen, or null when Ann does not see them. */
function seen(tab: GameTab, who: ScenarioPlayer) {
  const found = tab.coop.remotePlayers().find((other: { id: string }) => other.id === who.hex);
  return found ? { x: found.x, y: found.y } : null;
}

/** A player walking in a straight line, sending their movement ten times a second as a client does. */
function walker(who: ScenarioPlayer, start: { x: number; y: number }, speed: number) {
  let x = start.x, sequence = 1, tick = 1;
  return {
    get x() { return x; },
    step(ms: number, vx = speed) {
      x += vx * ms / 1000;
      tick += Math.round(ms * 60 / 1000);
      who.call("updateMovementState", { x, y: start.y, vx, vy: 0, simulationTick: tick, motionEpoch: 1, sequence: sequence++ });
    },
  };
}

/**
 * Ann's frames while Moss walks (or stands, `moving` false). The server publishes as it does live;
 * `held(frame)` stalls Ann's network that frame, and what it held back then arrives at once.
 */
async function watchWalk(world: ScenarioWorld, tab: GameTab, moss: ScenarioPlayer, walk: ReturnType<typeof walker>, frames: number,
  held: (frame: number) => boolean = () => false, moving = true) {
  const path: ({ x: number; y: number } | null)[] = [];
  for (let frame = 0; frame < frames; frame++) {
    tab.connection()!.fake.holdRows(held(frame));
    if (frame % 2 === 0) walk.step(100, moving ? 200 : 0);
    await tab.play(50);
    world.runDue();
    path.push(seen(tab, moss));
  }
  tab.connection()!.fake.holdRows(false);
  return path;
}

describe("seeing other players", () => {
  it("two players with the eye on see each other; the eye off hides them, and turning it back on waits five seconds", async () => {
    const world = gameWorld();
    const moss = world.join("Moss");
    const tab = await playAs(world, "Ann");
    const ann = tab.network.players.get("Ann")!;
    const start = { x: world.db.player.identity.find(moss.identity).x, y: world.db.player.identity.find(moss.identity).y };
    const walk = walker(moss, start, 200);

    // Only Moss has the eye on: Ann sees no one.
    moss.call("setMultiplayerEnabled", { enabled: true });
    await watchWalk(world, tab, moss, walk, 20);
    expect(seen(tab, moss)).toBeNull();

    // Ann turns hers on: now they see each other.
    tab.tap("playerVisibilityToggle");
    await watchWalk(world, tab, moss, walk, 40);
    expect(world.db.player.identity.find(ann.identity).isVisible).toBe(true);
    expect(seen(tab, moss)).not.toBeNull();

    // Moss turns the eye off and disappears from Ann's map.
    moss.call("setMultiplayerEnabled", { enabled: false });
    await watchWalk(world, tab, moss, walk, 40, () => false, false);
    expect(seen(tab, moss)).toBeNull();
    // Flicking it on and off again: switching back on within five seconds of the last time is refused.
    moss.call("setMultiplayerEnabled", { enabled: true });
    moss.call("setMultiplayerEnabled", { enabled: false });
    expect(moss.refusal("setMultiplayerEnabled", { enabled: true })).not.toBeNull();
    await tab.play(5_000, 500);
    expect(moss.refusal("setMultiplayerEnabled", { enabled: true })).toBeNull();

    // Ann's own eye: off at once, and the button waits five seconds before it can turn on again.
    tab.tap("playerVisibilityToggle");
    await tab.play(200);
    expect(world.db.player.identity.find(ann.identity).isVisible).toBe(false);
    expect((tab.element("playerVisibilityToggle") as HTMLButtonElement).disabled).toBe(true);
    await tab.play(5_000, 500);
    expect((tab.element("playerVisibilityToggle") as HTMLButtonElement).disabled).toBe(false);
  }, 60_000);

  it("the eye's choice survives a reload; idle and a full-screen window stop you seeing others; eye off, you are seen only standing still", async () => {
    const world = gameWorld();
    const moss = world.join("Moss");
    moss.call("setMultiplayerEnabled", { enabled: true });
    let tab = await playAs(world, "Ann");
    const ann = tab.network.players.get("Ann")!;
    const visible = () => Boolean(world.db.player.identity.find(ann.identity)?.isVisible);
    const seesMoss = async () => { await tab.play(1_000); world.runDue(); await tab.play(500); return seen(tab, moss) !== null; };
    tab.tap("playerVisibilityToggle");
    expect(await seesMoss()).toBe(true);

    // A reload keeps the eye on.
    tab = await tab.reload();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    expect(await tab.until(visible, 10_000)).toBe(true);
    expect(await seesMoss()).toBe(true);

    // A full-screen window held open stops Ann seeing others; closing it brings them back.
    tab.tap("chatSizeToggle");
    expect(await seesMoss()).toBe(false);
    tab.tap("chatBackBtn");
    expect(await seesMoss()).toBe(true);

    // A minute idle: Ann stops live motion-frame interest (zero tick load) while still seeing standing players and staying seen; walking resumes live motion.
    await tab.play(70_000, 1_000);
    expect(world.db.playerMotionInterest.identity.find(ann.identity)?.networkIds ?? []).toEqual([]);
    expect(await seesMoss()).toBe(true);
    expect(visible()).toBe(true);
    await tab.hold("KeyD", 500);
    expect(await seesMoss()).toBe(true);
    expect(world.db.playerMotionInterest.identity.find(ann.identity)?.networkIds.length ?? 0).toBeGreaterThan(0);

    // Eye off: hidden while walking, seen again after half a minute standing still, hidden when she walks on.
    await tab.play(5_000, 500);
    tab.tap("playerVisibilityToggle");
    await tab.hold("KeyD", 500);
    expect(visible()).toBe(false);
    expect(await seesMoss()).toBe(false);
    await tab.play(31_000, 500);
    expect(visible()).toBe(true);
    await tab.hold("KeyD", 500);
    await tab.play(200);
    expect(visible()).toBe(false);

    // A reload keeps the eye off.
    tab = await tab.reload();
    expect(await tab.until(tab.playing, 20_000)).toBe(true);
    await tab.hold("KeyD", 500);
    expect(await seesMoss()).toBe(false);
    expect(visible()).toBe(false);
  }, 90_000);

  it("another player walks smoothly and never jumps, whether his updates come steadily, stall and burst, or jitter", async () => {
    const world = gameWorld();
    const moss = world.join("Moss");
    moss.call("setMultiplayerEnabled", { enabled: true });
    const tab = await playAs(world, "Ann");
    tab.tap("playerVisibilityToggle");
    const start = { x: world.db.player.identity.find(moss.identity).x, y: world.db.player.identity.find(moss.identity).y };
    const walk = walker(moss, start, 200);
    await watchWalk(world, tab, moss, walk, 40);
    expect(seen(tab, moss)).not.toBeNull();

    // Steady, then a two-second stall that ends in a burst, then jittery delivery, then Moss stops.
    const jitter = [0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0];
    const path = [
      ...await watchWalk(world, tab, moss, walk, 40),
      ...await watchWalk(world, tab, moss, walk, 40, frame => frame < 39),
      ...await watchWalk(world, tab, moss, walk, 70, frame => Boolean(jitter[frame % jitter.length])),
      ...await watchWalk(world, tab, moss, walk, 60, () => false, false),
    ];
    expect(path.every(Boolean)).toBe(true);
    const xs = path.map(point => point!.x);
    // At 20 frames a second Moss covers 10 px a frame; nothing on screen may move much faster.
    // Going backwards is at most the small settle onto where he stopped (about 6 px after this run's stall and jitter).
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(Math.max(...steps)).toBeLessThan(15);
    expect(Math.min(...steps)).toBeGreaterThan(-10);
    expect(path.every(point => Math.abs(point!.y - start.y) < 1)).toBe(true);
    // Once he has stopped, Ann sees him where he stands.
    expect(Math.abs(xs.at(-1)! - walk.x)).toBeLessThan(5);
  }, 60_000);

  it("an autofarming player is played from their plan, walking at their own speed, and a new plan is walked to, never jumped", async () => {
    const world = gameWorld();
    const moss = world.join("Moss");
    moss.call("setMultiplayerEnabled", { enabled: true });
    const tab = await playAs(world, "Ann");
    tab.tap("playerVisibilityToggle");
    await tab.play(1_000);
    world.runDue();
    const speed = world.db.player.identity.find(moss.identity).speed;
    // Moss turns on autofarm: he sends what he farms, not where he walks.
    moss.call("setAutoFarmPuppet", { group: "stat:damage", camp: "" });
    const frames = async (count: number) => {
      const path: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        await tab.play(50);
        if (i % 20 === 0) world.runDue();
        const where = seen(tab, moss);
        if (where) path.push({ ...where });
      }
      return path;
    };
    const largestStep = (path: { x: number; y: number }[]) => Math.max(...path.slice(1).map((point, i) => Math.hypot(point.x - path[i].x, point.y - path[i].y)));
    const farming = await frames(100);
    expect(farming.length).toBeGreaterThan(90);
    expect(Math.hypot(farming.at(-1)!.x - farming[0].x, farming.at(-1)!.y - farming[0].y)).toBeGreaterThan(20);
    // A frame is 50 ms of walking at his own speed.
    expect(largestStep(farming)).toBeLessThanOrEqual(speed * .05 + 1);
    // A new plan a while later re-plans from where the puppet stands, and he walks there.
    await tab.play(10_000, 500);
    const before = seen(tab, moss)!;
    moss.call("setAutoFarmPuppet", { group: "stat:health", camp: "" });
    const replanned = [{ ...before }, ...await frames(200)];
    expect(largestStep(replanned)).toBeLessThanOrEqual(speed * .05 + 1);
    // He stops farming: he is handed back to his movement, where he stands.
    moss.call("setAutoFarmPuppet", { group: "", camp: "" });
    await frames(20);
    expect(world.db.playerAutoFarmPuppet.identity.find(moss.identity)).toBeNull();
  }, 60_000);

  it("the server publishes map frames only while two or more players are visible, clears the map when it stops, and the online count catches up each minute", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann"), moss = world.join("Moss");
    // The newest frame the map's players have, as [map, players in it].
    const frames = () => [...world.db.playerMapFrame.iter()]
      .sort((a, b) => Number(b.emittedAt.microsSinceUnixEpoch - a.emittedAt.microsSinceUnixEpoch)).slice(0, 1).map(row => [row.mapId, row.playerCount]);
    const armed = () => Number(world.db.mapFrameSchedule.count());
    const tick = () => { world.advance(1_000); world.runDue(); };

    // One visible player has no one to be seen by: nothing runs.
    moss.call("setMultiplayerEnabled", { enabled: true });
    tick(); tick();
    expect(frames()).toEqual([]);
    expect(armed()).toBe(0);
    // Two: a frame a second with both of them.
    ann.call("setMultiplayerEnabled", { enabled: true });
    tick();
    const map = world.db.player.identity.find(ann.identity).mapId;
    expect(frames()).toEqual([[map, 2]]);
    expect(armed()).toBe(1);
    // Back to one: a last frame clears the other player from every minimap, then the publisher stops.
    moss.call("setMultiplayerEnabled", { enabled: false });
    tick();
    expect(frames()).toEqual([[map, 1]]);
    const cleared = world.db.playerMapFrame.count();
    tick(); tick();
    expect(world.db.playerMapFrame.count()).toBe(cleared);
    expect(armed()).toBe(0);

    // A schedule row the host left long past due is replaced the next time someone needs frames.
    world.setup(ctx => ctx.db.mapFrameSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(BigInt(world.now() - 52 * 60_000) * 1000n) }));
    world.advance(5_000);
    moss.call("setMultiplayerEnabled", { enabled: true });
    const rows = [...world.db.mapFrameSchedule.iter()];
    expect(rows).toHaveLength(1);
    expect(Number((rows[0].scheduledAt.value as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch / 1000n)).toBeGreaterThan(world.now());

    // The online count is the maintenance tick's: a disconnect shows on the next one.
    world.advance(60_000); world.runDue();
    const online = () => world.db.worldStatus.id.find(0)?.onlinePlayers;
    const before = online();
    moss.disconnect();
    expect(online()).toBe(before);
    world.advance(60_000); world.runDue();
    expect(online()).toBe(before - 1);
  });

  // The receiver's interpolation replayed on the real code against recorded publication patterns.
  for (const fps of [30, 60, 144]) {
    it.each<MotionDelivery>(["steady", "jitter", "burst", "higher-latency"])(`a straight walk stays exact through %s delivery at ${fps} FPS`, delivery => {
      const result = replayRemoteMotion("straight", delivery, fps);
      expect(result.positionRMSE).toBeLessThan(.01);
      expect(result.maxCorrection).toBeLessThan(.01);
      expect(result.maxPacketJump).toBeLessThan(.01);
    });
    it.each<MotionDelivery>(["steady", "jitter", "burst"])(`turns between published samples stay close and never jump through %s delivery at ${fps} FPS`, delivery => {
      const result = replayRemoteMotion("turn", delivery, fps);
      expect(result.positionRMSE).toBeLessThan(5);
      expect(result.maxPositionError).toBeLessThan(25);
      expect(result.maxPacketJump).toBeLessThan(.02);
    });
    it(`a two-second stall recovers without a jump at ${fps} FPS`, () => {
      for (const path of ["straight", "turn", "stop"] as const) {
        const result = replayRemoteMotion(path, "stall", fps);
        expect(result.maxPacketJump).toBeLessThan(.02);
        expect(result.velocityRMSE).toBeLessThan(150);
      }
    });
  }
});
