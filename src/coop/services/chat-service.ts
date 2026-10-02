import type { ChatReaction, ChatReactionState, ChatRole } from "../../../shared/chat-reactions";
import type { Identity } from "spacetimedb";
import type { ChatReportReason } from "../../../shared/chat-report";
import { isPresenceChatMessage } from "../../../shared/presence-chat";
import { normalizePlayerGender } from "../../../shared/player-gender";
import type { ChatMessage } from "../contracts";
import type { ReducerPort } from "../ports";
import { playerReportValidationError } from "../../../shared/player-safety";
import { withRequestDeadline } from "./request-deadline";

type ChatServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  identityFor: (identity: string) => Identity | undefined;
  nameFor: (identity: string) => string | undefined;
  rememberSender: (sender: {
    identity: string;
    identityValue: Identity;
    name: string;
    isGuest: boolean;
  }) => void;
};

type ChatRow = {
  reactionCountsJson?: string;
  guildReplayKey?: string;
  id: bigint;
  sender: Identity;
  senderName: string;
  senderIsGuest: boolean;
  message: string;
  replayId: bigint;
  powerLevel: number;
  senderGender: number;
  moderated: boolean;
  replyToMessageId: bigint;
  replyToSenderName: string;
  replyToMessage: string;
  sentAt: { microsSinceUnixEpoch: bigint };
};

