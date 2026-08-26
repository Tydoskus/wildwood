import {
  CHAT_REPORT_REASONS,
  type ChatReportReason,
} from "../../shared/chat-report";

const CHAT_ACTION_SHEET_TRANSITION_MS = 300;

export type ChatMessageActionTarget = {
  id: bigint;
  sender: string;
  senderName: string;
  message: string;
  replayId: bigint;
};

export type ChatMessageActionElements = {
  layer: HTMLElement;
  backdrop: HTMLButtonElement;
  sheet: HTMLElement;
  drag: HTMLElement;
  title: HTMLElement;
  preview: HTMLElement;
  menu: HTMLElement;
  watchReplayButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  replyButton: HTMLButtonElement;
  reportButton: HTMLButtonElement;
  reportForm: HTMLFormElement;
  reportReasons: HTMLElement;
  reportBackButton: HTMLButtonElement;
  reportSubmitButton: HTMLButtonElement;
};

type ChatMessageActionsOptions = {
  elements: ChatMessageActionElements;
  getLocalIdentity: () => string;
  onWatchReplay: (replayId: bigint) => void;
  onReply: (target: ChatMessageActionTarget) => void;
  reportMessage: (messageId: bigint, reason: ChatReportReason) => Promise<{ ok: boolean; error?: string }>;
  showMessage: (text: string, color?: string) => void;
};

export function shouldOfferMessageReport(target: ChatMessageActionTarget, localIdentity: string) {
  return Boolean(target.sender)
    && Boolean(target.senderName)
    && target.sender !== localIdentity;
}

export function messageActionAvailability(target: ChatMessageActionTarget, localIdentity: string) {
  const isReplay = target.replayId > 0n;
  return {
    watchReplay: isReplay,
    copy: !isReplay,
    reply: Boolean(target.senderName),
    report: shouldOfferMessageReport(target, localIdentity),
  };
}

