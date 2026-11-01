import { describe, expect, it } from "vitest";
import { gameWorld, playAs } from "./harness/game";
import { effectivePlayerPowerStats, unroundedPlayerPower } from "../../shared/player-power";
import { PLAYER_SPAWN, PLAYER_SPEED } from "../../shared/rules";
import { portalUsePoint } from "../../shared/map-gateways";
import { TOWN_DOORS } from "../../shared/town";
import { createSpawnSites } from "../../src/game/world";
import { createGameBootstrap } from "../../src/game/runtime/game-bootstrap";
import { readyToPrestige } from "./harness/gear";
import { acceptedKillReports, bossPayouts, campSites, nearest, characterAt, popupAmount, seedBrowserRandom, reportedKills, sendQueuedKills, startReflectOnly, tapSwitch, lastSentPosition, enemyIndex } from "./harness/combat";

const distanceTo = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("combat in the booted game", { timeout: 60_000 }, () => {
  it("a regular kill lands on the attack timeline, is claimed once, paid by the server and shown as paid", async () => {
    const world = gameWorld();
    // Ann stands in throwing range of the Spitter nearest the Forest start.
    const spitter = nearest(campSites("tutorial_forest", "Thornshot Rise"), PLAYER_SPAWN);
    const ann = characterAt(world, "Ann", { x: spitter.x - 150, y: spitter.y });
    // Research raises both what a kill pays (Foraging) and what each point of damage is worth (Warcraft).
    const research = { warcraft: 5, foraging: 5 };
    ann.patch("playerResearch", research);
    const before = ann.progress()!;
    const tab = await playAs(world, "Ann");

    // Auto-attack throws on its own; the first Spitter falls to the fifth throw.
    const started = Date.now();
    expect(await tab.until(() => popupAmount(tab) !== null, 10_000, 20)).toBe(true);
    const killedAfter = (Date.now() - started) / 1000;
    expect(killedAfter).toBeGreaterThanOrEqual(4 * before.attackRate);
    expect(killedAfter).toBeLessThan(4 * before.attackRate + .5);

    // The tab sends what it queued: one Spitter, and the server pays it.
    await sendQueuedKills(tab);
    expect(reportedKills(tab)).toEqual({ Spitter: 1 });
    const after = ann.progress()!;
    expect(after.damage).toBeGreaterThan(before.damage);
    // The popup showed exactly what the paid stat is worth in play.
    const worth = effectivePlayerPowerStats(after, research).damage - effectivePlayerPowerStats(before, research).damage;
    expect(worth).toBeGreaterThan(after.damage - before.damage);
    expect(Math.abs(popupAmount(tab)! - worth)).toBeLessThanOrEqual(.005 + 1e-9);
  });

  it("a boss defeat pays once and its portal reveal plays once: not again on a replayed report or a reload onto the dead boss", async () => {
    const world = gameWorld();
    const { frostclaw } = createGameBootstrap().bosses;
    // Ann, strong enough to kill Frostclaw in a few hits, stands below it on the Snowlands.
    const ann = characterAt(world, "Ann", { mapId: "intermediate_snowlands", x: frostclaw.x,
      y: frostclaw.y + (frostclaw.hitboxOffsetY ?? 0) + (frostclaw.ry ?? frostclaw.r) + 60 });
    ann.patch("playerProgress", { damage: frostclaw.maxHp / 5, maxHp: 1e6, desertUnlocked: true, snowlandsUnlocked: true, bossRewardClaims: 3 });
    const before = bossPayouts(world, ann);
    const tab = await playAs(world, "Ann");

    expect(await tab.until(() => acceptedKillReports(tab).some(report => report.enemies.some(kill => kill.enemy === "boss")), 30_000)).toBe(true);
    await tab.play(500);
    const paid = bossPayouts(world, ann);
    expect(paid.gold).toBeGreaterThan(before.gold);
    expect(paid.mastery).toBeGreaterThan(before.mastery);
    expect(paid.claims).not.toBe(before.claims);
    expect(ann.progress()!.lavaUnlocked).toBe(true);
    // The way on is revealed, and the server remembers it was seen.
    expect(await tab.until(() => tab.shown("cutsceneOverlay"), 5_000)).toBe(true);
    expect(await tab.until(() => !tab.shown("cutsceneOverlay"), 30_000)).toBe(true);
    expect(ann.row("playerCutsceneHistory")?.seenMask).toBeGreaterThan(0);

    // The same packet again, and a fresh claim of the same defeat, pay nothing more.
    const report = acceptedKillReports(tab).find(sent => sent.enemies.some(kill => kill.enemy === "boss"))! as Record<string, any>;
    const reducers = tab.connection()!.reducers as unknown as Record<string, (args: unknown) => Promise<void>>;
    await reducers.reportEnemyDefeats(report).catch(() => {});
    await reducers.reportEnemyDefeats({ ...report, sequence: report.sequence + 1n, simulatedMillis: 5_000 }).catch(() => {});
    expect(bossPayouts(world, ann)).toEqual(paid);

    // A reload finds the boss dead and claims nothing more.
    const again = await tab.reload();
    expect(await again.until(again.playing, 20_000)).toBe(true);
    let revealedAgain = false;
    for (let waited = 0; waited < 10_000; waited += 250) { await again.play(250); revealedAgain ||= again.shown("cutsceneOverlay"); }
    expect(revealedAgain).toBe(false);
    expect(acceptedKillReports(again).filter(sent => sent.enemies.some(kill => kill.enemy === "boss"))).toEqual([]);
    expect(bossPayouts(world, ann)).toEqual(paid);
  });

  it("walking through a portal lands on the next map: behind the fade while its art first loads, then straight on, still walking", async () => {
    const world = gameWorld();
    const { mapConfig } = createGameBootstrap();
    const toDesert = portalUsePoint(mapConfig.tutorial_forest.portal as never);
    const ann = characterAt(world, "Ann", { x: toDesert.x - 150, y: toDesert.y });
    ann.patch("playerProgress", { desertUnlocked: true, bossRewardClaims: 1 });
    const tab = await playAs(world, "Ann");
    // With others visible, her position reaches the server as she moves.
    if (!ann.row("playerMultiplayerPreference")?.enabled) tab.tap("playerVisibilityToggle");
    await tab.play(500);

    // Into the Forest's portal: the Desert's art has never loaded, so the crossing waits behind the fade.
    tab.key("KeyD");
    let faded = false;
    expect(await tab.until(() => { faded ||= tab.shown("sceneFade"); return ann.row("player")?.mapId === "beginner_desert"; }, 5_000, 20)).toBe(true);
    tab.key("KeyD", "keyup");
    expect(await tab.until(() => { faded ||= tab.shown("sceneFade"); return faded && !tab.shown("sceneFade"); }, 5_000, 20)).toBe(true);
    await tab.play(500);

    // Back up into the Desert's portal home: art loaded, so she is on the Forest at once, no fade, still walking.
    tab.key("KeyW");
    faded = false;
    expect(await tab.until(() => { faded ||= tab.shown("sceneFade"); return ann.row("player")?.mapId === "tutorial_forest"; }, 3_000, 20)).toBe(true);
    // The next word from her, a moment later, is on the Forest and walking.
    expect(await tab.until(() => { faded ||= tab.shown("sceneFade"); const row = ann.row("player"); return row?.mapId === "tutorial_forest" && row.moving; }, 300, 20)).toBe(true);
    tab.key("KeyW", "keyup");
    expect(faded).toBe(false);
    expect(distanceTo(ann.row("player"), mapConfig.tutorial_forest.portal as never)).toBeLessThan(300);
  });

  it("a refused portal leaves the player on their map, trying again only once they step out and back in", async () => {
    const world = gameWorld();
    const { mapConfig } = createGameBootstrap();
    const toDesert = portalUsePoint(mapConfig.tutorial_forest.portal as never);
    const ann = characterAt(world, "Ann", { x: toDesert.x - 150, y: toDesert.y });
    ann.patch("playerProgress", { desertUnlocked: true, bossRewardClaims: 1 });
    let refuse = false;
    const tab = await playAs(world, "Ann", { client: { refuse: reducer => refuse && reducer === "changeMap" ? "Move closer to the portal." : null } });
    if (!ann.row("playerMultiplayerPreference")?.enabled) tab.tap("playerVisibilityToggle");
    await tab.play(500);
    const attempts = () => tab.connection()!.fake.calls.filter(call => call.reducer === "changeMap").length;

    // The server refuses the crossing.
    refuse = true;
    await tab.hold("KeyD", 1_500);
    await tab.play(3_000);
    expect(attempts()).toBe(1);
    expect(ann.row("player")?.mapId).toBe("tutorial_forest");
    // Stepping out and back in is a fresh try.
    await tab.hold("KeyA", 600);
    await tab.hold("KeyD", 900);
    await tab.play(1_000);
    const tried = attempts();
    expect(tried).toBeGreaterThan(1);
    await tab.play(3_000);
    expect(attempts()).toBe(tried);
    expect(ann.row("player")?.mapId).toBe("tutorial_forest");

    // Refusals leave her free to walk on.
    const before = { ...ann.row("player") };
    await tab.hold("KeyS", 1_000);
    await tab.play(500);
    expect(ann.row("player")!.y).toBeGreaterThan(before.y + 50);
  });

  it("kills still queued go to the server, and are paid for the map they were made on, when the player leaves for the Town", async () => {
    const world = gameWorld();
    const spitter = nearest(campSites("tutorial_forest", "Thornshot Rise"), PLAYER_SPAWN);
    const ann = characterAt(world, "Ann", { x: spitter.x - 150, y: spitter.y });
    const before = ann.progress()!;
    const tab = await playAs(world, "Ann");
    expect(await tab.until(() => popupAmount(tab) !== null, 10_000, 20)).toBe(true);
    // Long before the minute's report is due, she heads for the Town.
    expect(acceptedKillReports(tab)).toEqual([]);
    tab.tap("townBtn");
    expect(await tab.until(() => ann.row("player")?.mapId === "town", 10_000)).toBe(true);
    await tab.play(1_000);
    const reports = acceptedKillReports(tab);
    expect(reports.map(report => report.mapId)).toEqual(["tutorial_forest"]);
    expect(reportedKills(tab).Spitter).toBeGreaterThanOrEqual(1);
    expect(ann.progress()!.damage).toBeGreaterThan(before.damage);
  });

  it("kills still queued when she prestiges are paid to the run that made them, and none is sent after to be refused", async () => {
    const world = gameWorld();
    const camp = campSites("beginner_desert", "Sunbaked Burrow");
    const raider = nearest(camp, { x: camp[0].x, y: camp[0].y });
    const ann = characterAt(world, "Ann", { x: raider.x - 150, y: raider.y, mapId: "beginner_desert" });
    readyToPrestige(world, ann);
    ann.patch("playerProgress", { desertUnlocked: true, damage: 1e6, maxHp: 1e6 });
    const tab = await playAs(world, "Ann");
    expect(await tab.until(() => popupAmount(tab) !== null, 10_000, 20)).toBe(true);
    expect(acceptedKillReports(tab)).toEqual([]);
    expect(await tab.coop.prestigeAccount()).toMatchObject({ ok: true });
    expect(ann.row("player")?.mapId).toBe("tutorial_forest");
    await sendQueuedKills(tab);
    await tab.play(2_000);
    const reports = tab.connection()!.fake.calls.filter(call => /^report(AutoFarm)?EnemyDefeats$/.test(call.reducer));
    expect(reports.filter(call => call.error)).toEqual([]);
    expect(acceptedKillReports(tab).map(report => report.mapId)).toContain("beginner_desert");
  });

  it("the profile shows the power the game plays with; switching research off lowers it, and no switch moves during a challenge", async () => {
    const world = gameWorld();
    const ann = characterAt(world, "Ann", { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y });
    ann.patch("playerResearch", { warcraft: 10, vitality: 10 });
    ann.patch("playerProgress", { damage: 50, maxHp: 400 });
    const tab = await playAs(world, "Ann");
    const shown = () => ({ hud: Number(tab.element("playerPower").textContent), profile: Number(tab.element("playerProfilePower").textContent) });
    const powerOf = (research: Record<string, number>) => Math.round(unroundedPlayerPower(effectivePlayerPowerStats(ann.progress()!, research)));
    tab.tap("playerHudProfileIcon");
    await tab.play(500);
    // The panel, the HUD and the server agree, research included.
    expect(shown()).toEqual({ hud: powerOf({ warcraft: 10, vitality: 10 }), profile: powerOf({ warcraft: 10, vitality: 10 }) });
    expect(ann.row("player")!.power).toBe(shown().profile);

    // Research off: everything shown drops to the bare stats, and the server keeps the choice.
    tab.tap("profileBonusesTab");
    await tab.play(300);
    tapSwitch(tab, "bonusToggle-research");
    await tab.play(1_000);
    expect(shown()).toEqual({ hud: powerOf({}), profile: powerOf({}) });
    expect(ann.row("playerBonusToggle")?.off).toContain("research.warcraft");
    tapSwitch(tab, "bonusToggle-research");
    await tab.play(1_000);
    expect(shown().profile).toBe(powerOf({ warcraft: 10, vitality: 10 }));

    // In a Reflect Only run the switches hold still.
    startReflectOnly(world, ann, 0);
    tab.connection()!.fake.deliver();
    await tab.play(500);
    expect(() => tapSwitch(tab, "bonusToggle-research")).toThrow();
    expect(ann.row("playerBonusToggle")?.off ?? "").not.toContain("research.warcraft");
  });

  it("kills made while the connection is down are kept through a reload and paid exactly once", async () => {
    const world = gameWorld();
    const spitter = nearest(campSites("tutorial_forest", "Thornshot Rise"), PLAYER_SPAWN);
    const ann = characterAt(world, "Ann", { x: spitter.x - 150, y: spitter.y });
    const before = ann.progress()!.damage;
    const tab = await playAs(world, "Ann");
    expect(await tab.until(() => popupAmount(tab) !== null, 10_000, 20)).toBe(true);
    const perKill = popupAmount(tab)!;
    // The network goes before the minute's report: the kill waits in the browser.
    tab.connection()!.fake.drop(new Error("network lost"));
    await tab.play(2_000);
    expect(ann.progress()!.damage).toBe(before);

    // The page is reloaded; on the way back in, the kill is reported and paid.
    const again = await tab.reload();
    expect(await again.until(again.playing, 20_000)).toBe(true);
    await sendQueuedKills(again);
    const paid = ann.progress()!.damage - before;
    expect(paid).toBeCloseTo(perKill * (reportedKills(again).Spitter ?? 0), 6);
    expect(reportedKills(again).Spitter).toBeGreaterThanOrEqual(1);

    // Another reload pays nothing more for it.
    const third = await again.reload();
    expect(await third.until(third.playing, 20_000)).toBe(true);
    await sendQueuedKills(third);
    expect(reportedKills(third)).toEqual({});
    expect(ann.progress()!.damage - before).toBeCloseTo(paid, 6);
  });

  it("walking the Town: a door takes her in once the server agrees, the room's walls hold her, its doorway lets her out; a refused door leaves her outside", async () => {
    const world = gameWorld();
    const door = TOWN_DOORS[2];
    const ann = characterAt(world, "Ann", { mapId: "town", x: door.outside.x, y: door.outside.y + 60 });
    let refuseDoors = false;
    const tab = await playAs(world, "Ann", { client: { refuse: reducer => refuseDoors && reducer === "useTownDoor" ? "That door is too far away." : null } });
    if (!ann.row("playerMultiplayerPreference")?.enabled) tab.tap("playerVisibilityToggle");
    await tab.play(500);
    const at = () => ann.row("player")!;
    const inRoom = () => at().x >= door.room.left && at().x <= door.room.right && at().y >= door.room.top && at().y <= door.room.bottom;

    // Up to the door: in.
    await tab.hold("KeyW", 1_500);
    await tab.play(500);
    expect(inRoom()).toBe(true);
    // Into the room's west wall: it stops her inside.
    await tab.hold("KeyA", 4_000);
    await tab.play(500);
    expect(inRoom()).toBe(true);
    expect(at().x).toBeGreaterThan(door.room.left);
    // Out through the doorway: back on the street by the door.
    await tab.hold("KeyD", 280_000 / PLAYER_SPEED);
    await tab.hold("KeyS", 2_000);
    await tab.play(500);
    expect(inRoom()).toBe(false);
    expect(Math.hypot(at().x - door.outside.x, at().y - door.outside.y)).toBeLessThan(200);

    // The server refuses the door this time: she stays outside, free to walk off.
    refuseDoors = true;
    await tab.hold("KeyS", 500);
    await tab.hold("KeyW", 1_500);
    await tab.play(500);
    expect(inRoom()).toBe(false);
    const outside = { ...at() };
    await tab.hold("KeyS", 1_000);
    await tab.play(300);
    // Where her own page says she is, and where the server has her: out on the street, walking away.
    const sent = lastSentPosition(tab)!;
    expect(sent.x >= door.room.left && sent.x <= door.room.right && sent.y >= door.room.top && sent.y <= door.room.bottom).toBe(false);
    expect(sent.y).toBeGreaterThan(outside.y + 50);
    expect(at().y).toBeGreaterThan(outside.y + 50);
  });

  it("every house door in the Town takes her in when she walks up to it", async () => {
    for (const door of TOWN_DOORS) {
      const world = gameWorld();
      const ann = characterAt(world, "Ann", { mapId: "town", x: door.outside.x, y: door.outside.y + 60 });
      const tab = await playAs(world, "Ann");
      await tab.play(300);
      await tab.hold("KeyW", 1_500);
      await tab.play(500);
      const at = ann.row("player")!;
      expect(at.x >= door.room.left && at.x <= door.room.right && at.y >= door.room.top && at.y <= door.room.bottom, `door ${door.index}`).toBe(true);
    }
  });

  it("movement reaches the server sparsely, and the server takes each packet where the player says they are", async () => {
    const world = gameWorld();
    const ann = characterAt(world, "Ann", { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y });
    // Move Speed research: her speed differs from the base, so the server must learn it.
    ann.patch("playerResearch", { moveSpeed: 5 });
    const tab = await playAs(world, "Ann");
    const moves = () => tab.connection()!.fake.calls.filter(call => call.reducer === "updateMovementState");
    const corrected: string[] = [];
    world.onCommit(commit => {
      if (commit.reducer !== "updateMovementState" || commit.error) return;
      const sent = commit.args as { x: number; y: number }, row = ann.row("player")!;
      if (Math.hypot(row.x - sent.x, row.y - sent.y) > .01) corrected.push(`${sent.x},${sent.y} -> ${row.x},${row.y}`);
    });
    if (!ann.row("playerMultiplayerPreference")?.enabled) tab.tap("playerVisibilityToggle");
    await tab.play(1_000);

    // Standing still sends nothing.
    let count = moves().length;
    await tab.play(3_000);
    expect(moves().length).toBe(count);
    // Six seconds of walking with others visible: the start, the stop, and a heartbeat every two seconds between.
    await tab.hold("KeyD", 6_000);
    await tab.play(500);
    const walked = moves().length - count;
    expect(walked).toBeGreaterThanOrEqual(3);
    expect(walked).toBeLessThanOrEqual(6 / 2 + 3);
    // With others hidden, the same walk sends no more than its halt.
    tab.tap("playerVisibilityToggle");
    await tab.play(1_000);
    count = moves().length;
    await tab.hold("KeyA", 6_000);
    await tab.play(500);
    expect(moves().length - count).toBeLessThanOrEqual(2);

    // Every packet was taken as sent, none corrected, and the server has her where she stopped.
    expect(moves().every(call => call.error === null)).toBe(true);
    expect(corrected).toEqual([]);
    expect(ann.row("player")).toMatchObject({ ...lastSentPosition(tab), moving: false });
    // Faster with Move Speed research, and the server holds her to that speed, not the base.
    expect(ann.row("player")!.speed).toBeGreaterThan(PLAYER_SPEED);
  });

  it("dying shows the death screen, and three seconds later she is back at the Forest's start with full health", async () => {
    const world = gameWorld();
    const bramble = campSites("tutorial_forest", "Ember Fen")[0];
    const ann = characterAt(world, "Ann", { x: bramble.x + 120, y: bramble.y });
    // Nothing she throws hurts, and the Brambles hit hard.
    ann.patch("playerProgress", { damage: 0 });
    const tab = await playAs(world, "Ann");
    expect(await tab.until(() => tab.shown("gameOver"), 30_000)).toBe(true);
    const diedAt = Date.now();
    expect(tab.connection()!.fake.calls.filter(call => call.reducer === "recordPlayerDeath").length).toBe(1);
    // The screen stays until the countdown runs out, then she is playing again at the start.
    expect(await tab.until(() => !tab.shown("gameOver"), 10_000, 20)).toBe(true);
    const shownFor = (Date.now() - diedAt) / 1000;
    expect(shownFor).toBeGreaterThanOrEqual(3);
    expect(shownFor).toBeLessThan(5);
    await tab.play(500);
    expect(ann.row("player")).toMatchObject({ mapId: "tutorial_forest" });
    expect(Math.hypot(ann.row("player")!.x - PLAYER_SPAWN.x, ann.row("player")!.y - PLAYER_SPAWN.y)).toBeLessThan(50);
    const [hp, maxHp] = (tab.element("hpText").textContent ?? "").match(/[\d.]+/g)!.map(Number);
    expect(hp).toBe(maxHp);
  });

  it("stat gains add up on one card to exactly what the server paid, and none show with Stat Gain Popups off", async () => {
    const world = gameWorld();
    // In the middle of the Desert's archer camp, which comes as one; every one of them pays Max Health.
    const camp = createSpawnSites({ x: 0, y: 0 }, "beginner_desert").filter(site => site.groupAggro);
    const centre = { x: camp.reduce((sum, site) => sum + site.x, 0) / camp.length, y: camp.reduce((sum, site) => sum + site.y, 0) / camp.length };
    const ann = characterAt(world, "Ann", { mapId: "beginner_desert", ...centre });
    // One throw kills; research makes each gain a fraction the card's two decimals would round.
    const research = { vitality: 7, foraging: 1 };
    ann.patch("playerResearch", research);
    ann.patch("playerProgress", { damage: 1e5, maxHp: 1e7, desertUnlocked: true, bossRewardClaims: 1 });
    const before = ann.progress()!;
    const tab = await playAs(world, "Ann");
    // The first few kills, while the card's total stays under a thousand.
    await tab.until(() => (popupAmount(tab) ?? 0) > 300, 10_000, 20);
    const shown = popupAmount(tab)!;
    // Sent straight away: the report holds exactly the kills the card counts.
    await sendQueuedKills(tab);
    const kills = Object.values(reportedKills(tab)).reduce((sum, count) => sum + count, 0);
    expect(kills).toBeGreaterThan(1);
    const after = ann.progress()!;
    const worth = effectivePlayerPowerStats(after, research).maxHp - effectivePlayerPowerStats(before, research).maxHp;
    expect(Math.abs(shown - worth)).toBeLessThanOrEqual(.005 + 1e-9);

    // Stat Gain Popups off in Settings: the next kills show nothing.
    tab.tap("settingsBtn");
    await tab.play(300);
    tab.tap("statPopupsToggle");
    tab.tap("settingsBtn");
    await tab.play(20_000);
    await sendQueuedKills(tab);
    expect(Object.values(reportedKills(tab)).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(kills);
    expect(popupAmount(tab)).toBeNull();
  });

  it("the fight runs on the game's own clock: the first kill lands at the same moment at 144, 60, 30 and 9 frames a second, and a hidden tab fights on", async () => {
    const boot = async () => {
      const world = gameWorld();
      const spitter = nearest(campSites("tutorial_forest", "Thornshot Rise"), PLAYER_SPAWN);
      characterAt(world, "Ann", { x: spitter.x - 150, y: spitter.y });
      return playAs(world, "Ann");
    };
    const firstKill = async (frameMs: number) => {
      const tab = await boot();
      const started = Date.now();
      expect(await tab.until(() => popupAmount(tab) !== null, 10_000, frameMs)).toBe(true);
      return (Date.now() - started) / 1000;
    };
    const at60 = await firstKill(1000 / 60);
    for (const frameMs of [1000 / 144, 1000 / 30, 1000 / 9]) expect(Math.abs(await firstKill(frameMs) - at60), `${frameMs} ms frames`).toBeLessThanOrEqual(frameMs / 1000 + 1 / 60);
    // Hidden just past the moment it would kill: the kill is made all the same.
    const tab = await boot();
    tab.setHidden(true);
    await tab.play(at60 * 1000 + 300);
    tab.setHidden(false);
    await sendQueuedKills(tab);
    expect(reportedKills(tab).Spitter).toBe(1);
  });

  it("the Enemy Index shows each enemy's reward as a kill pays it, research included", async () => {
    const world = gameWorld();
    const spitter = nearest(campSites("tutorial_forest", "Thornshot Rise"), PLAYER_SPAWN);
    const ann = characterAt(world, "Ann", { x: spitter.x - 150, y: spitter.y });
    ann.patch("playerResearch", { warcraft: 5, foraging: 5 });
    const tab = await playAs(world, "Ann");
    tab.tap("minimapButton");
    await tab.play(300);
    const listed = enemyIndex(tab).get("Spitter")!;
    tab.tap("mapGuideBack");
    expect(await tab.until(() => popupAmount(tab) !== null, 10_000, 20)).toBe(true);
    expect(listed[2]).toBeCloseTo(popupAmount(tab)!, 2);
  });

  it("Reflect answers the melee enemy that struck, through the game's own wiring", async () => {
    const world = gameWorld();
    // A Reflect Only run: Ann's weapon deals nothing, so only Reflect can kill.
    const bramble = campSites("tutorial_forest", "Ember Fen")[0];
    const ann = characterAt(world, "Ann", { x: bramble.x + 120, y: bramble.y });
    startReflectOnly(world, ann, 10);
    // Tough enough to stand in the camp a while.
    ann.patch("playerProgress", { maxHp: 2_000 });
    seedBrowserRandom(3);
    const maxHpBefore = ann.progress()!.maxHp;
    const tab = await playAs(world, "Ann");

    // The Brambles come for her and hit; each hit Reflect answers lands on the one that struck.
    await tab.play(20_000);
    await sendQueuedKills(tab);
    expect(reportedKills(tab).Bramble ?? 0).toBeGreaterThan(0);
    expect(ann.progress()!.maxHp).toBeGreaterThan(maxHpBefore);
  });
});
