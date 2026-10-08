import {
  PROFILE_ICON_BACKGROUNDS, PROFILE_ICON_SNAPSHOT, encodeProfileIcon, isSnapshotProfileIcon, profileIconBackground, profileIconIndex,
  profileIconLocation, profileIconsInCategory, withProfileIconBackground, type ProfileIconBackground, type ProfileIconCategory,
} from "../../shared/profile-icons";

const BACKGROUND_LABELS: Record<ProfileIconBackground, string> = { white: "White", black: "Black" };

/** "Snapshot my character": the server saves the character's look, and the picture draws it. */
export type ProfileSnapshotHooks = {
  /** The local player, whose snapshot the preview draws. */
  identity: () => string | undefined;
  /** Whether a snapshot is saved, so Use Snapshot has something to show. */
  exists: () => boolean;
  take: () => Promise<{ ok: boolean; error?: string } | undefined>;
  /** Calls back when a fetched snapshot arrives or changes; returns the unsubscribe. */
  onChanged: (listener: () => void) => () => void;
};

export function createProfileIconPicker(choices: HTMLElement, hooks: {
  selectedIcon: () => number;
  paintIcon: (element: HTMLElement, index: number, identity?: string) => void;
  setIcon: (index: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  onSaved: () => void;
  /** A new backdrop was saved; the picker stays open on it. */
  onBackgroundSaved: () => void;
  onError: (message: string) => void;
  snapshot?: ProfileSnapshotHooks;
  /** A snapshot was taken and is now the picture; the picker stays open on it. */
  onSnapshotSaved?: () => void;
}) {
  // The snapshot sits first: a preview of the saved character, which is also
  // the Use Snapshot button, and the button that takes a new one.
  const snapshotHooks = hooks.snapshot;
  const snapshotRow = document.createElement("div"); snapshotRow.className = "profile-icon-snapshot";
  const snapshotPreview = document.createElement("button"); snapshotPreview.type = "button";
  snapshotPreview.className = "profile-icon-choice profile-icon-snapshot-preview";
  const snapshotCopy = document.createElement("div"); snapshotCopy.className = "profile-icon-snapshot-copy";
  const snapshotTitle = document.createElement("span"); snapshotTitle.className = "profile-icon-snapshot-title"; snapshotTitle.textContent = "Your Character";
  const snapshotNote = document.createElement("span"); snapshotNote.className = "profile-icon-snapshot-note";
  const snapshotTake = document.createElement("button"); snapshotTake.type = "button";
  snapshotTake.className = "profile-icon-snapshot-take"; snapshotTake.textContent = "Snapshot Character";
  snapshotCopy.append(snapshotTitle, snapshotNote, snapshotTake);
  snapshotRow.append(snapshotPreview, snapshotCopy);
  let stopWatchingSnapshot: (() => void) | null = null;
  // The backdrop behind the current picture: a White / Black segment, as the
  // autofarm window's, above the picture tabs. It previews every choice too.
  const backdrop = document.createElement("div"); backdrop.className = "profile-icon-background";
  const backdropLabel = document.createElement("span"); backdropLabel.id = "profileIconBackgroundLabel";
  backdropLabel.className = "profile-icon-background-label"; backdropLabel.textContent = "Background";
  const segment = document.createElement("div"); segment.className = "profile-icon-background-choice";
  segment.setAttribute("role", "radiogroup"); segment.setAttribute("aria-labelledby", backdropLabel.id);
  backdrop.append(backdropLabel, segment);
  const tabs = document.createElement("div"); tabs.className = "profile-icon-tabs";
  tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Profile pictures");
  choices.before(tabs); tabs.before(backdrop); choices.setAttribute("role", "tabpanel");
  if (snapshotHooks) backdrop.before(snapshotRow);
  const buttons = new Map<ProfileIconCategory, HTMLButtonElement>();
  const backgroundButtons = new Map<ProfileIconBackground, HTMLButtonElement>();
  let category: ProfileIconCategory = "people", revision = 0, busy = false;

  function setBusy(next: boolean) {
    busy = next;
    if (next) choices.setAttribute("aria-busy", "true"); else choices.removeAttribute("aria-busy");
    for (const button of [...choices.querySelectorAll("button"), ...backgroundButtons.values(), snapshotTake]) button.disabled = next;
    renderSnapshot();
  }
  function renderSnapshot() {
    if (!snapshotHooks) return;
    const selected = hooks.selectedIcon(), inUse = isSnapshotProfileIcon(selected), saved = inUse || snapshotHooks.exists();
    hooks.paintIcon(snapshotPreview, encodeProfileIcon(PROFILE_ICON_SNAPSHOT, profileIconBackground(selected)), snapshotHooks.identity());
    snapshotPreview.classList.toggle("is-selected", inUse); snapshotPreview.setAttribute("aria-pressed", String(inUse));
    snapshotPreview.disabled = busy || !saved;
    snapshotPreview.setAttribute("aria-label", saved ? "Use Snapshot" : "No Snapshot Yet");
    snapshotNote.textContent = inUse ? "Your picture now. It stays as it is until you snapshot again."
      : saved ? "Tap it to use your saved snapshot." : "Save how your character looks right now as your picture.";
    snapshotTake.disabled = busy;
  }
  async function takeSnapshot() {
    if (busy || !snapshotHooks) return;
    const version = revision; setBusy(true);
    try {
      const result = await snapshotHooks.take();
      if (version !== revision) return;
      if (result?.ok) {
        const scroll = choices.scrollTop; render(); choices.scrollTop = scroll;
        hooks.onSnapshotSaved?.();
      } else hooks.onError(result?.error || "Snapshot Failed");
    } catch { if (version === revision) hooks.onError("Snapshot Failed"); }
    finally { if (version === revision) setBusy(false); }
  }
  snapshotTake.addEventListener("click", () => { void takeSnapshot(); });
  snapshotPreview.addEventListener("click", () => {
    if (isSnapshotProfileIcon(hooks.selectedIcon())) return;
    void save(encodeProfileIcon(PROFILE_ICON_SNAPSHOT, profileIconBackground(hooks.selectedIcon())), hooks.onSaved);
  }); 
  /** Saves a profile icon, with the picker locked until the server answers. */
  async function save(icon: number, saved: () => void) {
    if (busy) return;
    const version = revision; setBusy(true);
    try {
      const result = await hooks.setIcon(icon);
      if (version !== revision) return;
      if (result?.ok) saved();
      else hooks.onError(result?.error || "PROFILE ICON UPDATE FAILED");
    } catch { if (version === revision) hooks.onError("PROFILE ICON UPDATE FAILED"); }
    finally { if (version === revision) setBusy(false); }
  }
  function renderBackground() {
    const current = profileIconBackground(hooks.selectedIcon());
    for (const [key, button] of backgroundButtons) {
      button.setAttribute("aria-checked", String(key === current));
      button.tabIndex = key === current ? 0 : -1;
    }
  }
  function render() {
    for (const [key, button] of buttons) {
      button.setAttribute("aria-selected", String(category === key));
      button.tabIndex = category === key ? 0 : -1;
    }
    renderBackground(); renderSnapshot();
    const selected = hooks.selectedIcon(), selectedIndex = profileIconIndex(selected), background = profileIconBackground(selected);
    choices.setAttribute("aria-labelledby", `profile-icon-tab-${category}`);
    choices.replaceChildren();
    for (const index of profileIconsInCategory(category)) {
      const choice = document.createElement("button"); choice.type = "button"; choice.className = "profile-icon-choice";
      const isSelected = index === selectedIndex;
      choice.classList.toggle("is-selected", isSelected); choice.setAttribute("aria-pressed", String(isSelected));
      choice.setAttribute("aria-label", `Use ${category === "people" ? "person" : "object"} picture ${index + 1}`);
      choice.disabled = busy; hooks.paintIcon(choice, encodeProfileIcon(index, background));
      // A new picture keeps the backdrop already chosen.
      choice.addEventListener("click", () => save(encodeProfileIcon(index, profileIconBackground(hooks.selectedIcon())), hooks.onSaved));
      choices.append(choice);
    }
    choices.scrollTop = 0;
  }
  function chooseBackground(background: ProfileIconBackground) {
    const current = hooks.selectedIcon();
    if (busy || profileIconBackground(current) === background) return;
    void save(withProfileIconBackground(current, background), () => {
      // Repaint the choices on the new backdrop without losing the scroll position.
      const scroll = choices.scrollTop; render(); choices.scrollTop = scroll;
      hooks.onBackgroundSaved();
    });
  }
  for (const key of PROFILE_ICON_BACKGROUNDS) {
    const button = document.createElement("button"); button.type = "button";
    button.dataset.background = key; button.textContent = BACKGROUND_LABELS[key];
    button.setAttribute("role", "radio");
    button.addEventListener("click", () => chooseBackground(key));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const next = key === "white" ? "black" : "white";
      backgroundButtons.get(next)?.focus(); chooseBackground(next);
    });
    backgroundButtons.set(key, button); segment.append(button);
  }
  for (const key of ["people", "objects"] as const) {
    const button = document.createElement("button"); button.type = "button";
    button.id = `profile-icon-tab-${key}`; button.textContent = key === "people" ? "People" : "Objects";
    button.setAttribute("role", "tab"); button.setAttribute("aria-controls", choices.id);
    button.addEventListener("click", () => { category = key; render(); });
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); category = event.key === "Home" ? "people" : event.key === "End" ? "objects" : category === "people" ? "objects" : "people";
      render(); buttons.get(category)?.focus();
    });
    buttons.set(key, button); tabs.append(button);
  }
  return {
    open() {
      revision++; setBusy(false); category = profileIconLocation(hooks.selectedIcon()).category; render();
      stopWatchingSnapshot?.(); stopWatchingSnapshot = snapshotHooks?.onChanged(renderSnapshot) ?? null;
    },
    close() { revision++; setBusy(false); stopWatchingSnapshot?.(); stopWatchingSnapshot = null; },
  };
}
