import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createGuildPanel } from "./guild-panel";
import type { GuildApi } from "../coop/services/guild-service";
import { resolveGuildBattle, type GuildSnapshot } from "../../shared/guilds";

const member = (identity: string, champion = true) => ({ identity, name: identity.toUpperCase(), champion, eligibleAt: "0", power: 100 });
const fixture = (): GuildSnapshot => ({
  identity: "a", serverNow: "1000000", week: 1, nextWeekAt: "9999999999999", joinAfter: "0", signedIn: true,
  guild: { id: "1", name: "Wildwood", leader: "a", attacksRemaining: 3, score: 12, members: [member("a"), member("b"), member("c"), member("d", false)] },
  directory: [{ id: "2", name: "Moonlight", members: 5, champions: 3, challengedToday: false }], nextPage: null,
  standings: [{ id: "1", name: "Wildwood", members: 4, score: 12, wins: 4, battles: 4 }], battles: [],
});
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup(snapshot = fixture()) {
  const { document } = parseHTML('<html><body><button id="guildBtn">Guilds</button></body></html>');
  const api = { cancel: vi.fn(), loadGuild: vi.fn(async () => snapshot), guildAction: vi.fn(async () => {}) } satisfies GuildApi;
  let session = "a";
  const onClose = vi.fn();
  const panel = createGuildPanel({ document: document as unknown as Document, api: () => api, sessionKey: () => session, beforeOpen: vi.fn(), onClose });
  disposals.push(panel.dispose);
  const find = (label: string) => [...document.querySelectorAll("#guildOverlay button")].find(el => el.textContent === label || el.getAttribute("aria-label") === label) as HTMLButtonElement | undefined;
  const click = (label: string) => { const target = find(label); expect(target, label).toBeTruthy(); expect(target!.disabled, `${label} disabled`).toBe(false); target!.click(); };
  return { panel, api, document, click, find, onClose, changeSession: () => { session = "b"; } };
}
async function settled() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

