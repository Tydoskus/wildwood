import { describe, expect, it, vi } from "vitest";
import { gameWorld, playAs } from "./harness/game";
import { chatPanel, foundGuild, guildHub, guildWindow, strongEnoughToFound } from "./harness/guild";

/** Every accepted call to a reducer, from now on. */
const guildCalls = (world: ScenarioWorld, reducer: string) => { const seen: unknown[] = []; world.onCommit(commit => { if (commit.reducer === reducer && !commit.error) seen.push(commit.args); }); return seen; };
import { scenarioWorld, type ScenarioPlayer, type ScenarioWorld } from "./harness/server";
import { AGE_BAND_ADULT, TERMS_VERSION } from "../../shared/legal";
import { GUILD_CREATION_MIN_POWER, GUILD_DAY_MICROS, GUILD_EMBLEMS, GUILD_MEMBER_LIMIT, GUILD_RANKING_LIMIT } from "../../shared/guilds";
import { guildEmblemCell, guildEmblemFor } from "../../src/ui/guild-emblems";
import { migrateGuildTags } from "../../spacetimedb/src/player-name-tags";
import { EMPTY_GUILD_HALL_LEVELS, GUILD_HALL_ARRIVAL, GUILD_HALL_DOOR, GUILD_HALL_FEET_OFFSET, GUILD_HALL_PARTS, GUILD_HALL_TABLE_SEATS, GUILD_HALL_WORLD,
  GUILD_HALL_YARD, guildHallMapId, guildHallRoom, parseGuildHallLevels, type GuildHallLevels } from "../../shared/guild-hall";
import { TOWN_MAP_ID } from "../../shared/town";
import { PLAYER_POSITION_SCALE } from "../../shared/player-motion-frame";
import { GUILD_HALL_GROUND, GUILD_HALL_INTERIOR_LEFT, guildHallBoard, guildHallDecor, guildHallFrame, guildHallRoomPicture, guildHallSeats, guildHallSolids } from "../../src/game/guild-hall";

