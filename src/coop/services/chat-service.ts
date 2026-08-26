import type { Identity } from "spacetimedb";
import type { ChatReportReason } from "../../../shared/chat-report";
import { isPresenceChatMessage } from "../../../shared/presence-chat";
import { normalizePlayerGender } from "../../../shared/player-gender";
import type { ChatMessage } from "../contracts";
import type { ReducerPort } from "../ports";

type ChatServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  rememberSender: (sender: {
    identity: string;
    identityValue: Identity;
    name: string;
    isGuest: boolean;
  }) => void;
};

type ChatRow = {
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
  let presentationRevision = 0;

  function upsert(row: ChatRow) {
    if (messages.some((message) => message.id === row.id)) return;
    const sender = row.sender.toHexString();
    if (!isPresenceChatMessage(row.senderName)) {
      dependencies.rememberSender({
        identity: sender,
        identityValue: row.sender,
        name: row.senderName,
        isGuest: row.senderIsGuest,
      });
    }
    messages.push({
      id: row.id,
      sender,
      senderName: row.senderName,
      message: row.message,
      replayId: row.replayId,
      powerLevel: Number(row.powerLevel) || 0,
      senderGender: normalizePlayerGender(row.senderGender),
      moderated: row.moderated,
      replyToMessageId: row.replyToMessageId,
      replyToSenderName: row.replyToSenderName,
      replyToMessage: row.replyToMessage,
      sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1_000n),
    });
    messages.sort((left, right) => left.id < right.id ? -1 : 1);
    while (messages.length > 100) messages.shift();
    presentationRevision += 1;
    dependencies.notify();
  }

  return {
    tables: { upsert },
    api: {
      chatMessages: () => messages.slice(),
      chatRevision: () => presentationRevision,
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
      messages.length = 0;
      presentationRevision += 1;
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
