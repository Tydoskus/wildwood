import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { createChatRuntimeController } from "./chat-runtime-controller";
import { installGameShell } from "./game-shell";
import { mergeChatConversations } from "./chat-channels";

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  vi.useFakeTimers();
  const { document, window } = parseHTML(readFileSync("public/index.html", "utf8"));
  installGameShell(document);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("HTMLElement", window.HTMLElement);
  vi.stubGlobal("Element", window.Element);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
  const row = (message: string, id = 1n) => ({ id, sender: "friend", senderName: "Moss", message,
    replayId: 0n, powerLevel: 0, senderGender: 0 as 0 | 1 | 2, moderated: false,
    replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "", sentAtMs: Date.now() });
  const coop = {
    localIdentity: () => "me", chatRevision: () => 1,
    chatMessages: () => [row("public only")],
    sendChatMessage: vi.fn(async () => ({ ok: true })),
    reportChatMessage: vi.fn(async () => ({ ok: true })),
    social: {
      revision: () => 1, guildMessages: () => [row("guild only", 2n)],
      privateMessages: vi.fn(() => [row("private only", 3n)]),
      friends: () => [{ identity: "friend", name: "Moss" }],
      privateConversations: (): { identity: string; name: string }[] => [], currentGuild: () => ({ id: 1n, name: "Oak" }),
      loadSocial: async () => ({}), sendGuildMessage: vi.fn(async () => ({ ok: true })),
      sendPrivateMessage: vi.fn(async () => ({ ok: true })), reportMessage: vi.fn(async () => ({ ok: true })),
    },
  };
  const showMessage = vi.fn();
  const chat = createChatRuntimeController({ getCoop: () => coop, showMessage, openReplay: vi.fn() });
  chat.init();
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".chat-channel-tabs button")].find(node => node.querySelector(".chat-channel-name")?.textContent === text)!;
  const input = document.getElementById("chatInput")! as HTMLTextAreaElement;
  input.setSelectionRange = vi.fn();
  const submit = async (text: string) => {
    input.value = text;
    document.getElementById("chatForm")!.dispatchEvent(new window.Event("submit", { cancelable: true }));
    await settle();
  };
  const history = () => document.getElementById("chatMessages")!.textContent;
  return { document, window, coop, chat, button, input, submit, history, showMessage };
}

