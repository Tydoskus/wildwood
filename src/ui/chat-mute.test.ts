import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatFixture, mountChat } from "../../tests/helpers/chat-controller";
import { CHAT_STRIKE_NOTICE, createChatMuteDisplay, formatChatMuteButton } from "./chat-mute";
import { canReactToMessage, createChatMessageActionsController, messageActionAvailability, type ChatMessageActionElements } from "./chat-message-actions";
import type { ChatMuteRecord } from "../../shared/chat-mute";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const NOW = 1_800_000_000_000;
const record = (mutedUntilMs: number, strikeAtMs: number[] = []): ChatMuteRecord => ({ strikeAtMs, mutedUntilMs, lastMuteAtMs: 0, muteCount: 1 });

/** The display alone, on a clock and a timer queue the test drives. */
function display(initial: ChatMuteRecord | null, visible = true) {
  const { document } = parseHTML("<textarea placeholder=\"Say something…\"></textarea><button>SEND</button>");
  const input = document.querySelector("textarea") as unknown as HTMLTextAreaElement;
  const sendButton = document.querySelector("button") as unknown as HTMLButtonElement;
  const state = { now: NOW, record: initial, visible, timers: [] as { at: number; run: () => void }[] };
  vi.stubGlobal("window", {
    setTimeout: (run: () => void, ms: number) => state.timers.push({ at: state.now + ms, run }),
    clearTimeout: (id: number) => { state.timers[id - 1] = { at: Infinity, run: () => {} }; },
  });
  const shown: string[] = [];
  const mute = createChatMuteDisplay({
    input, sendButton, record: () => state.record, visible: () => state.visible, now: () => state.now,
    showMessage: text => shown.push(text),
    onTick: () => { if (!mute.apply()) { sendButton.disabled = false; sendButton.textContent = "SEND"; } },
  });
  const pending = () => state.timers.filter(timer => timer.at !== Infinity);
  /** Moves the clock, firing each timer that comes due, as a browser would. */
  const advance = (ms: number) => {
    const end = state.now + ms;
    for (let next = pending().sort((a, b) => a.at - b.at)[0]; next && next.at <= end; next = pending().sort((a, b) => a.at - b.at)[0]) {
      state.now = next.at; next.at = Infinity; next.run();
    }
    state.now = end;
  };
  return { input, sendButton, state, mute, shown, pending, advance };
}

describe("chat mute display", () => {
  it("disables the input with the countdown and shows the time left on Send, ticking each second", () => {
    const d = display(record(NOW + 42 * 60_000 + 10_000));
    expect(d.mute.apply()).toBe(true);
    expect(d.input.disabled).toBe(true);
    expect(d.input.placeholder).toBe("Chat muted · 42:10");
    expect(d.sendButton.disabled).toBe(true);
    expect(d.sendButton.classList.contains("is-muted")).toBe(true);
    expect(d.sendButton.textContent).toBe("42:10");
    d.advance(1_000);
    expect(d.input.placeholder).toBe("Chat muted · 42:09");
    expect(d.sendButton.textContent).toBe("42:09");
    d.advance(60_000);
    expect(d.sendButton.textContent).toBe("41:09");
  });

  it("gives the composer back by itself when the mute ends", () => {
    const d = display(record(NOW + 2_500));
    d.mute.apply();
    expect(d.sendButton.textContent).toBe("0:03");
    d.advance(2_499);
    expect(d.input.disabled).toBe(true);
    d.advance(1);
    expect(d.input.disabled).toBe(false);
    expect(d.input.placeholder).toBe("Say something…");
    expect(d.sendButton.textContent).toBe("SEND");
    expect(d.sendButton.disabled).toBe(false);
    expect(d.sendButton.classList.contains("is-muted")).toBe(false);
    expect(d.pending()).toHaveLength(0);
  });

  it("shows hours on a long mute, compact on the narrow Send button", () => {
    const d = display(record(NOW + 23 * 3_600_000 + 59 * 60_000 + 59_000));
    d.mute.apply();
    expect(d.input.placeholder).toBe("Chat muted · 23:59:59");
    expect(d.sendButton.textContent).toBe("23h 59m");
    expect(formatChatMuteButton(3_600_000)).toBe("1h 00m");
    expect(formatChatMuteButton(3_599_000)).toBe("59:59");
  });

  it("only ticks while the composer is on screen, and catches up when it returns", () => {
    const d = display(record(NOW + 10 * 60_000), false);
    d.mute.apply();
    expect(d.input.disabled).toBe(true);
    expect(d.pending()).toHaveLength(0);
    d.advance(5 * 60_000);
    expect(d.mute.stale()).toBe(false);
    d.state.visible = true;
    expect(d.mute.stale()).toBe(true);
    d.mute.apply();
    expect(d.sendButton.textContent).toBe("5:00");
    expect(d.pending()).toHaveLength(1);
    // A mute that ended while hidden is picked up by the next refresh.
    d.state.visible = false; d.mute.apply();
    d.advance(6 * 60_000);
    expect(d.mute.stale()).toBe(true);
    expect(d.mute.apply()).toBe(false);
    expect(d.input.disabled).toBe(false);
  });

  it("announces the first and second strike after this tab's own send, never on load", () => {
    const d = display(record(0, [NOW - 60_000]));
    d.mute.apply();
    expect(d.shown).toEqual([]);
    d.mute.expectStrike();
    d.state.record = record(0, [NOW - 60_000, NOW]);
    d.mute.apply();
    expect(d.shown).toEqual([CHAT_STRIKE_NOTICE]);
    d.mute.apply();
    expect(d.shown).toHaveLength(1);
    // The third strike mutes: the countdown says so, not the warning.
    d.state.record = { ...record(NOW + 3_600_000), lastMuteAtMs: NOW };
    d.mute.apply();
    expect(d.shown).toHaveLength(1);
    expect(d.input.disabled).toBe(true);
  });
});

