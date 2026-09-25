import type { GuildApi } from "../coop/services/guild-service";
import { GUILD_MEMBER_LIMIT, type GuildSnapshot } from "../../shared/guilds";
import { renderGuildMemberName } from "./guild-member-name";
import { applyProfileIcon } from "../app/profile-icons";

/** On-demand guild requests share chat's account and guild boundaries. */
export function createChatGuildRequests(options: {
  document: Document; api: () => GuildApi | undefined;
  changed: () => void; openPlayer?: (identity: string, name: string) => void;
}) {
  const doc = options.document;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") => {
    const result = doc.createElement(tag); result.textContent = text; result.className = className; return result;
  };
  const tabs = node("div", "", "chat-guild-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Guild chat view");
  const root = node("section", "", "chat-guild-requests"); root.setAttribute("aria-label", "Guild join requests");
  let context = "", guildId = "", selected = false, visible = false, generation = 0, busy = false;
  let snapshot: GuildSnapshot | null = null, message = "";
  const drafts = new Map<string, string>();
  const buttons = [false, true].map(requests => {
    const button = node("button", requests ? "Requests" : "Chat"); button.type = "button"; button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      if (selected === requests) return;
      selected = requests; updateVisibility(); options.changed();
      if (requests) void load();
    });
    tabs.append(button); return button;
  });
  function updateVisibility() {
    tabs.hidden = !visible; root.hidden = !visible || !selected;
    buttons.forEach((button, index) => button.setAttribute("aria-selected", String(selected === Boolean(index))));
  }
  function render() {
    root.replaceChildren();
    const heading = node("div", "", "guild-request-heading"); heading.append(node("h3", "Join requests"));
    const refresh = node("button", "↻", "guild-requests-refresh"); refresh.type = "button"; refresh.disabled = busy;
    refresh.setAttribute("aria-label", "Refresh join requests"); refresh.title = "Refresh join requests";
    refresh.addEventListener("click", () => void load()); heading.append(refresh); root.append(heading);
    if (message) { const status = node("p", message); status.setAttribute("role", "status"); root.append(status); }
    if (!snapshot?.guild) return;
    const guild = snapshot.guild;
    const officer = snapshot.identity === guild.leader || snapshot.identity === guild.vicePresident;
    if (!guild.requests?.length) root.append(node("p", "No pending join requests."));
    for (const request of guild.requests ?? []) {
      const card = node("article", "", "guild-request-card");
      const profile = node("button", "", "guild-member-profile"); profile.type = "button";
      profile.setAttribute("aria-label", `View ${request.name}'s profile`);
      const avatar = node("span", "", "guild-avatar"); applyProfileIcon(avatar, request.profileIcon);
      const name = node("strong", "", "guild-row-copy"); renderGuildMemberName(name, request);
      profile.append(avatar, name); profile.addEventListener("click", () => options.openPlayer?.(request.identity, request.name)); card.append(profile);
      card.append(node("p", request.online ? "Online" : "Offline", request.online ? "guild-request-online" : "guild-request-offline"));
      card.append(node("p", `Requested ${new Date(Number(BigInt(request.requestedAt) / 1000n)).toLocaleDateString()}`));
      if (officer) {
        const label = node("label", "Optional note");
        const note = node("textarea"); note.maxLength = 300; note.rows = 2; note.placeholder = "Message to the applicant";
        note.value = drafts.get(request.identity) ?? ""; note.disabled = busy;
        note.addEventListener("input", () => drafts.set(request.identity, note.value)); label.append(note); card.append(label);
        const actions = node("div", "", "guild-request-actions");
        for (const accept of [true, false]) {
          const button = node("button", accept ? "Accept" : "Deny", `window-back-button guild-request-${accept ? "accept" : "deny"}`); button.type = "button";
          button.disabled = busy || (accept && guild.members.length >= GUILD_MEMBER_LIMIT);
          button.addEventListener("click", () => void load({ kind: "admission", action: accept ? "accept" : "decline", identity: request.identity, note: note.value }));
          actions.append(button);
        }
        card.append(actions);
      }
      root.append(card);
    }
  }
  async function load(action?: Parameters<GuildApi["guildAction"]>[0]) {
    if (busy || !visible || !selected) return;
    const api = options.api(); if (!api) { message = "Connect to view requests."; render(); return; }
    const expected = ++generation; busy = true; message = action ? "Saving…" : "Loading…"; render();
    try {
      if (action) await api.guildAction(action);
      if (expected !== generation) return;
      const result = await api.loadGuild();
      if (expected !== generation) return;
      if (result.guild?.id !== guildId) { snapshot = null; message = "Your guild changed. Reopen guild chat."; return; }
      snapshot = result; message = action ? "Decision sent to the player's mailbox." : "";
      if (action?.kind === "admission" && action.identity) drafts.delete(action.identity);
    } catch (error) { if (expected === generation) message = error instanceof Error ? error.message : "Could not load requests."; }
    finally { if (expected === generation) { busy = false; render(); } }
  }
  updateVisibility();
  return { tabs, root, isSelected: () => visible && selected,
    refresh(identity: string, nextGuild: string, show: boolean) {
      const nextContext = `${identity}:${nextGuild}`;
      if (nextContext !== context || (!show && visible)) {
        generation++; busy = false; selected = false; snapshot = null; message = ""; drafts.clear(); root.replaceChildren();
      }
      context = nextContext; guildId = nextGuild; visible = show && Boolean(nextGuild); updateVisibility();
    },
  };
}
