import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createGuildPanel } from "./guild-panel";
import type { SocialApi } from "../coop/services/social-service";
import type { SocialSnapshot } from "../../shared/social";
import type { GuildApi } from "../coop/services/guild-service";
import { resolveGuildBattle, type GuildSnapshot } from "../../shared/guilds";

const member = (identity: string) => ({ identity, name: identity.toUpperCase(), eligibleAt: "0" });
const fixture = (): GuildSnapshot => ({
  identity: "a", serverNow: "1000000", week: 1, nextWeekAt: "9999999999999", joinAfter: "0", signedIn: true,
  guild: { id: "1", name: "Wildwood", leader: "a", attacksRemaining: 3, score: 12, members: [member("a"), member("b"), member("c"), member("d")] },
  directory: [{ id: "2", name: "Moonlight", members: 5, challengedToday: false }], nextPage: null,
  standings: [{ id: "1", name: "Wildwood", members: 4, score: 12, wins: 4, battles: 4 }], battles: [],
});
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup(snapshot = fixture(), socialApi?: SocialApi) {
  const { document } = parseHTML('<html><body><button id="guildBtn">Guilds</button></body></html>');
  const api = { cancel: vi.fn(), loadGuildPreview: vi.fn(async () => ({ ...snapshot.guild!, id: '2', name: 'Moonlight' })), loadReplay: vi.fn(async () => snapshot.battles[0]), loadGuild: vi.fn(async () => snapshot), guildAction: vi.fn(async () => {}) } satisfies GuildApi;
  let session = "a";
  const onClose = vi.fn(), onOpenPlayer = vi.fn();
  const panel = createGuildPanel({ document: document as unknown as Document, api: () => api, socialApi: () => socialApi, sessionKey: () => session, beforeOpen: vi.fn(), onClose, onOpenPlayer });
  disposals.push(panel.dispose);
  const find = (label: string) => [...document.querySelectorAll("#guildOverlay button")].find(el => el.textContent === label || el.getAttribute("aria-label") === label) as HTMLButtonElement | undefined;
  const click = (label: string) => { const target = find(label); expect(target, label).toBeTruthy(); expect(target!.disabled, `${label} disabled`).toBe(false); target!.click(); };
  return { panel, api, document, click, find, onClose, onOpenPlayer, changeSession: () => { session = "b"; } };
}
async function settled() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

