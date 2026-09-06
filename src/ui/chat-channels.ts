import type { ChatUnreadCounts } from "./chat-unread";

export type ChatChannel = "public" | "guild" | "private";
export type ChatConversation = { identity: string; name: string };

export function mergeChatConversations(friends: ChatConversation[], conversations: ChatConversation[]) {
  const names = new Map<string, ChatConversation>();
  for (const person of [...conversations, ...friends]) {
    if (person.name.trim()) names.set(person.identity || person.name.trim().toLowerCase(), person);
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createChatChannelPicker(onChange: (channel: ChatChannel, username: string, identity?: string) => void) {
  const root = document.createElement("div");
  root.className = "chat-channels";
  const tabs = document.createElement("div");
  tabs.className = "chat-channel-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Chat channel");
  const buttons = new Map<ChatChannel, HTMLButtonElement>();
  let selected: ChatChannel = "public";
  let peer = "";
  let peerIdentity: string | undefined;
  let people: ChatConversation[] = [];
  for (const channel of ["public", "guild", "private"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = channel[0].toUpperCase() + channel.slice(1);
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => select(channel, peer, peerIdentity));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const channels = [...buttons.keys()];
      const index = channels.indexOf(channel);
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      select(channels[next], peer, peerIdentity);
      buttons.get(channels[next])?.focus();
    });
    buttons.set(channel, button);
    tabs.append(button);
  }
  const picker = document.createElement("form");
  picker.className = "chat-private-picker";
  const username = document.createElement("input");
  username.type = "text";
  username.placeholder = "Friend username";
  username.setAttribute("aria-label", "Private message recipient username");
  username.autocomplete = "off";
  username.maxLength = 40;
  const open = document.createElement("button");
  open.type = "submit";
  open.textContent = "Open";
  const contacts = document.createElement("select");
  contacts.setAttribute("aria-label", "Friends and private conversations");
  contacts.addEventListener("change", () => {
    const person = people.find(person => person.identity === contacts.value);
    if (person) select("private", person.name, person.identity);
  });
  picker.addEventListener("submit", (event) => {
    event.preventDefault();
    if (username.value.trim()) select("private", username.value.trim());
  });
  const manageFriends = document.createElement("button");
  manageFriends.type = "button";
  manageFriends.textContent = "Manage friends";
  manageFriends.className = "chat-manage-friends";
  manageFriends.addEventListener("click", () => window.dispatchEvent(new CustomEvent("wildwood:open-friends")));
  picker.append(username, open, contacts, manageFriends);
  const status = document.createElement("div");
  status.className = "chat-channel-status";
  status.setAttribute("aria-live", "polite");
  root.append(tabs, picker, status);

  function update() {
    for (const [channel, button] of buttons) {
      button.setAttribute("aria-selected", String(channel === selected));
      button.tabIndex = channel === selected ? 0 : -1;
    }
    picker.hidden = selected !== "private";
    username.value = peer;
  }
  function select(channel: ChatChannel, nextPeer: string, identity?: string) {
    selected = channel;
    peer = nextPeer.trim();
    peerIdentity = identity ?? people.find(person => person.name.toLowerCase() === peer.toLowerCase())?.identity;
    update();
    onChange(selected, peer, peerIdentity);
  }
  let contactSignature = "";
  function refresh(friends: ChatConversation[], conversations: ChatConversation[], guildName: string, unread: ChatUnreadCounts) {
    people = mergeChatConversations(friends, conversations);
    peerIdentity ??= people.find(person => person.name.toLowerCase() === peer.toLowerCase())?.identity;
    const currentPeer = people.find(person => person.identity === peerIdentity);
    if (currentPeer && currentPeer.name !== peer) {
      if (username.value === peer) username.value = currentPeer.name;
      peer = currentPeer.name;
    }
    for (const [channel, button] of buttons) {
      const count = channel === "guild" ? unread.guild : channel === "private" ? unread.private : 0;
      const label = channel[0].toUpperCase() + channel.slice(1);
      button.textContent = count ? `${label} · ${count}` : label;
      button.setAttribute("aria-label", count ? `${label}, ${count} unread messages` : label);
    }
    const signature = JSON.stringify([people, [...unread.conversations]]);
    if (signature !== contactSignature) {
      contactSignature = signature;
      contacts.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Friends & conversations";
      contacts.append(placeholder);
      for (const person of people) {
        const option = document.createElement("option");
        option.value = person.identity;
        const count = unread.conversations.get(person.identity) ?? 0;
        option.textContent = count ? `${person.name} (${count} unread)` : person.name;
        contacts.append(option);
      }
    }
    status.textContent = selected === "guild" ? (guildName ? `Guild: ${guildName}` : "Join or create a guild to chat with members.")
      : selected === "private" ? (peer ? `Private conversation with ${peer}` : "Enter a friend’s username or choose a conversation.") : "Public chat";
  }
  update();
  return { root, select, refresh };
}
