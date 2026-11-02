import { NAME_COLORS, NAME_COLOR_AUTO, nameColorHex } from "../../shared/name-colors";
import { PLAYER_GENDER_UNSET, isSelectedPlayerGender, playerGenderLabel, type PlayerGender } from "../../shared/player-gender";
import { appendPlayerGenderIcon } from "../game/player-gender-icon";
import type { NameChangeStatus } from "../../shared/name-change";
import { appendPlayerIdentity, autoNameColor } from "./player-identity";
import { createProfileNameEditor } from "./profile-name-editor";
import { replaceChildrenIfChanged } from "../game/replace-children-if-changed";

type Result = Promise<{ ok?: boolean; error?: string } | undefined>;

export type ProfileEditorElements = {
  overlay: HTMLElement; close: HTMLElement; picture: HTMLButtonElement; pictureButton: HTMLButtonElement; preview: HTMLElement;
  nameForm: HTMLFormElement; nameInput: HTMLInputElement; saveName: HTMLButtonElement;
  nameColors: HTMLElement; genderChoices: HTMLElement; skinChoices: HTMLElement;
  /** White pencils, one per setting, each opening its picker. */
  nameToggle: HTMLButtonElement; nameColorToggle: HTMLButtonElement; genderToggle: HTMLButtonElement; skinToggle: HTMLButtonElement;
  /** Just the mark after each label: the color square, the gender symbol, the skin square. */
  nameColorSwatch: HTMLElement; genderValue: HTMLElement; skinSwatch: HTMLElement;
  /** The window each picker opens in. */
  picker: HTMLElement; pickerTitle: HTMLElement; pickerBack: HTMLElement;
};

/**
 * Edit Profile: one window for the picture, name, chat name color, gender and skin tone, opened by the
 * profile's one pencil. A minimal centered stack: the picture, then the
 * name as chat draws it, name color, gender and skin tone, each with a white pencil beside it (the field
 * opens it too) that opens its picker in a window of its own; a pick saves and closes it.
 */