describe("chat channels", () => {
  it("keeps a fetched page loading until its portraits are prepared", async () => {
    const h = setup();
    let ready!: () => void;
    const prepareChatPortraits = vi.fn(() => new Promise<void>(resolve => { ready = resolve; }));
    Object.assign(h.coop, { prepareChatPortraits });
    Object.assign(h.coop.social, { loadChatHistory: vi.fn(async () => ({
      messages: [{ ...h.coop.social.guildMessages()[0], id: 15n, message: "new page with portrait" }],
      beforeId: 15n, hasMore: false,
    })) });
    h.document.getElementById("chatSizeToggle")!.click(); h.button("Guild").click();
    await settle();
    expect(prepareChatPortraits).toHaveBeenCalledWith(["friend"]);
    expect(h.history()).not.toContain("new page with portrait");
    ready(); await settle();
    expect(h.history()).toContain("new page with portrait");
  });
  it("does not request guild history without guild membership", async () => {
    const h = setup(), loadChatHistory = vi.fn(async () => { throw new Error("Join a guild first."); });
    Object.assign(h.coop.social, { currentGuild: () => null, loadChatHistory });
    h.document.getElementById("chatSizeToggle")!.click();
    h.button("Guild").click();
    await settle();
    expect(loadChatHistory).not.toHaveBeenCalled();
    expect(h.showMessage).not.toHaveBeenCalled();
  });
  it("shows an unlocked gem heart disabled alongside the other reactions on your own message", async () => {
    const h = setup();
    const own = { ...h.coop.chatMessages()[0], sender: "me", senderName: "Me" };
    h.coop.chatMessages = () => [own];
    h.coop.chatRevision = () => 2;
    const loadChatMessageReactions = vi.fn(async () => ({ counts: {}, selected: [], gemHeartUnlocked: true }));
    Object.assign(h.coop, { loadChatMessageReactions });
    h.chat.refresh();
    h.document.getElementById("chatSizeToggle")!.click();
    h.document.querySelector<HTMLElement>(".chat-text")!.click();
    await settle();
    expect(loadChatMessageReactions).toHaveBeenCalledWith("public", 1n);
    const buttons = [...h.document.querySelectorAll<HTMLButtonElement>("#chatMessageReactions button")];
    expect(buttons).toHaveLength(5);
    expect(buttons.every(button => button.disabled && !button.hidden)).toBe(true);
  });
  it("changes only the matching sender's portraits and retains other players' pictures", () => {
    const h = setup();
    const first = h.coop.chatMessages()[0];
    let revision = 2;
    const icons = new Map([["friend", 17], ["second", 42], ["third", 174]]);
    Object.assign(h.coop, { profileIcon: (id: string) => icons.get(id) ?? 0 });
    h.coop.chatMessages = () => [first, { ...first, id: 2n, sender: "second", senderName: "Second" },
      { ...first, id: 3n, sender: "third", senderName: "Third" }, { ...first, id: 4n }];
    h.coop.chatRevision = () => revision;
    h.document.getElementById("chatSizeToggle")!.click();
    h.chat.refresh();
    const portrait = (id: number) => h.document.querySelector<HTMLElement>(`.chat-line[data-message-id="${id}"] .chat-profile-icon`)!;
    const second = portrait(2), third = portrait(3);
    const originalSecondStyle = second.getAttribute("style"), originalThirdStyle = third.getAttribute("style");
    icons.set("friend", 190);
    revision++; h.chat.refresh();
    expect(portrait(1).dataset.profileIcon).toBe("190");
    expect(portrait(4).dataset.profileIcon).toBe("190");
    expect(portrait(2)).toBe(second); expect(portrait(3)).toBe(third);
    expect(second.getAttribute("style")).toBe(originalSecondStyle);
    expect(third.getAttribute("style")).toBe(originalThirdStyle);
    expect([second.dataset.profileIcon, third.dataset.profileIcon]).toEqual(["42", "174"]);
  });

  it.each([false, true])("retains gender and power image nodes through unrelated refreshes (fullscreen=%s)", (fullscreen) => {
    const h = setup();
    let revision = 2;
    const first = { ...h.coop.chatMessages()[0], senderGender: 1 as const, powerLevel: 120 };
    let rows = [first];
    h.coop.chatMessages = () => rows;
    h.coop.chatRevision = () => revision;
    h.coop.social.revision = () => revision;
    if (fullscreen) h.document.getElementById("chatSizeToggle")!.click();
    h.chat.refresh();
    const line = h.document.querySelector('.chat-line[data-message-id="1"]')!;
    const gender = line.querySelector(".player-gender-icon")!;
    const power = line.querySelector(".chat-power-icon")!;
    const remove = vi.spyOn(line, "remove");
    const insert = vi.spyOn(h.document.getElementById("chatMessages")!, "insertBefore");
    for (let i = 0; i < 5; i++) { revision++; h.chat.refresh(); }
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(h.document.querySelector(".player-gender-icon")).toBe(gender);
    expect(h.document.querySelector(".chat-power-icon")).toBe(power);
    rows = [first, { ...first, id: 2n, message: "new message" }];
    revision++; h.chat.refresh();
    expect(h.document.querySelector('.chat-line[data-message-id="1"]')).toBe(line);
    expect(line.querySelector(".chat-power-icon")).toBe(power);
    expect(remove).not.toHaveBeenCalled();
    rows = [{ ...first, moderated: true }, rows[1]];
    revision++; h.chat.refresh();
    const moderated = h.document.querySelector('.chat-line[data-message-id="1"]')!;
    expect(moderated.textContent).toContain("Message moderated.");
    if (fullscreen) {
      moderated.querySelector<HTMLElement>(".chat-text")!.click();
      expect(h.document.getElementById("chatMessageActionTitle")!.parentElement!.hidden).toBe(false);
      expect(h.document.getElementById("chatMessageReactions")!.hidden).toBe(true);
      expect(h.document.getElementById("chatMessageActionPreview")!.textContent).toBe("Message moderated.");
    }
  });

  it("opens guild replay announcements and sends public replies to them", async () => {
    const h = setup();
    vi.stubGlobal("CustomEvent", h.window.CustomEvent);
    const announcement = { ...h.coop.chatMessages()[0], senderName: "GUILDS", guildReplayKey: "1:42", message: "Oak defeated Pine" };
    h.coop.chatMessages = () => [announcement];
    h.coop.chatRevision = () => 2;
    h.chat.refresh();
    const content = h.document.querySelector(".chat-line .chat-message-content")!;
    expect(content.querySelector(".chat-name-text")!.textContent).toBe("GUILDS");
    expect(content.querySelector(".chat-text .chat-message-body")!.textContent).toBe("Oak defeated Pine");
    expect(h.document.querySelector(".chat-guild-replay")).toBeNull();
    expect(h.document.querySelector(".chat-replay")).toBeNull();
    h.document.getElementById("chatSizeToggle")!.click();
    h.document.querySelector<HTMLElement>(".chat-replay")!.click();
    expect(h.document.getElementById("chatMessageActionTitle")!.parentElement!.hidden).toBe(false);
    expect(h.document.getElementById("chatMessageReactions")!.textContent).toBe("👍😂❤️👎");
    expect(h.document.querySelector(".chat-line .chat-time")).toBeNull();
    expect(h.document.getElementById("chatMessageActionPreview")!.textContent).toBe(announcement.message);
    expect(h.document.querySelector("#chatMessageActionTitle time")!.getAttribute("datetime")).toBe(new Date(announcement.sentAtMs).toISOString());
    expect(h.document.getElementById("chatMessageReplyBtn")!.hidden).toBe(false);
    const openReplay = vi.fn();
    h.window.addEventListener("wildwood:open-guild-replay", openReplay);
    h.document.getElementById("chatMessageWatchReplayBtn")!.click();
    expect(openReplay).toHaveBeenCalledOnce();
    expect(openReplay.mock.calls[0][0].detail).toEqual({ reportKey: "1:42" });
    h.document.querySelector<HTMLElement>(".chat-replay")!.click();
    h.document.getElementById("chatMessageReplyBtn")!.click();
    expect(h.document.getElementById("chatReplyComposer")!.textContent).toContain("Oak defeated Pine");
    await h.submit("Good battle!");
    expect(h.coop.sendChatMessage).toHaveBeenCalledWith("Good battle!", announcement.id);
  });
  it("opens the sender's private conversation from the action between Copy and Reply", async () => {
    const h = setup();
    h.document.getElementById("chatSizeToggle")!.click();
    h.document.querySelector(".chat-text")!.dispatchEvent(new h.window.Event("click"));
    const button = h.document.getElementById("chatMessageDirectMessageBtn")!;
    expect(button.hidden).toBe(false);
    expect(button.previousElementSibling?.id).toBe("chatMessageOriginalBtn");
    expect(button.previousElementSibling?.previousElementSibling?.id).toBe("chatMessageCopyBtn");
    expect(h.document.getElementById("chatMessageOriginalBtn")!.hidden).toBe(true);
    expect(button.nextElementSibling?.id).toBe("chatMessageReplyBtn");
    button.click();
    expect(h.history()).toContain("private only");
    expect(h.coop.social.privateMessages).toHaveBeenCalledWith("friend");
    expect(h.document.getElementById("chatReplyComposer")!.hidden).toBe(true);
    await h.submit("Hi Moss");
    expect(h.coop.social.sendPrivateMessage).toHaveBeenCalledWith("friend", "Hi Moss", 0n);
    expect(h.coop.sendChatMessage).not.toHaveBeenCalled();
  });
  it("shows Original below Copy on replies and highlights a loaded original", async () => {
    const h = setup();
    const first = h.coop.chatMessages()[0];
    h.coop.chatMessages = () => [first, { ...first, id: 2n, message: "reply", replyToMessageId: 1n }];
    h.document.getElementById("chatSizeToggle")!.click();
    const original = h.document.querySelector<HTMLElement>('.chat-line[data-message-id="1"]')!;
    original.getBoundingClientRect = () => ({ top: 200, height: 40 } as DOMRect);
    h.document.getElementById("chatMessages")!.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    h.document.querySelector<HTMLElement>('.chat-line[data-message-id="2"] .chat-text')!.click();
    const button = h.document.getElementById("chatMessageOriginalBtn")!;
    expect(button.hidden).toBe(false);
    expect(button.previousElementSibling?.id).toBe("chatMessageCopyBtn");
    button.click();
    await settle();
    expect(original.classList.contains("is-original-message")).toBe(true);
    expect(h.showMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(original.classList.contains("is-original-message")).toBe(false);
  });
  it("fetches an unloaded original without merging a gap into the latest messages", async () => {
    const h = setup();
    const first = { ...h.coop.chatMessages()[0], message: "older original" };
    h.coop.chatMessages = () => [{ ...first, id: 100n, message: "reply", replyToMessageId: 1n }];
    const load = vi.fn(async () => ({ messages: [first], beforeId: 1n, hasMore: false }));
    Object.assign(h.coop, { loadChatHistory: load });
    h.window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 0, height: 40 } as DOMRect);
    h.document.getElementById("chatSizeToggle")!.click();
    h.document.querySelector<HTMLElement>('.chat-line[data-message-id="100"] .chat-text')!.click();
    h.document.getElementById("chatMessageOriginalBtn")!.click();
    await settle();
    expect(load).toHaveBeenCalledWith(2n);
    expect(h.history()).toContain("older original");
    expect(h.document.querySelector('.chat-line[data-message-id="100"]')).toBeNull();
    expect(h.document.querySelector('.is-original-message[data-message-id="1"]')).not.toBeNull();
    expect(h.showMessage).not.toHaveBeenCalled();
  });
  it("opens Private as a player list and preserves a conversation draft when returning to it", async () => {
    const h = setup();
    h.document.getElementById("chatSizeToggle")!.click();
    h.button("Private").click();
    expect(h.document.querySelector(".chat-private-picker select")).toBeNull();
    expect(h.document.getElementById("chatPanel")!.classList.contains("is-private-inbox")).toBe(true);
    h.document.querySelector<HTMLButtonElement>(".chat-conversation-row")!.click();
    expect(h.history()).toContain("private only");
    expect(h.document.getElementById("chatPanel")!.classList.contains("is-private-inbox")).toBe(false);
    h.input.value = "draft for Moss";
    h.document.getElementById("chatBackBtn")!.click();
    expect(h.document.getElementById("chatPanel")!.classList.contains("is-private-inbox")).toBe(true);
    h.document.querySelector<HTMLButtonElement>(".chat-conversation-row")!.click();
    expect(h.input.value).toBe("draft for Moss");
    await h.submit(h.input.value);
    expect(h.coop.social.sendPrivateMessage).toHaveBeenCalledWith("friend", "draft for Moss", 0n);
  });
  it("shows portraits and latest-message previews and closes the inbox with the regular Back button", () => {
    const h = setup();
    h.coop.social.privateConversations = () => [{ identity: "friend", name: "Moss", profileIcon: 19,
      lastMessage: "See you soon", lastSentAtMs: Date.now(), lastMessageMine: true }];
    h.coop.social.revision = () => 2;
    h.document.getElementById("chatSizeToggle")!.click();
    h.button("Private").click();
    expect(h.document.querySelector(".chat-conversation-back")).toBeNull();
    expect(h.document.querySelector(".chat-conversation-preview")!.textContent).toBe("You: See you soon");
    expect(h.document.querySelector<HTMLElement>(".chat-conversation-portrait")!.style.backgroundPosition).not.toBe("");
    expect((h.document.getElementById("chatBackBtn") as HTMLButtonElement).hidden).toBe(false);
    h.document.getElementById("chatBackBtn")!.click();
    expect(h.document.getElementById("chatPanel")!.classList.contains("is-large")).toBe(false);
  });
  it("keeps private messages older than 24 hours visible", () => {
    const h = setup();
    const old = { ...h.coop.social.privateMessages()[0], sentAtMs: Date.now() - 7 * 86_400_000 };
    h.coop.social.privateMessages.mockReturnValue([old]);
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss", identity: "friend" } }));
    expect(h.history()).toContain("private only");
  });
  it("deduplicates friends and incoming conversations by username", () => {
    expect(mergeChatConversations([{ identity: "1", name: "Moss" }], [{ identity: "1", name: "moss" }, { identity: "2", name: "Oak" }])).toHaveLength(2);
  });
  it("keeps guild and private history and sends separate from public chat", async () => {
    const h = setup();
    expect(h.history()).toContain("public only");
    h.button("Guild").click();
    expect(h.history()).toContain("guild only");
    expect(h.history()).not.toContain("public only");
    await h.submit("guild hello");
    expect(h.coop.social.sendGuildMessage).toHaveBeenCalledWith("guild hello", 0n);
    vi.advanceTimersByTime(3_000);
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss" } }));
    expect(h.history()).toContain("private only");
    expect(h.history()).not.toContain("guild only");
    await h.submit("private hello");
    expect(h.coop.social.sendPrivateMessage).toHaveBeenCalledWith("friend", "private hello", 0n);
    expect(h.coop.sendChatMessage).not.toHaveBeenCalled();
    expect(h.coop.chatMessages()[0].message).toBe("public only");
  });
  it("clears replies on channel changes and preserves each channel draft", async () => {
    const h = setup();
    h.document.getElementById("chatSizeToggle")!.click();
    h.document.querySelector(".chat-text")!.dispatchEvent(new h.window.Event("click"));
    h.document.getElementById("chatMessageReplyBtn")!.click();
    expect(h.document.getElementById("chatReplyComposer")!.hidden).toBe(false);
    h.input.value = "public draft";
    h.button("Guild").click();
    expect(h.document.getElementById("chatReplyComposer")!.hidden).toBe(true);
    await h.submit("new guild message");
    expect(h.coop.social.sendGuildMessage).toHaveBeenCalledWith("new guild message", 0n);
    h.button("Public").click();
    expect(h.input.value).toBe("public draft");
  });
  it("shows incoming private messages on the tab and clears them when opened", () => {
    const h = setup();
    expect(h.button("Private").textContent).toBe("Private");
    vi.advanceTimersByTime(1_000);
    h.coop.social.privateConversations = () => [{ identity: "friend", name: "Moss" }];
    h.coop.social.revision = () => 2;
    h.chat.refresh();
    expect(h.button("Private").querySelector(".chat-channel-name")!.textContent).toBe("Private");
    expect(h.button("Private").querySelector(".chat-channel-unread")!.textContent).toBe("1");
    expect((h.button("Private").querySelector(".chat-channel-unread") as HTMLElement).hidden).toBe(false);
    expect(h.document.querySelector(".chat-conversation-row")).toBeNull();
    h.button("Private").click();
    expect(h.document.querySelector(".chat-conversation-row")!.getAttribute("aria-label")).toBe("Moss, 1 unread messages");
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss", identity: "friend" } }));
    expect(h.button("Private").textContent).toBe("Private");
  });
  it("keeps a private recipient pinned to identity after a username change", async () => {
    const h = setup();
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss" } }));
    h.coop.social.friends = () => [{ identity: "friend", name: "NewMoss" }, { identity: "different", name: "Moss" }];
    h.chat.refresh();
    h.button("Public").click();
    h.button("Private").click();
    h.document.querySelector<HTMLButtonElement>('.chat-conversation-row[data-identity="friend"]')!.click();
    await h.submit("for the same person");
    expect(h.coop.social.sendPrivateMessage).toHaveBeenCalledWith("friend", "for the same person", 0n);
  });
  it("clears private drafts and ignores pending sends after an account change", async () => {
    const h = setup();
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss" } }));
    let finish!: (value: { ok: boolean }) => void;
    h.coop.social.sendPrivateMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await h.submit("old account draft");
    h.coop.localIdentity = () => "different-account";
    h.chat.refresh();
    expect(h.input.value).toBe("");
    expect(h.button("Public").getAttribute("aria-selected")).toBe("true");
    h.input.value = "new account draft";
    finish({ ok: true });
    await settle();
    expect(h.input.value).toBe("new account draft");
  });
  it("clears a guild draft and reply when membership changes", () => {
    const h = setup();
    h.button("Guild").click();
    h.input.value = "for old guild";
    h.coop.social.currentGuild = () => ({ id: 2n, name: "New Guild" });
    h.chat.refresh();
    expect(h.input.value).toBe("");
  });
  it("reports a guild message through the private social report endpoint", async () => {
    const h = setup();
    h.document.getElementById("chatSizeToggle")!.click();
    h.button("Guild").click();
    h.document.querySelector(".chat-text")!.dispatchEvent(new h.window.Event("click"));
    h.document.getElementById("chatMessageReportBtn")!.click();
    const reason = h.document.querySelector<HTMLButtonElement>(".chat-message-report-reason")!;
    reason.click();
    h.document.getElementById("chatMessageReportForm")!.dispatchEvent(new h.window.Event("submit", { cancelable: true }));
    await settle();
    expect(h.coop.social.reportMessage).toHaveBeenCalledWith(2n, reason.dataset.reason);
    expect(h.coop.reportChatMessage).not.toHaveBeenCalled();
  });
  it("retains a different conversation's draft when an earlier send finishes", async () => {
    const h = setup();
    let finish!: (value: { ok: boolean }) => void;
    h.coop.sendChatMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await h.submit("public send");
    h.button("Guild").click();
    h.input.value = "still writing";
    finish({ ok: true });
    await settle();
    expect(h.input.value).toBe("still writing");
    h.button("Public").click();
    expect(h.input.value).toBe("");
  });
});