const HOUR = 3_600_000, DAY = 24 * HOUR;
/** Back in the world on a new session, as a returning tab does. */
const enter = (player: ScenarioPlayer) => {
  if (!player.connectionId) player.connect();
  player.call("acceptTerms", { termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
  player.call("enterWorldWithTutorial", { tabId: `tab-${player.hex.slice(0, 12)}`, forceTakeover: false });
  return player;
};

vi.setConfig({ testTimeout: 60_000 });

describe("Guilds", () => {
  it("a strong enough player founds a guild from the Guild window, picks a badge, and members' tags follow joins and leaves", async () => {
    const world = gameWorld();
    const bob = world.join("Bob");
    const tab = await playAs(world, "Ann");
    const ann = tab.network.players.get("Ann")!;
    const guild = guildWindow(tab);
    await guild.open();
    // Too weak: the server refuses and nothing is made.
    await guild.create("Rose");
    expect(world.db.guild.count()).toBe(0n);
    // A filtered name is refused too.
    strongEnoughToFound(ann);
    await guild.create("Cock");
    expect(world.db.guild.count()).toBe(0n);
    await guild.create("Rose");
    const made = [...world.db.guild.iter()][0];
    expect(made).toMatchObject({ name: "Rose", members: 1 });
    expect(made.leader.toHexString()).toBe(ann.hex);
    expect(world.db.playerNameTag.identity.find(ann.identity).guildTag).toBe("Rose");
    // The President picks the turtle (badge 16).
    await guild.press("edit-badge");
    await guild.press("badge-16");
    expect(world.db.guild.id.find(made.id).emblem).toBe(16);

    // Bob joins: his tag reads Rose, and Ann sees him on her roster with the President's controls.
    bob.call("joinGuild", { guildId: made.id });
    expect(world.db.playerNameTag.identity.find(bob.identity).guildTag).toBe("Rose");
    await guild.press("refresh");
    expect(guild.has(`manage-${bob.hex}`)).toBe(true);
    // He leaves: tag gone, roster back to one.
    bob.call("leaveGuild");
    expect(world.db.playerNameTag.identity.find(bob.identity)?.guildTag ?? "").toBe("");
    await guild.press("refresh");
    expect(guild.has(`manage-${bob.hex}`)).toBe(false);
    expect(world.db.guild.id.find(made.id).members).toBe(1);

    // Ann leaves from the window: the last member out disbands it.
    await guild.press("Leave guild");
    await guild.confirm();
    expect(world.db.guild.count()).toBe(0n);
    expect(world.db.playerNameTag.identity.find(ann.identity).guildTag).toBe("");
  });

  it("founding needs the power minimum in the saved build, exactly; guests may found and join, but only from their playing session", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann"), bob = world.join("Bob");
    const weakAt = (maxHp: number) => ann.patch("playerProgress", { maxHp, damage: 0, armor: 0, regen: 0, equippedHead: "", equippedChest: "", equippedRightHand: "", equippedLeftHand: "" });
    weakAt(GUILD_CREATION_MIN_POWER - 1);
    // A live power reading does not count; the save does.
    ann.patch("player", { powerLevel: GUILD_CREATION_MIN_POWER * 2 });
    expect(ann.refusal("createGuild", { name: "Rose" })).not.toBeNull();
    expect(world.db.guild.count()).toBe(0n);
    expect(world.db.guildMember.count()).toBe(0n);
    weakAt(GUILD_CREATION_MIN_POWER);
    ann.call("createGuild", { name: "Rose" });
    const guildId = guildHub(ann).guild.id;
    // Bob, a guest, joins with no power at all.
    bob.call("joinGuild", { guildId: BigInt(guildId) });
    expect(guildHub(bob).guild.members).toHaveLength(2);
    // A closed session cannot act for him.
    bob.call("leaveGuild");
    bob.disconnect();
    expect(bob.refusal("joinGuild", { guildId: BigInt(guildId) })).not.toBeNull();
    expect(world.db.guild.id.find(BigInt(guildId)).members).toBe(1);
  });

  it("the President picks any of the 32 badges; a guild that never chose shows the one its name gives", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const guildId = foundGuild(world, ann, "Tort");
    ann.call("setGuildEmblem", { emblem: 31 });
    expect(world.db.guild.id.find(guildId).emblem).toBe(31);
    expect(ann.refusal("setGuildEmblem", { emblem: 32 })).not.toBeNull();
    expect(world.db.guild.id.find(guildId).emblem).toBe(31);
    // Every badge has its own picture; an unchosen or unknown one falls back to a first-sheet badge from the name.
    const cells = new Set(GUILD_EMBLEMS.map((_name, index) => JSON.stringify(guildEmblemCell(guildEmblemFor("Tort", index)))));
    expect(cells.size).toBe(GUILD_EMBLEMS.length);
    for (const name of ["Wolf Pack", "Turtle Power", "x", "Moonfen Mob"]) {
      expect(guildEmblemFor(name, 32)).toBe(guildEmblemFor(name));
      expect(guildEmblemFor(name)).toBeLessThan(16);
    }
    expect(guildEmblemFor("Wolf Pack")).toBe(GUILD_EMBLEMS.indexOf("wolf"));
  });

  it("a member who leaves and comes back the same week keeps their join time; joining brings this week's quest points along", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann"), bob = world.join("Bob"), cara = world.join("Cara");
    const guildId = foundGuild(world, ann, "Rose", [bob]);
    const joinedAt = world.db.guildMember.identity.find(bob.identity).joinedAt;
    world.advance(HOUR);
    bob.call("leaveGuild");
    bob.call("joinGuild", { guildId });
    expect(world.db.guildMember.identity.find(bob.identity).joinedAt).toBe(joinedAt);
    bob.call("leaveGuild");
    world.advance(7 * DAY);
    bob.call("joinGuild", { guildId });
    expect(world.db.guildMember.identity.find(bob.identity).joinedAt).not.toBe(joinedAt);

    const week = Math.floor((Math.floor(world.now() / DAY) + 3) / 7);
    world.setup(ctx => ctx.db.soloQuestWeek.insert({ identity: cara.identity, week, points: 6, lastWeek: 0, lastPoints: 0 }));
    cara.call("joinGuild", { guildId });
    expect(world.db.guildQuestWeek.key.find(`${week}:${guildId}`).points).toBe(6);
    expect(world.db.soloQuestWeek.identity.find(cara.identity).points).toBe(0);
  });

  it("the roster shows who is online (eye off too), last seen once gone, and a renamed member's new name and icon", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann"), bob = world.join("Bob");
    foundGuild(world, ann, "Rose", [bob]);
    const bobRow = world.db.guildMember.identity.find(bob.identity);
    const member = (who: typeof bob, viewer = ann) => guildHub(viewer).guild.members.find((row: any) => row.identity === who.hex);
    bob.call("setPresence", { enabled: false, shown: false });
    expect(member(bob).online).toBe(true);
    const leftAt = world.now();
    bob.disconnect();
    world.advance(HOUR);
    expect(member(bob)).toMatchObject({ online: false, lastSeenAtMs: leftAt });
    ann.call("setDisplayName", { displayName: "New Name" });
    ann.call("setProfileIcon", { profileIcon: 82 });
    enter(bob);
    expect(member(ann, bob)).toMatchObject({ name: "New Name", profileIcon: 82 });
    // A roster row saved under an old name still shows the current one.
    world.setup(ctx => ctx.db.guildMember.identity.update({ ...ctx.db.guildMember.identity.find(ann.identity), name: "Stale Name" }));
    ann.disconnect();
    expect(member(ann, bob).name).toBe("New Name");
    expect(world.db.guildMember.identity.find(bob.identity)).toEqual(bobRow);
  });

  it("leadership and removals reach only the caller's own guild, and only the President removes", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = ["Ann", "Bob", "Cara", "Dan"].map(name => world.join(name));
    const ours = foundGuild(world, ann, "Rose", [bob]);
    const theirs = foundGuild(world, cara, "Moon", [dan]);
    expect(ann.refusal("transferGuildLeadership", { identity: cara.identity })).not.toBeNull();
    expect(ann.refusal("kickGuildMember", { identity: cara.identity })).not.toBeNull();
    expect(bob.refusal("kickGuildMember", { identity: ann.identity })).not.toBeNull();
    for (const [id, leader] of [[ours, ann], [theirs, cara]] as const) {
      expect(world.db.guild.id.find(id)).toMatchObject({ members: 2 });
      expect(world.db.guild.id.find(id).leader.toHexString()).toBe(leader.hex);
    }
    // Another guild's preview is its public roster, no management data.
    const preview = JSON.parse(dan.procedure("getGuildPreview", { guildId: ours }) as string);
    expect(preview.members.map((row: any) => row.identity).sort()).toEqual([ann.hex, bob.hex].sort());
    expect(preview).not.toHaveProperty("requests");
    expect(preview).not.toHaveProperty("battles");
  });

  it("an old long guild name becomes its four-letter tag with members kept; only the developer account changes the developer tag", () => {
    const world = scenarioWorld();
    const ann = world.join("Ann");
    const guildId = foundGuild(world, ann, "TheG");
    world.setup(ctx => {
      ctx.db.guild.id.update({ ...ctx.db.guild.id.find(guildId), name: "The Guilds", nameKey: "the guilds" });
      ctx.db.guildRank.insert({ guildId, rankKey: "rank", payload: JSON.stringify({ id: String(guildId), name: "The Guilds" }) });
    });
    const member = world.db.guildMember.identity.find(ann.identity);
    world.setup(ctx => migrateGuildTags(ctx as never));
    world.setup(ctx => migrateGuildTags(ctx as never));
    expect(world.db.guild.id.find(guildId)).toMatchObject({ name: "TheG" });
    expect(world.db.guild.count()).toBe(1n);
    expect(world.db.guildMember.identity.find(ann.identity)).toEqual(member);
    expect(world.db.playerNameTag.identity.find(ann.identity).guildTag).toBe("TheG");
    expect(JSON.parse(world.db.guildRank.guildId.find(guildId).payload).name).toBe("TheG");

    expect(ann.refusal("setDeveloperNameTag", { visible: false })).not.toBeNull();
    const dev = world.join("Dev", { kind: "developer" });
    dev.call("setDeveloperNameTag", { visible: false });
    expect(world.db.playerNameTag.identity.find(dev.identity).showDevTag).toBe(false);
    dev.call("setDeveloperNameTag", { visible: true });
    expect(world.db.playerNameTag.identity.find(dev.identity).showDevTag).toBe(true);
  });

  it("a guest's guild survives linking into an account, tag and Presidency included", () => {
    const world = scenarioWorld();
    const gina = world.join("Gina");
    const guildId = foundGuild(world, gina, "Gues");
    const code = "guild-link-".padEnd(40, "x");
    gina.call("beginAccountLink", { code });
    const al = world.player("Al", "account").connect();
    al.call("claimGuestAccount", { code });
    enter(al);
    expect(guildHub(al).guild).toMatchObject({ id: String(guildId), leader: al.hex });
    expect(world.db.guildMember.identity.find(gina.identity)).toBeFalsy();
    expect(world.db.playerNameTag.identity.find(al.identity).guildTag).toBe("Gues");
  });
});

