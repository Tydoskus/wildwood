import { chatMuteRemainingMs, formatChatMuteRemaining, type ChatMuteRecord } from "../../shared/chat-mute";

export const CHAT_STRIKE_NOTICE = "REPEATED FILTERED MESSAGES WILL MUTE CHAT";
/** A strike that lands this long after a local send is that send's. */
const STRIKE_EXPECTATION_MS = 15_000;

/**
 * The Send button is 53px wide: 42:10 fits on one line, 23:59:59 does not, so
 * an hour or more reads "23h 59m" and wraps onto two lines like "WAIT 3S".
 */
export function formatChatMuteButton(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  if (totalSeconds < 3_600) return formatChatMuteRemaining(ms);
  return `${Math.floor(totalSeconds / 3_600)}h ${String(Math.floor(totalSeconds % 3_600 / 60)).padStart(2, "0")}m`;
}

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
    const label = formatChatMuteRemaining(remaining);
    const nextPlaceholder = muted ? `Chat muted · ${label}` : placeholder;
    if (input.placeholder !== nextPlaceholder) input.placeholder = nextPlaceholder;
    if (!muted) return false;
    sendButton.disabled = true;
    const buttonLabel = formatChatMuteButton(remaining);
    if (sendButton.textContent !== buttonLabel) sendButton.textContent = buttonLabel;
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