describe("mini chat unread badge", () => {
  it("totals world, guild and private arrivals and clears channels independently", () => {
    const h = setup();
    const badge = h.document.getElementById("chatUnreadBadge")!;
    expect(badge.hidden).toBe(true);
    const world = h.coop.chatMessages()[0];
    const guild = h.coop.social.guildMessages()[0];
    vi.advanceTimersByTime(1000);
    h.coop.chatMessages = () => [world, { ...world, id: 2n, sentAtMs: Date.now() }];
    h.coop.social.guildMessages = () => [guild, { ...guild, id: 4n, sentAtMs: Date.now() }];
    h.coop.social.privateConversations = () => [{ identity: "friend", name: "Moss" }];
    h.coop.chatRevision = () => 2;
    h.coop.social.revision = () => 2;
    h.chat.refresh();
    expect(badge.textContent).toBe("3");
    expect(badge.hidden).toBe(false);
    h.chat.refresh();
    expect(badge.textContent).toBe("3");
    h.document.getElementById("chatSizeToggle")!.click();
    expect(badge.hidden).toBe(true);
    h.chat.minimize();
    expect(badge.textContent).toBe("2");
    h.document.getElementById("chatSizeToggle")!.click();
    h.button("Guild").click();
    h.chat.minimize();
    expect(badge.textContent).toBe("1");
    h.window.dispatchEvent(new h.window.CustomEvent("wildwood:open-private-chat", { detail: { username: "Moss", identity: "friend" } }));
    h.chat.minimize();
    expect(badge.hidden).toBe(true);
  });

  it("keeps messages unread when full chat is in a hidden browser tab", () => {
    const h = setup();
    h.document.getElementById("chatSizeToggle")!.click();
    Object.defineProperty(h.document, "visibilityState", { value: "hidden", configurable: true });
    const world = h.coop.chatMessages()[0];
    h.coop.chatMessages = () => [world, { ...world, id: 2n }];
    h.coop.chatRevision = () => 2;
    h.chat.refresh();
    expect(h.document.getElementById("chatUnreadBadge")!.textContent).toBe("1");
    Object.defineProperty(h.document, "visibilityState", { value: "visible", configurable: true });
    h.document.dispatchEvent(new h.window.Event("visibilitychange"));
    expect(h.document.getElementById("chatUnreadBadge")!.textContent).toBe("");
  });
});