describe("Guild membership on the server", () => {
  const guildOf = (world: ScenarioWorld, player: ScenarioPlayer) => world.db.guildMember.identity.find(player.identity)?.guildId ?? null;
  const leaderOf = (world: ScenarioWorld, guildId: bigint) => world.db.guild.id.find(guildId)?.leader.toHexString() ?? null;
  const players = (world: ScenarioWorld, ...names: string[]) => names.map(name => world.join(name));

  it("the President appoints one Vice President, who may battle and change the badge but not manage members; the role does not survive leaving", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = players(world, "Ann", "Bob", "Cara", "Dan");
    const ours = foundGuild(world, ann, "Rose", [bob, cara]);
    const theirs = foundGuild(world, dan, "Moon"), third = foundGuild(world, world.join("Eve"), "Star");
    expect(bob.refusal("setGuildVicePresident", { identity: cara.identity, enabled: true })).not.toBeNull();
    expect(ann.refusal("setGuildVicePresident", { identity: dan.identity, enabled: true })).not.toBeNull();
    expect(ann.refusal("setGuildVicePresident", { identity: ann.identity, enabled: true })).not.toBeNull();
    ann.call("setGuildVicePresident", { identity: bob.identity, enabled: true });
    expect(guildHub(bob).guild.vicePresident).toBe(bob.hex);
    expect(bob.refusal("kickGuildMember", { identity: cara.identity })).not.toBeNull();
    expect(bob.refusal("transferGuildLeadership", { identity: cara.identity })).not.toBeNull();
    bob.call("setGuildEmblem", { emblem: 15 });
    expect(guildHub(ann).guild.emblem).toBe(15);
    expect(cara.refusal("setGuildEmblem", { emblem: 3 })).not.toBeNull();
    bob.call("challengeGuild", { opponentGuildId: theirs });
    expect(guildHub(ann).guild.attacksRemaining).toBe(2);
    // One at a time: appointing Cara replaces Bob, who can no longer battle.
    ann.call("setGuildVicePresident", { identity: cara.identity, enabled: true });
    expect(bob.refusal("challengeGuild", { opponentGuildId: third })).not.toBeNull();
    cara.call("challengeGuild", { opponentGuildId: third });
    ann.call("setGuildVicePresident", { identity: cara.identity, enabled: false });
    expect(guildHub(ann).guild.vicePresident).toBeNull();
    // A Vice President who leaves and comes back is a plain member.
    ann.call("setGuildVicePresident", { identity: cara.identity, enabled: true });
    cara.call("leaveGuild");
    cara.call("joinGuild", { guildId: ours });
    expect(guildHub(ann).guild.vicePresident).toBeNull();
  });

  it("leadership passes to the Vice President, else the longest-serving member; transferring or removing ends the role; the last out deletes the guild", () => {
    const world = scenarioWorld();
    const [ann, bob, cara] = players(world, "Ann", "Bob", "Cara");
    const id = foundGuild(world, ann, "Rose", [bob, cara]);
    ann.call("setGuildVicePresident", { identity: cara.identity, enabled: true });
    ann.call("leaveGuild");
    expect(leaderOf(world, id)).toBe(cara.hex);
    expect(guildHub(cara).guild.vicePresident).toBeNull();
    cara.call("setGuildVicePresident", { identity: bob.identity, enabled: true });
    cara.call("transferGuildLeadership", { identity: bob.identity });
    expect(guildHub(bob).guild).toMatchObject({ leader: bob.hex, vicePresident: null });
    bob.call("kickGuildMember", { identity: cara.identity });
    expect(guildOf(world, cara)).toBeNull();
    // Removed or gone, they may join or found again at once.
    cara.call("joinGuild", { guildId: id });
    cara.call("leaveGuild");
    foundGuild(world, cara, "Newg");
    expect(guildOf(world, cara)).not.toBe(id);
    // Without a Vice President the longest-serving member leads; the last out deletes it.
    const dan = world.join("Dan");
    dan.call("joinGuild", { guildId: id });
    world.advance(60_000);
    bob.call("leaveGuild");
    expect(leaderOf(world, id)).toBe(dan.hex);
    dan.call("leaveGuild");
    expect(world.db.guild.id.find(id)).toBeFalsy();
  });

  it("names are four letters, trimmed and unique; one guild a player; twenty members at most", () => {
    const world = scenarioWorld();
    const [ann, bob] = players(world, "Ann", "Bob");
    strongEnoughToFound(ann); strongEnoughToFound(bob);
    ann.call("createGuild", { name: "  Rose  " });
    const id = guildOf(world, ann)!;
    expect(world.db.guild.id.find(id).name).toBe("Rose");
    expect(bob.refusal("createGuild", { name: "rose" })).not.toBeNull();
    expect(bob.refusal("createGuild", { name: "<img src=x>" })).not.toBeNull();
    expect(ann.refusal("createGuild", { name: "Othr" })).not.toBeNull();
    expect(world.db.guild.count()).toBe(1n);
    for (let index = 1; index < GUILD_MEMBER_LIMIT; index++) world.join(`Member ${index}`).call("joinGuild", { guildId: id });
    expect(world.db.guild.id.find(id).members).toBe(GUILD_MEMBER_LIMIT);
    expect(bob.refusal("joinGuild", { guildId: id })).not.toBeNull();
  });

  it("an erased member leaves the roster and the reports' participant lists; a guest's guild follows it only into an account that has none", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = players(world, "Ann", "Bob", "Cara", "Dan");
    const ours = foundGuild(world, ann, "Rose", [bob]), theirs = foundGuild(world, cara, "Moon", [dan]);
    ann.call("challengeGuild", { opponentGuildId: theirs });
    world.player("Owner", "owner").call("devEraseAccount", { identityHex: bob.hex, confirmation: "ERASE", reason: "Asked to be forgotten" });
    expect(guildOf(world, bob)).toBeNull();
    expect(guildHub(ann).guild.members.map((member: any) => member.identity)).toEqual([ann.hex]);
    expect(world.db.guildReportParticipant.identity.filter(bob.identity)[Symbol.iterator]().next().done).toBe(true);
    // A guest in a guild links into an account that is in another: the account keeps its own.
    const gina = world.join("Gina");
    gina.call("joinGuild", { guildId: ours });
    const code = "guild-keep-".padEnd(40, "x");
    gina.call("beginAccountLink", { code });
    const al = enter(world.player("Al", "account"));
    al.call("joinGuild", { guildId: theirs });
    al.call("claimGuestAccount", { code });
    expect(guildOf(world, al)).toBe(theirs);
    expect(guildHub(ann).guild.members.map((member: any) => member.identity)).toEqual([ann.hex]);
  });
});

