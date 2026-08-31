import type { PlayerProfileData } from "../wildstat-coop";
import { PLAYER_GENDER_UNSET, isSelectedPlayerGender, playerGenderLabel, type PlayerGender } from "../../shared/player-gender";
import { appendPlayerGenderIcon } from "./player-gender";

export type ProfileTab = "overview" | "stats";
type Profile = PlayerProfileData;
type SavePatch = { displayName: string; maxHp: number; damage: number; attackRate: number; armor: number; regen: number; speed: number; attackRange: number; projectileSpeed: number; projectileCount: number };

export function createProfileWindowController(elements: {
  window: HTMLElement; name: HTMLElement; guest: HTMLElement; presence: HTMLElement; power: HTMLElement; icon: HTMLButtonElement; loading: HTMLElement;
  overviewTab: HTMLElement; statsTab: HTMLElement; overviewPanel: HTMLElement; statsPanel: HTMLElement;
  joined: HTMLElement; timePlayed: HTMLElement; kills: HTMLElement; online: HTMLElement; statGrid: HTMLElement;
  close: HTMLElement; editName: HTMLButtonElement; nameEditor: HTMLElement; nameForm: HTMLFormElement; nameInput: HTMLInputElement; saveName: HTMLButtonElement;
  skinEdit: HTMLButtonElement; skinChoices: HTMLDivElement; preview: HTMLElement; previousSprite: HTMLElement; nextSprite: HTMLElement; genderSetting: HTMLElement; genderValue: HTMLElement; genderEdit: HTMLButtonElement; genderChoices: HTMLElement;
  duel: HTMLButtonElement; developerEdit: HTMLElement; developerEditButton: HTMLElement;
  editNameInput: HTMLInputElement; editMaxHp: HTMLInputElement; editDamage: HTMLInputElement; editAttackRate: HTMLInputElement; editArmor: HTMLInputElement; editRegen: HTMLInputElement; editSpeed: HTMLInputElement; editAttackRange: HTMLInputElement; editProjectileSpeed: HTMLInputElement; editProjectileCount: HTMLInputElement;
  cancelDeveloperEdit: HTMLElement; saveDeveloperEdit: HTMLButtonElement;
}, api: {
  localIdentity: () => string | undefined; localDisplayName: () => string | undefined; profileIcon: (identity?: string) => number; paintIcon: (element: HTMLElement, index: number) => void;
  renderName: (element: HTMLElement, identity: string, name: string, gender?: PlayerGender) => void; isGuest: (identity: string) => boolean; isOnline: (identity: string) => boolean; presenceText: (profile: Profile, online: boolean) => string;
  renderCharacter: (identity: string, progress: Profile["progress"] | null, visible: boolean) => void; skinTone: (identity?: string) => number; setSkinTone: (value: number) => Promise<{ ok?: boolean; error?: string } | undefined>;
  playerGender: (identity?: string) => PlayerGender; setGender: (value: PlayerGender) => Promise<{ ok?: boolean; error?: string } | undefined>;
  renderStats: (profile: Profile, element: HTMLElement) => void; formatPower: (profile: Profile) => string; formatPlayedTime: (seconds: number) => string;
  profile: (identity: string) => Profile | null | undefined; loadProfile: (identity: string) => Promise<Profile | null | undefined>; releaseProfile: () => void;
  isDeveloper: () => boolean; isDueling: () => boolean; duelCooldownMs: () => number; requestDuel: (identity: string) => Promise<{ ok?: boolean; error?: string } | undefined>;
  isNameTaken: (name: string) => boolean; setDisplayName: (name: string) => Promise<{ ok?: boolean; error?: string } | undefined>; updateSave: (identity: string, save: SavePatch) => Promise<{ ok?: boolean; error?: string } | undefined>;
  showMessage: (text: string, color: string) => void;
}) {
  let identity = "";
  let profileData: Profile | null = null;

  function selectTab(tab: ProfileTab) {
    const overview = tab === "overview";
    const stats = tab === "stats";
    elements.overviewTab.classList.toggle("is-active", overview); elements.statsTab.classList.toggle("is-active", stats);
    elements.overviewTab.setAttribute("aria-selected", String(overview)); elements.statsTab.setAttribute("aria-selected", String(stats));
    elements.overviewPanel.hidden = !overview; elements.statsPanel.hidden = !stats;
  }

  function renderPower(value: string) {
    const label = document.createElement("span"); label.className = "power-label"; label.textContent = "Power:";
    const number = document.createElement("span"); number.className = "power-value"; number.textContent = value;
    elements.power.replaceChildren(label, " ", number);
  }

  function updateSkinChoices(value: number) {
    elements.skinChoices.querySelectorAll<HTMLButtonElement>(".profile-skin-tone-choice").forEach((choice) => choice.setAttribute("aria-pressed", String(Number(choice.dataset.skinTone) === value)));
  }

  function updateGenderChoices(value: PlayerGender) {
    elements.genderChoices.querySelectorAll<HTMLButtonElement>(".profile-gender-choice").forEach((choice) => {
      choice.setAttribute("aria-pressed", String(Number(choice.dataset.gender) === value));
    });
    elements.genderValue.replaceChildren();
    if (!isSelectedPlayerGender(value)) {
      elements.genderValue.setAttribute("aria-label", "Choose gender");
      elements.genderValue.textContent = "choose";
      return;
    }
    elements.genderValue.setAttribute("aria-label", `${playerGenderLabel(value)} selected`);
    const icon = appendPlayerGenderIcon(elements.genderValue, value);
    if (icon) {
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
    }
  }

  function closeGenderChoices() {
    elements.genderChoices.hidden = true;
    elements.genderEdit.setAttribute("aria-expanded", "false");
  }

  function drawPreview() {
    const profile = profileData;
    const progress = profile && profile.identity === elements.preview.dataset.identity ? profile.progress : null;
    api.renderCharacter(elements.preview.dataset.identity || "", progress, !elements.window.hidden);
  }

  function updatePreview(target: string, ownProfile: boolean) {
    const changed = elements.preview.dataset.identity !== target;
    elements.preview.dataset.identity = target;
    elements.previousSprite.hidden = true; elements.nextSprite.hidden = true; elements.skinEdit.hidden = !ownProfile;
    if (!ownProfile || changed) elements.skinChoices.hidden = true;
    if (ownProfile) updateSkinChoices(api.skinTone(target));
    drawPreview();
  }

  function updateDuelButton() {
    if (elements.duel.hidden) return;
    const remainingSeconds = Math.ceil(api.duelCooldownMs() / 1_000);
    const active = api.isDueling();
    elements.duel.disabled = active || remainingSeconds > 0;
    elements.duel.classList.toggle("is-cooling-down", remainingSeconds > 0);
    elements.duel.textContent = active ? "DUEL IN PROGRESS" : remainingSeconds > 0 ? `DUEL · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}` : "DUEL";
  }

  function render(profile: Profile | null) {
    if (!profile || profile.identity !== identity) return;
    profileData = profile;
    const online = api.isOnline(profile.identity);
    const own = profile.identity === api.localIdentity();
    const presence = api.presenceText(profile, online);
    api.renderName(elements.name, profile.identity, profile.name, profile.gender);
    elements.guest.hidden = !api.isGuest(profile.identity);
    elements.presence.textContent = presence; elements.presence.classList.toggle("is-online", online);
    api.paintIcon(elements.icon, api.profileIcon(profile.identity));
    elements.icon.classList.toggle("is-editable", own); elements.icon.disabled = !own; elements.icon.setAttribute("aria-label", own ? "Choose profile icon" : `${profile.name}'s profile icon`);
    elements.editName.hidden = !own;
    elements.genderSetting.hidden = !own;
    if (own) updateGenderChoices(profile.gender);
    else closeGenderChoices();
    updatePreview(profile.identity, own);
    renderPower(api.formatPower(profile));
    elements.duel.hidden = own; elements.duel.dataset.identity = own ? "" : profile.identity; updateDuelButton();
    const lifetime = profile.lifetime;
    elements.joined.textContent = new Date(lifetime.joinedAtMs).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    const activeSeconds = online ? Math.max(0, (Date.now() - lifetime.sessionStartedAtMs) / 1000) : 0;
    elements.timePlayed.textContent = api.formatPlayedTime(lifetime.playedSeconds + activeSeconds); elements.kills.textContent = Math.round(lifetime.enemyKills).toLocaleString();
    elements.online.textContent = presence; elements.online.style.color = online ? "#72ef58" : "#b7c5b7";
    api.renderStats(profile, elements.statGrid);
    elements.loading.hidden = true;
    elements.developerEditButton.hidden = !api.isDeveloper();
    elements.overviewPanel.hidden = !elements.overviewTab.classList.contains("is-active");
    elements.statsPanel.hidden = !elements.statsTab.classList.contains("is-active");
  }

  async function open(nextIdentity: string, fallbackName = "PLAYER") {
    if (!nextIdentity) return;
    identity = nextIdentity; profileData = null; elements.developerEdit.hidden = true; elements.duel.hidden = nextIdentity === api.localIdentity(); elements.duel.dataset.identity = nextIdentity; updateDuelButton();
    elements.window.hidden = false; api.renderName(elements.name, nextIdentity, fallbackName, api.playerGender(nextIdentity)); elements.guest.hidden = !api.isGuest(nextIdentity);
    const online = api.isOnline(nextIdentity); elements.presence.textContent = online ? "Online" : "CHECKING LAST SEEN"; elements.presence.classList.toggle("is-online", online);
    api.paintIcon(elements.icon, api.profileIcon(nextIdentity)); const own = nextIdentity === api.localIdentity(); elements.icon.classList.toggle("is-editable", own); elements.icon.disabled = !own; elements.editName.hidden = !own; elements.genderSetting.hidden = !own; closeGenderChoices(); if (own) updateGenderChoices(api.playerGender(nextIdentity));
    updatePreview(nextIdentity, own); renderPower("—"); elements.loading.hidden = false; elements.overviewPanel.hidden = true; elements.statsPanel.hidden = true; selectTab("stats"); elements.statsPanel.hidden = true;
    const cached = api.profile(nextIdentity); if (cached) { render(cached); return; }
    const loaded = await api.loadProfile(nextIdentity); if (nextIdentity !== identity) return; if (loaded) render(loaded); else elements.loading.textContent = "PLAYER DATA UNAVAILABLE";
  }

  function close() {
    closeNameEditor(); closeGenderChoices(); elements.skinChoices.hidden = true; elements.window.hidden = true; elements.guest.hidden = true; identity = ""; profileData = null; elements.developerEdit.hidden = true; elements.loading.textContent = "LOADING PLAYER…"; api.releaseProfile();
  }

  function openNameEditor() {
    if (!identity || identity !== api.localIdentity()) return;
    elements.nameInput.value = api.localDisplayName() || ""; elements.nameEditor.hidden = false; requestAnimationFrame(() => { elements.nameInput.focus(); elements.nameInput.select(); });
  }
  function closeNameEditor() { elements.nameEditor.hidden = true; }
  async function saveName(event: SubmitEvent) {
    event.preventDefault(); const name = elements.nameInput.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) { api.showMessage("NAME: 2–20 SAFE CHARACTERS", "#ff9b91"); return; }
    if (name === (api.localDisplayName() || "")) { api.showMessage("NAME ALREADY SET", "#bce7ff"); return; }
    if (api.isNameTaken(name)) { api.showMessage("NAME TAKEN · TRY ANOTHER", "#ff9b91"); return; }
    elements.saveName.disabled = true; const result = await api.setDisplayName(name); elements.saveName.disabled = false;
    if (result?.ok) { closeNameEditor(); api.showMessage("NAME UPDATED", "#c9f5c2"); return; }
    api.showMessage(/already taken/i.test(result?.error ?? "") ? "NAME TAKEN · TRY ANOTHER" : /once every 30 days/i.test(result?.error ?? "") ? "NAME LOCKED · CHANGES EVERY 30 DAYS" : "NAME UPDATE FAILED", "#ff9b91");
  }

  function beginDeveloperEdit() {
    if (!profileData || !api.isDeveloper()) return; const progress = profileData.progress;
    elements.editNameInput.value = profileData.name; elements.editMaxHp.value = String(progress.maxHp); elements.editDamage.value = String(progress.damage); elements.editAttackRate.value = String(progress.attackRate); elements.editArmor.value = String(progress.armor); elements.editRegen.value = String(progress.regen); elements.editSpeed.value = String(progress.speedOverride > 0 ? progress.speedOverride : progress.speed); elements.editAttackRange.value = String(progress.attackRange); elements.editProjectileSpeed.value = String(progress.projectileSpeed); elements.editProjectileCount.value = String(progress.projectileCount);
    elements.developerEdit.hidden = false; elements.developerEditButton.hidden = true;
  }
  function cancelDeveloperEdit() { elements.developerEdit.hidden = true; elements.developerEditButton.hidden = !profileData || !api.isDeveloper(); }
  async function saveDeveloperEdit() {
    if (!identity || !api.isDeveloper()) return; elements.saveDeveloperEdit.disabled = true;
    const result = await api.updateSave(identity, { displayName: elements.editNameInput.value, maxHp: Number(elements.editMaxHp.value), damage: Number(elements.editDamage.value), attackRate: Number(elements.editAttackRate.value), armor: Number(elements.editArmor.value), regen: Number(elements.editRegen.value), speed: Number(elements.editSpeed.value), attackRange: Number(elements.editAttackRange.value), projectileSpeed: Number(elements.editProjectileSpeed.value), projectileCount: Number(elements.editProjectileCount.value) });
    elements.saveDeveloperEdit.disabled = false; if (!result?.ok) { api.showMessage(result?.error || "DATABASE UPDATE FAILED", "#ff9b91"); return; }
    api.showMessage("PLAYER SAVE UPDATED", "#72ef58"); elements.developerEdit.hidden = true; elements.developerEditButton.hidden = false;
  }

  elements.overviewTab.addEventListener("click", () => selectTab("overview")); elements.statsTab.addEventListener("click", () => selectTab("stats"));
  elements.close.addEventListener("click", close); elements.editName.addEventListener("click", openNameEditor); elements.nameEditor.addEventListener("click", (event) => { if (event.target === elements.nameEditor) closeNameEditor(); }); elements.nameForm.addEventListener("submit", (event) => void saveName(event));
  elements.skinEdit.addEventListener("click", () => { if (identity !== api.localIdentity()) return; closeGenderChoices(); elements.skinChoices.hidden = !elements.skinChoices.hidden; });
  elements.skinChoices.addEventListener("click", async (event) => { const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-skin-tone-choice"); if (!choice || identity !== api.localIdentity()) return; const value = Number(choice.dataset.skinTone); if (!Number.isInteger(value)) return; const result = await api.setSkinTone(value); if (!result?.ok) { api.showMessage(result?.error || "SKIN TONE UPDATE FAILED", "#ff9b91"); updateSkinChoices(api.skinTone()); return; } updateSkinChoices(value); elements.skinChoices.hidden = true; drawPreview(); api.showMessage("SKIN TONE UPDATED", "#72ef58"); });
  elements.genderEdit.addEventListener("click", () => {
    if (identity !== api.localIdentity()) return;
    elements.skinChoices.hidden = true;
    const willOpen = elements.genderChoices.hidden;
    elements.genderChoices.hidden = !willOpen;
    elements.genderEdit.setAttribute("aria-expanded", String(willOpen));
  });
  elements.genderChoices.addEventListener("click", async (event) => {
    const choice = (event.target as Element).closest<HTMLButtonElement>(".profile-gender-choice");
    if (!choice || identity !== api.localIdentity()) return;
    const selectedGender = Number(choice.dataset.gender);
    if (!isSelectedPlayerGender(selectedGender)) return;
    const currentGender = profileData?.gender ?? api.playerGender(identity);
    const gender = currentGender === selectedGender ? PLAYER_GENDER_UNSET : selectedGender;
    const choices = [...elements.genderChoices.querySelectorAll<HTMLButtonElement>(".profile-gender-choice")];
    choices.forEach((button) => { button.disabled = true; });
    const result = await api.setGender(gender);
    choices.forEach((button) => { button.disabled = false; });
    if (!result?.ok) { api.showMessage(result?.error || "GENDER UPDATE FAILED", "#ff9b91"); updateGenderChoices(api.playerGender()); return; }
    updateGenderChoices(gender);
    closeGenderChoices();
    if (profileData) profileData = { ...profileData, gender };
    api.renderName(elements.name, identity, profileData?.name || api.localDisplayName() || "PLAYER", gender);
    api.showMessage("GENDER UPDATED", "#72ef58");
  });
  elements.developerEditButton.addEventListener("click", beginDeveloperEdit); elements.cancelDeveloperEdit.addEventListener("click", cancelDeveloperEdit); elements.saveDeveloperEdit.addEventListener("click", () => void saveDeveloperEdit());
  elements.duel.addEventListener("click", () => { const opponent = elements.duel.dataset.identity || ""; if (!opponent || elements.duel.disabled) return; elements.duel.disabled = true; void api.requestDuel(opponent).then((result) => { if (!result?.ok) api.showMessage(result?.error || "DUEL FAILED", "#ff9b91"); else close(); updateDuelButton(); }); });
  return { selectTab, render, open, close, drawPreview, openNameEditor, closeNameEditor, updateDuelButton, isOpen: () => !elements.window.hidden, isNameEditorOpen: () => !elements.nameEditor.hidden, identity: () => identity, profile: () => profileData };
}
