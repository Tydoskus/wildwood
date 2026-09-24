import { parseHTML } from "linkedom";
import { vi } from "vitest";
import { createChatController } from "../../src/ui/chat";

type ChatOptions = Parameters<typeof createChatController>[0];
type Coop = NonNullable<ReturnType<ChatOptions["getCoop"]>>;
type Social = NonNullable<Coop["social"]>;
type Message = ReturnType<NonNullable<Coop["chatMessages"]>>[number];
type Conversation = ReturnType<Social["friends"]>[number];

export const LOCAL_IDENTITY = "a".repeat(64);
const identity = (index: number) => index.toString(16).padStart(64, "0");

/** Realistic client-side volumes: the public view pages 50 rows, the social
 * view 50 guild and 50 direct messages, and a friend list of about 50. */
export function chatFixture(options: { publicMessages?: number; guildMessages?: number; privateMessages?: number; friends?: number } = {}) {
  const now = Date.now();
  let nextId = 1n;
  const message = (sender: string, text: string, ageMs: number): Message => ({
    id: nextId++, sender, senderName: `Player ${sender.slice(-4)}`, message: text, replayId: 0n, powerLevel: 1200,
    senderGender: 0 as Message["senderGender"], moderated: false, replyToMessageId: 0n, replyToSenderName: "",
    replyToMessage: "", sentAtMs: Date.now() - ageMs, reactionCountsJson: "{}", guildReplayKey: "",
  });
  const friends: Conversation[] = Array.from({ length: options.friends ?? 50 }, (_, index) => ({
    identity: identity(1_000 + index), name: `Friend ${index}`, lastMessage: "hello", lastSentAtMs: now - index * 1_000,
  }));
  const publicRows = Array.from({ length: options.publicMessages ?? 50 }, (_, index) =>
    message(identity(index % 40 + 1), `public message ${index}`, (options.publicMessages ?? 50) * 1_000 - index * 1_000));
  const guildRows = Array.from({ length: options.guildMessages ?? 50 }, (_, index) =>
    message(identity(index % 10 + 1), `guild message ${index}`, 60_000 + index));
  const privateRows = new Map<string, Message[]>();
  for (let index = 0; index < (options.privateMessages ?? 50); index++) {
    const friend = friends[index % Math.max(1, friends.length)];
    if (!friend) break;
    const rows = privateRows.get(friend.identity) ?? [];
    rows.push(message(friend.identity, `dm ${index}`, 30_000 + index));
    privateRows.set(friend.identity, rows);
  }
  const state = {
    chatRevision: 1, socialRevision: 1, publicRows, guildRows, privateRows, friends,
    conversations: friends.slice(0, 10) as Conversation[],
  };
  const counts = new Map<string, number>();
  const count = <T extends (...args: never[]) => unknown>(name: string, fn: T) => ((...args: Parameters<T>) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return fn(...args);
  }) as T;
  const social: Social = {
    revision: count("social.revision", () => state.socialRevision),
    historyRevision: () => 0,
    guildMessages: count("social.guildMessages", () => state.guildRows),
    privateMessages: count("social.privateMessages", (peer: string) => state.privateRows.get(peer) ?? []),
    friends: count("social.friends", () => state.friends),
    privateConversations: count("social.privateConversations", () => state.conversations),
    currentGuild: () => ({ id: "7", name: "Guild" }),
    loadSocial: async () => ({}),
    sendGuildMessage: async () => ({ ok: true }),
    sendPrivateMessage: async () => ({ ok: true }),
    reportMessage: async () => ({ ok: true }),
  };
  const coop: Coop = {
    social,
    localIdentity: () => LOCAL_IDENTITY,
    isGuest: count("isGuest", () => false),
    profileIcon: count("profileIcon", () => 3),
    playerGender: () => 0 as Message["senderGender"],
    chatRevision: count("chatRevision", () => state.chatRevision),
    chatHistoryRevision: () => 0,
    isPlayerBlocked: count("isPlayerBlocked", () => false),
    chatMessages: count("chatMessages", () => state.publicRows),
    sendChatMessage: async () => ({ ok: true }),
  };
  function addPublicMessage(text = "new message") {
    state.publicRows = [...state.publicRows.slice(1), message(identity(99), text, 0)];
    state.chatRevision++;
  }
  /** A profile, name-tag or portrait row: the chat service re-filters into a
   * new array that holds the same message objects. */
  function touchChatPresentation() {
    state.publicRows = [...state.publicRows];
    state.chatRevision++;
  }
  /** A social hub update (friend request, invitation): the social service
   * rebuilds every index into new arrays holding the same message objects. */
  function touchSocial() {
    state.guildRows = [...state.guildRows];
    state.conversations = [...state.conversations];
    state.privateRows = new Map([...state.privateRows].map(([key, rows]) => [key, [...rows]]));
    state.socialRevision++;
  }
  function addGuildMessage(text = "guild news") {
    touchSocial();
    state.guildRows = [...state.guildRows.slice(1), message(identity(98), text, 0)];
  }
  return { state, coop, counts, addPublicMessage, addGuildMessage, touchChatPresentation, touchSocial, resetCounts: () => counts.clear() };
}