describe("Guild battles and standings", () => {
  /** Every member of these hits hard: their saved damage is huge. */
  const strong = (...members: ScenarioPlayer[]) => { for (const member of members) member.patch("playerProgress", { damage: 1_000_000, maxHp: 1_000_000 }); };

  it("a battle freezes every current member's saved build, scores once, and both guilds keep the report; three attacks a day, back at UTC midnight", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan, eve] = ["Ann", "Bob", "Cara", "Dan", "Eve"].map(name => world.join(name));
    const ours = foundGuild(world, ann, "Rose", [bob, cara]);
    const theirs = foundGuild(world, dan, "Moon", [eve]);
    const others = ["Aaaa", "Bbbb", "Cccc"].map((name, index) => foundGuild(world, world.join(`Founder ${index}`), name));
    strong(ann, bob, cara);
    // Its own guild, or a member who is no officer: refused.
    expect(ann.refusal("challengeGuild", { opponentGuildId: ours })).not.toBeNull();
    expect(bob.refusal("challengeGuild", { opponentGuildId: theirs })).not.toBeNull();
    ann.call("challengeGuild", { opponentGuildId: theirs });
    const [report] = guildHub(ann).battles;
    expect(report.result.outcome).toBe("VICTORY");
    expect(report.result.attackers).toHaveLength(3);
    expect(report.result.defenders).toHaveLength(2);
    expect(guildHub(dan).battles[0].id).toBe(report.id);
    expect(guildHub(ann).standings[0]).toMatchObject({ id: String(ours), score: 3, wins: 1 });
    // What a member saves later does not change the report.
    bob.patch("playerProgress", { damage: 5 });
    expect(guildHub(ann).battles[0].result).toEqual(report.result);
    // Each opponent once a day, three attacks in all; the directory marks today's.
    expect(ann.refusal("challengeGuild", { opponentGuildId: theirs })).not.toBeNull();
    expect(world.db.guild.id.find(ours).score).toBe(3);
    expect(guildHub(ann).directory.find((row: any) => row.id === String(theirs)).challengedToday).toBe(true);
    expect(guildHub(ann).directory.find((row: any) => row.id === String(others[0])).challengedToday).toBe(false);
    ann.call("challengeGuild", { opponentGuildId: others[0] });
    ann.call("challengeGuild", { opponentGuildId: others[1] });
    expect(ann.refusal("challengeGuild", { opponentGuildId: others[2] })).not.toBeNull();
    // Past the next UTC midnight: three more, and nothing marked.
    world.advance(Number(GUILD_DAY_MICROS / 1000n) - (world.now() % Number(GUILD_DAY_MICROS / 1000n)) + 1_000);
    expect(guildHub(ann).directory.every((row: any) => !row.challengedToday)).toBe(true);
    ann.call("challengeGuild", { opponentGuildId: theirs });
    expect(guildHub(ann).guild.attacksRemaining).toBe(2);
  });

  it("a member who already fought for another guild today sits out; with nobody free there is no battle", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = ["Ann", "Bob", "Cara", "Dan"].map(name => world.join(name));
    const first = foundGuild(world, cara, "Moon", [bob]);
    const target = foundGuild(world, dan, "Star");
    // Bob fights for Moon, then joins Rose the same day.
    cara.call("challengeGuild", { opponentGuildId: target });
    bob.call("leaveGuild");
    const ours = foundGuild(world, ann, "Rose", [bob]);
    const other = foundGuild(world, world.join("Eve"), "Wolf");
    ann.call("challengeGuild", { opponentGuildId: other });
    const fought = guildHub(ann).battles[0].result.attackers.map((member: any) => member.identity);
    expect(fought).toEqual([ann.hex]);
    expect(world.db.guild.id.find(ours).attacks).toBe(1);
    // Cara fought for Moon today too; alone in a new guild, she has nobody free to send.
    cara.call("leaveGuild");
    foundGuild(world, cara, "Solo");
    expect(cara.refusal("challengeGuild", { opponentGuildId: other })).not.toBeNull();
    void first;
  });

  it("only a shared battle is posted to chat, once, with both badges, and only a shared report can be watched by others", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan, eve] = ["Ann", "Bob", "Cara", "Dan", "Eve"].map(name => world.join(name));
    const ours = foundGuild(world, ann, "Rose", [bob]), theirs = foundGuild(world, cara, "Moon", [dan]);
    ann.call("setGuildEmblem", { emblem: 16 });
    ann.call("challengeGuild", { opponentGuildId: theirs });
    const { shared, ...report } = guildHub(ann).battles[0];
    expect(shared).toBe(false);
    const key = `${ours}:${report.id}`;
    const announcements = () => [...world.db.chatMessage.iter()].filter(row => row.guildReplayKey);
    expect(announcements()).toHaveLength(0);
    expect(() => eve.procedure("getGuildReplay", { reportKey: key })).toThrow();
    expect(() => ann.procedure("getGuildBattleBadges", { reportKey: key })).toThrow();
    // The defenders share it; sharing again is refused.
    cara.call("shareGuildBattle", { battleId: report.id });
    expect(cara.refusal("shareGuildBattle", { battleId: report.id })).not.toBeNull();
    expect(guildHub(ann).battles[0].shared).toBe(true);
    expect(announcements().map(row => row.guildReplayKey)).toEqual([key]);
    expect(JSON.parse(ann.procedure("getGuildBattleBadges", { reportKey: key }) as string)).toEqual([{ name: "Rose", emblem: 16 }, { name: "Moon", emblem: -1 }]);
    expect(JSON.parse(eve.procedure("getGuildReplay", { reportKey: key }) as string)).toEqual(report);
    expect(() => eve.procedure("getGuildReplay", { reportKey: `${theirs}:${report.id}` })).toThrow();
  });

  it("each guild keeps its ten latest reports; standings reset with the week; the directory pages twenty at a time; total power counts current members", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = ["Ann", "Bob", "Cara", "Dan"].map(name => world.join(name));
    const ours = foundGuild(world, ann, "Rose", [bob]), theirs = foundGuild(world, cara, "Moon", [dan]);
    const day = Number(GUILD_DAY_MICROS / 1000n);
    for (let battle = 0; battle < 12; battle++) { ann.call("challengeGuild", { opponentGuildId: theirs }); world.advance(day); }
    const kept = guildHub(ann).battles.map((row: any) => Number(row.id));
    expect(kept).toHaveLength(10);
    expect(Math.min(...kept)).toBe(3);
    expect(guildHub(cara).battles).toHaveLength(10);
    // A new week: last week's standings and score are gone until the next battle.
    const nextWeekAt = Number(BigInt(guildHub(ann).nextWeekAt) / 1000n);
    world.advance(nextWeekAt - world.now() + 1_000);
    expect(guildHub(ann).standings).toEqual([]);
    expect(guildHub(ann).guild.score).toBe(0);
    // Twenty guilds a page.
    for (let index = 0; index < 25; index++) foundGuild(world, world.join(`F${index}`), `G${String.fromCharCode(65 + index)}xx`);
    const page = guildHub(bob);
    expect(page.directory).toHaveLength(20);
    const next = JSON.parse(bob.procedure("getGuildHub", { afterId: BigInt(page.nextPage) }) as string);
    expect(next.directory.length).toBeGreaterThan(0);
    expect(next.directory.some((row: any) => page.directory.some((seen: any) => seen.id === row.id))).toBe(false);
    // Total power: current members only.
    const before = guildHub(ann).guild.totalPower;
    bob.call("leaveGuild");
    expect(guildHub(ann).guild.totalPower).toBeLessThan(before);
    void ours;
  });

  it("the standings list the top fifty by points, and refill when a ranked guild disbands", () => {
    const world = scenarioWorld();
    const bags = foundGuild(world, world.join("Bag"), "Bagz");
    const founders = Array.from({ length: GUILD_RANKING_LIMIT + 2 }, (_, index) => world.join(`Founder ${index}`));
    founders.forEach((founder, index) => {
      foundGuild(world, founder, `R${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}x`);
      founder.patch("playerProgress", { damage: 1_000_000, maxHp: 1_000_000 });
      founder.call("challengeGuild", { opponentGuildId: bags });
    });
    const viewer = founders[0];
    const standings = guildHub(viewer).standings;
    expect(standings).toHaveLength(GUILD_RANKING_LIMIT);
    expect(standings.every((row: any) => row.score === 3)).toBe(true);
    const gone = standings[0].id;
    const leaving = founders.find(founder => String(world.db.guildMember.identity.find(founder.identity)?.guildId) === gone)!;
    leaving.call("leaveGuild");
    const after = guildHub(viewer === leaving ? founders[1] : viewer).standings;
    expect(after).toHaveLength(GUILD_RANKING_LIMIT);
    expect(after.some((row: any) => row.id === gone)).toBe(false);
  });
});