describe("guild panel", () => {
  it("shows total guild power beside battle opponent names", async () => {
    const g = fixture(); g.directory[0].totalPower = 2_500_000_000;
    const h = setup(g); h.panel.open(); await settled(); h.click("Battles"); await settled();
    const title = h.document.querySelector(".guild-opponent-heading")!;
    expect(title.textContent).toContain("Moonlight");
    expect(title.querySelector(".guild-opponent-power")?.textContent).toBe("2.50b");
    expect(title.querySelector("img")?.getAttribute("src")).toContain("Icon_Battle_Candy_v2.webp");
    expect(h.find("View Moonlight guild")).toBeTruthy();
    expect(h.find("Challenge")?.disabled).toBe(false);
  });
  it("shows presence in member rows while preserving officer titles", async () => {
    const g = fixture();
    g.serverNow = String(10 * 86_400_000_000);
    g.guild!.members[1].online = true;
    g.guild!.members[2].lastSeenAtMs = 10 * 86_400_000 - 6 * 3_600_000;
    g.guild!.members[3].lastSeenAtMs = 7 * 86_400_000;
    const h = setup(g); h.panel.open(); await settled();
    const rows = h.document.querySelectorAll('.guild-member-profile');
    expect(h.document.querySelector(".guild-officer--president")!.textContent).toContain('President');
    expect(rows[1].textContent).toContain('Online');
    expect(rows[1].querySelector('.guild-presence--online')).not.toBeNull();
    expect(rows[2].textContent).toContain('Last seen 6 hours ago');
    expect(rows[3].textContent).toContain('Last seen 3 days ago');
    h.click("View B's profile");
    expect(h.onOpenPlayer).toHaveBeenCalledWith('b', 'B');
    expect(h.document.getElementById('guildOverlay')!.hidden).toBe(false);
    const profile = h.document.createElement('div'); profile.id = 'playerProfile';
    h.document.body.append(profile);
    const event = new h.document.defaultView!.Event('keydown');
    Object.defineProperty(event, 'key', { value: 'Escape' });
    h.document.dispatchEvent(event);
    expect(h.document.getElementById('guildOverlay')!.hidden).toBe(false);
  });
  it("lets the President appoint and remove a Vice President", async () => {
    const g = fixture(), h = setup(g); h.panel.open(); await settled();
    expect(h.document.body.textContent).toContain("President");
    h.click("Manage B"); h.click("Make Vice President"); h.click("Appoint"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "vicePresident", identity: "b", enabled: true });
    g.guild!.vicePresident = "b"; h.panel.open(); await settled();
    h.click("Manage B"); h.click("Remove Vice President"); h.click("Remove role"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "vicePresident", identity: "b", enabled: false });
  });
  it("gives the Vice President battle controls without membership management", async () => {
    const g = fixture(); g.identity = "b"; g.guild!.vicePresident = "b";
    const h = setup(g); h.panel.open(); await settled();
    expect(h.document.querySelector(".guild-officer--vice")!.textContent).toContain("Vice President · You");
    expect(h.find("Manage C")).toBeUndefined();
    h.click("Battles"); await settled(); h.click("Challenge"); h.click("Start battle"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "challenge", opponentGuildId: "2" });
  });
  it("places creation and invitations ahead of discovery", async () => {
    const g = fixture(); g.guild = null;
    const social: SocialSnapshot = { identity: "a", signedIn: true, friends: [], incomingRequests: [], outgoingRequests: [],
      guildInvitations: [{ id: "8", guildId: "2", guildName: "MOON", inviterName: "B" }],
      outgoingGuildInvitations: [], currentGuild: null };
    const api = { loadSocial: vi.fn(async () => social), socialAction: vi.fn(async () => {}), revision: () => 1, snapshot: () => social } as unknown as SocialApi;
    const h = setup(g, api); h.panel.open(); await settled();
    const content = h.document.querySelector(".guild-content")!.textContent!;
    expect(content.indexOf("Create a guild")).toBeLessThan(content.indexOf("Open guilds"));
    expect(content.indexOf("Guild invitations")).toBeLessThan(content.indexOf("Open guilds"));
    h.click("Join guild"); await settled();
    expect(api.socialAction).toHaveBeenCalledWith({ action: "acceptGuildInvite", invitationId: "8" });
  });
  it("uses Back to cancel a pending destructive action", async () => {
    const h = setup(); h.panel.open(); await settled();
    expect(h.find("Manage A")).toBeUndefined();
    h.click("Manage B"); h.click("Remove member"); h.click("Back");
    expect(h.panel.isOpen()).toBe(true);
    expect(h.document.querySelector(".guild-confirm")).toBeNull();
    expect(h.api.guildAction).not.toHaveBeenCalled();
  });
  it("opens battle history first for regular members", async () => {
    const g = fixture(); g.identity = "d";
    const h = setup(g); h.panel.open("battles"); await settled();
    expect(h.find("Battle history")?.getAttribute("aria-pressed")).toBe("true");
    expect(h.find("Challenge")).toBeUndefined();
  });
  it("opens Manage friends as its own window and returns to the previous guild section", async () => {
    const h = setup(); h.panel.open("rankings"); await settled();
    h.click("Manage friends");
    expect(h.document.querySelector("#guildTitle")?.textContent).toBe("Friends");
    expect(h.document.querySelector(".guild-tabs")).toBeNull();
    h.click("Back");
    expect(h.panel.isOpen()).toBe(true);
    expect(h.find("Rankings")?.getAttribute("aria-current")).toBe("page");
    expect(h.document.querySelector("#guildTitle")?.textContent).toBe("Guilds");
    expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
  });
  it("toggles closed from the Guild toolbar button without reopening or refetching", async () => {
    const h = setup();
    const toggle = h.document.getElementById("guildBtn")!;
    toggle.click(); await settled();
    expect(h.document.getElementById("guildOverlay")!.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click(); await settled();
    expect(h.document.getElementById("guildOverlay")!.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
    toggle.click(); await settled();
    expect(h.document.getElementById("guildOverlay")!.hidden).toBe(false);
    expect(h.api.loadGuild).toHaveBeenCalledTimes(2);
  });
  it("keeps navigation focused and requests ranked opponents when opening battles", async () => {
    const h = setup(); h.panel.open(); await settled();
    expect([...h.document.querySelectorAll(".guild-tabs button")].map(node => node.textContent)).toEqual(["My Guild", "Battles", "Rankings"]);
    expect(h.document.querySelectorAll(".guild-champion")).toHaveLength(0);
    expect(h.find("Make President")).toBeUndefined();
    expect(h.find("Remove member")).toBeUndefined();
    h.click("Rankings"); h.click("Battles"); await settled();
    expect(h.api.loadGuild).toHaveBeenCalledTimes(2);
    expect(h.api.loadGuild).toHaveBeenLastCalledWith("0", true);
  });
  it("reveals management only for the selected member and confirms leadership changes", async () => {
    const h = setup(); h.panel.open(); await settled(); h.click("Manage B");
    h.click("Make President");
    expect(h.api.guildAction).not.toHaveBeenCalled();
    expect(h.document.body.textContent).toContain("Make B President?");
    h.click("Cancel"); expect(h.api.guildAction).not.toHaveBeenCalled();
    h.click("Make President"); h.click("Make President"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledExactlyOnceWith({ kind: "transfer", identity: "b" });
  });
  it("has no champion selection and includes every member in the challenge", async () => {
    const h = setup(); h.panel.open(); await settled(); h.click("Manage D");
    expect(h.find("Set as champion")).toBeUndefined(); expect(h.find("Update my build")).toBeUndefined();
    h.click("Battles"); await settled(); h.click("Challenge");
    expect(h.document.body.textContent).toContain("All 4 of your members will fight their 5 members");
  });
  it("keeps leadership controls unavailable to ordinary members", async () => {
    const g = fixture(); g.identity = "d";
    const h = setup(g); h.panel.open(); await settled();
    expect(h.find("Update my build")).toBeUndefined();
    expect(h.find("Manage A")).toBeUndefined();
    h.click("Battles"); await settled(); expect(h.find("Challenge")).toBeUndefined();
  });
  it("requires confirmation before spending a guild attack", async () => {
    const h = setup(); h.panel.open("battles"); await settled(); h.click("Challenge");
    expect(h.document.body.textContent).toContain("Uses 1 of your guild’s 3 remaining attacks today.");
    expect(h.api.guildAction).not.toHaveBeenCalled();
    h.click("Start battle"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledExactlyOnceWith({ kind: "challenge", opponentGuildId: "2" });
    expect(h.document.body.textContent).toContain("Battle complete.");
  });
  it("automatically plays the newly completed challenge and returns to history", async () => {
    const g = fixture(), h = setup(g);
    h.panel.open("battles"); await settled();
    const fighter = (identity: string) => ({ identity, name: identity, fighter: { maxHp: 100, damage: 10, armor: 0, regen: 0, attackRate: 1 } });
    const battle = { id: "new", attackerId: "1", defenderId: "2", attacker: "FIRE", defender: "MOON", at: "2000000",
      result: resolveGuildBattle([fighter("a")], [fighter("b")]) };
    h.api.loadGuild.mockResolvedValue({ ...g, battles: [battle] });
    h.click("Challenge"); h.click("Start battle"); await settled();
    expect(h.document.querySelector(".guild-overlay--replay canvas")).not.toBeNull();
    expect(h.api.guildAction).toHaveBeenCalledTimes(1);
    h.click("Back");
    expect(h.panel.isOpen()).toBe(true);
    expect(h.find("Battle history")?.getAttribute("aria-pressed")).toBe("true");
    expect(h.find("Replay")).toBeDefined();
    h.click("Refresh"); await settled();
    expect(h.document.querySelector("canvas")).toBeNull();
  });
  it.each(["challenged", "no-attacks", "ineligible", "opponent-not-ready"])("disables unavailable challenges: %s", async reason => {
    const g = fixture();
    if (reason === "challenged") g.directory[0].challengedToday = true;
    if (reason === "no-attacks") g.guild!.attacksRemaining = 0;
    if (reason === "ineligible") g.guild!.members[0].eligibleAt = "999999999999999999";
    if (reason === "opponent-not-ready") g.directory[0].members = 0;
    const h = setup(g); h.panel.open("battles"); await settled();
    expect((h.find("Challenge") ?? h.find("Challenged") ?? h.find("Not ready"))?.disabled).toBe(true);
  });
  it("allows joining and creating even when old snapshots contain a membership cooldown", async () => {
    const g = fixture(); g.guild = null; g.signedIn = false;
    const h = setup(g); h.panel.open(); await settled();
    expect(h.find("Join")?.disabled).toBe(false); expect(h.find("Create a guild")?.disabled).toBe(false);
    h.api.loadGuild.mockResolvedValue({ ...g, signedIn: true, joinAfter: "999999999999999999" });
    h.click("Refresh"); await settled();
    expect(h.find("Join")?.disabled).toBe(false); expect(h.find("Create a guild")?.disabled).toBe(false);
  });
  it("renders user names as text and only reveals the creation form on request", async () => {
    const g = fixture(); g.guild = null; g.directory[0].name = '<img src=x onerror="attack()">';
    const h = setup(g); h.panel.open(); await settled();
    expect(h.document.body.textContent).toContain(g.directory[0].name);
    expect(h.document.querySelector("#guildOverlay img")).toBeNull();
    expect(h.document.querySelector("#guildName")).toBeNull(); h.click("Create a guild");
    const input = h.document.querySelector("#guildName") as unknown as HTMLInputElement;
    input.value = "NewG";
    h.document.querySelector("form")!.dispatchEvent(new h.document.defaultView!.Event("submit", { cancelable: true }));
    await settled(); expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "create", name: "NewG" });
  });
  it("shows defensive results from the current guild's perspective", async () => {
    const g = fixture();
    const fighter = { damage: 4, maxHp: 30, armor: 0, regen: 0, attackRate: 1 };
    const result = resolveGuildBattle(["a", "b", "c"].map(name => ({ identity: name, name, fighter })), ["d", "e", "f"].map(name => ({ identity: name, name, fighter })));
    g.battles = [{ id: "1", attackerId: "2", defenderId: "1", attacker: "Moonlight", defender: "Wildwood", at: "1000000", result: { ...result, version: 2, attackerSurvivors: 3, defenderSurvivors: 0, outcome: "VICTORY" } }];
    const h = setup(g); h.panel.open("battles"); await settled(); h.click("Battle history");
    const report = h.document.querySelector(".guild-report-summary")!;
    expect(report.textContent).toContain("Defeat"); expect(h.find("Replay")).toBeDefined();
    expect(report.textContent).toContain("vs Moonlight"); expect(report.textContent).toContain("Defense");
  });
  it("opens only a full-window replay and uses Back to return to the battle list", async () => {
    const g = fixture();
    const member = (name: string) => ({ identity: name, name, fighter: { damage: 4, maxHp: 30, armor: 0, regen: 0, attackRate: 1 } });
    g.battles = [{ id: "1", attackerId: "1", defenderId: "2", attacker: "Wildwood", defender: "Moonlight", at: "1000000", result: resolveGuildBattle([member("a")], [member("b")]) }];
    const h = setup(g); h.panel.open("battles"); await settled(); h.click("Battle history");
    expect(h.document.querySelector("canvas")).toBeNull();
    h.click("Replay"); await settled();
    expect(h.document.querySelector(".guild-window--replay > .guild-replay canvas")).not.toBeNull();
    expect(h.document.querySelector(".guild-tabs")).toBeNull();
    expect(h.document.querySelector(".window-back-footer .window-back-button")?.textContent).toBe("Back");
    h.click("Back");
    expect(h.document.querySelector("canvas")).toBeNull();
    expect(h.find("Replay")).toBeDefined();
    h.click("Back"); expect(h.panel.isOpen()).toBe(false);
  });
  it("loads a world chat replay on demand and discards it when closed while loading", async () => {
    const h = setup(); let finish!: (report: GuildSnapshot["battles"][number]) => void;
    h.api.loadReplay.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const win = h.document.defaultView!;
    win.dispatchEvent(new win.CustomEvent("wildwood:open-guild-replay", { detail: { reportKey: "1:2" } }));
    expect(h.panel.isOpen()).toBe(true);
    expect(h.api.loadReplay).toHaveBeenCalledWith("1:2");
    expect(h.api.loadGuild).not.toHaveBeenCalled();
    h.click("Back"); finish(undefined as never); await settled();
    expect(h.panel.isOpen()).toBe(false);
    expect(h.document.querySelector("canvas")).toBeNull();
  });
  it("does not poll the database while open and closes when the session changes", async () => {
    vi.useFakeTimers(); const h = setup(); h.panel.open(); await settled();
    await vi.advanceTimersByTimeAsync(60_000); expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
    h.changeSession(); await vi.advanceTimersByTimeAsync(1000);
    expect(h.panel.isOpen()).toBe(false); expect(h.api.cancel).toHaveBeenCalled();
  });
  it("rejects a stale button immediately after an account switch, before the close timer fires", async () => {
    const h = setup(); h.panel.open(); await settled();
    h.changeSession(); h.click("Refresh"); await settled();
    expect(h.api.guildAction).not.toHaveBeenCalled();
    expect(h.panel.isOpen()).toBe(false);
  });
  it("discards loads completing after close", async () => {
    const h = setup(); let resolve!: (value: GuildSnapshot) => void;
    h.api.loadGuild.mockReturnValue(new Promise(done => { resolve = done; }));
    h.panel.open(); h.panel.close(); resolve(fixture()); await settled();
    expect(h.panel.isOpen()).toBe(false); expect(h.document.body.textContent).not.toContain("Wildwood");
  });
  it("recovers after a rejected action without discarding the existing roster", async () => {
    const h = setup(); h.panel.open(); await settled();
    h.api.guildAction.mockRejectedValueOnce(new Error("Connection interrupted"));
    h.click("Manage B"); h.click("Remove member"); h.click("Remove member"); await settled();
    expect(h.document.querySelector('[role="alert"]')?.textContent).toContain("Connection interrupted");
    expect(h.document.querySelectorAll(".guild-champion")).toHaveLength(0);
    expect(h.find("Refresh")?.disabled).toBe(false);
  });
  it("does not offer stale actions when a saved change cannot be refreshed", async () => {
    const h = setup(); h.panel.open(); await settled();
    h.api.loadGuild.mockRejectedValueOnce(new Error("Timeout"));
    h.click("Manage B"); h.click("Remove member"); h.click("Remove member"); await settled();
    expect(h.document.querySelector('[role="alert"]')?.textContent).toContain("Your change was saved");
    expect(h.find("Manage B")).toBeUndefined();
    h.click("Refresh"); await settled();
    expect(h.find("Refresh")?.disabled).toBe(false);
    expect(h.api.guildAction).toHaveBeenCalledTimes(1);
  });
});


