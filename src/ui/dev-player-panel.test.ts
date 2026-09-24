import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import type { DevPlayerCard } from "../../shared/dev-console";
import { createDevPlayerPanel, type DevPlayerApi } from "./dev-player-panel";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.now();
const card = (): DevPlayerCard => ({
  summary: { identity: "ab".repeat(32), displayName: "Rude", isGuest: false, online: true, suspendedUntilMs: 0, permanentlySuspended: false,
    chatMutedUntilMs: NOW + 30 * 60_000 },
  pastNames: ["OldRude"], prestigeLevel: 3, power: 120, joinedAtMs: NOW - 86_400_000, strikes: 2, muteCount: 1,
  reportsFiled: 0, reportsAgainst: 4, history: [],
  recentChat: [{ channel: "dm", where: "DM with Alice", text: "hello", sentAtMs: NOW - 60_000, moderated: false }],
  serverNowMs: NOW,
});

function harness() {
  const { document } = parseHTML("<html><body><section id=p></section></body></html>");
  vi.stubGlobal("document", document);
  const api: DevPlayerApi = {
    findPlayers: vi.fn(async () => []), playerCard: vi.fn(async () => card()),
    setChatMute: vi.fn(async () => ({ ok: true })), suspend: vi.fn(async () => ({ ok: true })), liftSuspension: vi.fn(async () => ({ ok: true })),
    warn: vi.fn(async () => ({ ok: true })), resetDisplayName: vi.fn(async () => ({ ok: true })),
  };
  const confirm = vi.fn(async () => true);
  const showMessage = vi.fn();
  const root = document.getElementById("p") as unknown as HTMLElement;
  const panel = createDevPlayerPanel(root, { api: () => api, confirm, showMessage, onAccessDenied: vi.fn() });
  const button = (label: string) => [...root.querySelectorAll("button")].find(element => element.textContent === label) as HTMLButtonElement;
  const type = (placeholder: string, value: string) => {
    const input = root.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new (input.ownerDocument.defaultView as any).Event("input"));
    return input;
  };
  return { panel, api, confirm, showMessage, root, button, type };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("player card", () => {
  it("shows standing, names, reports and recent chat for the player opened from another tab", async () => {
    const h = harness();
    h.panel.open("ab".repeat(32), "Rude");
    await settle();
    const text = h.root.textContent ?? "";
    for (const expected of ["OldRude", "Prestige3", "Power120", "4 against · 0 filed", "2 · 1 mutes so far", "Chat muted", "DM with Alice hello"]) {
      expect(text).toContain(expected);
    }
    expect(h.button("Unmute").disabled).toBe(false);
    expect(h.button("Unban").disabled).toBe(true);
  });

  it("needs a reason to ban, confirms warnings, and takes custom lengths", async () => {
    const h = harness();
    h.panel.open("ab".repeat(32), "Rude");
    await settle();
    h.button("Ban 24h").click();
    await settle();
    expect(h.api.suspend).not.toHaveBeenCalled();
    h.type("Reason (saved in the moderation log)", "Slurs");
    h.type("Hours", "12");
    h.button("Ban").click();
    await settle(); await settle();
    expect(h.api.suspend).toHaveBeenCalledWith("ab".repeat(32), "Rude", 12, "Slurs");
    await settle();
    h.type("Warning letter to the player", "Keep it friendly");
    h.button("Send warning").click();
    await settle(); await settle();
    expect(h.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ confirmLabel: "Send warning" }));
    expect(h.api.warn).toHaveBeenCalledWith("ab".repeat(32), "Keep it friendly");
    await settle();
    h.type("Minutes", "90");
    h.button("Mute").click();
    await settle();
    expect(h.api.setChatMute).toHaveBeenCalledWith("ab".repeat(32), 90);
  });
});