/** A chat controller mounted in linkedom. Layout reads return zero, so the
 * numbers measure script work only. */
export function mountChat(coop: Coop) {
  const { document, window } = parseHTML(`<html><body><div id="chatPanel"><div class="chat-header"></div>
    <div id="chatMessages"></div><form id="chatForm"><textarea id="chatInput"></textarea></form></div></body></html>`);
  let frames: FrameRequestCallback[] = [];
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  const element = <T extends HTMLElement>(tag: string, id?: string) => {
    const existing = id ? document.getElementById(id) : null;
    if (existing) return existing as unknown as T;
    const created = document.createElement(tag) as unknown as T;
    if (id) created.id = id;
    document.body.append(created as unknown as Node);
    return created;
  };
  const layoutReads = { count: 0 };
  const created = { count: 0 };
  const createElement = document.createElement.bind(document);
  document.createElement = ((tag: string) => { created.count++; return createElement(tag); }) as typeof document.createElement;
  vi.stubGlobal("InputEvent", (window as unknown as { InputEvent?: unknown }).InputEvent ?? class InputEvent extends window.Event {});
  const proto = window.HTMLElement.prototype as unknown as HTMLElement;
  const rect = () => { layoutReads.count++; return { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0, x: 0, y: 0, toJSON() {} } as DOMRect; };
  Object.defineProperty(proto, "getBoundingClientRect", { configurable: true, value: rect });
  // Every one of these forces a synchronous layout in a browser when the page
  // is dirty, and typing into the textarea always leaves it dirty.
  const scrollTops = new WeakMap<object, number>();
  for (const name of ["scrollHeight", "clientHeight", "clientWidth", "offsetHeight"]) {
    Object.defineProperty(proto, name, { configurable: true, get() { layoutReads.count++; return 0; } });
  }
  Object.defineProperty(proto, "scrollTop", {
    configurable: true,
    get() { layoutReads.count++; return scrollTops.get(this) ?? 0; },
    set(value: number) { scrollTops.set(this, value); },
  });
  const elements: ChatOptions["elements"] = {
    toggle: element("button"), panel: element("div", "chatPanel"),
    header: document.querySelector(".chat-header") as unknown as HTMLElement,
    sizeToggle: element("button"), messages: element("div", "chatMessages"), form: element("form", "chatForm"),
    input: element("textarea", "chatInput"), replyComposer: element("div"), replyComposerName: element("span"),
    replyComposerPreview: element("span"), replyCancelButton: element("button"), backButton: element("button"),
    sendButton: element("button"),
    messageActions: {
      layer: element("div"), backdrop: element("button"), sheet: element("div"), drag: element("div"),
      reactions: element("div"), title: element("div"), preview: element("div"), menu: element("div"),
      watchReplayButton: element("button"), copyButton: element("button"), originalButton: element("button"),
      directMessageButton: element("button"), replyButton: element("button"), reportButton: element("button"),
      reportForm: element("form"), reportReasons: element("div"), reportBackButton: element("button"),
      reportSubmitButton: element("button"),
    },
  };
  const chat = createChatController({ elements, getCoop: () => coop, showMessage: () => {} });
  chat.init();
  const flushFrames = () => { for (let i = 0; i < 4 && frames.length; i++) { const pending = frames; frames = []; for (const frame of pending) frame(0); } };
  flushFrames();
  return { chat, document, window, elements, layoutReads, created, flushFrames };
}