describe("live friends inbox", () => {
  it("updates from the subscription cache without requesting another snapshot", async () => {
    let social: SocialSnapshot = { identity: "a", signedIn: true, friends: [], incomingRequests: [], outgoingRequests: [], guildInvitations: [], outgoingGuildInvitations: [], currentGuild: null };
    let revision = 1;
    const api = { loadSocial: vi.fn(async () => social), socialAction: vi.fn(async () => {}), revision: () => revision, snapshot: () => social } as unknown as SocialApi;
    const h = setup(fixture(), api); h.panel.open("friends"); await settled(); h.panel.tick();
    social = { ...social, incomingRequests: [{ id: "9", identity: "b", name: "Visitor" }] }; revision++;
    h.panel.tick(); expect(h.document.body.textContent).toContain("Visitor");
    expect(api.loadSocial).toHaveBeenCalledTimes(1);
    h.changeSession(); h.panel.tick(); expect(h.panel.isOpen()).toBe(false);
  });
  it("ignores an action completing after the account changes", async () => {
    const social: SocialSnapshot = { identity: "a", signedIn: true, friends: [], incomingRequests: [{ id: "9", identity: "b", name: "Visitor" }], outgoingRequests: [], guildInvitations: [], outgoingGuildInvitations: [], currentGuild: null };
    let finish!: () => void;
    const api = { loadSocial: vi.fn(async () => social), socialAction: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })), revision: () => 1, snapshot: () => social } as unknown as SocialApi;
    const h = setup(fixture(), api); h.panel.open("friends"); await settled(); h.click("Accept");
    h.changeSession(); h.panel.tick(); finish(); await settled();
    expect(h.panel.isOpen()).toBe(false); expect(api.loadSocial).toHaveBeenCalledTimes(1);
    expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
  });
});

