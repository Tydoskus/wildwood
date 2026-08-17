import { DEVELOPER_BADGE, isDeveloperIdentity } from "../app/developer";
import { formatCompactNumber } from "./number-format";

const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
const CHAT_DISPLAY_TTL_MS = 10_800_000;
const CHAT_COOLDOWN_MS = 3_000;
const PROFILE_PORTRAIT_ZOOM = 1.03;
const PROFILE_PORTRAIT_POSITION_STEP = PROFILE_PORTRAIT_ZOOM / (8 * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const PROFILE_PORTRAIT_POSITION_START = (PROFILE_PORTRAIT_ZOOM - 1) / 2 / (8 * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];

type ChatMessage = {
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  powerLevel: number;
  sentAtMs: number;
};

type CoopClient = {
  localDisplayName?: () => string;
  localIdentity?: () => string | undefined;
  isGuest?: (identity: string) => boolean;
  profileIcon?: (identity: string) => number;
  chatRevision?: () => number;
  chatMessages?: () => ChatMessage[];
  sendChatMessage?: (message: string) => Promise<{ ok: boolean; error?: string }>;
};

type ChatElements = {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  header: HTMLElement;
  sizeToggle: HTMLButtonElement;
  messages: HTMLElement;
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
};

type ChatOptions = {
  elements: ChatElements;
  getCoop: () => CoopClient | null;
  showMessage: (text: string, color?: string) => void;
  onOpenReplay?: (replayId: bigint) => void;
  onOpenPlayer?: (identity: string, displayName: string) => void;
};

export function createChatController({ elements, getCoop, showMessage, onOpenReplay, onOpenPlayer }: ChatOptions) {
  let enabled = true;
  let large = false;
  let renderedRevision = -1;
  let nextExpiryAt = 0;
  let chatCooldownUntil = 0;
  let chatCooldownTimer: number | null = null;

  try { enabled = localStorage.getItem(CHAT_ENABLED_KEY) !== "false"; } catch {}

  function updateVisibility() {
    elements.toggle.textContent = enabled ? "ON" : "OFF";
    elements.toggle.setAttribute("aria-pressed", String(enabled));
    elements.toggle.classList.toggle("is-off", !enabled);
    elements.panel.hidden = !enabled;
    try { localStorage.setItem(CHAT_ENABLED_KEY, String(enabled)); } catch {}
  }

  function updateHeight() {
    elements.panel.classList.toggle("is-large", large);
    elements.sizeToggle.setAttribute("aria-expanded", String(large));
    elements.sizeToggle.setAttribute("aria-label", large ? "Minimize chat" : "Expand chat");
    // Minimized chat renders only its two latest messages. Rebuild when the
    // presentation changes so there is no hidden scroll position to preserve.
    renderedRevision = -1;
    refresh();
    if (large) requestAnimationFrame(() => { elements.messages.scrollTop = elements.messages.scrollHeight; });
  }

  function updateChatCooldown() {
    const remaining = Math.max(0, chatCooldownUntil - Date.now());
    const active = remaining > 0;
    elements.sendButton.disabled = active;
    elements.sendButton.textContent = active ? `WAIT ${Math.ceil(remaining / 1000)}S` : "SEND";
    if (chatCooldownTimer !== null) window.clearTimeout(chatCooldownTimer);
    chatCooldownTimer = active ? window.setTimeout(updateChatCooldown, Math.min(remaining, 250)) : null;
  }

  function startChatCooldown() {
    chatCooldownUntil = Date.now() + CHAT_COOLDOWN_MS;
    updateChatCooldown();
  }

  function nameColor(identity: string) {
    let hash = 2166136261;
    for (const character of identity) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
  }

  function duelPresentation(message: ChatMessage, localName: string | undefined, localIdentity: string | undefined) {
    const match = /^(.+?) beat (.+?) in a duel\.$/.exec(message.message);
    if (!match || !localName) return null;
    const [, winner, loser] = match;
    if (loser === localName) return { name: loser, identity: localIdentity, text: `${loser} lost to ${winner} in a duel.` };
    return null;
  }

  function displayNameFor(message: ChatMessage, localName: string | undefined, localIdentity: string | undefined) {
    if (message.replayId === 0n) return message.senderName;
    return duelPresentation(message, localName, localIdentity)?.name ?? (message.senderName || "DUEL");
  }

  function refresh() {
    const coop = getCoop();
    const localName = coop?.localDisplayName?.();
    const localIdentity = coop?.localIdentity?.();

    const now = Date.now();
    const revision = coop?.chatRevision?.() ?? -1;
    if (revision === renderedRevision && now < nextExpiryAt) return;
    const previousScrollTop = elements.messages.scrollTop;
    const previousScrollHeight = elements.messages.scrollHeight;
    const distanceFromBottom = previousScrollHeight - elements.messages.clientHeight - previousScrollTop;
    const followNewestMessage = !large || renderedRevision < 0 || distanceFromBottom <= 16;
    const allMessages = (coop?.chatMessages?.().filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS) ?? []).slice(-100);
    // Do not rely on scrolling hidden rows in compact mode. Its DOM contains
    // exactly the newest two rows in the same oldest-to-newest order as the
    // expanded view.
    const messages = large ? allMessages : allMessages.slice(-2);
    renderedRevision = revision;
    nextExpiryAt = allMessages.length > 0 ? allMessages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
    elements.messages.replaceChildren();
    for (const message of messages) {
      const duel = message.replayId > 0n ? duelPresentation(message, localName, localIdentity) : null;
      const displayName = displayNameFor(message, localName, localIdentity);
      const displayIdentity = duel?.identity ?? message.sender;
      const line = document.createElement("div");
      line.className = "chat-line";
      const isDuelMessage = message.replayId > 0n;
      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = new Date(message.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const name = document.createElement("span");
      name.className = "chat-name";
      name.style.color = nameColor(displayIdentity);
      const nameCore = document.createElement("span");
      nameCore.className = "chat-name-core";
      const guestSuffix = coop?.isGuest?.(displayIdentity) ? " (guest)" : "";
      if (isDeveloperIdentity(displayIdentity)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = `${DEVELOPER_BADGE} `;
        nameCore.appendChild(badge);
      }
      nameCore.append(document.createTextNode(`${displayName}${guestSuffix}`));
      name.appendChild(nameCore);
      if (!isDuelMessage && message.powerLevel > 0) {
        const power = document.createElement("span");
        power.className = "chat-power";
        power.setAttribute("aria-label", `Power ${formatCompactNumber(message.powerLevel)}`);
        const powerIcon = document.createElement("img");
        powerIcon.className = "power-icon chat-power-icon";
        powerIcon.src = "assets/wildwood/icons/Icon_Battle.png";
        powerIcon.alt = "";
        powerIcon.setAttribute("aria-hidden", "true");
        const powerValue = document.createElement("span");
        powerValue.textContent = formatCompactNumber(message.powerLevel);
        power.append(powerIcon, powerValue);
        name.appendChild(power);
      }
      name.setAttribute("role", "button");
      name.setAttribute("tabindex", "0");
      name.setAttribute("aria-label", `View ${displayName}'s profile`);
      const openPlayer = (event: Event) => {
        event.stopPropagation();
        onOpenPlayer?.(displayIdentity, displayName);
      };
      const openReplay = (event: Event) => {
        event.stopPropagation();
        onOpenReplay?.(message.replayId);
      };
      name.addEventListener("click", openPlayer);
      name.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      const text = document.createElement("span");
      text.className = "chat-text";
      text.textContent = duel?.text ?? message.message;
      const icon = document.createElement("span");
      icon.className = "chat-profile-icon";
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", "0");
      icon.setAttribute("aria-label", `View ${displayName}'s profile`);
      icon.addEventListener("click", openPlayer);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      const iconIndex = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(displayIdentity) ?? 0)));
      icon.style.backgroundPosition = `${PROFILE_PORTRAIT_POSITION_START + (iconIndex % 8) * PROFILE_PORTRAIT_POSITION_STEP}% ${PROFILE_PORTRAIT_POSITION_START + Math.floor(iconIndex / 8) * PROFILE_PORTRAIT_POSITION_STEP}%`;
      line.append(time, icon, name, text);
      if (isDuelMessage) {
        line.classList.add("has-replay");
        line.setAttribute("role", "button");
        line.setAttribute("tabindex", "0");
        line.setAttribute("aria-label", "Watch duel replay");
        line.addEventListener("click", openReplay);
        line.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openReplay(event);
        });
        const replay = document.createElement("button");
        replay.className = "chat-replay";
        replay.type = "button";
        replay.title = "Watch duel replay";
        replay.setAttribute("aria-label", "Watch duel replay");
        const replayIcon = document.createElement("span");
        replayIcon.className = "chat-replay-icon";
        replayIcon.setAttribute("aria-hidden", "true");
        replay.appendChild(replayIcon);
        replay.addEventListener("click", openReplay);
        text.append(" ", replay);
      }
      elements.messages.appendChild(line);
    }
    if (followNewestMessage) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    } else {
      // Appended messages do not move history being read. If old messages
      // expire from the top, compensate only for the removed height.
      const heightChange = elements.messages.scrollHeight - previousScrollHeight;
      elements.messages.scrollTop = Math.max(0, previousScrollTop + Math.min(0, heightChange));
    }
  }

  function init() {
    elements.toggle.addEventListener("click", () => {
      enabled = !enabled;
      updateVisibility();
    });
    elements.header.addEventListener("pointerup", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      large = !large;
      updateHeight();
    });
    elements.sizeToggle.addEventListener("click", () => {
      large = !large;
      updateHeight();
    });
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (Date.now() < chatCooldownUntil) {
        showMessage(`CHAT READY IN ${Math.ceil((chatCooldownUntil - Date.now()) / 1000)}S`, "#ffdb84");
        return;
      }
      const message = elements.input.value.trim();
      if (!message) return;
      const bugCommand = /^\/bug(?:\s|$)/i.exec(message);
      if (bugCommand && !message.slice(bugCommand[0].length).trim()) {
        showMessage("USE /BUG FOLLOWED BY A DESCRIPTION", "#ff9b91");
        return;
      }
      const result = await getCoop()?.sendChatMessage?.(message);
      if (!result?.ok) {
        showMessage(result?.error || "MESSAGE FAILED", "#ff9b91");
        return;
      }
      elements.input.value = "";
      elements.input.style.height = "28px";
      startChatCooldown();
      if (bugCommand) showMessage("BUG REPORT SENT", "#c9f5c2");
    });
    elements.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    elements.input.addEventListener("beforeinput", (event) => {
      if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    elements.input.addEventListener("input", (event) => {
      if (event instanceof InputEvent && (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph")) {
        elements.input.value = elements.input.value.replace(/\n$/, "");
        elements.form.requestSubmit();
      }
      elements.input.style.height = "auto";
      elements.input.style.height = `${Math.min(elements.input.scrollHeight, 54)}px`;
    });
    updateVisibility();
    updateHeight();
    updateChatCooldown();
    refresh();
  }

  return { init, refresh };
}
