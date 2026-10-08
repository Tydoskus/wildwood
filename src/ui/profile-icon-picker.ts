import {
  PROFILE_ICON_BACKGROUNDS, encodeProfileIcon, profileIconBackground, profileIconIndex, profileIconLocation, profileIconsInCategory,
  withProfileIconBackground, type ProfileIconBackground, type ProfileIconCategory,
} from "../../shared/profile-icons";

const BACKGROUND_LABELS: Record<ProfileIconBackground, string> = { white: "White", black: "Black" };

export function createProfileIconPicker(choices: HTMLElement, hooks: {
  selectedIcon: () => number;
  paintIcon: (element: HTMLElement, index: number) => void;
  setIcon: (index: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  onSaved: () => void;
  /** A new backdrop was saved; the picker stays open on it. */
  onBackgroundSaved: () => void;
  onError: (message: string) => void;
}) {
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
  const buttons = new Map<ProfileIconCategory, HTMLButtonElement>();
  const backgroundButtons = new Map<ProfileIconBackground, HTMLButtonElement>();
  let category: ProfileIconCategory = "people", revision = 0, busy = false;

  function setBusy(next: boolean) {
    busy = next;
    if (next) choices.setAttribute("aria-busy", "true"); else choices.removeAttribute("aria-busy");
    for (const button of [...choices.querySelectorAll("button"), ...backgroundButtons.values()]) button.disabled = next;
  }
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
    renderBackground();
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
    open() { revision++; setBusy(false); category = profileIconLocation(hooks.selectedIcon()).category; render(); },
    close() { revision++; setBusy(false); },
  };
}
