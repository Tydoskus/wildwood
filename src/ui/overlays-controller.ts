import { renderUpdateNotice } from "./overlays";

export function createOverlaysController(elements: {
  update: { overlay: HTMLElement; items: HTMLElement; toggle: HTMLElement };
  iconPicker: { overlay: HTMLElement; choices: HTMLElement; close: HTMLElement };
}, hooks: {
  releases: () => Array<{ version: string; date: string; notes: string[] }>;
  connected: () => boolean;
  selectedIcon: () => number;
  setIcon: (index: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  paintIcon: (element: HTMLElement, index: number) => void;
  afterIconSet: () => void;
  showMessage: (message: string, color: string) => void;
}) {
  let hasUpdateNotes = false;

  function setUpdateNoticeOpen(open: boolean) {
    const expanded = open && hasUpdateNotes;
    elements.update.overlay.hidden = !expanded;
    elements.update.toggle.setAttribute("aria-expanded", String(expanded));
  }

  function showUpdateNotice() {
    const releases = hooks.releases();
    hasUpdateNotes = releases.length > 0;
    if (!hasUpdateNotes) {
      setUpdateNoticeOpen(false);
      return;
    }
    renderUpdateNotice({ items: elements.update.items }, releases);
  }
  function closeUpdateNotice() { setUpdateNoticeOpen(false); }
  function toggleUpdateNotice() {
    if (!hasUpdateNotes) showUpdateNotice();
    setUpdateNoticeOpen(elements.update.overlay.hidden);
  }
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
  setUpdateNoticeOpen(false);
  elements.update.toggle.addEventListener("click", toggleUpdateNotice);
  elements.iconPicker.close.addEventListener("click", closeIconPicker);
  return { showUpdateNotice, closeUpdateNotice, openIconPicker, closeIconPicker, isIconPickerOpen: () => !elements.iconPicker.overlay.hidden };
}
