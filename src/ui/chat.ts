import { DEVELOPER_BADGE, isDeveloperIdentity } from "../app/developer";

const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
const CHAT_DISPLAY_TTL_MS = 10_800_000;
const CHAT_COOLDOWN_MS = 3_000;
const PROFILE_PORTRAIT_ZOOM = 1.03;
const PROFILE_PORTRAIT_POSITION_STEP = PROFILE_PORTRAIT_ZOOM / (8 * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];

type ChatMessage = {
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  sentAtMs: number;
};

type CoopClient = {
  localDisplayName?: () => string;
  isGuest?: (identity: string) => boolean;
  profileIcon?: (identity: string) => number;
  chatRevision?: () => number;
  chatMessages?: () => ChatMessage[];
  sendChatMessage?: (message: string) => Promise<{ ok: boolean; error?: string }>;
  setDisplayName?: (name: string) => Promise<{ ok: boolean; error?: string }>;
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
  displayNameInput: HTMLInputElement;
  saveNameButton: HTMLButtonElement;
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

  function displayNameFor(message: ChatMessage) {
    if (message.senderName !== "DUEL") return message.senderName;
    return /^(.+?) (?:beat|and) /.exec(message.message)?.[1] ?? "DUEL RESULT";
  }

  function refresh() {
    const coop = getCoop();
    const localName = coop?.localDisplayName?.();
    if (localName && document.activeElement !== elements.displayNameInput) {
      elements.displayNameInput.value = localName;
    }

    const now = Date.now();
    const revision = coop?.chatRevision?.() ?? -1;
    if (revision === renderedRevision && now < nextExpiryAt) return;
    const previousScrollTop = elements.messages.scrollTop;
    const previousScrollHeight = elements.messages.scrollHeight;
    const distanceFromBottom = previousScrollHeight - elements.messages.clientHeight - previousScrollTop;
    const followNewestMessage = !large || renderedRevision < 0 || distanceFromBottom <= 16;
    const messages = (coop?.chatMessages?.().filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS) ?? []).slice(-100);
    renderedRevision = revision;
    nextExpiryAt = messages.length > 0 ? messages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
    elements.messages.replaceChildren();
    for (const message of messages) {
      const displayName = displayNameFor(message);
      const line = document.createElement("div");
      line.className = "chat-line";
      const isDuelMessage = message.replayId > 0n;
      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = new Date(message.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const name = document.createElement("span");
      name.className = "chat-name";
      name.style.color = nameColor(message.sender);
      const guestSuffix = coop?.isGuest?.(message.sender) ? " (guest)" : "";
      if (isDeveloperIdentity(message.sender)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = `${DEVELOPER_BADGE} `;
        name.appendChild(badge);
      }
      name.append(document.createTextNode(`${displayName}${guestSuffix}`));
      name.setAttribute("role", "button");
      name.setAttribute("tabindex", "0");
      name.setAttribute("aria-label", isDuelMessage ? "Watch duel replay" : `View ${displayName}'s profile`);
      const openPlayer = (event: Event) => {
        event.stopPropagation();
        onOpenPlayer?.(message.sender, displayName);
      };
      const openReplay = (event: Event) => {
        event.stopPropagation();
        onOpenReplay?.(message.replayId);
      };
      const activateMessage = isDuelMessage ? openReplay : openPlayer;
      name.addEventListener("click", activateMessage);
      name.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateMessage(event);
      });
      const text = document.createElement("span");
      text.className = "chat-text";
      text.textContent = message.message;
      const icon = document.createElement("span");
      icon.className = "chat-profile-icon";
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", "0");
      icon.setAttribute("aria-label", isDuelMessage ? "Watch duel replay" : `View ${displayName}'s profile`);
      icon.addEventListener("click", activateMessage);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateMessage(event);
      });
      const iconIndex = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(message.sender) ?? 0)));
      icon.style.backgroundPosition = `${(iconIndex % 8) * PROFILE_PORTRAIT_POSITION_STEP}% ${Math.floor(iconIndex / 8) * PROFILE_PORTRAIT_POSITION_STEP}%`;
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

  async function saveDisplayName() {
    const name = elements.displayNameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
      showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
      return;
    }
    const currentName = getCoop()?.localDisplayName?.();
    if (name === currentName) {
      showMessage("NAME ALREADY SET", "#bce7ff");
      return;
    }
    elements.saveNameButton.disabled = true;
    const result = await getCoop()?.setDisplayName?.(name);
    elements.saveNameButton.disabled = false;
    if (result?.ok) {
      showMessage("NAME UPDATED", "#c9f5c2");
      return;
    }
    if (/once every 30 days/i.test(result?.error ?? "")) {
      showMessage("NAME LOCKED · CHANGES EVERY 30 DAYS", "#ff9b91");
      return;
    }
    showMessage("NAME UPDATE FAILED", "#ff9b91");
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
    elements.saveNameButton.addEventListener("click", saveDisplayName);
    updateVisibility();
    updateHeight();
    updateChatCooldown();
    refresh();
  }

  return { init, refresh };
}