describe("chat work scheduling", () => {
  it("does not measure layout or scan messages for unchanged gameplay notifications", () => {
    const h = setup(); h.document.getElementById("chatSizeToggle")!.click(); h.chat.refresh(); h.chat.refresh();
    const panel = h.document.getElementById("chatMessages")!;
    const measure = vi.fn(() => 0);
    for (const name of ["scrollHeight", "clientHeight", "scrollTop", "clientWidth"]) Object.defineProperty(panel, name, { configurable: true, get: measure });
    const messages = vi.spyOn(h.coop, "chatMessages");
    for (let i = 0; i < 1000; i++) h.chat.refresh();
    expect(measure).not.toHaveBeenCalled(); expect(messages).not.toHaveBeenCalled();
  });
  it("coalesces notification bursts and keeps the typed draft and existing rows", () => {
    const h = setup(); h.document.getElementById("chatSizeToggle")!.click(); h.chat.refresh();
    const callbacks: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callbacks.push(callback); return 1; });
    const original = h.document.querySelector(".chat-line")!;
    const rows = h.coop.chatMessages();
    h.input.value = "still typing";
    h.coop.chatMessages = () => [...rows, { ...rows[0], id: 2n, message: "incoming" }];
    h.coop.chatRevision = () => 2;
    for (let i = 0; i < 100; i++) h.chat.requestRefresh();
    expect(callbacks).toHaveLength(1); callbacks.shift()!();
    expect(h.history()).toContain("incoming"); expect(h.input.value).toBe("still typing");
    expect(h.document.querySelector(".chat-line")).toBe(original);
  });
  it("does not submit while a mobile IME is composing", () => {
    const h = setup(); const submit = vi.fn();
    (h.document.getElementById("chatForm")! as HTMLFormElement).requestSubmit = submit;
    h.input.dispatchEvent(new h.window.Event("compositionstart"));
    const enter = new h.window.Event("keydown", { cancelable: true });
    Object.assign(enter, { key: "Enter", isComposing: false });
    h.input.dispatchEvent(enter); expect(submit).not.toHaveBeenCalled();
    h.input.dispatchEvent(new h.window.Event("compositionend"));
    h.input.dispatchEvent(enter); expect(submit).toHaveBeenCalledOnce();
  });
  it("mounts a bounded window and preserves the visible message through a history prepend", async () => {
    const h = setup(), panel = h.document.getElementById("chatMessages")!;
    const seed = h.coop.chatMessages()[0];
    let live = Array.from({ length: 50 }, (_, i) => ({ ...seed, id: BigInt(1001 + i) })), revision = 2;
    h.coop.chatMessages = () => live; h.coop.chatRevision = () => revision;
    // A deterministic variable-height layout, independent of browser visual QA.
    const height = (element: Element) => element.classList.contains("chat-line") ? 100.25 + Number(BigInt((element as HTMLElement).dataset.messageId!) % 3n) * 20
      : (parseFloat((element as HTMLElement).style.height) || 0) + (parseFloat((element as HTMLElement).style.marginTop) || 0);
    let top = 0;
    const scrollWrites = vi.fn();
    Object.defineProperties(panel, {
      clientWidth: { get: () => 360 }, clientHeight: { get: () => 500 },
      scrollHeight: { get: () => [...panel.children].reduce((sum, child) => sum + height(child), 0) },
      scrollTop: { get: () => top, set: value => { scrollWrites(value); top = Math.max(0, Math.min(value, panel.scrollHeight - 500)); } },
    });
    Object.defineProperty(h.window.HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return height(this); } });
    h.window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this === panel) return { top: 0, bottom: 500, height: 500 } as DOMRect;
      let offset = 0;
      for (const child of panel.children) { if (child === this) break; offset += height(child); }
      return { top: offset - top, bottom: offset - top + height(this), height: height(this) } as DOMRect;
    };
    const page = vi.fn(async (before: bigint) => ({ messages: Array.from({ length: 50 }, (_, i) => ({ ...seed, id: before - 50n + BigInt(i) })), beforeId: before - 50n, hasMore: true }));
    Object.assign(h.coop, { loadChatHistory: page });
    h.document.getElementById("chatSizeToggle")!.click();
    expect(panel.querySelectorAll(".chat-line").length).toBeLessThan(25);
    const visible = () => {
      let offset = 0;
      for (const element of panel.children) {
        const size = height(element);
        if (offset + size > top && element.classList.contains("chat-line")) return [(element as HTMLElement).dataset.messageId, top - offset];
        offset += size;
      }
    };
    // First render the upper window, then scroll into the prefetch threshold.
    panel.scrollTop = 300; scrollWrites.mockClear(); panel.dispatchEvent(new h.window.Event("scroll"));
    expect(scrollWrites).not.toHaveBeenCalled();
    panel.scrollTop = 120;
    panel.dispatchEvent(new h.window.Event("scroll")); await settle();
    expect(page).not.toHaveBeenCalled();
    panel.scrollTop = 47;
    panel.dispatchEvent(new h.window.Event("scroll")); await settle();
    expect(page).not.toHaveBeenCalled();
    panel.scrollTop = 0;
    panel.dispatchEvent(new h.window.Event("scroll")); await settle();
    // A negative virtual origin must be rebased before the row is reachable.
    if (!page.mock.calls.length) panel.scrollTop = 0;
    const anchor = visible();
    panel.dispatchEvent(new h.window.Event("scroll")); await settle();
    expect(page).toHaveBeenCalledExactlyOnceWith(1001n);
    const spinner = panel.querySelector<HTMLElement>(".chat-history-spinner")!;
    const loadingRow = spinner.parentElement!;
    expect(spinner.hidden).toBe(false);
    expect(loadingRow.className).toBe("chat-history-row");
    expect(loadingRow.parentElement).toBe(panel);
    expect(height(loadingRow)).toBe(48);
    expect(loadingRow.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(loadingRow.getBoundingClientRect().bottom).toBeLessThanOrEqual(500);
    expect(loadingRow.nextElementSibling?.classList.contains("chat-line")).toBe(true);
    expect(h.document.querySelector(".chat-channels .chat-history-spinner")).toBeNull();
    expect(visible()).toEqual(anchor);
    scrollWrites.mockClear();
    await vi.advanceTimersByTimeAsync(159);
    expect(scrollWrites).not.toHaveBeenCalled();
    expect(panel.querySelector('[data-message-id="1000"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(spinner.hidden).toBe(true);
    // New history fills the spinner's space; the previously read message
    // stays at the same pixel even if a preceding message is now also visible.
    expect(panel.querySelector(`[data-message-id="${anchor![0]}"]`)!.getBoundingClientRect().top).toBe(-Number(anchor![1]));
    const loadedAnchor = visible();
    expect(panel.querySelectorAll(".chat-line").length).toBeLessThan(25);
    scrollWrites.mockClear();
    live = [...live.slice(1), { ...seed, id: 1051n, message: "live while reading" }]; revision++; h.chat.refresh();
    expect(visible()).toEqual(loadedAnchor);
    expect(panel.textContent).not.toContain("live while reading");
    expect(scrollWrites).not.toHaveBeenCalled();
    // Native scrolling inside the mounted buffer must not be repositioned.
    top += 30;
    const beforeScroll = visible();
    panel.dispatchEvent(new h.window.Event("scroll"));
    expect(visible()).toEqual(beforeScroll);
    expect(scrollWrites).not.toHaveBeenCalled();
    // Every later history boundary needs the same in-flow loading row.
    for (let batch = 2; batch <= 4; batch++) {
      panel.scrollTop = 0;
      panel.dispatchEvent(new h.window.Event("scroll"));
      await settle();
      if (page.mock.calls.length < batch) {
        panel.scrollTop = 0;
        panel.dispatchEvent(new h.window.Event("scroll"));
        await settle();
      }
      expect(page).toHaveBeenCalledTimes(batch);
      expect(panel.querySelector(".chat-history-spinner")).toBe(spinner);
      expect(spinner.hidden).toBe(false);
      expect(loadingRow.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
      expect(loadingRow.getBoundingClientRect().bottom).toBeLessThanOrEqual(500);
      const boundaryMessage = panel.querySelector<HTMLElement>(".chat-line")!;
      const boundaryId = boundaryMessage.dataset.messageId;
      const boundaryTop = boundaryMessage.getBoundingClientRect().top;
      await vi.advanceTimersByTimeAsync(160);
      expect(spinner.hidden).toBe(true);
      expect(panel.querySelector(`[data-message-id="${boundaryId}"]`)!.getBoundingClientRect().top).toBe(boundaryTop);
    }
  });
});

it("keeps chat interaction active through momentum and typing, then releases idle pacing", () => {
  const h = setup();
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  try {
    expect(h.chat.isInteracting()).toBe(false);
    h.document.getElementById("chatSizeToggle")!.click();
    const panel = h.document.getElementById("chatPanel")!;
    panel.dispatchEvent(new h.window.Event("scroll"));
    expect(h.chat.isInteracting()).toBe(true);
    now += 1500;
    panel.dispatchEvent(new h.window.Event("scroll"));
    now += 1500;
    expect(h.chat.isInteracting()).toBe(true);
    now += 501;
    expect(h.chat.isInteracting()).toBe(false);
    // Typing keeps the canvas behind chat at 60fps, as scrolling does.
    panel.dispatchEvent(new h.window.Event("keydown"));
    expect(h.chat.isInteracting()).toBe(true);
    now += 2_001;
    panel.dispatchEvent(new h.window.Event("input"));
    expect(h.chat.isInteracting()).toBe(true);
    now += 2_001;
    panel.dispatchEvent(new h.window.Event("pointerdown"));
    expect(h.chat.isInteracting()).toBe(true);
    h.chat.minimize();
    expect(h.chat.isInteracting()).toBe(false);
  } finally { vi.restoreAllMocks(); }
});
