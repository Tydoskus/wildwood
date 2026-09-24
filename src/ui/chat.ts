import { createChatViewport } from "./chat-viewport";
import { createChatScrollIdle } from "./chat-scroll-idle";
import { applyAvatarFrame } from "../app/avatar-frames";
import { applyProfileIcon } from "../app/profile-icons";
import { normalizeProfileIcon } from "../../shared/profile-icons";
import { appendChatReactions } from "./chat-reactions";
import type { ChatReaction, ChatReactionState } from "../../shared/chat-reactions";
import { appendPlayerNameTags, appendPrestigeBadge, playerNamePrefix } from "../app/player-name-tags";
import {
  duelReplayIsInteractive,
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

import { createChatUnreadTracker, formatChatUnreadCount, type ChatUnreadCounts } from "./chat-unread";
import { createChatHistory, type ChatHistoryPage } from "./chat-history";
import { createChatChannelPicker, type ChatChannel, type ChatConversation } from "./chat-channels";
import { createChatInputSizer } from "./chat-input-size";
import { chatListFingerprint, createChatInputMemo, sameChatRows, setChatAttribute, setChatHidden, setChatText } from "./chat-refresh-cache";

const CHAT_ENABLED_KEY = "wildwood-chat-enabled-v1";
const CHAT_DISPLAY_TTL_MS = 86_400_000;
const CHAT_COOLDOWN_MS = 3_000;
const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];