export function createProfileEditor(elements: ProfileEditorElements, api: {
  localIdentity: () => string | undefined; localDisplayName: () => string | undefined;
  profileIcon: (identity?: string) => number; paintIcon: (element: HTMLElement, index: number, identity?: string) => void;
  openIconPicker: () => void;
  playerGender: (identity?: string) => PlayerGender; setGender: (value: PlayerGender) => Result;
  skinTone: (identity?: string) => number; setSkinTone: (value: number) => Result;
  nameColor: (identity?: string) => number; setNameColor: (value: number) => Result;
  getNameChangeStatus: () => Promise<NameChangeStatus | undefined>;
  isNameTaken: (name: string) => boolean; setDisplayName: (name: string, expectedCost: number) => Result;
  showMessage: (text: string, color: string) => void;
  /** A look was saved; the profile window repaints its character and name. */
  onChanged: (change: { gender?: PlayerGender }) => void;
}) {
  // A saved name closes its window, as the other picks do.
  const nameEditor = createProfileNameEditor({ overlay: elements.overlay, form: elements.nameForm, input: elements.nameInput, save: elements.saveName }, {
    ...api, setDisplayName: async (name, cost) => { const result = await api.setDisplayName(name, cost); if (result?.ok) showPicker(null); return result; },
  });
  let paintedIcon = "", shownColor = "", busy = false;

  const colorButtons = NAME_COLORS.map((entry, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "profile-name-color-choice"; button.dataset.nameColor = String(index);
    button.setAttribute("aria-label", entry.name); button.title = entry.name;
    if (index === NAME_COLOR_AUTO) { button.classList.add("is-auto"); button.textContent = "Auto"; }
    else button.style.setProperty("--name-color", entry.color);
    elements.nameColors.append(button);
    return button;
  });
  const genderButtons = [...elements.genderChoices.querySelectorAll<HTMLButtonElement>(".profile-gender-choice")];
  const skinButtons = () => [...elements.skinChoices.querySelectorAll<HTMLButtonElement>(".profile-skin-tone-choice")];

  function press(buttons: HTMLButtonElement[], selected: (button: HTMLButtonElement) => boolean) {
    for (const button of buttons) {
      const pressed = String(selected(button));
      if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
      if (button.disabled !== busy) button.disabled = busy;
    }
  }

  /** Cheap enough for the HUD tick: each part writes only what changed. */
  function render() {
    const identity = api.localIdentity();
    if (!identity || elements.overlay.hidden) return;
    const icon = api.profileIcon(identity), gender = api.playerGender(identity), color = api.nameColor(identity), skin = api.skinTone(identity);
    if (paintedIcon !== `${identity}:${icon}`) {
      paintedIcon = `${identity}:${icon}`;
      api.paintIcon(elements.picture, icon, identity);
    }
    const name = api.localDisplayName() || "PLAYER";
    replaceChildrenIfChanged(elements.genderValue, target => {
      if (!isSelectedPlayerGender(gender)) { target.textContent = "Not Set"; return; }
      const genderIcon = appendPlayerGenderIcon(target, gender);
      if (genderIcon) genderIcon.alt = playerGenderLabel(gender);
    });
    replaceChildrenIfChanged(elements.preview, target => appendPlayerIdentity(target,
      { identity, name, nameColor: color }, { chat: true }));
    // appendPlayerIdentity colors the element it is given, here the off-page copy, so the preview takes it too.
    const shown = nameColorHex(color) || autoNameColor(identity);
    if (shownColor !== shown) { shownColor = shown; elements.preview.style.color = shown; }
    colorButtons[NAME_COLOR_AUTO].style.setProperty("--name-color", autoNameColor(identity));
    press(colorButtons, button => Number(button.dataset.nameColor) === color);
    const label = NAME_COLORS[color]?.name ?? "Auto";
    if (elements.nameColorSwatch.getAttribute("aria-label") !== label) { elements.nameColorSwatch.setAttribute("aria-label", label); elements.nameColorSwatch.title = label; }
    elements.nameColorSwatch.style.background = shown;
    const skinChoice = skinButtons().find(button => Number(button.dataset.skinTone) === skin);
    elements.skinSwatch.style.background = skinChoice?.style.background ?? "";
    const skinLabel = (skinChoice?.getAttribute("aria-label") ?? "").replace(/\b\w/g, letter => letter.toUpperCase());
    if (elements.skinSwatch.getAttribute("aria-label") !== skinLabel) { elements.skinSwatch.setAttribute("aria-label", skinLabel); elements.skinSwatch.title = skinLabel; }
    press(genderButtons, button => Number(button.dataset.gender) === gender);
    press(skinButtons(), button => Number(button.dataset.skinTone) === skin);
  }

  const pickers = [[elements.nameToggle, elements.nameForm], [elements.nameColorToggle, elements.nameColors],
    [elements.genderToggle, elements.genderChoices], [elements.skinToggle, elements.skinChoices]] as const;
  const TITLES = new Map<HTMLElement, string>([[elements.nameForm, "Name"], [elements.nameColors, "Name Color"], [elements.genderChoices, "Gender"], [elements.skinChoices, "Skin Tone"]]);
  /** Opens one picker's window, or closes it with null. */
  function showPicker(open: HTMLElement | null) {
    for (const [, choices] of pickers) choices.hidden = choices !== open;
    elements.picker.hidden = !open;
    if (!open) return;
    elements.pickerTitle.textContent = TITLES.get(open) ?? "";
    if (open === elements.nameForm) { elements.nameInput.value = api.localDisplayName() || ""; elements.nameInput.focus(); }
  }
  for (const [toggle, choices] of pickers) toggle.addEventListener("click", () => showPicker(choices));
  elements.pickerBack.addEventListener("click", () => showPicker(null));
  // A field opens its picker too, not only its pencil.
  elements.overlay.addEventListener("click", event => {
    const target = event.target as Element;
    const tile = target.closest<HTMLElement>("[data-opens]");
    if (!tile || target.closest("button")) return;
    elements.overlay.ownerDocument.getElementById(tile.dataset.opens || "")?.click();
  });

  /** Saves one pick with every choice locked until the server answers, then shows it. */
  async function save(action: () => Result, failure: string, success: string, change: { gender?: PlayerGender } = {}) {
    if (busy || !api.localIdentity()) return;
    busy = true; render();
    try {
      const result = await action();
      if (!result?.ok) api.showMessage(result?.error || failure, "#ff9b91");
      else { api.showMessage(success, "#72ef58"); api.onChanged(change); showPicker(null); }
    } catch { api.showMessage(failure, "#ff9b91"); }
    finally { busy = false; render(); }
  }

  elements.nameColors.addEventListener("click", event => {
    const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-name-color-choice");
    const value = Number(choice?.dataset.nameColor);
    if (!choice || !Number.isInteger(value) || value === api.nameColor()) return;
    void save(() => api.setNameColor(value), "NAME COLOR UPDATE FAILED", "NAME COLOR UPDATED");
  });
  elements.genderChoices.addEventListener("click", event => {
    const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-gender-choice");
    const selected = Number(choice?.dataset.gender);
    if (!choice || !isSelectedPlayerGender(selected)) return;
    // Tapping the chosen one again clears it.
    const gender = api.playerGender() === selected ? PLAYER_GENDER_UNSET : selected;
    void save(() => api.setGender(gender), "GENDER UPDATE FAILED", "GENDER UPDATED", { gender });
  });
  elements.skinChoices.addEventListener("click", event => {
    const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-skin-tone-choice");
    const value = Number(choice?.dataset.skinTone);
    if (!choice || !Number.isInteger(value) || value === api.skinTone()) return;
    void save(() => api.setSkinTone(value), "SKIN TONE UPDATE FAILED", "SKIN TONE UPDATED");
  });
  elements.picture.addEventListener("click", () => api.openIconPicker());
  elements.pictureButton.addEventListener("click", () => api.openIconPicker());
  elements.close.addEventListener("click", () => { showPicker(null); nameEditor.close(); });

  return {
    open() {
      if (!api.localIdentity()) return;
      paintedIcon = ""; shownColor = ""; showPicker(null);
      void nameEditor.open();
      render();
      const scroll = elements.overlay.querySelector<HTMLElement>(".profile-editor-scroll");
      if (scroll) scroll.scrollTop = 0;
    },
    close: () => { showPicker(null); nameEditor.close(); },
    render,
    isOpen: () => !elements.overlay.hidden,
  };
}
