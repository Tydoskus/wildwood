import { requiredElement, requiredSelector } from "../game/runtime/dom";
import { createChatController } from "./chat";

type ChatOptions = Parameters<typeof createChatController>[0];

export function createChatRuntimeController(options: Pick<ChatOptions, "getCoop" | "showMessage" | "onOpenPlayer"> & {
  openReplay: (replayId: bigint) => void;
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
      backButton: requiredElement<HTMLButtonElement>("chatBackBtn"),
      sendButton: requiredElement<HTMLButtonElement>("chatSendBtn"),
    },
    getCoop: options.getCoop,
    showMessage: options.showMessage,
    onOpenReplay: options.openReplay,
    onOpenPlayer: options.onOpenPlayer,
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
