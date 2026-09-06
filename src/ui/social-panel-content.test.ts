import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { renderFriends, renderGuildInvites } from "./social-panel-content";
import type { SocialSnapshot } from "../../shared/social";

function setup() {
  const { document, window } = parseHTML("<html><body></body></html>");
  const snapshot: SocialSnapshot = {
    identity: "me", signedIn: true, currentGuild: null,
    friends: [{ identity: "friend", name: "Archer", online: true }],
    incomingRequests: [{ id: "1", identity: "new", name: "Newcomer" }],
    outgoingRequests: [{ id: "2", identity: "pending", name: "Pending" }],
    guildInvitations: [{ id: "3", guildId: "4", guildName: "Fire", inviterName: "Leader" }],
    outgoingGuildInvitations: [],
  };
  const act = vi.fn(), message = vi.fn();
  const ctx = { document: document as unknown as Document, snapshot, busy: false, drafts: { friend: "", invite: "" }, act, message };
  const click = (label: string) => {
    const button = [...document.querySelectorAll("button")].find(el => el.textContent === label)!;
    expect(button).toBeTruthy(); button.click();
  };
  return { document, window, snapshot, ctx, act, message, click, parent: document.body as unknown as HTMLElement };
}
describe("social panel content", () => {
  it("uses request and invitation IDs for accept, decline, and cancellation", () => {
    const h = setup(); renderFriends(h.parent, h.ctx);
    h.click("Accept"); expect(h.act).toHaveBeenLastCalledWith({ action: "acceptFriend", requestId: "1" });
    h.click("Cancel request"); expect(h.act).toHaveBeenLastCalledWith({ action: "cancelFriend", requestId: "2" });
    h.click("Join guild"); expect(h.act).toHaveBeenLastCalledWith({ action: "acceptGuildInvite", invitationId: "3" });
    h.click("Message"); expect(h.message).toHaveBeenCalledWith("Archer", "friend");
  });
  it("submits trimmed usernames and retains the draft while controls rerender", () => {
    const h = setup(); renderFriends(h.parent, h.ctx);
    const input = h.document.querySelector("input")!; input.value = "  Archer  ";
    input.dispatchEvent(new h.window.Event("input"));
    h.document.querySelector("form")!.dispatchEvent(new h.window.Event("submit", { cancelable: true }));
    expect(h.act).toHaveBeenCalledWith({ action: "requestFriend", username: "Archer" });
    expect(h.ctx.drafts.friend).toBe("  Archer  ");
  });
  it("invites friends, excludes guild members, and disables already invited friends", () => {
    const h = setup(); renderGuildInvites(h.parent, h.ctx, ["me"]);
    h.click("Invite"); expect(h.act).toHaveBeenCalledWith({ action: "inviteGuild", username: "friend" });
    h.snapshot.outgoingGuildInvitations.push({ id: "8", identity: "friend", name: "Archer", guildId: "4" });
    h.parent.replaceChildren(); renderGuildInvites(h.parent, h.ctx, ["me"]);
    expect([...h.document.querySelectorAll("button")].find(el => el.textContent === "Invited")!.disabled).toBe(true);
    h.click("Revoke"); expect(h.act).toHaveBeenLastCalledWith({ action: "revokeGuildInvite", invitationId: "8" });
    h.parent.replaceChildren(); renderGuildInvites(h.parent, h.ctx, ["friend"]);
    expect([...h.document.querySelectorAll("button")].some(el => el.textContent === "Invite")).toBe(false);
  });
  it("omits unavailable presence and orders friends by name", () => {
    const h = setup(); h.snapshot.friends = [{ identity: "z", name: "Zebra" }, { identity: "a", name: "Archer" }];
    renderFriends(h.parent, h.ctx);
    expect(h.parent.textContent).not.toContain("Offline");
    expect(h.parent.textContent).not.toContain("online");
    expect([...h.document.querySelectorAll(".social-row strong")].map(el => el.textContent).filter(name => name === "Archer" || name === "Zebra")).toEqual(["Archer", "Zebra"]);
    h.parent.replaceChildren(); renderGuildInvites(h.parent, h.ctx, []);
    expect(h.parent.textContent).not.toContain("Offline");
    expect(h.parent.textContent).not.toContain("Online");
  });
  it("renders player text safely and prevents joining while already in a guild", () => {
    const h = setup(); h.snapshot.friends[0].name = '<img src=x onerror="oops">';
    h.snapshot.currentGuild = { id: "4", name: "Fire" }; renderFriends(h.parent, h.ctx);
    expect(h.document.querySelector("img")).toBeNull();
    expect([...h.document.querySelectorAll("button")].find(el => el.textContent === "Join guild")!.disabled).toBe(true);
  });
});