describe("a muted player in the chat window", () => {
  function mounted(mute: () => ChatMuteRecord | null) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const fixture = chatFixture({ publicMessages: 5 });
    fixture.coop.chatMute = mute;
    const chat = mountChat(fixture.coop);
    chat.elements.sizeToggle.dispatchEvent(new chat.window.Event("click"));
    chat.chat.refresh();
    return { fixture, ...chat };
  }

  it("keeps showing incoming messages while the composer is muted", () => {
    const { fixture, chat, elements, flushFrames } = mounted(() => record(NOW + 42 * 60_000 + 10_000));
    expect(elements.input.disabled).toBe(true);
    expect(elements.input.placeholder).toBe("Chat muted · 42:10");
    expect(elements.sendButton.textContent).toBe("42:10");
    fixture.addPublicMessage("still readable while muted");
    chat.refresh(); flushFrames();
    expect(elements.messages.textContent).toContain("still readable while muted");
    expect(elements.input.disabled).toBe(true);
  });

  it("re-enables the composer when the mute expires", () => {
    const { chat, elements } = mounted(() => record(NOW + 5_000));
    expect(elements.input.disabled).toBe(true);
    vi.setSystemTime(NOW + 5_000);
    chat.refresh();
    expect(elements.input.disabled).toBe(false);
    expect(elements.sendButton.textContent).toBe("SEND");
    expect(elements.sendButton.disabled).toBe(false);
  });

  it("follows a mute that starts while chat is open", () => {
    let current: ChatMuteRecord | null = null;
    const { chat, elements } = mounted(() => current);
    expect(elements.input.disabled).toBe(false);
    current = record(NOW + 3_600_000);
    chat.refresh();
    expect(elements.input.disabled).toBe(true);
    expect(elements.input.placeholder).toBe("Chat muted · 1:00:00");
    expect(elements.sendButton.textContent).toBe("1h 00m");
  });
});

describe("message actions for a muted player", () => {
  const target = { id: 7n, sender: "other-player", senderName: "Mossy Wolf", message: "hello", replayId: 0n };

  it("offers no reaction or reply, and keeps copy, report and direct message", () => {
    expect(canReactToMessage(target, "local", true)).toBe(false);
    expect(canReactToMessage(target, "local", false)).toBe(true);
    expect(messageActionAvailability(target, "local", true)).toMatchObject({ reply: false, copy: true, report: true, directMessage: true });
  });

  it("hides the reaction row in the sheet while muted and shows it again after", () => {
    const { document, window } = parseHTML("<html><body></body></html>");
    vi.stubGlobal("document", document);
    vi.stubGlobal("HTMLElement", window.HTMLElement);
    vi.stubGlobal("window", { setTimeout: () => 1, clearTimeout: () => {}, addEventListener: () => {} });
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const make = (tag: string) => { const element = document.createElement(tag); document.body.append(element); return element as unknown as HTMLElement; };
    const title = make("div"); const titleParent = make("div"); titleParent.append(title as unknown as Node);
    const elements = {
      layer: make("div"), backdrop: make("button"), sheet: make("div"), drag: make("div"), reactions: make("div"), title,
      preview: make("div"), menu: make("div"), watchReplayButton: make("button"), copyButton: make("button"),
      originalButton: make("button"), directMessageButton: make("button"), replyButton: make("button"),
      reportButton: make("button"), reportForm: make("form"), reportReasons: make("div"), reportBackButton: make("button"),
      reportSubmitButton: make("button"),
    } as unknown as ChatMessageActionElements;
    let muted = true;
    const actions = createChatMessageActionsController({
      elements, isMuted: () => muted, getLocalIdentity: () => "local",
      loadReactions: async () => ({ counts: { heart: 2 }, selected: [] }), setReaction: vi.fn(),
      onWatchReplay: () => {}, onOriginal: () => {}, onDirectMessage: () => {}, onReply: vi.fn(),
      reportMessage: async () => ({ ok: true }), showMessage: () => {},
    });
    actions.init();
    actions.open(target);
    expect(elements.reactions.hidden).toBe(true);
    expect(elements.replyButton.hidden).toBe(true);
    expect([...elements.reactions.querySelectorAll("button")].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    actions.close(false);
    muted = false;
    actions.open(target);
    expect(elements.reactions.hidden).toBe(false);
    expect(elements.replyButton.hidden).toBe(false);
  });
});