it("paints distinct roster portraits and opens the selected profile without triggering management", async () => {
  const g = fixture();
  g.guild!.members[0].profileIcon = 5;
  g.guild!.members[1].profileIcon = 82;
  const h = setup(g); h.panel.open(); await settled();
  expect(h.find("View A's profile")?.querySelector(".guild-avatar")?.getAttribute("data-profile-icon")).toBe("5");
  expect(h.find("View B's profile")?.querySelector(".guild-avatar")?.getAttribute("data-profile-icon")).toBe("82");
  h.click("View B's profile");
  expect(h.onOpenPlayer).toHaveBeenCalledExactlyOnceWith("b", "B");
  h.click("Manage B");
  expect(h.onOpenPlayer).toHaveBeenCalledTimes(1);
  expect(h.api.guildAction).not.toHaveBeenCalled();
});

it("shows the guild overview and roster together, with Back closing the window", async () => {
  const g = fixture(); g.guild!.vicePresident = "b"; g.guild!.totalPower = 2_500_000_000;
  const h = setup(g); h.panel.open(); await settled();
  expect(h.document.querySelector("#guildOverlay .guild-window--overview")).toBeNull();
  expect(h.document.querySelector(".guild-total-power")?.textContent).toBe("Power:2.50b");
  expect(h.document.querySelector(".guild-total-power img")?.getAttribute("src")).toContain("Icon_Battle_Candy_v2.webp");
  expect(h.document.querySelector(".guild-stats")).toBeNull();
  expect(h.find("Members")).toBeUndefined();
  expect(h.document.querySelectorAll(".guild-officer--president")).toHaveLength(1);
  expect(h.document.querySelector("#guildTitle")?.textContent).toBe("Guilds");
  expect(h.document.querySelector(".guild-officer--president")?.textContent).toContain("A");
  expect(h.document.querySelector(".guild-officer--vice")?.textContent).toContain("B");
  expect(h.document.querySelectorAll(".guild-office-vacancy--future")).toHaveLength(2);
  expect(h.document.querySelectorAll(".guild-list .guild-member-profile")).toHaveLength(2);
  h.click("View B's profile");
  expect(h.onOpenPlayer).toHaveBeenCalledWith("b", "B");
  expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
  h.click("Back");
  expect(h.panel.isOpen()).toBe(false);
});

