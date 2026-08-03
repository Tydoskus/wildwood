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
  chatMessages?: () => ChatMessage[];
  sendChatMessage?: (message: string) => void;
  setDisplayName?: (name: string) => void;
};

type ChatElements = {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
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
};

export function createChatController({ elements, getCoop, showMessage, onOpenReplay }: ChatOptions) {
  let enabled = true;
  let large = false;

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

    elements.messages.replaceChildren();
    const now = Date.now();
    const messages = coop?.chatMessages?.().filter((message) => now - message.sentAtMs < CHAT_DISPLAY_TTL_MS) ?? [];
    for (const message of messages) {
      const line = document.createElement("div");
      line.className = "chat-line";
      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = new Date(message.sentAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const name = document.createElement("span");
      name.className = "chat-name";
      name.style.color = nameColor(message.sender);
      name.textContent = `${message.senderName}: `;
      const text = document.createElement("span");
      text.className = "chat-text";
      text.textContent = message.message;
      line.append(time, name, text);
      if (message.replayId > 0n) {
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

  function saveDisplayName() {
    const name = elements.displayNameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) {
      showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91");
      return;
    }
    getCoop()?.setDisplayName?.(name);
  }

  function init() {
    elements.toggle.addEventListener("click", () => {
      enabled = !enabled;
      updateVisibility();
    });
    elements.panel.addEventListener("pointerup", (event) => {
      if (event.target instanceof Element && event.target.closest("#chatForm, button, input, textarea, label")) return;
      large = !large;
      updateHeight();
    });
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = elements.input.value.trim();
      if (!message) return;
      getCoop()?.sendChatMessage?.(message);
      elements.input.value = "";
      elements.input.style.height = "28px";
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
