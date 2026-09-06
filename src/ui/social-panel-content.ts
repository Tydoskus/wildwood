import type { SocialAction, SocialSnapshot } from "../../shared/social";

type Context = {
  document: Document;
  snapshot: SocialSnapshot;
  busy: boolean;
  drafts: { friend: string; invite: string };
  act: (action: SocialAction) => void;
  message: (username: string, identity: string) => void;
};
function controls(ctx: Context) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") => {
    const el = ctx.document.createElement(tag); el.textContent = text; el.className = className; return el;
  };
  const button = (text: string, run: () => void, key: string, style = "secondary") => {
    const el = node("button", text, `guild-button guild-button--${style}`);
    el.type = "button"; el.disabled = ctx.busy; el.dataset.focusKey = key; el.addEventListener("click", run); return el;
  };
  const heading = (parent: HTMLElement, title: string, detail: string) => {
    const el = node("div", "", "guild-section-heading"); el.append(node("h3", title), node("p", detail)); parent.append(el);
  };
  const row = (parent: HTMLElement, name: string, detail: string) => {
    const el = node("div", "", "guild-row social-row");
    const copy = node("div", "", "guild-row-copy"); copy.append(node("strong", name));
    if (detail) copy.append(node("span", detail));
    const actions = node("div", "", "social-actions"); el.append(copy, actions); parent.append(el); return actions;
  };
  const form = (parent: HTMLElement, key: "friend" | "invite", labelText: string, submit: string, action: "requestFriend" | "inviteGuild") => {
    const el = node("form", "", "guild-create social-form");
    const label = node("label", labelText); label.htmlFor = `social-${key}`;
    const input = node("input"); input.id = label.htmlFor; input.name = "username"; input.placeholder = "Exact username";
    input.autocomplete = "off"; input.required = true; input.maxLength = 32; input.disabled = ctx.busy;
    input.value = ctx.drafts[key]; input.dataset.focusKey = key;
    input.addEventListener("input", () => { ctx.drafts[key] = input.value; });
    const send = button(submit, () => {}, `${key}-submit`, "primary"); send.type = "submit";
    el.append(label, input, send);
    el.addEventListener("submit", event => {
      event.preventDefault(); const username = input.value.trim();
      if (!ctx.busy && username) ctx.act({ action, username });
    }); parent.append(el);
  };
  return { node, button, heading, row, form };
}

export function renderFriends(parent: HTMLElement, ctx: Context) {
  const { node, button, heading, row, form } = controls(ctx);
  const s = ctx.snapshot;
  heading(parent, "Stay in touch", "Add a player by username to chat privately and invite them to your guild.");
  form(parent, "friend", "Player username", "Add friend", "requestFriend");
  if (s.guildInvitations.length) {
    heading(parent, "Guild invitations", "Accept an invitation to join the guild.");
    for (const invite of s.guildInvitations) {
      const actions = row(parent, invite.guildName, `Invited by ${invite.inviterName}`);
      const accept = button("Join guild", () => ctx.act({ action: "acceptGuildInvite", invitationId: invite.id }), `join-invite-${invite.id}`, "primary");
      accept.disabled ||= Boolean(s.currentGuild);
      actions.append(accept, button("Decline", () => ctx.act({ action: "declineGuildInvite", invitationId: invite.id }), `decline-invite-${invite.id}`, "quiet"));
    }
    if (s.currentGuild) parent.append(node("p", "Leave your current guild before accepting another invitation.", "guild-callout"));
  }
  if (s.incomingRequests.length) {
    heading(parent, "Friend requests", `${s.incomingRequests.length} waiting for you`);
    for (const request of s.incomingRequests) {
      row(parent, request.name, "Wants to be friends").append(
        button("Accept", () => ctx.act({ action: "acceptFriend", requestId: request.id }), `accept-${request.id}`, "primary"),
        button("Decline", () => ctx.act({ action: "declineFriend", requestId: request.id }), `decline-${request.id}`, "quiet"));
    }
  }
  const presenceKnown = s.friends.length > 0 && s.friends.every(friend => typeof friend.online === "boolean");
  heading(parent, "Your friends", `${s.friends.length} friends${presenceKnown ? ` · ${s.friends.filter(friend => friend.online).length} online` : ""}`);
  if (!s.friends.length) parent.append(node("p", "Your friends will appear here after a request is accepted.", "guild-callout"));
  for (const friend of [...s.friends].sort((a, b) => a.name.localeCompare(b.name) || a.identity.localeCompare(b.identity))) {
    const actions = row(parent, friend.name, friend.online === undefined ? "" : friend.online ? "Online" : "Offline");
    actions.append(button("Message", () => ctx.message(friend.name, friend.identity), `message-${friend.identity}`));
    const menu = node("details", "", "social-manage");
    const summary = node("summary", "Manage"); summary.setAttribute("aria-label", `Manage friendship with ${friend.name}`);
    menu.append(summary, button("Remove friend", () => ctx.act({ action: "removeFriend", identity: friend.identity }), `remove-${friend.identity}`, "danger")); actions.append(menu);
  }
  if (s.outgoingRequests.length) {
    heading(parent, "Sent requests", "Waiting for a response");
    for (const request of s.outgoingRequests) row(parent, request.name, "Pending").append(
      button("Cancel request", () => ctx.act({ action: "cancelFriend", requestId: request.id }), `cancel-${request.id}`, "quiet"));
  }
}

export function renderGuildInvites(parent: HTMLElement, ctx: Context, memberIdentities: string[]) {
  const { node, button, heading, row, form } = controls(ctx);
  const disclosure = node("details", "", "guild-disclosure social-invite");
  disclosure.append(node("summary", "Invite players"));
  heading(disclosure, "Grow your guild", "Invite a player by username or choose a friend.");
  form(disclosure, "invite", "Player username", "Send invitation", "inviteGuild");
  const pending = ctx.snapshot.outgoingGuildInvitations;
  const eligible = ctx.snapshot.friends.filter(friend => !memberIdentities.includes(friend.identity))
    .sort((a, b) => a.name.localeCompare(b.name) || a.identity.localeCompare(b.identity));
  for (const friend of eligible) {
    const invited = pending.some(invite => invite.identity === friend.identity);
    const inviteButton = button(invited ? "Invited" : "Invite", () => ctx.act({ action: "inviteGuild", username: friend.identity }), `invite-friend-${friend.identity}`);
    inviteButton.disabled ||= invited;
    row(disclosure, friend.name, friend.online === undefined ? "" : friend.online ? "Online" : "Offline").append(inviteButton);
  }
  if (pending.length) {
    heading(disclosure, "Pending invitations", "Invitations remain available until accepted, declined, or revoked.");
    for (const invite of pending) row(disclosure, invite.name, "Pending").append(
      button("Revoke", () => ctx.act({ action: "revokeGuildInvite", invitationId: invite.id }), `revoke-${invite.id}`, "quiet"));
  }
  parent.append(disclosure);
}
