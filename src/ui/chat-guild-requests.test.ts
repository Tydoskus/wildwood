import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createChatGuildRequests } from "./chat-guild-requests";
import type { GuildApi } from "../coop/services/guild-service";
import type { GuildSnapshot } from "../../shared/guilds";
const settle = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function setup(viewer = "president") {
  const { document, window } = parseHTML('<html><body></body></html>');
  const snapshot = { identity: viewer, guild: { id: "1", leader: "president", vicePresident: "vice", members: [], requests: [
    { identity: "applicant", name: "Moss", power: 123, prestige: 1, profileIcon: 0, requestedAt: "1000000" },
  ] } } as unknown as GuildSnapshot;
  const api = { loadGuild: vi.fn(async () => snapshot), guildAction: vi.fn(async () => { snapshot.guild!.requests = []; }) } as unknown as GuildApi;
  const panel = createChatGuildRequests({ document: document as unknown as Document, api: () => api, changed: vi.fn() });
  document.body.append(panel.tabs, panel.root);
  panel.refresh(viewer, "1", true);
  const click = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!.click();
  return { document, window, panel, api, snapshot, click };
}
describe("guild chat requests", () => {
  it.each(["president", "vice", "member"])("shows requests to %s with officer-only decisions", async viewer => {
    const h = setup(viewer); h.click("Requests"); await settle();
    expect(h.panel.root.textContent).toContain("Moss");
    expect(Boolean(h.panel.root.querySelector("textarea"))).toBe(viewer !== "member");
    expect(h.panel.root.textContent?.includes("Accept")).toBe(viewer !== "member");
    h.click("Chat"); expect(h.panel.root.hidden).toBe(true);
  });
  it("submits the optional note and removes a decided request", async () => {
    const h = setup(); h.click("Requests"); await settle();
    const note = h.panel.root.querySelector<HTMLTextAreaElement>("textarea")!; note.value = "Welcome!";
    note.dispatchEvent(new h.window.Event("input")); h.click("Accept"); await settle();
    expect(h.api.guildAction).toHaveBeenCalledWith({ kind: "admission", action: "accept", identity: "applicant", note: "Welcome!" });
    expect(h.panel.root.textContent).toContain("Decision sent to the player's mailbox.");
    expect(h.panel.root.textContent).toContain("No pending join requests.");
  });
  it("discards responses after the player leaves the guild", async () => {
    const h = setup(); let resolve!: (value: GuildSnapshot) => void;
    vi.mocked(h.api.loadGuild).mockImplementation(() => new Promise(done => { resolve = done; }));
    h.click("Requests"); h.panel.refresh("president", "", true); resolve(h.snapshot); await settle();
    expect(h.panel.root.hidden).toBe(true); expect(h.panel.root.textContent).not.toContain("Moss");
  });
});
