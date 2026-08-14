import { renderUpdateNotice } from "./overlays";

export function createOverlaysController(elements: {
  update: { overlay: HTMLElement; title: HTMLElement; items: HTMLElement; close: HTMLElement };
  iconPicker: { overlay: HTMLElement; choices: HTMLElement; close: HTMLElement };
}, hooks: {
  version: string;
  releases: () => Array<{ version: string; date: string; notes: string[] }>;
  seenVersion: () => string;
  markSeen: () => void;
  connected: () => boolean;
  selectedIcon: () => number;
  setIcon: (index: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  paintIcon: (element: HTMLElement, index: number) => void;
  afterIconSet: () => void;
  showMessage: (message: string, color: string) => void;
}) {
  function showUpdateNotice() {
    if (hooks.seenVersion() === hooks.version) return;
    const releases = hooks.releases();
    if (releases.length) renderUpdateNotice({ overlay: elements.update.overlay, title: elements.update.title, items: elements.update.items }, hooks.version, releases);
  }
  function closeUpdateNotice() { elements.update.overlay.hidden = true; hooks.markSeen(); }
  function openIconPicker() {
    if (!hooks.connected()) return;
    const selected = hooks.selectedIcon();
    elements.iconPicker.choices.replaceChildren();
    for (let index = 0; index < 64; index += 1) {
      const choice = document.createElement("button");
      choice.type = "button"; choice.className = "profile-icon-choice";
      choice.classList.toggle("is-selected", index === selected);
      choice.setAttribute("aria-label", `Use profile icon ${index + 1}`);
      choice.setAttribute("aria-pressed", String(index === selected));
      hooks.paintIcon(choice, index);
      choice.addEventListener("click", async () => {
        const result = await hooks.setIcon(index);
        if (!result?.ok) return hooks.showMessage(result?.error || "PROFILE ICON UPDATE FAILED", "#ff9b91");
        hooks.afterIconSet(); elements.iconPicker.overlay.hidden = true; hooks.showMessage("PROFILE ICON UPDATED", "#72ef58");
      });
      elements.iconPicker.choices.append(choice);
    }
    elements.iconPicker.overlay.hidden = false;
  }
  function closeIconPicker() { elements.iconPicker.overlay.hidden = true; }
  elements.update.close.addEventListener("click", closeUpdateNotice);
  elements.iconPicker.close.addEventListener("click", closeIconPicker);
  return { showUpdateNotice, closeUpdateNotice, openIconPicker, closeIconPicker, isIconPickerOpen: () => !elements.iconPicker.overlay.hidden };
}
