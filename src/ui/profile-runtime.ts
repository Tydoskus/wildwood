import { formatArmorReduction } from "../game/combat";
import type { SoulStats } from "../../shared/soul-dimension";
import type { PlayerProfileData } from "../coop/contracts";
import type { InventoryState } from "../game/inventory";
import type { CoopAccess } from "../game/runtime/coop-access";
import type { createGameBootstrapAssets } from "../game/runtime/game-bootstrap";
import type { createPlayerIdentityRenderer } from "../game/runtime/render/player-identity-renderer";
import type { createGameElements } from "./game-elements";
import type { createInventoryController } from "./inventory-controller";
import type { createItemInspectionController } from "./item-inspection-controller";
import { formatCompactNumber } from "./number-format";
import { createPlayerSafetyController } from "./player-safety-controller";
import type { createPrestigeExpansionRuntime } from "./prestige-expansion-runtime";
import { formatPlayedTime, profileAttackCap, profileInPlay, profilePower, profilePrestigeStatLevel, profilePresenceText, profileSoulInPlay, renderProfileStats } from "./profile";
import { profileBonusDeps } from "./profile-bonus-toggles";
import { createProfileWindowController } from "./profile-window-controller";
import { createGuildLookup } from "./profile-guild";
import { playerGuildTag } from "../app/player-name-tags";

type BootstrapAssets = ReturnType<typeof createGameBootstrapAssets>;
type IdentityRenderer = ReturnType<typeof createPlayerIdentityRenderer>;
type NameSaveResult = { ok?: boolean; error?: string } | undefined;

export type ProfileRuntimeDeps = {
  coop: CoopAccess;
  e: ReturnType<typeof createGameElements>;
  inventory: InventoryState;
  isDueling: () => boolean;
  soulInPlay: () => SoulStats | null;
  /** The map's name for "Online - <map>", or "" for one this client does not know. */
  mapName: (mapId: string | undefined) => string;
  powerForEquipment: (equipment: InventoryState) => number;
  profileCharacterPreview: BootstrapAssets["profileCharacterPreview"];
  inventoryCharacterPreview: BootstrapAssets["inventoryCharacterPreview"];
  applyProfileIcon: IdentityRenderer["applyProfileIcon"];
  renderName: IdentityRenderer["renderDomPlayerName"];
  expansionNotice: ReturnType<typeof createPrestigeExpansionRuntime>;
  runPrestige: () => Promise<unknown>;
  openIconPicker: () => void;
  chat: () => { minimize: () => void; openPrivate: (name: string, identity?: string) => void };
  guildPanel: () => { close: () => void; openGuildPreview: (id: string) => void } | undefined;
  clearInput: () => void;
  itemInspection: ReturnType<typeof createItemInspectionController>;
  destructionActions: ReturnType<typeof createInventoryController>["destructionActions"];
  showMessage: (text: string, color?: string) => void;
};

