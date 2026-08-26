import { requiredElement, requiredSelector } from "../game/runtime/dom";
import { createChatController } from "./chat";

type ChatOptions = Parameters<typeof createChatController>[0];

export function createChatRuntimeController(options: Pick<ChatOptions, "getCoop" | "showMessage" | "onOpenPlayer"> & {
  openReplay: (replayId: bigint) => void;
  onLayoutChange?: () => void;
}) {
  const chat = createChatController({
    elements: {
      toggle: requiredElement<HTMLButtonElement>("chatToggle"),
      panel: requiredElement("chatPanel"),
      header: requiredSelector("#chatPanel .chat-header"),
      sizeToggle: requiredElement<HTMLButtonElement>("chatSizeToggle"),
      messages: requiredElement("chatMessages"),
      form: requiredElement<HTMLFormElement>("chatForm"),
      input: requiredElement<HTMLTextAreaElement>("chatInput"),
      replyComposer: requiredElement("chatReplyComposer"),
      replyComposerName: requiredElement("chatReplyComposerName"),
      replyComposerPreview: requiredElement("chatReplyComposerPreview"),
      replyCancelButton: requiredElement<HTMLButtonElement>("chatReplyCancelBtn"),
      backButton: requiredElement<HTMLButtonElement>("chatBackBtn"),
      sendButton: requiredElement<HTMLButtonElement>("chatSendBtn"),
      messageActions: {
        layer: requiredElement("chatMessageActions"),
        backdrop: requiredElement<HTMLButtonElement>("chatMessageActionsBackdrop"),
        sheet: requiredElement("chatMessageActionSheet"),
        drag: requiredElement("chatMessageActionDrag"),
        title: requiredElement("chatMessageActionTitle"),
        preview: requiredElement("chatMessageActionPreview"),
        menu: requiredElement("chatMessageActionMenu"),
        watchReplayButton: requiredElement<HTMLButtonElement>("chatMessageWatchReplayBtn"),
        copyButton: requiredElement<HTMLButtonElement>("chatMessageCopyBtn"),
        replyButton: requiredElement<HTMLButtonElement>("chatMessageReplyBtn"),
        reportButton: requiredElement<HTMLButtonElement>("chatMessageReportBtn"),
        reportForm: requiredElement<HTMLFormElement>("chatMessageReportForm"),
        reportReasons: requiredElement("chatMessageReportReasons"),
        reportBackButton: requiredElement<HTMLButtonElement>("chatMessageReportBackBtn"),
        reportSubmitButton: requiredElement<HTMLButtonElement>("chatMessageReportSubmitBtn"),
      },
    },
    getCoop: options.getCoop,
    showMessage: options.showMessage,
    onOpenReplay: options.openReplay,
    onOpenPlayer: options.onOpenPlayer,
    onLayoutChange: options.onLayoutChange,
  });

  function init() {
    chat.init();
    window.setInterval(chat.refresh, 1_000);
  }

  return {
    init,
    refresh: chat.refresh,
    minimize: chat.minimize,
    isMaximized: chat.isMaximized,
  };
}
