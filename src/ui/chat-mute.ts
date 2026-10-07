import { chatMuteRemainingMs, type ChatMuteRecord } from "../../shared/chat-mute";
import { formatTimerMs } from "../../shared/timer-format";

export const CHAT_STRIKE_NOTICE = "REPEATED FILTERED MESSAGES WILL MUTE CHAT";
/** A strike that lands this long after a local send is that send's. */
const STRIKE_EXPECTATION_MS = 15_000;

type ChatMuteDisplayOptions = {
  input: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  record: () => ChatMuteRecord | null;
  /** The composer is on screen: chat open, maximized and the page visible. */
  visible: () => boolean;
  /** Redraw the composer; the chat controller routes this back through apply(). */
  onTick: () => void;
  showMessage: (text: string, color?: string) => void;
  now?: () => number;
};

/**
 * The composer's muted state. While the account is muted the input is disabled
 * with the countdown as its placeholder and the Send button shows the time
 * left, ticking once a second only while the composer is on screen. When the
 * mute ends the next apply() gives the composer back. Chat itself keeps
 * rendering: a mute only stops sending.
 */
export function createChatMuteDisplay({ input, sendButton, record, visible, onTick, showMessage, now = Date.now }: ChatMuteDisplayOptions) {
  const placeholder = input.placeholder;
  let timer: number | null = null;
  let appliedRecord: ChatMuteRecord | null | undefined;
  let appliedVisible = false;
  let appliedMuted = false;
  let noticedStrikeAt = 0;
  let expectStrikeUntil = 0;

  const isMuted = () => chatMuteRemainingMs(record(), now()) > 0;

  /** Cheap enough for every chat refresh: whether apply() has something to redraw. */
  function stale() {
    return record() !== appliedRecord || visible() !== appliedVisible || (appliedMuted && !isMuted());
  }

  /** Draws the muted state onto the composer and returns whether chat is muted. */
  function apply() {
    const current = record(), shown = visible(), at = now();
    const remaining = chatMuteRemainingMs(current, at);
    const muted = remaining > 0;
    // Only a strike that follows this tab's own send earns the notice, so a
    // reload or reconnect never repeats it. Clocks are compared locally only.
    const latestStrike = current?.strikeAtMs[current.strikeAtMs.length - 1] ?? 0;
    if (latestStrike > noticedStrikeAt) {
      if (!muted && at < expectStrikeUntil) showMessage(CHAT_STRIKE_NOTICE, "#ffdb84");
      noticedStrikeAt = latestStrike;
    }
    appliedRecord = current; appliedVisible = shown; appliedMuted = muted;
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
    if (input.disabled !== muted) input.disabled = muted;
    // HH:MM, or MM:SS in the last minute: five characters, so it fits the 53px Send button.
    const label = formatTimerMs(remaining);
    const nextPlaceholder = muted ? `Chat muted · ${label}` : placeholder;
    if (input.placeholder !== nextPlaceholder) input.placeholder = nextPlaceholder;
    // Greyed out, not merely disabled: the green cooldown look read as "wait a moment".
    if (sendButton.classList.contains("is-muted") !== muted) sendButton.classList.toggle("is-muted", muted);
    if (!muted) return false;
    sendButton.disabled = true;
    if (sendButton.textContent !== label) sendButton.textContent = label;
    if (shown) timer = window.setTimeout(() => { timer = null; onTick(); }, remaining % 1_000 || 1_000);
    return true;
  }

  return {
    apply,
    stale,
    isMuted,
    /** Called as a message is sent, so the strike it may earn is announced. */
    expectStrike: () => { expectStrikeUntil = now() + STRIKE_EXPECTATION_MS; },
  };
}
