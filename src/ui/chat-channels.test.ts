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
    replayId: 0n, powerLevel: 0, senderGender: 0 as const, moderated: false,
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
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".chat-channel-tabs button")].find(node => node.textContent?.split(" · ")[0] === text)!;
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
  it("renders guild replays as normal chat bubbles and opens them through replay actions", () => {
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
    expect(h.document.getElementById("chatMessageActionTitle")!.textContent).toBe("Guild battle replay");
    expect(h.document.getElementById("chatMessageReplyBtn")!.hidden).toBe(true);
    const openReplay = vi.fn();
    h.window.addEventListener("wildwood:open-guild-replay", openReplay);
    h.document.getElementById("chatMessageWatchReplayBtn")!.click();
    expect(openReplay).toHaveBeenCalledOnce();
    expect(openReplay.mock.calls[0][0].detail).toEqual({ reportKey: "1:42" });
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
    expect(h.button("Private").textContent).toBe("Private · 1");
    expect(h.document.querySelector(".chat-private-picker select")!.textContent).toContain("Moss (1 unread)");
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