/** Player profiles: the profile window, its block and report actions, the prestige panel, and display-name saves. */
export function createProfileRuntime(deps: ProfileRuntimeDeps) {
  const { coop, e, showMessage } = deps;
  const client = coop.client;

  const playerSafety = createPlayerSafetyController({
    blockedSetting: e.blockedPlayersSetting, blockedList: e.blockedPlayersList,
  }, {
    localIdentity: coop.identity,
    isBlocked: coop.isPlayerBlocked,
    blockedPlayers: () => client?.blockedPlayers?.() ?? [],
    setBlocked: async (identity, blocked) => await client?.setPlayerBlocked?.(identity, blocked) ?? { ok: false, error: "NOT CONNECTED" },
    report: async (identity, reason, note) => await client?.reportPlayer?.(identity, reason, note) ?? { ok: false, error: "NOT CONNECTED" },
    showMessage,
    onChanged: () => profileWindow.updateDuelButton(),
    beforeOpen: () => { deps.guildPanel()?.close(); deps.clearInput(); },
  });

  // The tutorial waits for the name it just asked for before moving on.
  let pendingNameSave: Promise<NameSaveResult> | undefined;
  function saveProfileName(name: string, expectedCost = 0) {
    const request = Promise.resolve(client?.setDisplayName?.(name, expectedCost));
    pendingNameSave = request;
    return request.finally(() => { if (pendingNameSave === request) pendingNameSave = undefined; });
  }

  const guildLookup = createGuildLookup(() => client?.guild);
  const prestigePanel = deps.expansionNotice.createPanel({ e, showMessage, runPrestige: deps.runPrestige });
  const ownSoulInPlay = (profile: PlayerProfileData) => coop.isLocal(profile.identity) ? deps.soulInPlay() : profileSoulInPlay(profile);
  const profileWindow = createProfileWindowController({
    window: e.playerProfileEl, name: e.playerProfileNameEl, guest: e.playerProfileGuestLabel, presence: e.playerProfilePresenceEl,
    power: e.playerProfilePowerEl, icon: e.playerProfileIcon, loading: e.playerProfileLoadingEl,
    infoTab: e.profileInfoTab, statsTab: e.profileStatsTab, infoPanel: e.profileInfoPanel, statsPanel: e.profileStatsPanel,
    bonusesTab: e.profileBonusesTab, bonusesPanel: e.profileBonusesPanel, bonuses: profileBonusDeps(() => client, deps.isDueling),
    joined: e.profileJoinedEl, timePlayed: e.profileTimePlayedEl, kills: e.profileKillsEl, online: e.profileOnlineEl, statGrid: e.profileStatGrid,
    close: e.closePlayerProfileBtn, editName: e.editPlayerNameBtn, editor: e.profileEditor,
    preview: e.profileCharacterPreviewEl, equipmentHead: e.profileEquippedHeadSlot, equipmentChest: e.profileEquippedChestSlot,
    equipmentFeet: e.profileEquippedFeetSlot, equipmentRightHand: e.profileEquippedRightHandSlot,
    previousSprite: e.previousPlayerSpriteBtn, nextSprite: e.nextPlayerSpriteBtn,
    duel: e.profileDuelBtn,
    settings: e.settingsBtn, more: e.profileMoreBtn, guild: e.playerProfileGuild,
    prestigeRow: e.profilePrestigeRow, prestige: e.profilePrestige, skillsTab: e.profileSkillsTab, skillsPanel: e.profileSkillsPanel,
    soulTier: e.profileSoulTier,
  }, {
    isBlocked: coop.isPlayerBlocked,
    openSafety: playerSafety.open,
    guildTag: playerGuildTag, findGuild: guildLookup.find,
    guildInvite: {
      available: identity => client?.social?.canInviteToGuild?.() === true && !playerGuildTag(identity),
      send: async identity => await client?.social?.inviteToGuild?.(identity) ?? { ok: false, error: "Not Connected" },
    },
    openGuild: id => deps.guildPanel()?.openGuildPreview(id),
    openPrivateChat: (identity, name) => deps.chat().openPrivate(name, identity),
    onOwnProfile: (own: boolean) => prestigePanel.refresh(own),
    prestigeLevel: coop.prestigeLevel,
    weaponMastery: () => client?.weaponMastery?.(),
    craftExperience: () => client?.craftSkills?.(), rewardKills: () => client?.rewardKills?.(),
    localIdentity: coop.localIdentity, localDisplayName: coop.localDisplayName, profileIcon: coop.profileIcon, paintIcon: deps.applyProfileIcon,
    renderName: deps.renderName,
    isGuest: coop.isGuest,
    isOnline: identity => coop.isLocal(identity)
      ? coop.connected()
      : Boolean(client?.activePlayerMap?.(identity)) || coop.remotePlayers().some(other => other.id === identity),
    presenceText: (profile, online) => {
      const mapName = deps.mapName(profile.mapId);
      return online && mapName ? `Online - ${mapName}` : profilePresenceText(online, profile.lifetime.sessionStartedAtMs);
    },
    renderCharacter: (identity, progress, visible) => deps.profileCharacterPreview.draw({ visible, progress, skinTone: coop.skinTone(identity) }),
    skinTone: coop.skinTone, setSkinTone: async value => client?.setSkinTone?.(value),
    playerGender: coop.playerGender, setGender: async value => client?.setGender?.(value), openIconPicker: deps.openIconPicker,
    nameColor: identity => client?.nameColor?.(identity) ?? 0, setNameColor: async value => client?.setNameColor?.(value),
    renderStats: (profile, element) => {
      // Your own profile shows the stats in play now; anyone else's, theirs in play as the server counts them.
      const own = coop.isLocal(profile.identity), theirs = own ? null : profileInPlay(profile);
      return renderProfileStats(profile, element, formatArmorReduction,
        own ? coop.attackCap() : profileAttackCap(profile),
        own ? client?.researchInPlay?.() ?? profile.research : theirs?.research ?? profile.research,
        own ? (client?.prestigeStatGainInPlay?.() === false ? 0 : coop.prestigeLevel()) : profilePrestigeStatLevel(profile),
        own ? client?.prestigePerks?.() : theirs?.perks,
        own ? client?.weeklyQuests?.()?.bonus ?? 1 : profile.questBonus ?? 1,
        ownSoulInPlay(profile));
    },
    formatPower: profile => formatCompactNumber(profilePower(profile, ownSoulInPlay(profile))),
    formatPlayedTime,
    profile: identity => client?.playerProfile?.(identity),
    loadProfile: async identity => client?.loadPlayerProfile?.(identity),
    releaseProfile: () => { client?.releasePlayerProfile?.(); },
    isDueling: deps.isDueling, duelCooldownMs: () => client?.duelCooldownRemainingMs?.() ?? 0,
    requestDuel: async identity => {
      deps.chat().minimize();
      const result = await client?.requestDuel?.(identity);
      if (result?.ok) deps.guildPanel()?.close();
      return result;
    },
    isNameTaken: name => client?.isDisplayNameTaken?.(name) ?? false,
    getNameChangeStatus: async () => client?.getNameChangeStatus?.(),
    setDisplayName: saveProfileName,
    itemInspection: deps.itemInspection, destructionActions: deps.destructionActions, showMessage,
  });

  new ResizeObserver(() => { if (deps.profileCharacterPreview.resize()) profileWindow.drawPreview(); }).observe(e.profileCharacterCanvas);
  new ResizeObserver(() => {
    if (!e.inventoryPanel.hidden && deps.inventoryCharacterPreview.resize()) {
      deps.inventoryCharacterPreview.draw({
        visible: true, inventory: deps.inventory, power: deps.powerForEquipment(deps.inventory), skinTone: coop.skinTone(),
      });
    }
  }).observe(e.inventoryCharacterCanvas);

  return {
    playerSafety, prestigePanel, profileWindow, saveProfileName,
    /** Settles once the display name being saved, if any, has been answered. */
    async waitForNameSave() {
      try { await pendingNameSave; } catch {}
    },
  };
}