describe("A President who stops playing", () => {
  it("hands the guild to the Vice President who still plays, or else the longest-serving member, when a member comes back", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan] = ["Ann", "Bob", "Cara", "Dan"].map(name => world.join(name));
    const id = foundGuild(world, ann, "Rose", [bob]);
    world.advance(HOUR);
    for (const later of [cara, dan]) later.call("joinGuild", { guildId: id });
    ann.call("setGuildVicePresident", { identity: dan.identity, enabled: true });
    const president = () => world.db.guild.id.find(id).leader.toHexString();
    for (const player of [ann, bob, cara, dan]) player.disconnect();
    // Six days away is not long enough.
    world.advance(6 * DAY);
    enter(cara);
    expect(president()).toBe(ann.hex);
    // Past a week: the Vice President has not played either, so the longest-serving member who has leads.
    cara.disconnect();
    world.advance(2 * DAY);
    enter(bob);
    expect(president()).toBe(bob.hex);
    // Bob hears it by letter, and so does Ann.
    const letters = (who: typeof ann) => [...world.db.playerMail.iter()].filter((mail: any) => mail.identity.toHexString() === who.hex).map((mail: any) => mail.title);
    expect(letters(bob)).toContain("Rose: You Are President");
    expect(letters(ann)).toContain("Rose: New President");
    // Ann comes back as a member, and stays one: Bob plays.
    enter(ann);
    expect(president()).toBe(bob.hex);
    expect(world.db.guildMember.identity.find(ann.identity)?.guildId).toBe(id);
  });
});

describe("Guild join requests", () => {
  it("a request-only guild takes requests that members see and only officers decide; the answer comes by mail with its note", () => {
    const world = scenarioWorld();
    const [ann, bob, cara, dan, eve] = ["Ann", "Bob", "Cara", "Dan", "Eve"].map(name => world.join(name));
    const id = foundGuild(world, ann, "Rose", [bob, cara]);
    const other = foundGuild(world, eve, "Moon");
    ann.call("guildAdmission", { action: "requestOnly", guildId: 0n, identity: ann.identity, note: "" });
    expect(dan.refusal("joinGuild", { guildId: id })).not.toBeNull();
    dan.call("guildAdmission", { action: "request", guildId: id, identity: dan.identity, note: "" });
    dan.call("guildAdmission", { action: "request", guildId: id, identity: dan.identity, note: "" });
    expect(guildHub(dan).pendingRequest.guildId).toBe(String(id));
    expect(guildHub(ann).guild.requests).toHaveLength(1);
    expect(guildHub(cara).guild.requests).toHaveLength(1);
    expect(bob.refusal("guildAdmission", { action: "accept", guildId: id, identity: dan.identity, note: "" })).not.toBeNull();
    expect(eve.refusal("guildAdmission", { action: "decline", guildId: other, identity: dan.identity, note: "" })).not.toBeNull();
    ann.call("setGuildVicePresident", { identity: bob.identity, enabled: true });
    bob.call("guildAdmission", { action: "accept", guildId: id, identity: dan.identity, note: "Welcome to Rose!" });
    expect(world.db.guildMember.identity.find(dan.identity).guildId).toBe(id);
    const letters = [...world.db.playerMail.identity.filter(dan.identity)];
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ read: false });
    expect(letters[0].body).toContain("Welcome to Rose!");
    expect(bob.refusal("guildAdmission", { action: "accept", guildId: id, identity: dan.identity, note: "" })).not.toBeNull();
    // Declined: the request goes, a letter says so.
    const fay = world.join("Fay");
    fay.call("guildAdmission", { action: "request", guildId: id, identity: fay.identity, note: "" });
    ann.call("guildAdmission", { action: "decline", guildId: id, identity: fay.identity, note: "Try again later." });
    expect(world.db.guildJoinRequest.identity.find(fay.identity)).toBeFalsy();
    expect([...world.db.playerMail.identity.filter(fay.identity)][0].body).toContain("Try again later.");
    expect(world.db.guildMember.identity.find(fay.identity)).toBeFalsy();
  });

  it("a request can be cancelled, goes when its player joins elsewhere or is erased, and is not accepted into a full guild", () => {
    const world = scenarioWorld();
    const [ann, eve, gus] = ["Ann", "Eve", "Gus"].map(name => world.join(name));
    const id = foundGuild(world, ann, "Rose"), open = foundGuild(world, eve, "Moon");
    ann.call("guildAdmission", { action: "requestOnly", guildId: id, identity: ann.identity, note: "" });
    gus.call("guildAdmission", { action: "request", guildId: id, identity: gus.identity, note: "" });
    gus.call("guildAdmission", { action: "cancel", guildId: 0n, identity: gus.identity, note: "" });
    expect(world.db.guildJoinRequest.identity.find(gus.identity)).toBeFalsy();
    gus.call("guildAdmission", { action: "request", guildId: id, identity: gus.identity, note: "" });
    gus.call("joinGuild", { guildId: open });
    expect(world.db.guildJoinRequest.identity.find(gus.identity)).toBeFalsy();
    gus.call("leaveGuild");
    // Full by the time it is answered: the accept is refused and the request stays.
    gus.call("guildAdmission", { action: "request", guildId: id, identity: gus.identity, note: "" });
    for (let index = 1; index < GUILD_MEMBER_LIMIT; index++) {
      const member = world.join(`Member ${index}`);
      member.call("guildAdmission", { action: "request", guildId: id, identity: member.identity, note: "" });
      ann.call("guildAdmission", { action: "accept", guildId: id, identity: member.identity, note: "" });
    }
    expect(ann.refusal("guildAdmission", { action: "accept", guildId: id, identity: gus.identity, note: "" })).not.toBeNull();
    expect(world.db.guildJoinRequest.identity.find(gus.identity)).toBeTruthy();
    world.player("Owner", "owner").call("devEraseAccount", { identityHex: gus.hex, confirmation: "ERASE", reason: "Asked to be forgotten" });
    expect(world.db.guildJoinRequest.identity.find(gus.identity)).toBeFalsy();
  });
});