export function shouldDismissMessageActionSheet(deltaY: number, sheetHeight: number, elapsedMs: number) {
  const distanceThreshold = Math.min(110, sheetHeight * .25);
  const velocity = deltaY / Math.max(1, elapsedMs);
  return deltaY >= distanceThreshold || (deltaY >= 28 && velocity >= .55);
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.setAttribute("readonly", "");
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.appendChild(temporary);
  temporary.select();
  const copied = document.execCommand("copy");
  temporary.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

export function createChatMessageActionsController({
  elements,
  getLocalIdentity,
  onWatchReplay,
  onReply,
  reportMessage,
  showMessage,
}: ChatMessageActionsOptions) {
  let selectedMessage: ChatMessageActionTarget | null = null;
  let selectedReason: ChatReportReason | null = null;
  let previousFocus: HTMLElement | null = null;
  let closeTimer: number | null = null;
  let reportPending = false;
  let dragPointerId: number | null = null;
  let dragStartY = 0;
  let dragStartedAt = 0;
  let presentationRevision = 0;

  function setDragOffset(offset: number) {
    elements.layer.style.setProperty("--chat-sheet-drag-y", `${Math.max(0, offset)}px`);
  }

  function updateReportSubmit() {
    elements.reportSubmitButton.disabled = reportPending || selectedReason === null;
    elements.reportSubmitButton.textContent = reportPending ? "Sending…" : "Submit Report";
  }

  function selectReason(reason: ChatReportReason | null) {
    selectedReason = reason;
    for (const button of elements.reportReasons.querySelectorAll<HTMLButtonElement>(".chat-message-report-reason")) {
      const selected = button.dataset.reason === reason;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    updateReportSubmit();
  }

  function showActionMenu() {
    if (!selectedMessage) return;
    const availability = messageActionAvailability(selectedMessage, getLocalIdentity());
    reportPending = false;
    selectReason(null);
    elements.title.textContent = selectedMessage.replayId > 0n
      ? `Duel replay from ${selectedMessage.senderName || "Player"}`
      : `Message from ${selectedMessage.senderName || "Player"}`;
    elements.preview.textContent = selectedMessage.message.replace(/\s+/g, " ");
    elements.menu.hidden = false;
    elements.reportForm.hidden = true;
    elements.watchReplayButton.hidden = !availability.watchReplay;
    elements.copyButton.hidden = !availability.copy;
    elements.replyButton.hidden = !availability.reply;
    elements.reportButton.hidden = !availability.report;
  }

  function showReportForm() {
    if (!selectedMessage || elements.reportButton.hidden) return;
    selectReason(null);
    elements.title.textContent = "Report Message";
    elements.preview.textContent = `Reporting ${selectedMessage.senderName}`;
    elements.menu.hidden = true;
    elements.reportForm.hidden = false;
    elements.reportReasons.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  function close(restoreFocus = true) {
    if (elements.layer.hidden) return;
    presentationRevision += 1;
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    elements.layer.classList.remove("is-open", "is-dragging");
    setDragOffset(0);
    dragPointerId = null;
    const focusTarget = previousFocus;
    previousFocus = null;
    selectedMessage = null;
    reportPending = false;
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      elements.layer.hidden = true;
    }, CHAT_ACTION_SHEET_TRANSITION_MS);
    if (restoreFocus) focusTarget?.focus({ preventScroll: true });
  }

  function open(target: ChatMessageActionTarget) {
    if (closeTimer !== null) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    selectedMessage = target;
    presentationRevision += 1;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDragOffset(0);
    elements.layer.classList.remove("is-dragging");
    elements.layer.hidden = false;
    showActionMenu();
    requestAnimationFrame(() => {
      elements.layer.classList.add("is-open");
      const firstAction = elements.watchReplayButton.hidden
        ? elements.copyButton
        : elements.watchReplayButton;
      firstAction.focus({ preventScroll: true });
    });
  }

  function finishDrag(event: PointerEvent, cancelled = false) {
    if (dragPointerId !== event.pointerId) return;
    const deltaY = Math.max(0, event.clientY - dragStartY);
    const elapsedMs = performance.now() - dragStartedAt;
    dragPointerId = null;
    elements.layer.classList.remove("is-dragging");
    if (!cancelled && shouldDismissMessageActionSheet(deltaY, elements.sheet.clientHeight, elapsedMs)) {
      close();
      return;
    }
    setDragOffset(0);
  }

  function init() {
    elements.reportReasons.replaceChildren(...CHAT_REPORT_REASONS.map(({ value, label }) => {
      const button = document.createElement("button");
      button.className = "chat-message-report-reason";
      button.type = "button";
      button.dataset.reason = value;
      button.setAttribute("aria-pressed", "false");
      button.textContent = label;
      button.addEventListener("click", () => selectReason(value));
      return button;
    }));

    elements.backdrop.addEventListener("click", () => close());
    elements.watchReplayButton.addEventListener("click", () => {
      const replayId = selectedMessage?.replayId ?? 0n;
      if (replayId <= 0n) return;
      close(false);
      onWatchReplay(replayId);
    });
    elements.copyButton.addEventListener("click", () => {
      const message = selectedMessage?.message;
      if (!message) return;
      void copyText(message)
        .then(() => {
          close();
          showMessage("MESSAGE COPIED", "#c9a6ff");
        })
        .catch(() => showMessage("COPY FAILED", "#ff9b91"));
    });
    elements.replyButton.addEventListener("click", () => {
      if (!selectedMessage) return;
      const replyTarget = selectedMessage;
      close(false);
      onReply(replyTarget);
    });
    elements.reportButton.addEventListener("click", showReportForm);
    elements.reportBackButton.addEventListener("click", () => {
      showActionMenu();
      elements.reportButton.focus({ preventScroll: true });
    });
    elements.reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedMessage || !selectedReason || reportPending) return;
      const submittedRevision = presentationRevision;
      const submittedMessageId = selectedMessage.id;
      const submittedReason = selectedReason;
      reportPending = true;
      updateReportSubmit();
      const result = await reportMessage(submittedMessageId, submittedReason);
      const stillShowingSubmission = presentationRevision === submittedRevision;
      if (stillShowingSubmission) {
        reportPending = false;
        updateReportSubmit();
      }
      if (!result.ok) {
        showMessage(result.error || "REPORT FAILED", "#ff9b91");
        return;
      }
      if (stillShowingSubmission) close();
      showMessage("REPORT SENT", "#c9a6ff");
    });

    elements.drag.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !elements.layer.classList.contains("is-open")) return;
      dragPointerId = event.pointerId;
      dragStartY = event.clientY;
      dragStartedAt = performance.now();
      elements.layer.classList.add("is-dragging");
      elements.drag.setPointerCapture(event.pointerId);
    });
    elements.drag.addEventListener("pointermove", (event) => {
      if (dragPointerId !== event.pointerId) return;
      setDragOffset(event.clientY - dragStartY);
    });
    elements.drag.addEventListener("pointerup", (event) => finishDrag(event));
    elements.drag.addEventListener("pointercancel", (event) => finishDrag(event, true));
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || elements.layer.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }, { capture: true });
  }

  return { init, open, close };
}
