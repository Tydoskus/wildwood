import { DEVELOPER_BADGE, isDeveloperIdentity } from "../app/developer";
import {
  duelReplayIsInteractive,
  formatChatTime,
  formatChatReplyPreview,
  shouldShowGlobalChatMessage,
} from "./chat-presentation";
import { formatCompactNumber } from "./number-format";
import { appendPlayerGenderIcon } from "./player-gender";
import { PLAYER_GENDER_UNSET, normalizePlayerGender, type PlayerGender } from "../../shared/player-gender";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import { type ChatReportReason } from "../../shared/chat-report";
import {
  createChatMessageActionsController,
  type ChatMessageActionElements,
  type ChatMessageActionTarget,
} from "./chat-message-actions";

const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
const CHAT_DISPLAY_TTL_MS = 86_400_000;
const CHAT_COOLDOWN_MS = 3_000;
const PROFILE_PORTRAIT_ZOOM = 1.03;
const PROFILE_PORTRAIT_POSITION_STEP = PROFILE_PORTRAIT_ZOOM / (8 * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const PROFILE_PORTRAIT_POSITION_START = (PROFILE_PORTRAIT_ZOOM - 1) / 2 / (8 * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];

export function focusChatReplyInput(input: Pick<HTMLTextAreaElement, "focus" | "setSelectionRange" | "value">) {
  // Native focus scrolling is required here: revealing the reply preview moves
  // the textarea down just before the mobile keyboard opens.
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

type ChatMessage = {
  id: bigint;
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
  powerLevel: number;
  senderGender: PlayerGender;
  moderated: boolean;
  replyToMessageId: bigint;
  replyToSenderName: string;
  replyToMessage: string;
  sentAtMs: number;
};

type CoopClient = {
  localIdentity?: () => string;
  isGuest?: (identity: string) => boolean;
  profileIcon?: (identity: string) => number;
  playerGender?: (identity: string) => PlayerGender;
  chatRevision?: () => number;
  isPlayerBlocked?: (identity: string) => boolean;
  chatMessages?: () => ChatMessage[];
  sendChatMessage?: (message: string, replyToMessageId?: bigint) => Promise<{ ok: boolean; error?: string }>;
  reportChatMessage?: (messageId: bigint, reason: ChatReportReason) => Promise<{ ok: boolean; error?: string }>;
};

type ChatElements = {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  header: HTMLElement;
  sizeToggle: HTMLButtonElement;
  messages: HTMLElement;
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  replyComposer: HTMLElement;
  replyComposerName: HTMLElement;
  replyComposerPreview: HTMLElement;
  replyCancelButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  sendButton: HTMLButtonElement;
  messageActions: ChatMessageActionElements;
};

type ChatOptions = {
  elements: ChatElements;
  getCoop: () => CoopClient | null;
  showMessage: (text: string, color?: string) => void;
  onOpenReplay?: (replayId: bigint) => void;
  onOpenPlayer?: (identity: string, displayName: string) => void;
  onLayoutChange?: () => void;
};

export function createChatController({ elements, getCoop, showMessage, onOpenReplay, onOpenPlayer, onLayoutChange }: ChatOptions) {
  let enabled = true;
  let large = false;
  let renderedRevision = -1;
  let nextExpiryAt = 0;
  let chatCooldownUntil = 0;
  let chatCooldownTimer: number | null = null;
  let layoutRecoveryTimer: number | null = null;
  let pendingReply: ChatMessageActionTarget | null = null;
  const messageActions = createChatMessageActionsController({
    elements: elements.messageActions,
    getLocalIdentity: () => getCoop()?.localIdentity?.() ?? "",
    onWatchReplay: (replayId) => onOpenReplay?.(replayId),
    onReply: (target) => setPendingReply(target, true),
    reportMessage: async (messageId, reason) => {
      const report = getCoop()?.reportChatMessage;
      if (!report) return { ok: false, error: "NOT CONNECTED" };
      return report(messageId, reason);
    },
    showMessage,
  });

  try { enabled = localStorage.getItem(CHAT_ENABLED_KEY) !== "false"; } catch {}

  function setPendingReply(target: ChatMessageActionTarget | null, focusInput = false) {
    pendingReply = target;
    elements.replyComposer.hidden = target === null;
    if (target) {
      elements.replyComposerName.textContent = `Replying to ${target.senderName}`;
      elements.replyComposerPreview.textContent = target.message.replace(/\s+/g, " ");
    } else {
      elements.replyComposerName.textContent = "";
      elements.replyComposerPreview.textContent = "";
    }
    if (focusInput) {
      focusChatReplyInput(elements.input);
    }
  }

  function updateVisibility() {
    elements.toggle.textContent = enabled ? "ON" : "OFF";
    elements.toggle.setAttribute("aria-pressed", String(enabled));
    elements.toggle.classList.toggle("is-off", !enabled);
    elements.panel.hidden = !enabled;
    if (!enabled) {
      messageActions.close(false);
      setPendingReply(null);
    }
    try { localStorage.setItem(CHAT_ENABLED_KEY, String(enabled)); } catch {}
    requestAnimationFrame(() => onLayoutChange?.());
  }

  function updateHeight() {
    elements.panel.classList.toggle("is-large", large);
    elements.sizeToggle.setAttribute("aria-expanded", String(large));
    elements.sizeToggle.setAttribute("aria-label", large ? "Minimize chat" : "Expand chat");
    elements.backButton.hidden = !large;
    // Minimized chat renders only its two latest messages. Rebuild when the
    // presentation changes so there is no hidden scroll position to preserve.
    renderedRevision = -1;
    refresh();
    if (!large) {
      elements.input.style.height = "28px";
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
    requestAnimationFrame(() => onLayoutChange?.());
    if (large) requestAnimationFrame(() => { elements.messages.scrollTop = elements.messages.scrollHeight; });
  }

  function setLarge(nextLarge: boolean) {
    const closingComposer = large && !nextLarge;
    if (closingComposer) elements.input.blur();
    large = nextLarge;
    if (!large) {
      messageActions.close(false);
      setPendingReply(null);
    }
    updateHeight();
    if (closingComposer) {
      if (layoutRecoveryTimer !== null) window.clearTimeout(layoutRecoveryTimer);
      requestAnimationFrame(() => requestAnimationFrame(() => onLayoutChange?.()));
      layoutRecoveryTimer = window.setTimeout(() => {
        layoutRecoveryTimer = null;
        onLayoutChange?.();
      }, 400);
    }
  }

  function toggleLarge() {
    setLarge(!large);
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

  function refresh() {
    const coop = getCoop();
    if (pendingReply && coop?.isPlayerBlocked?.(pendingReply.sender)) setPendingReply(null);

    const now = Date.now();
    const revision = coop?.chatRevision?.() ?? -1;
    if (revision === renderedRevision && now < nextExpiryAt) return;
    const previousScrollTop = elements.messages.scrollTop;
    const previousScrollHeight = elements.messages.scrollHeight;
    const distanceFromBottom = previousScrollHeight - elements.messages.clientHeight - previousScrollTop;
    const followNewestMessage = !large || renderedRevision < 0 || distanceFromBottom <= 16;
    const allMessages = (coop?.chatMessages?.().filter((message) =>
      now - message.sentAtMs < CHAT_DISPLAY_TTL_MS && shouldShowGlobalChatMessage(message.senderName)
    ) ?? []).slice(-100);
    // Do not rely on scrolling hidden rows in compact mode. Its DOM contains
    // exactly the newest two rows in the same oldest-to-newest order as the
    // expanded view.
    const messages = large ? allMessages : allMessages.slice(-2);
    renderedRevision = revision;
    nextExpiryAt = allMessages.length > 0 ? allMessages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
    elements.messages.replaceChildren();
    for (const message of messages) {
      const line = document.createElement("div");
      line.className = "chat-line";
      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = formatChatTime(new Date(message.sentAtMs));
      const shownMessage = message.moderated ? MODERATED_CHAT_MESSAGE : message.message;
      const text = document.createElement("span");
      text.className = "chat-text";
      text.classList.toggle("is-moderated", message.moderated);
      if (message.replyToMessageId > 0n && message.replyToSenderName && message.replyToMessage) {
        const replyPreview = document.createElement("span");
        replyPreview.className = "chat-reply-preview";
        replyPreview.textContent = formatChatReplyPreview(message.replyToSenderName, message.replyToMessage);
        text.appendChild(replyPreview);
      }
      const messageBody = document.createElement("span");
      messageBody.className = "chat-message-body";
      messageBody.textContent = shownMessage;
      text.appendChild(messageBody);
      const displayName = message.senderName || (message.replayId > 0n ? "DUEL" : "PLAYER");
      const displayIdentity = message.sender;
      const cachedGender = normalizePlayerGender(coop?.playerGender?.(displayIdentity));
      const displayedGender = cachedGender !== PLAYER_GENDER_UNSET
        ? cachedGender
        : message.senderGender;
      const displayedPower = message.powerLevel;
      const name = document.createElement("span");
      name.className = "chat-name";
      name.style.color = nameColor(displayIdentity);
      const nameCore = document.createElement("span");
      nameCore.className = "chat-name-core";
      if (isDeveloperIdentity(displayIdentity)) {
        const badge = document.createElement("span");
        badge.className = "dev-badge";
        badge.textContent = `${DEVELOPER_BADGE} `;
        nameCore.appendChild(badge);
      }
      const nameText = document.createElement("span");
      nameText.className = "chat-name-text";
      nameText.textContent = displayName;
      nameCore.append(nameText);
      appendPlayerGenderIcon(nameCore, displayedGender);
      if (coop?.isGuest?.(displayIdentity)) nameCore.append(document.createTextNode(" (guest)"));
      name.appendChild(nameCore);
      if (displayedPower > 0) {
        const power = document.createElement("span");
        power.className = "chat-power";
        power.setAttribute("aria-label", `Power ${formatCompactNumber(displayedPower)}`);
        const powerIcon = document.createElement("img");
        powerIcon.className = "power-icon chat-power-icon";
        powerIcon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.png";
        powerIcon.alt = "";
        powerIcon.setAttribute("aria-hidden", "true");
        const powerValue = document.createElement("span");
        powerValue.textContent = formatCompactNumber(displayedPower);
        power.append(powerValue, powerIcon);
        name.appendChild(power);
      }
      const openPlayer = (event: Event) => {
        event.stopPropagation();
        if (!large) {
          event.preventDefault();
          setLarge(true);
          return;
        }
        onOpenPlayer?.(displayIdentity, displayName);
      };
      const openMessageActions = (event: Event) => {
        event.stopPropagation();
        messageActions.open({
          id: message.id,
          sender: message.sender,
          senderName: displayName,
          message: shownMessage,
          replayId: message.replayId,
        });
      };
      const icon = document.createElement("span");
      icon.className = "chat-profile-icon";
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", large ? "0" : "-1");
      icon.setAttribute("aria-label", `View ${displayName}'s profile`);
      icon.addEventListener("click", openPlayer);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      const iconIndex = Math.max(0, Math.min(63, Math.floor(coop?.profileIcon?.(displayIdentity) ?? 0)));
      icon.style.backgroundPosition = `${PROFILE_PORTRAIT_POSITION_START + (iconIndex % 8) * PROFILE_PORTRAIT_POSITION_STEP}% ${PROFILE_PORTRAIT_POSITION_START + Math.floor(iconIndex / 8) * PROFILE_PORTRAIT_POSITION_STEP}%`;
      const content = document.createElement("div");
      content.className = "chat-message-content";
      content.append(name, text);
      line.append(time, icon, content);
      if (large) {
        text.classList.add("is-actionable");
        text.setAttribute("role", "button");
        text.setAttribute("tabindex", "0");
        text.setAttribute("aria-label", `Message from ${displayName}. Open actions.`);
        text.addEventListener("click", openMessageActions);
        text.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openMessageActions(event);
        });
      }
      if (duelReplayIsInteractive(message.replayId, large)) {
        line.classList.add("has-replay");
        line.setAttribute("role", "button");
        line.setAttribute("tabindex", "0");
        line.setAttribute("aria-label", "Open duel replay actions");
        line.addEventListener("click", openMessageActions);
        line.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openMessageActions(event);
        });
        const replay = document.createElement("button");
        replay.className = "chat-replay";
        replay.type = "button";
        replay.title = "Open duel replay actions";
        replay.setAttribute("aria-label", "Open duel replay actions");
        const replayIcon = document.createElement("span");
        replayIcon.className = "chat-replay-icon";
        replayIcon.setAttribute("aria-hidden", "true");
        replay.appendChild(replayIcon);
        replay.addEventListener("click", openMessageActions);
        messageBody.append(" ", replay);
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
    messageActions.init();
    elements.toggle.addEventListener("click", () => {
      enabled = !enabled;
      updateVisibility();
    });
    elements.header.addEventListener("pointerup", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      toggleLarge();
    });
    elements.panel.addEventListener("click", (event) => {
      if (large) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLarge(true);
    }, { capture: true });
    elements.sizeToggle.addEventListener("click", toggleLarge);
    elements.backButton.addEventListener("click", () => setLarge(false));
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
      const result = await getCoop()?.sendChatMessage?.(message, pendingReply?.id ?? 0n);
      if (!result?.ok) {
        showMessage(result?.error || "MESSAGE FAILED", "#ff9b91");
        return;
      }
      elements.input.value = "";
      elements.input.style.height = "28px";
      setPendingReply(null);
      startChatCooldown();
      if (bugCommand) showMessage("BUG REPORT SENT", "#c9f5c2");
    });
    elements.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    elements.replyCancelButton.addEventListener("click", () => setPendingReply(null, true));
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

  return {
    init,
    refresh,
    minimize: () => { if (large) setLarge(false); },
    isMaximized: () => large,
  };
}
