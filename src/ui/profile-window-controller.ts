import { replaceChildrenIfChanged } from "./replace-children-if-changed";
import { createProfileEditor, type ProfileEditorElements } from "./profile-editor";
import { createProfileLoading } from "./profile-loading";
import type { NameChangeStatus } from "../../shared/name-change";
import { applyAvatarFrame } from "../app/avatar-frames";
import type { PlayerProfileData } from "../wildstat-coop";
import type { PlayerGender } from "../../shared/player-gender";
import { PRESTIGE_STAT_GAIN_PER_LEVEL } from "../../shared/prestige";
import { formatPercentMultiplier } from "./number-format";
import type { WeaponSchool } from "../../shared/weapon-mastery";
import type { CraftSkill } from "../../shared/crafting";
import type { RewardKillCounts } from "../../shared/soul-dimension";
import { profileSkillRows, renderProfileSkills, renderProfileSoulTier } from "./profile-skills";
import type { ItemInspectionController, ItemInspectionAction } from "./item-inspection-controller";
import { profileActiveCardIds, slotUpgradeLevelFor } from "./profile";
import { setText } from "./settings";
import { createProfileBonusToggles, type ProfileBonusDeps } from "./profile-bonus-toggles";
import { createProfileActionsMenu } from "./profile-actions-menu";
import { renderProfileGuild, type KnownGuild } from "./profile-guild";
import {
  PROFILE_EQUIPMENT_SLOTS,
  profileEquipmentPresentation,
  profileEquipmentRefine, profileInspectionLookRefine, profileLookRefine,
  profileEquipmentActiveCards,
  renderProfileEquipmentSlot,
  type ProfileEquipmentSlot,
} from "./profile-equipment";

export type ProfileTab = "info" | "stats" | "skills" | "bonuses";
const DUEL_BUTTON_TITLE = "Automatic duel using earned stats and equipped gear. Hits grow stronger after 10 seconds. Knockout wins; at 30 seconds, the higher percentage of health remaining wins.";
type Profile = PlayerProfileData;

