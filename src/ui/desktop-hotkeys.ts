import { actionForKey, controlBindings, keyLabel, onControlAction, onControlBindingsChange, type ControlAction } from "../game/runtime/control-bindings";

/**
 * Keyboard shortcuts for PC players, on the keys the Controls tab binds. Each one does exactly what
 * clicking its button does, and only when that button could be clicked: on screen, enabled and not
 * under another window. A controller button bound to the same action does the same. Escape presses
 * the Back of whichever window is on top, so every window closes the same way its own Back does.
 * Enter opens the chat to type in; Escape from the chat box closes it again.
 */
export const DESKTOP_HOTKEYS = [
  { action: "inventory", selector: "#inventoryBtn" },
  { action: "leaderboard", selector: "#leaderboardBtn" },
  { action: "guild", selector: "#guildBtn" },
  { action: "map", selector: "#minimapButton" },
  { action: "profile", selector: "#playerHudProfileIcon" },
] as const satisfies readonly { action: ControlAction; selector: string }[];
// Auto Farm starts and stops itself (auto-farm-panel.ts), rather than opening its window.

/** Whether a click at the element's centre would reach it. */
export function clickable(element: Element | null): element is HTMLElement {
  if (!element || (element as HTMLButtonElement).disabled) return false;
  const doc = element.ownerDocument;
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  const hit = doc.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2) ?? null;
  return hit === element || element.contains(hit);
}

/** The Back button of the window on top, if one is showing. */
export function topBackButton(doc: Document = document): HTMLElement | null {
  let top: HTMLElement | null = null;
  for (const button of doc.querySelectorAll("button")) {
    if (button.textContent?.trim() !== "Back" || !clickable(button)) continue;
    top = button;
  }
  return top;
}

/** Escape: press the top window's Back. False when no window is open. */
export function pressTopBack(doc: Document = document) {
  const back = topBackButton(doc);
  back?.click();
  return Boolean(back);
}

const typing = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName ?? ""));
};

export function installDesktopHotkeys(doc: Document = document) {
  const view = doc.defaultView;
  // The Back each shortcut's window showed when it opened: the same key closes it again.
  const opened = new Map<string, HTMLElement>();

  // Each button's tooltip names its key, and follows a rebinding.
  const labelButtons = () => {
    for (const hotkey of DESKTOP_HOTKEYS) {
      const button = doc.querySelector<HTMLElement>(hotkey.selector);
      if (!button) continue;
      const base = (button.title || button.getAttribute("aria-label") || "").replace(/ \([^)]*\)$/, "").trim();
      const code = controlBindings().keys[hotkey.action];
      button.title = code ? `${base} (${keyLabel(code)})`.trim() : base;
    }
  };
  labelButtons();

  /** Opens the shortcut's window as its button does, or closes the window it opened. */
  const run = (hotkey: (typeof DESKTOP_HOTKEYS)[number]) => {
    const back = topBackButton(doc);
    const own = opened.get(hotkey.action);
    if (back && back === own) { back.click(); opened.delete(hotkey.action); return true; }
    const button = doc.querySelector<HTMLElement>(hotkey.selector);
    if (!clickable(button)) return false;
    button.click();
    opened.delete(hotkey.action);
    // The window draws on the next frame; remember its Back then.
    const nextFrame = (next: () => void) => view?.requestAnimationFrame ? view.requestAnimationFrame(next) : setTimeout(next, 16);
    nextFrame(() => {
      const shown = topBackButton(doc);
      if (shown && shown !== back) opened.set(hotkey.action, shown);
    });
    return true;
  };
  // Settings sits in the profile window, so its button is pressed wherever it is.
  const openSettings = () => doc.getElementById("settingsBtn")?.click();

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const chat = doc.getElementById("chatInput") as HTMLTextAreaElement | null;
    // One Escape out of the chat box closes the chat it opened, as its Back does.
    if (event.code === "Escape" && event.target === chat) { chat?.blur(); event.stopPropagation(); pressTopBack(doc); return; }
    if (typing(event.target)) return;
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      // Inside a window Enter stays the window's. Outside one it is chat, even
      // over the HUD button a closed window handed focus back to.
      if (!chat || topBackButton(doc)) return;
      if (clickable(chat)) { event.preventDefault(); chat.focus(); return; }
      // The small chat bar has no box to type in: open it as a tap on it does, then type.
      const bar = doc.getElementById("chatPanel");
      if (!clickable(bar) || bar.classList.contains("is-large")) return;
      event.preventDefault();
      bar.click();
      (doc.getElementById("chatInput") as HTMLTextAreaElement | null)?.focus();
      return;
    }
    const action = actionForKey(event.code);
    if (action === "settings") { event.preventDefault(); openSettings(); return; }
    const hotkey = DESKTOP_HOTKEYS.find(entry => entry.action === action);
    if (hotkey && run(hotkey)) event.preventDefault();
  };
  doc.addEventListener("keydown", onKey);
  const stops = [
    ...DESKTOP_HOTKEYS.map(hotkey => onControlAction(doc, hotkey.action, () => { run(hotkey); })),
    onControlAction(doc, "settings", openSettings),
    onControlBindingsChange(labelButtons),
  ];
  return () => { doc.removeEventListener("keydown", onKey); for (const stop of stops) stop(); };
}
