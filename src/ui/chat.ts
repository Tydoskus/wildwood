import { DEVELOPER_BADGE, isDeveloperIdentity } from "../app/developer";

const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
const CHAT_DISPLAY_TTL_MS = 10_800_000;
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

  function nameColor(identity: string) {
    let hash = 2166136261;
    for (const character of identity) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
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
    const messages = (coop?.chatMessages?.().filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS) ?? []).slice(-100);
    renderedRevision = revision;
    nextExpiryAt = messages.length > 0 ? messages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
    elements.messages.replaceChildren();
    for (const message of messages) {
      const line = document.createElement("div");
      line.className = "chat-line";
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
      name.append(document.createTextNode(`${message.senderName}${guestSuffix}`));
      name.setAttribute("role", "button");
      name.setAttribute("tabindex", "0");
      name.setAttribute("aria-label", `View ${message.senderName}'s profile`);
      const openPlayer = (event: Event) => {
        event.stopPropagation();
        onOpenPlayer?.(message.sender, message.senderName);
      };
      name.addEventListener("click", openPlayer);
      name.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      const text = document.createElement("span");
      text.className = "chat-text";
      text.textContent = message.message;
      const icon = document.createElement("span");
      icon.className = "chat-profile-icon";
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", "0");
      icon.setAttribute("aria-label", `View ${message.senderName}'s profile`);
      icon.addEventListener("click", openPlayer);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      const iconIndex = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(message.sender) ?? 0)));
      icon.style.backgroundPosition = `${(iconIndex % 8) / 7 * 100}% ${Math.floor(iconIndex / 8) / 7 * 100}%`;
      line.append(time, icon, name, text);
      if (message.replayId > 0n) {
        line.classList.add("has-replay");
        const replay = document.createElement("button");
        replay.className = "chat-replay";
        replay.type = "button";
        replay.title = "Watch duel replay";
        replay.setAttribute("aria-label", "Watch duel replay");
        replay.textContent = "▶";
        replay.addEventListener("click", (event) => {
          event.stopPropagation();
          onOpenReplay?.(message.replayId);
        });
        line.appendChild(replay);
      }
      elements.messages.appendChild(line);
    }
    elements.messages.scrollTop = elements.messages.scrollHeight;
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
      if (bugCommand) showMessage("BUG REPORT SENT", "#c9f5c2");
    });
    elements.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    elements.input.addEventListener("input", () => {
      elements.input.style.height = "auto";
      elements.input.style.height = `${Math.min(elements.input.scrollHeight, 54)}px`;
    });
    elements.saveNameButton.addEventListener("click", saveDisplayName);
    updateVisibility();
    updateHeight();
    refresh();
  }

  return { init, refresh };
}