export function createProfileWindowController(elements: {
  window: HTMLElement; name: HTMLElement; guest: HTMLElement; presence: HTMLElement; power: HTMLElement; icon: HTMLButtonElement; loading: HTMLElement;
  infoTab: HTMLElement; statsTab: HTMLElement; infoPanel: HTMLElement; statsPanel: HTMLElement;
  /** Your own profile's bonus switches (profile-bonus-toggles.ts); hidden on anyone else's. */
  bonusesTab?: HTMLElement; bonusesPanel?: HTMLElement; bonuses?: ProfileBonusDeps;
  joined: HTMLElement; timePlayed: HTMLElement; kills: HTMLElement; online: HTMLElement; statGrid: HTMLElement;
  /** The one pencil, beside the name: it opens Edit Profile (profile-editor.ts). */
  close: HTMLElement; editName: HTMLButtonElement; editor: ProfileEditorElements;
  preview: HTMLElement; equipmentHead: HTMLButtonElement; equipmentChest: HTMLButtonElement; equipmentFeet: HTMLButtonElement; equipmentRightHand: HTMLButtonElement; previousSprite: HTMLElement; nextSprite: HTMLElement;
  duel: HTMLButtonElement;
  /** Other players' ⋯ menu (Copy Name, Report, Block), where the pencil sits on your own. */
  settings?: HTMLElement; more: HTMLButtonElement;
  /** The player's guild badge and name, under the online line; it opens the guild. */
  guild: HTMLButtonElement;
  prestigeRow: HTMLElement; prestige: HTMLElement;
  /** Every skill's level (profile-skills.ts), and your own soul tier kills under Info. */
  skillsTab?: HTMLElement; skillsPanel?: HTMLElement; soulTier?: HTMLElement;
}, api: {
  /** Own-profile actions live outside this controller; prestige is the first. */
  onOwnProfile?: (own: boolean) => void;
  prestigeLevel?: () => number;
  /** Your own Weapon Mastery points, live (my_weapon_mastery). */
  weaponMastery?: () => Readonly<Record<WeaponSchool, bigint>> | undefined;
  /** Your own craft experience (my_craft_skills) and soul tier kills, live. */
  craftExperience?: () => Readonly<Record<CraftSkill, bigint>> | undefined;
  rewardKills?: () => RewardKillCounts | undefined;
  localIdentity: () => string | undefined; localDisplayName: () => string | undefined; profileIcon: (identity?: string) => number; paintIcon: (element: HTMLElement, index: number, identity?: string) => void;
  renderName: (element: HTMLElement, identity: string, name: string, gender?: PlayerGender) => void; isGuest: (identity: string) => boolean; isOnline: (identity: string) => boolean; presenceText: (profile: Profile, online: boolean) => string;
  /** `progress` carries the profile's refines too, so the preview draws worn graded gear in its refine look. */
  renderCharacter: (identity: string, progress: (Profile["progress"] & { itemRefines?: Readonly<Record<string, number>>; cosmeticRefines?: Readonly<Record<string, number>> }) | null, visible: boolean) => void; skinTone: (identity?: string) => number; setSkinTone: (value: number) => Promise<{ ok?: boolean; error?: string } | undefined>;
  playerGender: (identity?: string) => PlayerGender; setGender: (value: PlayerGender) => Promise<{ ok?: boolean; error?: string } | undefined>;
  nameColor: (identity?: string) => number; setNameColor: (value: number) => Promise<{ ok?: boolean; error?: string } | undefined>; openIconPicker: () => void;
  renderStats: (profile: Profile, element: HTMLElement) => void; formatPower: (profile: Profile) => string; formatPlayedTime: (seconds: number) => string;
  profile: (identity: string) => Profile | null | undefined; loadProfile: (identity: string) => Promise<Profile | null | undefined>; releaseProfile: () => void;
  isDueling: () => boolean; duelCooldownMs: () => number; requestDuel: (identity: string) => Promise<{ ok?: boolean; error?: string } | undefined>;
  getNameChangeStatus: () => Promise<NameChangeStatus | undefined>;
  isNameTaken: (name: string) => boolean; setDisplayName: (name: string, expectedCost: number) => Promise<{ ok?: boolean; error?: string } | undefined>;
  itemInspection: ItemInspectionController;
  destructionActions?: (itemId: string) => ItemInspectionAction[];
  showMessage: (text: string, color: string) => void;
  isBlocked: (identity: string) => boolean;
  openSafety: (identity: string, name: string, action: "report" | "block") => void;
  /** The player's guild name ("" without one), its id and badge, and the guild's own window. */
  guildTag: (identity: string) => string;
  findGuild: (name: string) => Promise<KnownGuild | undefined>;
  openGuild: (id: string) => void;
  /** Opens the private chat with this player. */
  openPrivateChat: (identity: string, name: string) => void;
  /** Invite to Guild, for a President or Vice President looking at a player with no guild. */
  guildInvite?: { available: (identity: string) => boolean; send: (identity: string) => Promise<{ ok: boolean; error?: string }> };
}) {
  let identity = "";
  let profileData: Profile | null = null;
  const loading = createProfileLoading(elements.loading, elements.statGrid);
  const actionsMenu = createProfileActionsMenu({ ...api, openPrivateChat: (target, name) => { close(); api.openPrivateChat(target, name); } });
  let guildShown: string | null = null;
  const bonuses = elements.bonusesPanel && elements.bonuses ? createProfileBonusToggles(elements.bonusesPanel, elements.bonuses) : null;
  const equipmentElements: Record<ProfileEquipmentSlot, HTMLButtonElement> = {
    HEAD: elements.equipmentHead,
    CHEST: elements.equipmentChest,
    FEET: elements.equipmentFeet,
    WEAPON: elements.equipmentRightHand,
  };

  const editor = createProfileEditor(elements.editor, { ...api, onChanged: ({ gender }) => {
    if (gender !== undefined && profileData) profileData = { ...profileData, gender };
    if (gender !== undefined && identity) api.renderName(elements.name, identity, profileData?.name || api.localDisplayName() || "PLAYER", gender);
    drawPreview();
  } });

  const tabs = () => ([["info", elements.infoTab, elements.infoPanel], ["stats", elements.statsTab, elements.statsPanel],
    ["skills", elements.skillsTab, elements.skillsPanel], ["bonuses", elements.bonusesTab, elements.bonusesPanel]] as const).filter((entry): entry is readonly [ProfileTab, HTMLElement, HTMLElement] => Boolean(entry[1] && entry[2]));
  function selectTab(tab: ProfileTab) {
    for (const [name, button, panel] of tabs()) {
      const active = name === tab;
      button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active));
      panel.hidden = !active;
    }
  }
  /** The Bonuses tab is your own profile's: on anyone else's it is hidden, and Stats takes its place if it was open. */
  function showBonusesTab(own: boolean) {
    if (!elements.bonusesTab) return;
    elements.bonusesTab.hidden = !own;
    if (!own && elements.bonusesTab.classList.contains("is-active")) selectTab("stats");
  }

  function renderPower(value: string) {
    const number = document.createElement("span"); number.className = "power-value"; number.textContent = value;
    const icon = document.createElement("img"); icon.className = "power-icon";
    icon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp"; icon.alt = ""; icon.setAttribute("aria-hidden", "true");
    elements.power.setAttribute("aria-label", `Power ${value}`);
    replaceChildrenIfChanged(elements.power, target => target.append(number, icon));
  }

  function drawPreview() {
    const profile = profileData;
    const progress = profile && profile.identity === elements.preview.dataset.identity ? { ...profile.progress, itemRefines: profile.itemRefines, cosmeticRefines: profile.cosmeticRefines } : null;
    api.renderCharacter(elements.preview.dataset.identity || "", progress, !elements.window.hidden);
  }

  function renderEquipment(profile: Profile | null) {
    for (const slot of PROFILE_EQUIPMENT_SLOTS) {
      const presentation = profileEquipmentPresentation(profile?.progress ?? null, slot);
      renderProfileEquipmentSlot(
        equipmentElements[slot],
        presentation,
        profile?.itemUpgradeLevels[slot === "WEAPON" ? "HAND" : slot] ?? 0,
        profileEquipmentRefine(presentation, profile?.itemRefines),
        profileLookRefine(presentation, profile?.itemRefines, profile?.cosmeticRefines),
      );
    }
  }

  function inspectEquipment(slot: ProfileEquipmentSlot) {
    if (!profileData) return;
    const presentation = profileEquipmentPresentation(profileData.progress, slot);
    if (!presentation.inspectionItemId) return;
    api.itemInspection.open({
      itemId: presentation.inspectionItemId,
      upgradeLevel: slotUpgradeLevelFor(profileData.itemUpgradeLevels, presentation.inspectionItemId),
      refine: profileEquipmentRefine(presentation, profileData.itemRefines),
      lookRefine: profileInspectionLookRefine(presentation, profileData.itemRefines, profileData.cosmeticRefines),
      activeCards: profileEquipmentActiveCards(presentation, profileActiveCardIds(profileData)),
      skills: profileData.wornSkill?.itemId === presentation.inspectionItemId ? profileData.wornSkill.roll : undefined,
      context: presentation.context,
      ownItem: identity === api.localIdentity(),
      worn: profileData.progress,
      actions: identity === api.localIdentity() ? api.destructionActions?.(presentation.inspectionItemId) : undefined,
    });
  }

  function updatePreview(target: string, ownProfile: boolean) {
    const changed = elements.preview.dataset.identity !== target;
    elements.preview.dataset.identity = target;
    elements.previousSprite.hidden = true; elements.nextSprite.hidden = true;
    if (!ownProfile || changed) editor.close();
    drawPreview();
  }

  /** Redraws the guild row when the player's guild changes; the badge and link follow once the guild is found. */
  function syncGuild() {
    const name = identity ? api.guildTag(identity) : "";
    if (name === guildShown) return;
    guildShown = name;
    renderProfileGuild(elements.guild, name);
    if (!name) return;
    const target = identity;
    const settle = (guild: KnownGuild | null) => { if (identity === target && guildShown === name) renderProfileGuild(elements.guild, name, guild); };
    void api.findGuild(name).then(guild => settle(guild ?? null), () => settle(null));
  }

  /** Also runs on the 100ms HUD tick, so it only writes what changed and skips the duel button while the window is closed. */
  function updateDuelButton() {
    const own = !identity || identity === api.localIdentity();
    if (elements.more.hidden !== own) elements.more.hidden = own;
    api.onOwnProfile?.(own);
    if (!elements.window.hidden) syncGuild();
    if (!elements.window.hidden && own) bonuses?.render();
    if (editor.isOpen()) editor.render();
    if (elements.duel.hidden || elements.window.hidden) return;
    if (elements.duel.title !== DUEL_BUTTON_TITLE) elements.duel.title = DUEL_BUTTON_TITLE;
    const remainingSeconds = Math.ceil(api.duelCooldownMs() / 1_000);
    const active = api.isDueling();
    const disabled = api.isBlocked(identity) || active || remainingSeconds > 0;
    if (elements.duel.disabled !== disabled) elements.duel.disabled = disabled;
    if (elements.duel.classList.contains("is-cooling-down") !== remainingSeconds > 0) elements.duel.classList.toggle("is-cooling-down", remainingSeconds > 0);
    setText(elements.duel, active ? "DUEL IN PROGRESS" : remainingSeconds > 0 ? `DUEL · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}` : "DUEL");
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
    // Under the online line, only while the player is in a challenge.
    const challenge = profile.aggroChallenge?.active ? "Aggro" : profile.prestigeChallenge?.active ? "Reflect Only" : "";
    const challengeLine = elements.window.querySelector<HTMLElement>("#playerProfileChallenge");
    if (challengeLine) { challengeLine.hidden = !challenge; challengeLine.textContent = challenge ? `In challenge - ${challenge}` : ""; }
    api.paintIcon(elements.icon, api.profileIcon(profile.identity), profile.identity);
    applyAvatarFrame(elements.icon, profile.identity);
    elements.icon.classList.toggle("is-editable", own); elements.icon.disabled = !own; elements.icon.setAttribute("aria-label", own ? "Edit profile" : `${profile.name}'s profile icon`);
    elements.editName.hidden = !own;
    if (elements.settings) elements.settings.hidden = !own;
    renderEquipment(profile);
    updatePreview(profile.identity, own);
    renderPower(api.formatPower(profile));
    elements.duel.hidden = own; elements.duel.dataset.identity = own ? "" : profile.identity; updateDuelButton();
    const lifetime = profile.lifetime;
    const hearts = elements.window.querySelector<HTMLElement>("#playerProfileHearts");
    if (hearts) hearts.textContent = (lifetime.chatHeartsReceived ?? 0).toLocaleString();
    elements.joined.textContent = new Date(lifetime.joinedAtMs).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    const activeSeconds = online ? Math.max(0, (Date.now() - lifetime.sessionStartedAtMs) / 1000) : 0;
    elements.timePlayed.textContent = api.formatPlayedTime(lifetime.playedSeconds + activeSeconds); elements.kills.textContent = Math.round(lifetime.enemyKills).toLocaleString();
    elements.online.textContent = presence; elements.online.style.color = online ? "#72ef58" : "#b7c5b7";
    // Remote bonuses arrive with the inspected profile subscription.
    const prestigeLevel = own ? api.prestigeLevel?.() ?? profile.prestigeLevel ?? 0 : profile.prestigeLevel ?? 0;
    elements.prestigeRow.hidden = prestigeLevel <= 0;
    elements.prestige.textContent = `${prestigeLevel} (${formatPercentMultiplier(Math.round(prestigeLevel * PRESTIGE_STAT_GAIN_PER_LEVEL * 100))} stat gain)`;
    if (elements.skillsPanel) renderProfileSkills(elements.skillsPanel, profileSkillRows(profile, own ? { mastery: api.weaponMastery?.(), crafts: api.craftExperience?.() } : undefined));
    if (elements.soulTier) renderProfileSoulTier(elements.soulTier, own ? api.rewardKills?.() ?? {} : undefined);
    api.renderStats(profile, elements.statGrid);
    loading.hide();
    showBonusesTab(own);
    for (const [, button, panel] of tabs()) panel.hidden = !button.classList.contains("is-active");
  }

  async function open(nextIdentity: string, fallbackName = "PLAYER") {
    if (!nextIdentity) return;
    const scroll = elements.window.querySelector<HTMLElement>(".player-profile-scroll");
    if (scroll) scroll.scrollTop = 0;
    const hearts = elements.window.querySelector<HTMLElement>("#playerProfileHearts");
    if (hearts) hearts.textContent = "0";
    identity = nextIdentity; profileData = null; elements.duel.hidden = nextIdentity === api.localIdentity(); elements.duel.dataset.identity = nextIdentity;
    elements.window.hidden = false; updateDuelButton(); api.renderName(elements.name, nextIdentity, fallbackName, api.playerGender(nextIdentity)); elements.guest.hidden = !api.isGuest(nextIdentity);
    const online = api.isOnline(nextIdentity); elements.presence.textContent = online ? "Online" : "CHECKING LAST SEEN"; elements.presence.classList.toggle("is-online", online);
    const challengeLine = elements.window.querySelector<HTMLElement>("#playerProfileChallenge"); if (challengeLine) challengeLine.hidden = true;
    api.paintIcon(elements.icon, api.profileIcon(nextIdentity), nextIdentity); applyAvatarFrame(elements.icon, nextIdentity); const own = nextIdentity === api.localIdentity(); elements.icon.classList.toggle("is-editable", own); elements.icon.disabled = !own; elements.editName.hidden = !own;
    if (elements.settings) elements.settings.hidden = !own;
    renderEquipment(null); updatePreview(nextIdentity, own); renderPower("—"); selectTab("stats"); showBonusesTab(own); loading.show();
    const cached = api.profile(nextIdentity); if (cached) { render(cached); if (own) return; }
    try {
      const loaded = await api.loadProfile(nextIdentity); if (nextIdentity !== identity) return;
      if (loaded) render(loaded); else loading.fail();
    } catch { if (nextIdentity === identity) loading.fail(); }
  }

  function close() {
    closeNameEditor(); actionsMenu.close(); elements.window.hidden = true; guildShown = null; elements.guest.hidden = true; identity = ""; profileData = null; renderEquipment(null); loading.hide(); api.releaseProfile();
  }

  function openNameEditor() {
    if (!identity || identity !== api.localIdentity()) return;
    editor.open();
  }
  function closeNameEditor() { editor.close(); }

  elements.infoTab.addEventListener("click", () => selectTab("info")); elements.statsTab.addEventListener("click", () => selectTab("stats"));
  elements.skillsTab?.addEventListener("click", () => selectTab("skills"));
  elements.bonusesTab?.addEventListener("click", () => selectTab("bonuses"));
  elements.more.addEventListener("click", () => actionsMenu.open(identity, profileData?.name || elements.name.textContent || "PLAYER"));
  elements.guild.addEventListener("click", () => { const id = elements.guild.dataset.guildId; if (id) { close(); api.openGuild(id); } });
  for (const slot of PROFILE_EQUIPMENT_SLOTS) equipmentElements[slot].addEventListener("click", () => inspectEquipment(slot));
  elements.close.addEventListener("click", close); elements.editName.addEventListener("click", openNameEditor);
  elements.duel.addEventListener("click", () => { const opponent = elements.duel.dataset.identity || ""; if (!opponent || elements.duel.disabled) return; elements.duel.disabled = true; void api.requestDuel(opponent).then((result) => { if (!result?.ok) api.showMessage(result?.error || "DUEL FAILED", "#ff9b91"); else close(); updateDuelButton(); }); });
  return { selectTab, render, open, close, drawPreview, openNameEditor, closeNameEditor, updateDuelButton, isOpen: () => !elements.window.hidden, isNameEditorOpen: editor.isOpen, identity: () => identity, profile: () => profileData };
}