export function createChatService(dependencies: ChatServiceDependencies) {
  const messages: ChatMessage[] = [];
  const blocks = new Map<string, { identity: Identity; name: string }>();
  let session = 0;
  let presentationRevision = 0;
  let privacyRevision = 0;
  let cachedRevision = -1, cachedMessages: ChatMessage[] = [];

  function changed() { privacyRevision++; presentationRevision += 1; dependencies.notify(); }
  function upsertBlock(row: { owner: Identity; target: Identity; targetName: string }) {
    if (row.owner.toHexString() !== dependencies.localIdentity()) return;
    blocks.set(row.target.toHexString(), { identity: row.target, name: row.targetName });
    changed();
  }
  function removeBlock(row: { owner: Identity; target: Identity }) {
    if (row.owner.toHexString() !== dependencies.localIdentity()) return;
    blocks.delete(row.target.toHexString());
    changed();
  }

  function presentation(row: ChatRow): ChatMessage {
    const sender = row.sender.toHexString();
    if (!isPresenceChatMessage(row.senderName)) {
      dependencies.rememberSender({
        identity: sender,
        identityValue: row.sender,
        name: row.senderName,
        isGuest: row.senderIsGuest,
      });
    }
    return {
      reactionCountsJson: row.reactionCountsJson ?? "{}",
      id: row.id,
      sender,
      senderName: row.senderName,
      message: row.message,
      replayId: row.replayId,
      guildReplayKey: row.guildReplayKey ?? "",
      powerLevel: Number(row.powerLevel) || 0,
      senderGender: normalizePlayerGender(row.senderGender),
      moderated: row.moderated,
      replyToMessageId: row.replyToMessageId,
      replyToSenderName: row.replyToSenderName,
      replyToMessage: row.replyToMessage,
      sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1_000n),
    };
  }
  function upsert(row: ChatRow) {
    const existingIndex = messages.findIndex((message) => message.id === row.id);
    const message = presentation(row);
    if (existingIndex >= 0) messages[existingIndex] = message;
    else messages.push(message);
    messages.sort((left, right) => left.id < right.id ? -1 : 1);
    while (messages.length > 50) messages.shift();
    presentationRevision += 1;
    dependencies.notify();
  }

  return {
    tables: { upsert, upsertBlock, removeBlock, remove(row: { id: bigint }) {
      const index = messages.findIndex(message => message.id === row.id);
      if (index >= 0) { messages.splice(index, 1); presentationRevision++; dependencies.notify(); }
    } },
    api: {
      async loadChatMessageReactions(channel: string, messageId: bigint): Promise<ChatReactionState> {
        const connection = dependencies.reducers.connection(), started = session;
        if (!connection?.isActive || dependencies.reducers.protocolBlocked()) throw new Error("Reconnect to react.");
        const value = await withRequestDeadline(connection.procedures.getChatMessageReactions({ channel, messageId }));
        if (session !== started || connection !== dependencies.reducers.connection()) throw new Error("Session changed.");
        return JSON.parse(value) as ChatReactionState;
      },
      async loadChatRole(): Promise<ChatRole> {
        const connection = dependencies.reducers.connection();
        if (!connection?.isActive || dependencies.reducers.protocolBlocked()) return { moderatorHeart: null, canModerate: false };
        return JSON.parse(await withRequestDeadline(connection.procedures.getChatRole({}))) as ChatRole;
      },
      async restoreChatMessage(channel: string, messageId: bigint) {
        const connection = dependencies.reducers.connection();
        if (!connection?.isActive || dependencies.reducers.protocolBlocked()) throw new Error("Reconnect to restore.");
        await withRequestDeadline(dependencies.reducers.runWorldReducer(() => connection.reducers.restoreChatMessage({ channel, messageId })));
      },
      async setChatMessageReaction(channel: string, messageId: bigint, reaction: ChatReaction, active: boolean) {
        const connection = dependencies.reducers.connection();
        if (!connection?.isActive || dependencies.reducers.protocolBlocked()) throw new Error("Reconnect to react.");
        await withRequestDeadline(dependencies.reducers.runWorldReducer(() => connection.reducers.setChatMessageReaction({ channel, messageId, reaction, active })));
      },
      chatHistoryRevision: () => privacyRevision,
      async loadChatHistory(beforeId: bigint) {
        const connection = dependencies.reducers.connection(), started = session, privacy = privacyRevision;
        if (!connection?.isActive || dependencies.reducers.protocolBlocked()) throw new Error("Reconnect to load chat history.");
        const page = await withRequestDeadline(connection.procedures.getChatHistoryWithReactions({ beforeId }));
        if (session !== started || privacy !== privacyRevision || connection !== dependencies.reducers.connection()) throw new Error("Session changed. Reopen chat.");
        const blockedNames = new Set([...blocks.values()].map(block => block.name));
        return { hasMore: page.hasMore, messages: page.messages.map(presentation).filter(row => !blocks.has(row.sender)).map(row =>
          blockedNames.has(row.replyToSenderName) ? { ...row, replyToSenderName: "", replyToMessage: "" } : row),
          beforeId: page.messages[0]?.id ?? beforeId };
      },
      chatMessages: () => {
        if (cachedRevision === presentationRevision) return cachedMessages;
        cachedRevision = presentationRevision;
        const blockedMessageIds = new Set(messages.filter((message) => blocks.has(message.sender)).map((message) => message.id));
        const blockedNames = new Set([...blocks.values()].map((block) => block.name));
        return cachedMessages = messages.filter((message) => !blocks.has(message.sender)).map((message) =>
          blockedMessageIds.has(message.replyToMessageId) || blockedNames.has(message.replyToSenderName)
            ? { ...message, replyToSenderName: "", replyToMessage: "" }
            : message);
      },
      chatRevision: () => presentationRevision,
      isPlayerBlocked: (identity: string) => blocks.has(identity),
      blockedPlayers: () => [...blocks].map(([identity, block]) => ({ identity, name: block.name })),
      async setPlayerBlocked(identity: string, blocked: boolean) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        const target = blocks.get(identity)?.identity ?? dependencies.identityFor(identity);
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        if (!target || identity === dependencies.localIdentity()) return { ok: false, error: "PLAYER UNAVAILABLE" };
        const submittedSession = session;
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setPlayerBlocked({ target, blocked }));
          if (session === submittedSession && dependencies.reducers.connection() === connection) {
            // Apply only after server confirmation, without waiting for a
            // later presentation tick. The view keeps other devices in sync.
            if (blocked) blocks.set(identity, { identity: target, name: dependencies.nameFor(identity) ?? "PLAYER" });
            else blocks.delete(identity);
            changed();
          }
          return { ok: true };
        } catch (error) {
          return { ok: false, error: dependencies.reducers.errorMessage(error) };
        }
      },
      async reportPlayer(identity: string, reason: ChatReportReason, note: string) {
        const error = playerReportValidationError(dependencies.localIdentity(), identity, reason, note);
        if (error) return { ok: false, error };
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        const target = dependencies.identityFor(identity) ?? blocks.get(identity)?.identity;
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        if (!target) return { ok: false, error: "PLAYER UNAVAILABLE" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.reportPlayer({ target, reason, note: note.trim() }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: dependencies.reducers.errorMessage(error) };
        }
      },
      async sendChatMessage(message: string, replyToMessageId = 0n) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        try {
          if (replyToMessageId > 0n) {
            await dependencies.reducers.runWorldReducer(() => connection.reducers.sendChatReply({ message, replyToMessageId }));
          } else {
            await dependencies.reducers.runWorldReducer(() => connection.reducers.sendChatMessage({ message }));
          }
          return { ok: true };
        } catch (error) {
          const rejected = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("chat message", error);
          return { ok: false, error: rejected };
        }
      },
      async reportChatMessage(messageId: bigint, reason: ChatReportReason) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.reportChatMessage({ messageId, reason }));
          return { ok: true };
        } catch (error) {
          const rejected = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("chat report", error);
          return { ok: false, error: rejected };
        }
      },
    },
    presentationRows: () => messages as readonly ChatMessage[],
    markPresentationChanged() {
      presentationRevision += 1;
    },
    resetSession() {
      session += 1;
      privacyRevision++;
      blocks.clear();
      messages.length = 0;
      presentationRevision += 1;
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