it("shows a vacant Vice President slot and no imaginary role actions", async () => {
  const h = setup(); h.panel.open(); await settled();
  expect(h.document.querySelector(".guild-office-vacancy")?.textContent).toContain("Vice PresidentVacant");
  expect(h.document.querySelectorAll(".guild-office-vacancy button")).toHaveLength(0);
});


it("opens another guild in a compact preview without closing your fullscreen guild", async () => {
  const h = setup(); h.panel.open("battles"); await settled();
  h.click("View Moonlight guild"); await settled();
  expect(h.api.loadGuildPreview).toHaveBeenCalledWith("2");
  const preview = h.document.querySelector<HTMLElement>(".guild-overlay--overview")!;
  expect(preview.hidden).toBe(false);
  expect(preview.textContent).toContain("Moonlight");
  expect(h.document.querySelector("#guildOverlay .guild-window--overview")).toBeNull();
  [...preview.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Back")!.click();
  expect(preview.hidden).toBe(true);
  expect(h.panel.isOpen()).toBe(true);
  expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
  expect(h.api.guildAction).not.toHaveBeenCalled();
});

it.each(["a", "b", "c"])("shows the badge pencil only to officers (%s)", async viewer => {
  const g = fixture(); g.identity = viewer; g.guild!.vicePresident = "b";
  g.guild!.members[0].power = 2500;
  const h = setup(g); h.panel.open(); await settled();
  expect(Boolean(h.find("Change guild badge"))).toBe(viewer !== "c");
  expect(h.document.querySelector(".guild-member-power")?.textContent).toContain("Power:");
  if (viewer !== "c") {
    h.click("Change guild badge");
    expect(h.document.querySelectorAll(".guild-badge-picker button")).toHaveLength(16);
    h.click("wolf badge"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "emblem", emblem: 0 });
  }
});