describe("The Guild window", () => {

  it("the President appoints and removes a Vice President from the roster, each once however often the button is tapped; Back cancels a pending leave; a battle waits for its confirmation", async () => {
    const world = gameWorld();
    const [ann, bob, cara] = ["Ann", "Bob", "Cara"].map(name => world.join(name));
    const moon = foundGuild(world, cara, "Moon");
    const ours = foundGuild(world, ann, "Rose", [bob]);
    ann.disconnect();
    const appointments = guildCalls(world, "setGuildVicePresident");
    // A slow network: each call takes a moment to answer.
    const tab = await playAs(world, "Ann", { client: { latencyMs: 400 } });
    const me = tab.network.players.get("Ann")!;
    const guild = guildWindow(tab);
    await guild.open();
    await guild.press(`manage-${bob.hex}`);
    await guild.press("Make Vice President");
    await guild.confirm(100);
    // While it saves, the controls cannot be pressed again.
    expect(guild.asking()).toBe(false);
    expect(guild.has(`manage-${bob.hex}`)).toBe(false);
    await tab.play(1_000);
    expect(guildHub(me).guild.vicePresident).toBe(bob.hex);
    expect(appointments).toHaveLength(1);
    if (!guild.has("Remove Vice President")) await guild.press(`manage-${bob.hex}`);
    await guild.press("Remove Vice President");
    await guild.confirm();
    await tab.play(1_000);
    expect(guildHub(me).guild.vicePresident).toBeNull();
    // Leave asks first; Back drops the question and she stays.
    await guild.press("Leave guild");
    expect(guild.asking()).toBe(true);
    await guild.back();
    expect(guild.asking()).toBe(false);
    expect(guild.shown()).toBe(true);
    expect(world.db.guildMember.identity.find(ann.identity).guildId).toBe(ours);
    // A challenge spends an attack only once confirmed.
    await guild.press("tab-battles");
    await tab.play(1_000);
    await guild.press(`challenge-${moon}`);
    expect(world.db.guild.id.find(ours).attacks).toBe(0);
    await guild.confirm();
    await tab.play(1_000);
    expect(world.db.guild.id.find(ours).attacks).toBe(1);
    expect(guildHub(cara).battles).toHaveLength(1);
  });

  it("an invitation arrives as a private chat from its sender and is accepted there, and an officer answers join requests from guild chat with a note", async () => {
    const world = gameWorld();
    const [ann, dan, eve] = ["Ann", "Dan", "Eve"].map(name => world.join(name));
    const moon = foundGuild(world, dan, "Moon");
    // Moon takes requests only; an invitation is the guild's own approval.
    dan.call("guildAdmission", { action: "requestOnly", guildId: moon, identity: dan.identity, note: "" });
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const annNow = tab.network.players.get("Ann")!;
    const chat = chatPanel(tab);
    await chat.expand();
    await chat.press("Private");
    dan.call("guildInviteAction", { action: "invite", target: annNow.hex, invitationId: 0n });
    await tab.play(1_000);
    const fromDan = chat.panel().querySelector<HTMLButtonElement>(`.chat-conversation-row[data-identity="${dan.hex}"]`);
    expect(fromDan).not.toBeNull();
    fromDan!.dispatchEvent(new (tab.window as any).Event("click", { bubbles: true }));
    await tab.play(500);
    await chat.press("Accept");
    await tab.play(1_000);
    expect(world.db.guildMember.identity.find(annNow.identity)?.guildId).toBe(moon);

    // Dan makes Ann Vice President; Eve asks to join.
    dan.call("setGuildVicePresident", { identity: annNow.identity, enabled: true });
    eve.call("guildAdmission", { action: "request", guildId: moon, identity: eve.identity, note: "" });
    await chat.press("Guild");
    await chat.press("Requests");
    await tab.play(500);
    const note = chat.panel().querySelector<HTMLTextAreaElement>("textarea")!;
    note.value = "Welcome to Moon!";
    note.dispatchEvent(new (tab.window as any).Event("input", { bubbles: true }));
    await chat.press("Accept");
    await tab.play(500);
    expect(world.db.guildMember.identity.find(eve.identity)?.guildId).toBe(moon);
    expect([...world.db.playerMail.identity.filter(eve.identity)].map(letter => letter.body).join()).toContain("Welcome to Moon!");
  });

  it("a plain member sees battle history and no officer controls; asking to join a request-only guild can be taken back; another guild opens in a preview over her own", async () => {
    const world = gameWorld();
    const [ann, bob, cara] = ["Ann", "Bob", "Cara"].map(name => world.join(name));
    const ours = foundGuild(world, ann, "Rose", [bob]);
    const moon = foundGuild(world, cara, "Moon");
    cara.call("guildAdmission", { action: "requestOnly", guildId: moon, identity: cara.identity, note: "" });
    ann.call("challengeGuild", { opponentGuildId: moon });
    bob.disconnect();
    const tab = await playAs(world, "Bob");
    const me = tab.network.players.get("Bob")!;
    const guild = guildWindow(tab);
    await guild.open();
    // No managing, no badge pencil, no admission switch for a plain member.
    expect([`manage-${ann.hex}`, "edit-badge", "Request Only"].map(key => guild.has(key))).toEqual([false, false, false]);
    // Battles open on the history: a replay to watch, no opponent to challenge.
    await guild.press("tab-battles");
    await tab.play(1_000);
    const [report] = guildHub(me).battles;
    expect(guild.has(`replay-${report.id}`)).toBe(true);
    expect(guild.has(`challenge-${moon}`)).toBe(false);
    // Another guild's preview opens over her own window, which stays open behind it.
    await guild.press("battle-opponents");
    tab.element("guildOverlay").querySelector<HTMLElement>('[aria-label="View Moon guild"]')!.dispatchEvent(new (tab.window as any).Event("click", { bubbles: true }));
    await tab.play(1_000);
    expect(tab.shown("guildPreviewTitle")).toBe(true);
    expect(guild.shown()).toBe(true);
    // She leaves Rose and asks to join Moon, then takes it back.
    await guild.press("tab-guild");
    await guild.press("Leave guild");
    await guild.confirm();
    expect(world.db.guildMember.identity.find(me.identity)).toBeFalsy();
    await guild.press(`join-${moon}`);
    expect(guildHub(me).pendingRequest?.guildId).toBe(String(moon));
    expect(guild.has(`join-${moon}`)).toBe(false);
    await guild.press("Cancel request");
    expect(guildHub(me).pendingRequest ?? null).toBeNull();
    // The toolbar's Guild button closes it again.
    tab.tap("guildBtn");
    await tab.play(300);
    expect(guild.shown()).toBe(false);
    void ours;
  });
});