describe("guild panel", () => {
  it("keeps navigation focused and reuses the loaded snapshot across sections", async () => {
    const h = setup(); h.panel.open(); await settled();
    expect([...h.document.querySelectorAll(".guild-tabs button")].map(node => node.textContent)).toEqual(["Guild", "Battles", "Rankings"]);
    expect(h.document.querySelectorAll(".guild-champion")).toHaveLength(3);
    expect(h.find("Transfer leadership")).toBeUndefined();
    expect(h.find("Remove member")).toBeUndefined();
    h.click("Rankings"); h.click("Battles");
    expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
  });
  it("reveals management only for the selected member and confirms leadership changes", async () => {
    const h = setup(); h.panel.open(); await settled(); h.click("Manage B");
    h.click("Transfer leadership");
    expect(h.api.guildAction).not.toHaveBeenCalled();
    expect(h.document.body.textContent).toContain("Make B leader?");
    h.click("Cancel"); expect(h.api.guildAction).not.toHaveBeenCalled();
    h.click("Transfer leadership"); h.click("Transfer leadership"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledExactlyOnceWith({ kind: "transfer", identity: "b" });
  });
  it("prevents selecting a fourth champion and lets a saved champion update their own build", async () => {
    const h = setup(); h.panel.open(); await settled(); h.click("Manage D");
    expect(h.find("Set as champion")?.disabled).toBe(true);
    h.click("Update my build"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "refreshChampion" });
    expect(h.document.body.textContent).toContain("Your champion build is up to date.");
  });
  it("does not offer a build refresh to a member who is not a champion", async () => {
    const g = fixture(); g.identity = "d";
    const h = setup(g); h.panel.open(); await settled();
    expect(h.find("Update my build")).toBeUndefined();
    expect(h.find("Manage A")).toBeUndefined();
    h.click("Battles"); expect(h.find("Challenge")).toBeUndefined();
  });
  it("requires confirmation before spending a guild attack", async () => {
    const h = setup(); h.panel.open("battles"); await settled(); h.click("Challenge");
    expect(h.document.body.textContent).toContain("Uses 1 of your guild’s 3 remaining attacks today.");
    expect(h.api.guildAction).not.toHaveBeenCalled();
    h.click("Start battle"); await settled();
    expect(h.api.guildAction).toHaveBeenCalledExactlyOnceWith({ kind: "challenge", opponentGuildId: "2" });
    expect(h.document.body.textContent).toContain("Battle complete.");
  });
  it.each(["challenged", "no-attacks", "no-team", "opponent-not-ready"])("disables unavailable challenges: %s", async reason => {
    const g = fixture();
    if (reason === "challenged") g.directory[0].challengedToday = true;
    if (reason === "no-attacks") g.guild!.attacksRemaining = 0;
    if (reason === "no-team") g.guild!.members[0].champion = false;
    if (reason === "opponent-not-ready") g.directory[0].champions = 2;
    const h = setup(g); h.panel.open("battles"); await settled();
    expect((h.find("Challenge") ?? h.find("Challenged") ?? h.find("Not ready"))?.disabled).toBe(true);
  });
  it("keeps joining and creation disabled for guests and during membership cooldown", async () => {
    const g = fixture(); g.guild = null; g.signedIn = false;
    const h = setup(g); h.panel.open(); await settled();
    expect(h.find("Join")?.disabled).toBe(true); expect(h.find("Create a guild")).toBeUndefined();
    h.api.loadGuild.mockResolvedValue({ ...g, signedIn: true, joinAfter: "999999999999999999" });
    h.click("Refresh"); await settled();
    expect(h.find("Join")?.disabled).toBe(true); expect(h.find("Create a guild")?.disabled).toBe(true);
  });
  it("renders user names as text and only reveals the creation form on request", async () => {
    const g = fixture(); g.guild = null; g.directory[0].name = '<img src=x onerror="attack()">';
    const h = setup(g); h.panel.open(); await settled();
    expect(h.document.body.textContent).toContain(g.directory[0].name);
    expect(h.document.querySelector("#guildOverlay img")).toBeNull();
    expect(h.document.querySelector("#guildName")).toBeNull(); h.click("Create a guild");
    const input = h.document.querySelector("#guildName") as unknown as HTMLInputElement;
    input.value = "New Guild";
    h.document.querySelector("form")!.dispatchEvent(new h.document.defaultView!.Event("submit", { cancelable: true }));
    await settled(); expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "create", name: "New Guild" });
  });
  it("shows defensive results from the current guild's perspective", async () => {
    const g = fixture();
    const fighter = { damage: 4, maxHp: 30, armor: 0, regen: 0, attackRate: 1 };
    const result = resolveGuildBattle(["a", "b", "c"].map(name => ({ identity: name, name, fighter })), ["d", "e", "f"].map(name => ({ identity: name, name, fighter })));
    g.battles = [{ id: "1", attackerId: "2", defenderId: "1", attacker: "Moonlight", defender: "Wildwood", at: "1000000", result: { ...result, wins: 3, losses: 0, outcome: "VICTORY" } }];
    const h = setup(g); h.panel.open("battles"); await settled();
    const report = h.document.querySelector(".guild-report summary")!;
    expect(report.textContent).toContain("Defeat"); expect(report.textContent).toContain("0–3");
    expect(report.textContent).toContain("vs Moonlight"); expect(report.textContent).toContain("Defense");
  });
  it("does not poll the database while open and closes when the session changes", async () => {
    vi.useFakeTimers(); const h = setup(); h.panel.open(); await settled();
    await vi.advanceTimersByTimeAsync(60_000); expect(h.api.loadGuild).toHaveBeenCalledTimes(1);
    h.changeSession(); await vi.advanceTimersByTimeAsync(1000);
    expect(h.panel.isOpen()).toBe(false); expect(h.api.cancel).toHaveBeenCalled();
  });
  it("rejects a stale button immediately after an account switch, before the close timer fires", async () => {
    const h = setup(); h.panel.open(); await settled();
    h.changeSession(); h.click("Update my build"); await settled();
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
    h.click("Update my build"); await settled();
    expect(h.document.querySelector('[role="alert"]')?.textContent).toContain("Connection interrupted");
    expect(h.document.querySelectorAll(".guild-champion")).toHaveLength(3);
    expect(h.find("Update my build")?.disabled).toBe(false);
  });
  it("does not offer stale actions when a saved change cannot be refreshed", async () => {
    const h = setup(); h.panel.open(); await settled();
    h.api.loadGuild.mockRejectedValueOnce(new Error("Timeout"));
    h.click("Update my build"); await settled();
    expect(h.document.querySelector('[role="alert"]')?.textContent).toContain("Your change was saved");
    expect(h.find("Update my build")).toBeUndefined();
    h.click("Refresh"); await settled();
    expect(h.find("Update my build")?.disabled).toBe(false);
    expect(h.api.guildAction).toHaveBeenCalledTimes(1);
  });
});