export function focusChatReplyInput(input: Pick<HTMLTextAreaElement, "focus" | "setSelectionRange" | "value">) {
  // Native focus scrolling is required here: revealing the reply preview moves
  // the textarea down just before the mobile keyboard opens.
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

type ChatMessage = {
  reactionCountsJson?: string;
  guildReplayKey?: string;
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
  loadChatMessageReactions?: (channel: string, id: bigint) => Promise<ChatReactionState>;
  setChatMessageReaction?: (channel: string, id: bigint, reaction: ChatReaction, active: boolean) => Promise<void>;
  social?: {
    historyRevision?: () => number;
    loadChatHistory?: (channel: "guild" | "dm", peer: string, beforeId: bigint) => Promise<ChatHistoryPage<ChatMessage>>;
    revision: () => number;
    guildMessages: () => ChatMessage[];
    privateMessages: (username: string) => ChatMessage[];
    friends: () => ChatConversation[];
    privateConversations: () => ChatConversation[];
    currentGuild: () => { id: string | bigint; name: string } | null;
    loadSocial: () => Promise<unknown>;
    sendGuildMessage: (message: string, replyId?: bigint) => Promise<{ ok: boolean; error?: string }>;
    sendPrivateMessage: (username: string, message: string, replyId?: bigint) => Promise<{ ok: boolean; error?: string }>;
    reportMessage: (id: bigint, reason: ChatReportReason) => Promise<{ ok: boolean; error?: string }>;
  };
  localIdentity?: () => string;
  isGuest?: (identity: string) => boolean;
  profileIcon?: (identity: string) => number;
  prepareChatPortraits?: (identities: readonly string[]) => Promise<void>;
  playerGender?: (identity: string) => PlayerGender;
  chatRevision?: () => number;
  chatHistoryRevision?: () => number;
  isPlayerBlocked?: (identity: string) => boolean;
  chatMessages?: () => ChatMessage[];
  loadChatHistory?: (beforeId: bigint) => Promise<ChatHistoryPage<ChatMessage>>;
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
  let interactionUntil = 0;
  let reactionRevision = 0;
  const reactionOverrides = new Map<string, { source: string | undefined; value: string }>();
  let renderedRevision = "", metadataRevision = "";
  let renderedRows = new Map<string, { signature: string; element: HTMLDivElement }>();
  // What the last full render drew, so a refresh can prove nothing changed
  // before it touches layout.
  let renderedViewKey = "", renderedSource: readonly ChatMessage[] = [], renderedMessages: readonly ChatMessage[] = [];
  let unreadInputs = "", unreadCounts: ChatUnreadCounts | null = null;
  const pickerInputs = createChatInputMemo();
  let channel: ChatChannel = "public";
  let privatePeer = "";
  let privatePeerIdentity = "";
  let sessionIdentity = getCoop()?.localIdentity?.() ?? "";
  let guildContext = String(getCoop()?.social?.currentGuild()?.id ?? "");
  let submissionGeneration = 0;
  let submitting = false;
  const unread = createChatUnreadTracker();
  const unreadBadge = document.createElement("span");
  unreadBadge.id = "chatUnreadBadge";
  unreadBadge.hidden = true;
  unreadBadge.setAttribute("role", "status");
  const drafts = new Map<string, string>();
  const history = createChatHistory<ChatMessage>();
  const scrollIdle = createChatScrollIdle();
  const historySpinner = document.createElement("span");
  historySpinner.className = "chat-history-spinner";
  historySpinner.hidden = true;
  historySpinner.setAttribute("role", "status");
  historySpinner.setAttribute("aria-label", "Loading older messages");
  const historyRow = document.createElement("div");
  historyRow.className = "chat-history-row";
  const historyRowHeight = 48;
  historyRow.style.height = `${historyRowHeight}px`;
  historyRow.append(historySpinner);
  const historyRowId = -1n; // Real message IDs are positive.
  const latestButton = document.createElement("button");
  latestButton.id = "chatLatestBtn";
  latestButton.type = "button";
  latestButton.textContent = "↓";
  latestButton.setAttribute("aria-label", "Jump to latest messages");
  latestButton.hidden = true;
  let lastScrollTop = 0, atLatest = true, viewportRevision = 0, scrollFrame = false;
  const viewport = createChatViewport();
  const topSpacer = document.createElement("div"), bottomSpacer = document.createElement("div");
  for (const spacer of [topSpacer, bottomSpacer]) { spacer.className = "chat-viewport-spacer"; spacer.setAttribute("aria-hidden", "true"); }
  let viewportContext = "";
  let settlingViewport = false;
  let originalTarget: bigint | null = null;
  function setSpacers(space: { top: number; bottom: number }) {
    const top = `${Math.max(0, space.top)}px`, bottom = `${space.bottom}px`;
    // At the history boundary an estimate correction can extend above zero.
    // A temporary negative margin keeps the visible row still until idle.
    const margin = `${Math.min(0, space.top)}px`;
    if (topSpacer.style.height !== top) topSpacer.style.height = top;
    if (topSpacer.style.marginTop !== margin) topSpacer.style.marginTop = margin;
    if (bottomSpacer.style.height !== bottom) bottomSpacer.style.height = bottom;
  }
  function refreshLatestButton() {
    const distance = elements.messages.scrollHeight - elements.messages.clientHeight - elements.messages.scrollTop;
    setChatHidden(latestButton, !large || !enabled || (channel === "private" && !privatePeer) || (distance <= 80 && !history.state().detached));
    if (latestButton.disabled !== history.state().loading) latestButton.disabled = history.state().loading;
  }
  const channelPicker = createChatChannelPicker((nextChannel, username, identity) => {
    scrollIdle.reset();
    drafts.set(conversationKey(), elements.input.value);
    channel = nextChannel;
    privatePeer = username;
    const social = getCoop()?.social;
    privatePeerIdentity = identity ?? social?.friends().find(person => person.name.toLowerCase() === username.toLowerCase())?.identity
      ?? social?.privateConversations().find(person => person.name.toLowerCase() === username.toLowerCase())?.identity ?? "";
    elements.input.value = drafts.get(conversationKey()) ?? "";
    messageActions.close(false);
    setPendingReply(null);
    renderedRevision = "";
    refresh();
    if (large && channel !== "public") void loadHistory(true);
    if (channel !== "public") void getCoop()?.social?.loadSocial().then(refresh)
      .catch(error => showMessage(error instanceof Error ? error.message : "COULD NOT REFRESH SOCIAL CONTACTS", "#ff9b91"));
  });

  function conversationKey() { return `${channel}:${channel === "private" ? privatePeerIdentity || privatePeer.toLowerCase() : channel === "guild" ? guildContext : ""}`; }
  function currentMessages() {
    const coop = getCoop();
    return (channel === "public" ? coop?.chatMessages?.() : channel === "guild" ? coop?.social?.guildMessages()
      : privatePeer ? coop?.social?.privateMessages(privatePeerIdentity || privatePeer) : []) ?? [];
  }
  async function loadHistory(latest = false) {
    if (!large || !enabled || (channel === "private" && !privatePeer)) return;
    const coop = getCoop(), key = conversationKey(), identity = coop?.localIdentity?.();
    if (channel === "guild" && !coop?.social?.currentGuild()) return;
    const fetch = channel === "public" ? coop?.loadChatHistory : coop?.social?.loadChatHistory
      ? (beforeId: bigint) => coop.social!.loadChatHistory!(channel === "guild" ? "guild" : "dm", privatePeerIdentity || privatePeer, beforeId) : undefined;
    if (!fetch) return;
    try {
      const pending = history.load(async before => {
        const page = await fetch(before);
        await coop?.prepareChatPortraits?.([...new Set(page.messages.map(message => message.sender))]);
        if (!latest) await scrollIdle.wait();
        return page;
      }, currentMessages(), latest);
      refresh();
      const changed = await pending;
      if (changed && key === conversationKey() && identity === getCoop()?.localIdentity?.()) {
        refresh();
        if (latest) elements.messages.scrollTop = elements.messages.scrollHeight;
      }
    } catch (error) {
      if (key === conversationKey() && identity === getCoop()?.localIdentity?.()) showMessage(error instanceof Error ? error.message : "COULD NOT LOAD HISTORY · TRY AGAIN", "#ff9b91");
    } finally { refresh(); }
  }
  async function goToOriginal(id: bigint) {
    if (id <= 0n || !large) return;
    const coop = getCoop(), key = conversationKey(), identity = coop?.localIdentity?.();
    const current = () => large && key === conversationKey() && identity === getCoop()?.localIdentity?.();
    const findLine = () => elements.messages.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    try {
      if (!history.messages(currentMessages()).some(row => row.id === id)) {
        const selectedChannel = channel, peer = privatePeerIdentity || privatePeer;
        const fetch = selectedChannel === "public" ? coop?.loadChatHistory : coop?.social?.loadChatHistory
          ? (before: bigint) => coop.social!.loadChatHistory!(selectedChannel === "guild" ? "guild" : "dm", peer, before) : undefined;
        if (!fetch) throw new Error("Reconnect to load the original message.");
        const pending = history.seek(fetch, id);
        refresh();
        const found = await pending;
        if (!current()) return;
        refresh();
        if (!found) throw new Error("Original message is no longer available.");
      }
      if (!current()) return;
      history.freeze(currentMessages());
      originalTarget = id;
      viewportRevision++; refresh();
      const line = findLine();
      if (!line) throw new Error("Original message is no longer available.");
      history.freeze(currentMessages());
      const bounds = line.getBoundingClientRect(), viewport = elements.messages.getBoundingClientRect();
      elements.messages.scrollTop += bounds.top - viewport.top - (elements.messages.clientHeight - bounds.height) / 2;
      line.classList.add("is-original-message");
      window.setTimeout(() => line.classList.remove("is-original-message"), 2_000);
      line.querySelector<HTMLElement>(".chat-text")?.focus({ preventScroll: true });
      lastScrollTop = elements.messages.scrollTop || 0;
      refreshLatestButton();
    } catch (error) {
      if (current()) showMessage(error instanceof Error ? error.message : "Could not load the original message.", "#ff9b91");
    }
  }
  let nextExpiryAt = 0;
  let chatCooldownUntil = 0;
  let chatCooldownTimer: number | null = null;
  let layoutRecoveryTimer: number | null = null;
  let pendingReply: ChatMessageActionTarget | null = null;
  const messageActions = createChatMessageActionsController({
    elements: elements.messageActions,
    loadReactions: async target => {
      const coop = getCoop();
      if (!coop?.loadChatMessageReactions) throw new Error("Reconnect to react.");
      return coop.loadChatMessageReactions(target.channel ?? "public", target.id);
    },
    setReaction: async (target, reaction, active) => {
      const coop = getCoop(), owner = coop?.localIdentity?.();
      if (!coop?.setChatMessageReaction || !coop.loadChatMessageReactions) throw new Error("Reconnect to react.");
      await coop.setChatMessageReaction(target.channel ?? "public", target.id, reaction, active);
      const state = await coop.loadChatMessageReactions(target.channel ?? "public", target.id);
      if (owner !== getCoop()?.localIdentity?.()) throw new Error("Session changed.");
      reactionOverrides.set(`${target.channel}:${target.id}`, { source: target.reactionCountsJson, value: JSON.stringify(state.counts) });
      if (reactionOverrides.size > 500) reactionOverrides.delete(reactionOverrides.keys().next().value!);
      reactionRevision++; refresh();
      return state;
    },
    getLocalIdentity: () => getCoop()?.localIdentity?.() ?? "",
    onWatchReplay: (replayId) => onOpenReplay?.(replayId),
    onWatchGuildReplay: (reportKey) => window.dispatchEvent(new CustomEvent("wildwood:open-guild-replay", { detail: { reportKey } })),
    onOriginal: (target) => { void goToOriginal(target.replyToMessageId ?? 0n); },
    onDirectMessage: (target) => { openPrivate(target.senderName, target.sender); focusChatReplyInput(elements.input); },
    onReply: (target) => setPendingReply(target, true),
    reportMessage: async (messageId, reason) => {
      const coop = getCoop();
      const report = channel === "public" ? coop?.reportChatMessage : coop?.social?.reportMessage;
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
    renderedRevision = "";
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
      scrollIdle.reset();
      messageActions.close(false);
      setPendingReply(null);
    }
    updateHeight();
    if (large && channel !== "public") void loadHistory(true);
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
    elements.sendButton.disabled = active || submitting;
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

  /** Everything a drawn row shows. An unchanged signature keeps its element. */
  function presentMessage(coop: CoopClient | null, identity: string, message: ChatMessage) {
    const cachedGender = normalizePlayerGender(coop?.playerGender?.(message.sender));
    const displayedGender = cachedGender !== PLAYER_GENDER_UNSET ? cachedGender : message.senderGender;
    const guest = !!coop?.isGuest?.(message.sender);
    const iconIndex = normalizeProfileIcon(coop?.profileIcon?.(message.sender) ?? 0);
    const reactionChannel: "public" | "social" = channel === "public" ? "public" : "social";
    const reactionOverride = reactionOverrides.get(`${reactionChannel}:${message.id}`);
    const reactionCountsJson = reactionOverride?.source === message.reactionCountsJson ? reactionOverride?.value : message.reactionCountsJson;
    const rowKey = `${identity}:${conversationKey()}:${large}:${message.id}`;
    const signature = JSON.stringify([
      message.sender, message.senderName, message.message, String(message.replayId), message.guildReplayKey,
      message.powerLevel, displayedGender, message.moderated, String(message.replyToMessageId),
      message.replyToSenderName, message.replyToMessage, message.sentAtMs, guest, iconIndex,
      playerNamePrefix(message.sender), large ? reactionCountsJson : "",
    ]);
    return { displayedGender, guest, iconIndex, reactionChannel, reactionCountsJson, rowKey, signature };
  }

  function refresh() {
    const coop = getCoop();
    const identity = coop?.localIdentity?.() ?? "";
    if (identity !== sessionIdentity) {
      sessionIdentity = identity;
      reactionOverrides.clear();
      unread.reset();
      unreadInputs = "";
      submissionGeneration++;
      submitting = false;
      elements.input.value = "";
      drafts.clear();
      channelPicker.select("public", "");
      drafts.clear();
      updateChatCooldown();
      return;
    }
    const nextGuildContext = String(coop?.social?.currentGuild()?.id ?? "");
    if (nextGuildContext !== guildContext) {
      unread.resetGuild();
      unreadInputs = "";
      drafts.delete(`guild:${guildContext}`);
      guildContext = nextGuildContext;
      if (channel === "guild") {
        elements.input.value = "";
        setPendingReply(null);
        messageActions.close(false);
      }
    }
    if (pendingReply && coop?.isPlayerBlocked?.(pendingReply.sender)) setPendingReply(null);

    elements.panel.classList.toggle("is-private-inbox", channel === "private" && !privatePeer);
    const now = Date.now();
    history.select(`${identity}:${conversationKey()}:${coop?.social?.historyRevision?.() ?? 0}:${coop?.chatHistoryRevision?.() ?? 0}:${large}`);
    const historyState = history.state();
    setChatHidden(historySpinner, !large || !enabled || !historyState.loading);

    const readingLatest = enabled && large && document.visibilityState !== "hidden"
      && (renderedRevision === "" || (!historyState.frozen && atLatest));
    const revision = `${viewportRevision}:${Math.floor(now / 60_000)}:${reactionRevision}:${readingLatest}:${conversationKey()}:${coop?.chatRevision?.() ?? -1}:${coop?.social?.revision() ?? -1}:${coop?.localIdentity?.() ?? ""}:${enabled}:${large}:${historyState.revision}`;
    if (revision === renderedRevision && now < nextExpiryAt) return;
    // Scrolling changes only the message window, not conversation metadata.
    const metadata = `${readingLatest}:${conversationKey()}:${coop?.chatRevision?.() ?? -1}:${coop?.social?.revision() ?? -1}:${identity}:${enabled}:${large}`;
    if (metadata !== metadataRevision || renderedRevision === "") {
      metadataRevision = metadata;
      const conversations = coop?.social?.privateConversations() ?? [];
      const friends = coop?.social?.friends() ?? [];
      if (privatePeer && !privatePeerIdentity) {
        privatePeerIdentity = [...friends, ...conversations]
          .find(person => person.name.toLowerCase() === privatePeer.toLowerCase())?.identity ?? "";
      }
      const readConversation = readingLatest ? channel === "public" ? "world" : channel === "guild" ? "guild"
        : privatePeer ? `private:${privatePeerIdentity || privatePeer}` : null : null;
      const guildRows = coop?.social?.guildMessages() ?? [], worldRows = coop?.chatMessages?.() ?? [];
      const privateRows = conversations.map(person => [person.identity, coop?.social?.privateMessages(person.identity) ?? []] as const);
      // Counting walks every live row of every channel, yet most revisions
      // here are profile, portrait or hub rows that cannot move a count. Only
      // a new or removed row, the channel being read, or a block can.
      const unreadKey = [identity, readConversation, coop?.chatHistoryRevision?.() ?? 0, chatListFingerprint(guildRows), chatListFingerprint(worldRows),
        ...privateRows.map(([person, rows]) => `${person}=${chatListFingerprint(rows)}`)].join("|");
      if (unreadKey !== unreadInputs || !unreadCounts) {
        unreadInputs = unreadKey;
        const eligibleUnread = (rows: ChatMessage[]) => rows.filter(message => !coop?.isPlayerBlocked?.(message.sender));
        unreadCounts = unread.refresh(identity, eligibleUnread(guildRows),
          new Map(privateRows.map(([person, rows]) => [person, eligibleUnread(rows)])),
          readConversation,
          eligibleUnread(worldRows).filter(message => shouldShowGlobalChatMessage(message.senderName)));
      }
      const unreadTotal = unreadCounts.world + unreadCounts.guild + unreadCounts.private;
      setChatText(unreadBadge, formatChatUnreadCount(unreadTotal));
      setChatHidden(unreadBadge, large || unreadTotal === 0);
      setChatAttribute(unreadBadge, "aria-label", `${unreadTotal} unread messages`);
      const guildName = coop?.social?.currentGuild()?.name ?? "";
      if (pickerInputs.changed([unreadCounts, friends, conversations, guildName]) || renderedRevision === "") {
        channelPicker.refresh(friends, conversations, guildName, unreadCounts);
      }
    }
    const channelMessages = history.messages(currentMessages());
    const allMessages = (channelMessages ?? []).filter((message) =>
      (channel === "private" || now - message.sentAtMs < CHAT_DISPLAY_TTL_MS) && !coop?.isPlayerBlocked?.(message.sender)
      && (channel !== "public" || shouldShowGlobalChatMessage(message.senderName))
    );
    const expiresAt = channel !== "private" && allMessages.length > 0 ? allMessages[0].sentAtMs + CHAT_DISPLAY_TTL_MS : Number.POSITIVE_INFINITY;
    // Profile, portrait, hub, other-channel and minute ticks all land here
    // without changing a drawn row. Prove that from data alone: reading scroll
    // metrics forces a page layout, and typing keeps the page dirty.
    const viewKey = `${viewportRevision}:${readingLatest}:${conversationKey()}:${identity}:${enabled}:${large}:${historyState.revision}`;
    if (renderedRevision !== "" && originalTarget === null && viewKey === renderedViewKey && sameChatRows(renderedSource, allMessages)
      && renderedMessages.every(message => {
        const row = presentMessage(coop, identity, message);
        return renderedRows.get(row.rowKey)?.signature === row.signature;
      })) {
      renderedRevision = revision;
      nextExpiryAt = expiresAt;
      return;
    }
    const context = `${identity}:${conversationKey()}:${large}`;
    if (context !== viewportContext) { viewportContext = context; viewport.reset(); }
    const previousScrollTop = elements.messages.scrollTop || 0;
    // Measurement compensation may put older rows above scrollTop=0. Once
    // native scrolling reaches that edge, restore their reachable coordinates.
    const revealHistoryBoundary = large && previousScrollTop <= 0 && viewport.shifted();
    const virtualAnchor = viewport.anchor(previousScrollTop);
    const previousScrollHeight = elements.messages.scrollHeight || 0;
    const distanceFromBottom = previousScrollHeight - (elements.messages.clientHeight || 0) - previousScrollTop;
    const followNewestMessage = originalTarget === null && (!large || renderedRevision === "" || (!historyState.frozen && distanceFromBottom <= 16));
    // Preserve the actual on-screen row, not just accumulated estimated heights.
    // Fractional text layout and late portrait/reaction changes can otherwise
    // make the virtual anchor disagree with what the player is reading.
    const viewportBounds = large && !followNewestMessage && originalTarget === null
      ? elements.messages.getBoundingClientRect() : null;
    const visibleAnchor = viewportBounds && [...renderedRows.values()].map(row => ({
      element: row.element, bounds: row.element.getBoundingClientRect(),
    })).find(row => row.bounds.height > 0 && row.bounds.bottom > viewportBounds.top && row.bounds.top < viewportBounds.bottom);
    // Do not rely on scrolling hidden rows in compact mode. Its DOM contains
    // exactly the newest two rows in the same oldest-to-newest order as the
    // expanded view.
    if (revealHistoryBoundary || !scrollIdle.active() || followNewestMessage || originalTarget !== null) viewport.settle();
    // Reserve a real row at the history boundary before a request starts.
    // Showing the spinner therefore changes neither layout nor momentum.
    const hasHistoryRow = large && (historyState.hasMore || historyState.loading);
    const historyRowCount = hasHistoryRow ? 1 : 0;
    viewport.select(hasHistoryRow ? [{ id: historyRowId }, ...allMessages] : allMessages, elements.messages.clientWidth || 0);
    const targetAnchor = originalTarget !== null ? { id: originalTarget, offset: 0 }
      : visibleAnchor ? { id: BigInt(visibleAnchor.element.dataset.messageId!), offset: viewportBounds!.top - visibleAnchor.bounds.top }
        : virtualAnchor;
    originalTarget = null;
    const windowTop = viewport.restore(targetAnchor, previousScrollTop);
    const windowRange = viewport.window(windowTop, elements.messages.clientHeight || 600, followNewestMessage);
    const messages = large ? allMessages.slice(Math.max(0, windowRange.start - historyRowCount), Math.max(0, windowRange.end - historyRowCount)) : allMessages.slice(-2);
    const showHistoryRow = hasHistoryRow && windowRange.start === 0;
    if (large) setSpacers(windowRange);
    renderedRevision = revision;
    nextExpiryAt = expiresAt;
    renderedViewKey = viewKey; renderedSource = allMessages; renderedMessages = messages;
    // Social refreshes and incoming messages must not detach unchanged image
    // elements: recreating them makes gender/power icons flash while repainting.
    const nextRows = new Map<string, { signature: string; element: HTMLDivElement }>();
    for (const message of messages) {
      const { displayedGender, guest, iconIndex, reactionChannel, reactionCountsJson, rowKey, signature } = presentMessage(coop, identity, message);
      const previous = renderedRows.get(rowKey);
      if (previous?.signature === signature) { nextRows.set(rowKey, previous); continue; }
      const line = document.createElement("div");
      line.className = "chat-line";
      line.dataset.messageId = String(message.id);
      const guildReplayKey = channel === "public" ? message.guildReplayKey : undefined;
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
      if (!large && message.replyToMessageId > 0n) {
        const replyPrefix = document.createElement("span");
        replyPrefix.className = "chat-reply-prefix";
        replyPrefix.textContent = "reply: ";
        messageBody.prepend(replyPrefix);
      }
      text.appendChild(messageBody);
      const displayName = message.senderName || (message.replayId > 0n ? "DUEL" : "PLAYER");
      const displayIdentity = message.sender;
      const displayedPower = message.powerLevel;
      const name = document.createElement("span");
      name.className = "chat-name";
      name.style.color = nameColor(displayIdentity);
      const nameCore = document.createElement("span");
      nameCore.className = "chat-name-core";
      appendPlayerNameTags(nameCore, displayIdentity);
      const nameText = document.createElement("span");
      nameText.className = "chat-name-text";
      nameText.textContent = displayName;
      nameCore.append(nameText);
      appendPrestigeBadge(nameCore, displayIdentity);
      appendPlayerGenderIcon(nameCore, displayedGender);
      if (guest) nameCore.append(document.createTextNode(" (guest)"));
      name.appendChild(nameCore);
      if (displayedPower > 0) {
        const power = document.createElement("span");
        power.className = "chat-power";
        power.setAttribute("aria-label", `Power ${formatCompactNumber(displayedPower)}`);
        const powerIcon = document.createElement("img");
        powerIcon.className = "power-icon chat-power-icon";
        powerIcon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp";
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
          channel: reactionChannel, reactionCountsJson: message.reactionCountsJson, moderated: message.moderated,
          id: message.id,
          sender: message.sender,
          senderName: displayName,
          message: shownMessage,
          sentAtMs: message.sentAtMs,
          replayId: message.replayId,
          guildReplayKey,
          replyToMessageId: message.replyToMessageId,
        });
      };
      const icon = document.createElement("span");
      icon.className = "chat-profile-icon";
      if (large) applyAvatarFrame(icon, displayIdentity);
      icon.setAttribute("role", "button");
      icon.setAttribute("tabindex", large ? "0" : "-1");
      icon.setAttribute("aria-label", `View ${displayName}'s profile`);
      icon.addEventListener("click", openPlayer);
      icon.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openPlayer(event);
      });
      applyProfileIcon(icon, iconIndex);
      const content = document.createElement("div");
      content.className = "chat-message-content";
      content.append(name, text);
      line.append(icon, content);
      if (large) {
        if (!message.moderated) appendChatReactions(text, reactionCountsJson);
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
      if (duelReplayIsInteractive(message.replayId, large) || (guildReplayKey && large)) {
        line.classList.add("has-replay");
        line.setAttribute("role", "button");
        line.setAttribute("tabindex", "0");
        const replayLabel = guildReplayKey ? "Open guild battle replay actions" : "Open duel replay actions";
        line.setAttribute("aria-label", replayLabel);
        line.addEventListener("click", openMessageActions);
        line.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openMessageActions(event);
        });
        const replay = document.createElement("button");
        replay.className = "chat-replay";
        replay.type = "button";
        replay.title = replayLabel;
        replay.setAttribute("aria-label", replayLabel);
        const replayIcon = document.createElement("span");
        replayIcon.className = "chat-replay-icon";
        replayIcon.setAttribute("aria-hidden", "true");
        replay.appendChild(replayIcon);
        replay.addEventListener("click", openMessageActions);
        messageBody.append(" ", replay);
      }
      nextRows.set(rowKey, { signature, element: line });
    }
    const ordered = large ? [topSpacer, ...(showHistoryRow ? [historyRow] : []), ...[...nextRows.values()].map(row => row.element), bottomSpacer] : [...nextRows.values()].map(row => row.element);
    const retained = new Set(ordered);
    for (const child of [...elements.messages.children]) {
      if (!retained.has(child as HTMLDivElement)) child.remove();
    }
    let cursor = elements.messages.firstElementChild;
    for (const element of ordered) {
      if (element !== cursor) elements.messages.insertBefore(element, cursor);
      cursor = element.nextElementSibling;
    }
    // Keep only displayed rows, including when switching channels or accounts.
    renderedRows = nextRows;
    if (large) setSpacers(viewport.measure([...(hasHistoryRow ? [{ id: historyRowId, height: historyRowHeight }] : []), ...messages.map(message => {
      const element = nextRows.get(`${identity}:${conversationKey()}:${large}:${message.id}`)?.element;
      return { id: message.id, height: element?.getBoundingClientRect().height || element?.offsetHeight || 0 };
    })]));
    if (large && !followNewestMessage && scrollIdle.active() && !revealHistoryBoundary) {
      setSpacers(viewport.preserve(targetAnchor, windowTop));
      if (viewport.shifted() && !settlingViewport) {
        settlingViewport = true;
        void scrollIdle.wait().then(() => {
          settlingViewport = false;
          if (large && enabled && viewport.shifted()) { viewportRevision++; refresh(); }
        });
      }
    }
    // Restore only when the anchor actually moved. Even assigning the current
    // scrollTop can interfere with native momentum scrolling on mobile.
    const scrollHeight = elements.messages.scrollHeight || 0;
    const heightChange = scrollHeight - previousScrollHeight;
    const retainedAnchor = visibleAnchor && nextRows.get(`${identity}:${conversationKey()}:${large}:${visibleAnchor.element.dataset.messageId}`)?.element;
    const desiredTop = followNewestMessage
      ? Math.max(0, scrollHeight - (elements.messages.clientHeight || 0))
      : retainedAnchor ? Math.max(0, elements.messages.scrollTop + retainedAnchor.getBoundingClientRect().top - visibleAnchor!.bounds.top)
      : Math.max(0, large ? viewport.restore(targetAnchor, previousScrollTop + Math.min(0, heightChange)) : previousScrollTop + Math.min(0, heightChange));
    if (Math.abs((elements.messages.scrollTop || 0) - desiredTop) > .5) elements.messages.scrollTop = desiredTop;
    lastScrollTop = elements.messages.scrollTop || 0;
    atLatest = followNewestMessage || (elements.messages.scrollHeight || 0) - (elements.messages.clientHeight || 0) - lastScrollTop <= 16;
    refreshLatestButton();
  }

  function init() {
    messageActions.init();
    // Capture scrolling from messages and the conversation list, including
    // momentum after the finger lifts. No layout reads or per-event timers.
    // Scrolling and typing both keep the game behind chat at 60fps instead of
    // its idle 30fps (Ryan's call: typing should feel as smooth as scrolling).
    const noteInteraction = () => {
      if (large && enabled) interactionUntil = performance.now() + 2_000;
    };
    for (const event of ["scroll", "wheel", "touchmove", "pointerdown", "keydown", "input"]) {
      elements.panel.addEventListener(event, noteInteraction, { capture: true, passive: true });
    }
    elements.panel.insertBefore(channelPicker.root, elements.messages);
    elements.panel.insertBefore(channelPicker.conversations, elements.messages);
    elements.form.append(latestButton);
    elements.panel.append(unreadBadge);
    document.addEventListener("visibilitychange", refresh);
    latestButton.addEventListener("click", () => { void loadHistory(true); });
    elements.messages.addEventListener("scroll", () => {
      scrollIdle.activity();
      if (scrollFrame || !large || !enabled || (channel === "private" && !privatePeer)) return;
      scrollFrame = true;
      requestAnimationFrame(() => {
        scrollFrame = false;
        if (!large || !enabled || (channel === "private" && !privatePeer)) return;
        const top = elements.messages.scrollTop;
        const scrollingUp = top < lastScrollTop;
        lastScrollTop = top;
        const distance = elements.messages.scrollHeight - elements.messages.clientHeight - top;
        atLatest = distance <= 16;
        if (!atLatest) history.freeze(currentMessages());
        refreshLatestButton();
        if (viewport.needsRender(top, elements.messages.clientHeight || 600) || (top <= 0 && viewport.shifted())) { viewportRevision++; refresh(); }
        // ScrollTop alone is unreliable while virtual row heights are being
        // corrected. Wait until the actual loading row is fully on screen.
        const boundary = scrollingUp && historyRow.parentElement === elements.messages
          ? historyRow.getBoundingClientRect() : null;
        const bounds = boundary ? elements.messages.getBoundingClientRect() : null;
        if (boundary && bounds && boundary.top >= bounds.top - .5 && boundary.bottom <= bounds.bottom) void loadHistory();
        else if (atLatest && history.state().frozen && !history.state().detached && !history.state().loading) void loadHistory(true);
        else if (atLatest) refresh();
      });
    }, { passive: true });
    elements.messages.addEventListener("touchstart", () => scrollIdle.touchStart(), { passive: true });
    for (const event of ["touchend", "touchcancel"]) {
      elements.messages.addEventListener(event, () => scrollIdle.touchEnd(), { passive: true });
    }
    elements.messages.addEventListener("wheel", () => scrollIdle.activity(), { passive: true });
    window.addEventListener("resize", () => { if (large) { viewportRevision++; refresh(); } });
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
    elements.backButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (channel === "private" && privatePeer) channelPicker.select("private", "");
      else setLarge(false);
    });
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      if (Date.now() < chatCooldownUntil) {
        showMessage(`CHAT READY IN ${Math.ceil((chatCooldownUntil - Date.now()) / 1000)}S`, "#ffdb84");
        return;
      }
      const message = elements.input.value.trim();
      if (!message) return;
      const bugCommand = channel === "public" ? /^\/bug(?:\s|$)/i.exec(message) : null;
      if (bugCommand && !message.slice(bugCommand[0].length).trim()) {
        showMessage("USE /BUG FOLLOWED BY A DESCRIPTION", "#ff9b91");
        return;
      }
      const coop = getCoop();
      if (channel === "private" && !privatePeer) {
        showMessage("CHOOSE A PLAYER TO MESSAGE", "#ff9b91");
        return;
      }
      if (channel === "guild" && !coop?.social?.currentGuild()) {
        showMessage("JOIN A GUILD TO CHAT WITH MEMBERS", "#ff9b91");
        return;
      }
      const sentConversation = conversationKey();
      const sentIdentity = sessionIdentity;
      const generation = ++submissionGeneration;
      const replyId = pendingReply?.id ?? 0n;
      submitting = true;
      updateChatCooldown();
      let result: { ok: boolean; error?: string } | undefined;
      try {
        result = channel === "public" ? await coop?.sendChatMessage?.(message, replyId)
          : channel === "guild" ? await coop?.social?.sendGuildMessage(message, replyId)
          : await coop?.social?.sendPrivateMessage(privatePeerIdentity || privatePeer, message, replyId);
      } catch {
        result = { ok: false, error: "MESSAGE FAILED" };
      } finally {
        if (generation === submissionGeneration) {
          submitting = false;
          updateChatCooldown();
        }
      }
      if (generation !== submissionGeneration || sentIdentity !== (getCoop()?.localIdentity?.() ?? "")) return;
      if (!result?.ok) {
        showMessage(result?.error || "MESSAGE FAILED", "#ff9b91");
        return;
      }
      if (drafts.get(sentConversation)?.trim() === message) drafts.delete(sentConversation);
      if (conversationKey() === sentConversation && elements.input.value.trim() === message) {
        elements.input.value = "";
        elements.input.style.height = "28px";
        setPendingReply(null);
      }
      startChatCooldown();
      if (bugCommand) showMessage("BUG REPORT SENT", "#c9f5c2");
    });
    let composing = false;
    elements.input.addEventListener("compositionstart", () => { composing = true; });
    elements.input.addEventListener("compositionend", () => { composing = false; });
    elements.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || composing || event.keyCode === 229) return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    elements.replyCancelButton.addEventListener("click", () => setPendingReply(null, true));
    elements.input.addEventListener("beforeinput", (event) => {
      if (event.isComposing || composing) return;
      if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
      event.preventDefault();
      elements.form.requestSubmit();
    });
    let sizingInput = false;
    const sizeInput = createChatInputSizer(elements.input);
    elements.input.addEventListener("input", (event) => {
      if (event instanceof InputEvent && !event.isComposing && !composing && (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph")) {
        elements.input.value = elements.input.value.replace(/\n$/, "");
        elements.form.requestSubmit();
      }
      if (sizingInput) return;
      sizingInput = true;
      requestAnimationFrame(() => {
        sizingInput = false;
        sizeInput();
      });
    });
    updateVisibility();
    updateHeight();
    updateChatCooldown();
    refresh();
  }

  function openPrivate(username: string, identity?: string) {
    if (!username.trim()) return;
    enabled = true;
    updateVisibility();
    channelPicker.select("private", username, identity);
    setLarge(true);
  }

  return {
    init,
    refresh,
    openPrivate,
    minimize: () => { if (large) setLarge(false); },
    isMaximized: () => large,
    isInteracting: () => large && enabled && performance.now() < interactionUntil,
  };
}