describe("The Guild Hall", () => {
  const questWeek = (world: ScenarioWorld) => Math.floor((Math.floor(world.now() / DAY) + 3) / 7);
  const giveQuestPoints = (world: ScenarioWorld, guildId: bigint, points: number) =>
    world.setup(ctx => ctx.db.guildQuestWeek.insert({ key: `${questWeek(world)}:${guildId}`, week: questWeek(world), guildId, guildName: "Rose", points }));
  const hallLevels = (world: ScenarioWorld, guildId: bigint) => parseGuildHallLevels(world.db.guildHall.guildId.find(guildId).levels);

  it("a member goes in from a fighting map, walks through the door into the room, upgrades from the board that opens as she walks up, and leaving the guild sends her to the Town", async () => {
    const world = gameWorld();
    const [ann, bob] = ["Ann", "Bob"].map(name => world.join(name));
    const guildId = foundGuild(world, ann, "Rose", [bob]);
    giveQuestPoints(world, guildId, 120);
    ann.disconnect();
    const tab = await playAs(world, "Ann");
    const me = tab.network.players.get("Ann")!;
    const at = () => world.db.player.identity.find(me.identity);
    const hallWindow = () => tab.element("guildHallTitle").closest("dialog")!;
    const press = async (target: HTMLButtonElement | null | undefined) => {
      if (!target || target.disabled) throw new Error("That button cannot be pressed");
      target.dispatchEvent(new (tab.window as any).Event("click", { bubbles: true }));
      await tab.play(1_000);
    };
    const guild = guildWindow(tab);
    await guild.open();
    await guild.press("guild-hall");
    expect(tab.shown("guildHallTitle")).toBe(true);
    await press(hallWindow().querySelector<HTMLButtonElement>(".guild-hall-enter"));
    expect(await tab.until(() => at().mapId === guildHallMapId(guildId), 5_000)).toBe(true);
    // Fight from the Town still goes back to where she fought.
    expect(world.db.homeReturnLocation.identity.find(me.identity).mapId).toBe("tutorial_forest");
    // North up the yard to the door: the server takes her into the small hall's room.
    tab.key("KeyW");
    const inside = await tab.until(() => Math.abs(at().x - guildHallRoom(0).inside.x) < 5, 12_000);
    tab.key("KeyW", "keyup");
    expect(inside).toBe(true);
    // East to the upgrade board: it opens once.
    tab.key("KeyD");
    const opened = await tab.until(() => tab.shown("guildHallTitle"), 5_000);
    tab.key("KeyD", "keyup");
    expect(opened).toBe(true);
    const banners = hallWindow().querySelectorAll<HTMLButtonElement>(".guild-hall-part")[GUILD_HALL_PARTS.findIndex(part => part.id === "banners")].querySelector("button");
    await press(banners);
    expect(hallLevels(world, guildId).banners).toBe(1);
    expect(world.db.guildHall.guildId.find(guildId)).toMatchObject({ fund: 20, spent: 100 });
    await press(hallWindow().querySelector<HTMLButtonElement>(".window-back-button"));
    await tab.play(1_000);
    expect(tab.shown("guildHallTitle")).toBe(false);
    // She leaves the guild from inside: back to the Town.
    await guild.open();
    await guild.press("Leave guild");
    await guild.confirm();
    expect(await tab.until(() => at().mapId === TOWN_MAP_ID, 5_000)).toBe(true);
  });

  it("only members get in; the door lets a member through only from where she could have walked; officers spend the fund, which quest points fill", () => {
    const world = scenarioWorld();
    const [ann, bob, cara] = ["Ann", "Bob", "Cara"].map(name => world.join(name));
    const guildId = foundGuild(world, ann, "Rose", [bob]);
    const hall = guildHallMapId(guildId);
    expect(cara.refusal("changeMap", { mapId: hall, x: 4050, y: 4050 })).not.toBeNull();
    expect(ann.refusal("changeMap", { mapId: guildHallMapId(guildId + 99n), x: 4050, y: 4050 })).not.toBeNull();
    giveQuestPoints(world, guildId, 50);
    ann.call("changeMap", { mapId: hall, x: 4050, y: 4050 });
    expect(world.db.guildHall.guildId.find(guildId).fund).toBe(50);
    // The door from the arrival is a walk away: refused at once, through once she could have walked there.
    expect(ann.refusal("useGuildHallDoor")).not.toBeNull();
    const walk = Math.hypot(GUILD_HALL_DOOR.x - GUILD_HALL_ARRIVAL.x, GUILD_HALL_DOOR.enter - GUILD_HALL_FEET_OFFSET - GUILD_HALL_ARRIVAL.y);
    world.advance(Math.ceil(walk / 200 * 1_000));
    world.setup(ctx => ctx.db.playerMotionInterest.insert({ identity: ann.identity, networkIds: [7] }));
    ann.call("useGuildHallDoor");
    const me = () => world.db.player.identity.find(ann.identity);
    expect([me().x, me().y]).toEqual([guildHallRoom(0).inside.x, guildHallRoom(0).inside.y]);
    // Who she watches stays through the door.
    expect(world.db.playerMotionInterest.identity.find(ann.identity)?.networkIds).toEqual([7]);
    // A joiner's quest points go into the fund; only officers spend it, on real parts, when it has enough.
    const week = questWeek(world);
    world.setup(ctx => ctx.db.soloQuestWeek.insert({ identity: cara.identity, week, points: 60, lastWeek: 0, lastPoints: 0 }));
    cara.call("joinGuild", { guildId });
    expect(world.db.guildHall.guildId.find(guildId).fund).toBe(110);
    expect(ann.refusal("upgradeGuildHall", { part: "table" })).not.toBeNull();
    expect(ann.refusal("upgradeGuildHall", { part: "moat" })).not.toBeNull();
    expect(bob.refusal("upgradeGuildHall", { part: "lights" })).not.toBeNull();
    ann.call("setGuildVicePresident", { identity: bob.identity, enabled: true });
    bob.call("upgradeGuildHall", { part: "lights" });
    expect(hallLevels(world, guildId).lights).toBe(1);
    expect(world.db.guildHall.guildId.find(guildId).fund).toBe(10);
    // A Long Hall's door leads to its bigger room.
    world.setup(ctx => ctx.db.guildHall.guildId.update({ ...ctx.db.guildHall.guildId.find(guildId), levels: JSON.stringify({ ...hallLevels(world, guildId), size: 2 }) }));
    world.setup(ctx => { if (ctx.db.playerMotion.identity.find(ann.identity)) ctx.db.playerMotion.identity.delete(ann.identity); });
    ann.patch("player", { x: GUILD_HALL_DOOR.outside.x, y: GUILD_HALL_DOOR.outside.y });
    ann.call("useGuildHallDoor");
    expect([me().x, me().y]).toEqual([guildHallRoom(2).inside.x, guildHallRoom(2).inside.y]);
    // Back after a break: where she stood in the room, she still is; saved where the courtyard stood before it moved, at the arrival.
    const relog = (x: number, y: number) => {
      world.setup(ctx => { if (ctx.db.playerMotion.identity.find(ann.identity)) ctx.db.playerMotion.identity.delete(ann.identity); });
      ann.patch("player", { x, y });
      ann.disconnect();
      ann.patch("playerLastLocation", { mapId: hall, x, y });
      enter(ann);
      return [me().mapId, me().x, me().y];
    };
    const seat = { x: guildHallRoom(2).inside.x + 100, y: guildHallRoom(2).inside.y - 200 };
    expect(relog(seat.x, seat.y)).toEqual([hall, seat.x, seat.y]);
    expect(relog(160, 1_200)).toEqual([hall, GUILD_HALL_ARRIVAL.x, GUILD_HALL_ARRIVAL.y]);
    // The last member out takes the hall with the guild.
    for (const member of [cara, bob, ann]) member.call("leaveGuild");
    expect(me().mapId).toBe(TOWN_MAP_ID);
    expect(world.db.guildHall.guildId.find(guildId)).toBeFalsy();
  });

  it("every hall size keeps its rooms, board and seats inside its world, seats as many as the table's level, and draws more with every upgrade", () => {
    expect(GUILD_HALL_WORLD.width * PLAYER_POSITION_SCALE).toBeLessThanOrEqual(0xffff);
    expect(GUILD_HALL_WORLD.height * PLAYER_POSITION_SCALE).toBeLessThanOrEqual(0xffff);
    const most = Object.fromEntries(GUILD_HALL_PARTS.map(part => [part.id, part.levels.length - 1])) as GuildHallLevels;
    for (const size of [0, 1, 2]) {
      const room = guildHallRoom(size), picture = guildHallRoomPicture(size), board = guildHallBoard(size);
      expect(picture.x).toBeGreaterThanOrEqual(GUILD_HALL_INTERIOR_LEFT);
      expect(picture.x + picture.w).toBeLessThanOrEqual(GUILD_HALL_WORLD.width);
      expect(picture.y + picture.h).toBeLessThanOrEqual(GUILD_HALL_WORLD.height);
      expect(board.x > room.left && board.x < room.right).toBe(true);
      for (const seat of guildHallSeats({ ...most, size })) expect(seat.x > room.left && seat.x < room.right).toBe(true);
      for (const [table, seats] of GUILD_HALL_TABLE_SEATS.entries()) {
        const shown = guildHallSeats({ ...EMPTY_GUILD_HALL_LEVELS, table, size });
        expect(shown).toHaveLength(seats);
        expect(shown.filter(seat => seat.side === "north")).toHaveLength(seats / 2);
      }
    }
    // The courtyard stands in the middle of the outdoors, the same wood all round it, its ground and its arrival in it.
    const yardMiddle = { x: (GUILD_HALL_YARD.left + GUILD_HALL_YARD.right) / 2, y: (GUILD_HALL_YARD.top + GUILD_HALL_YARD.bottom) / 2 };
    expect(Math.abs(yardMiddle.x - GUILD_HALL_INTERIOR_LEFT / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(yardMiddle.y - GUILD_HALL_WORLD.height / 2)).toBeLessThanOrEqual(30);
    expect(GUILD_HALL_DOOR.x).toBe(GUILD_HALL_INTERIOR_LEFT / 2);
    expect(GUILD_HALL_GROUND.x > 0 && GUILD_HALL_GROUND.x + GUILD_HALL_GROUND.w < GUILD_HALL_INTERIOR_LEFT).toBe(true);
    expect(GUILD_HALL_ARRIVAL.y + GUILD_HALL_FEET_OFFSET).toBeLessThan(GUILD_HALL_YARD.bottom);
    // Each side of the door draws only its own decor.
    const both = (levels: GuildHallLevels) => [...guildHallDecor(levels, false), ...guildHallDecor(levels, true)];
    expect(guildHallDecor(most, false).every(item => item.x < GUILD_HALL_INTERIOR_LEFT)).toBe(true);
    expect(guildHallDecor(most, true).every(item => item.x >= GUILD_HALL_INTERIOR_LEFT)).toBe(true);
    const bare = both(EMPTY_GUILD_HALL_LEVELS), grand = both(most);
    expect(grand.length).toBeGreaterThan(bare.length);
    for (const item of grand) if (item.type === "soulProp" && !item.crest) expect(guildHallFrame(item.frame), item.frame).not.toBeNull();
    for (const part of GUILD_HALL_PARTS) expect(JSON.stringify(both({ ...EMPTY_GUILD_HALL_LEVELS, [part.id]: 1 })), part.id).not.toBe(JSON.stringify(bare));
    expect(guildHallSolids({ ...EMPTY_GUILD_HALL_LEVELS, size: 2 })).not.toEqual(guildHallSolids(EMPTY_GUILD_HALL_LEVELS));
  });
});

