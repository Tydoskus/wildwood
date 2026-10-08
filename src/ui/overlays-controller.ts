import { createReleaseNotesIndicator } from "./release-notes-unread";
import { renderUpdateNotice } from "./overlays";
import { createAvatarFramePicker, type SupporterActions } from "./avatar-frame-picker";
import { createProfileIconPicker, type ProfileSnapshotHooks } from "./profile-icon-picker";

export function createOverlaysController(elements: {
  update: { overlay: HTMLElement; items: HTMLElement; toggle: HTMLElement };
  iconPicker: { overlay: HTMLElement; choices: HTMLElement; close: HTMLElement };
}, hooks: {
  releases: () => Array<{ version: string; date: string; notes: string[] }>;
  connected: () => boolean;
  selectedIcon: () => number;
  setIcon: (index: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  paintIcon: (element: HTMLElement, index: number, identity?: string) => void;
  afterIconSet: () => void;
  snapshot?: ProfileSnapshotHooks;
  showMessage: (message: string, color: string) => void;
  supporter?: SupporterActions;
}) {
  const frames = hooks.supporter ? createAvatarFramePicker(hooks.supporter, hooks.showMessage) : undefined;
  if (frames) {
    const options = document.createElement("details"); options.className = "profile-frame-options";
    const summary = document.createElement("summary"); summary.append("Frame: ", frames.selection);
    options.append(summary, frames.element); elements.iconPicker.choices.before(options);
  }
  const icons = createProfileIconPicker(elements.iconPicker.choices, {
    selectedIcon: hooks.selectedIcon, setIcon: hooks.setIcon, paintIcon: hooks.paintIcon,
    onSaved: () => { hooks.afterIconSet(); closeIconPicker(); hooks.showMessage("PROFILE ICON UPDATED", "#72ef58"); },
    onBackgroundSaved: hooks.afterIconSet,
    snapshot: hooks.snapshot,
    onSnapshotSaved: () => { hooks.afterIconSet(); hooks.showMessage("Character Snapshot Saved", "#72ef58"); },
    onError: message => hooks.showMessage(message, "#ff9b91"),
  });
  let hasUpdateNotes = false;
  const notesIndicator = createReleaseNotesIndicator(elements.update.toggle, hooks.releases);

  function setUpdateNoticeOpen(open: boolean) {
    const expanded = open && hasUpdateNotes;
    elements.update.overlay.hidden = !expanded;
    if (expanded) notesIndicator.markRead();
    elements.update.toggle.setAttribute("aria-expanded", String(expanded));
  }

  function showUpdateNotice() {
    const releases = hooks.releases();
    notesIndicator.refresh();
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
    frames?.open();
    icons.open();
    elements.iconPicker.overlay.hidden = false;
  }
  function closeIconPicker() { frames?.close(); icons.close(); elements.iconPicker.overlay.hidden = true; }
  setUpdateNoticeOpen(false);
  elements.update.toggle.addEventListener("click", toggleUpdateNotice);
  elements.iconPicker.close.addEventListener("click", closeIconPicker);
  return { showUpdateNotice, closeUpdateNotice, openIconPicker, closeIconPicker, isIconPickerOpen: () => !elements.iconPicker.overlay.hidden };
}
