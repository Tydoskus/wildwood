import { updatePlayerNameTag, removePlayerNameTag, clearPlayerNameTags, developerNameTagVisible, playerNamePrefix, playerNameTagsRevision } from "../../app/player-name-tags";
import type { Identity } from "spacetimedb";
import {
  NAME_ADJECTIVES,
  NAME_CREATURES,
} from "../../../shared/rules";
import {
  PLAYER_GENDER_UNSET,
  normalizePlayerGender,
  type PlayerGender,
} from "../../../shared/player-gender";
import type { ReducerPort } from "../ports";
import { createChatPortraits } from "./chat-portraits";
import { createPatreonService } from "./patreon-service";
import { clearAvatarFrames } from "../../app/avatar-frames";
import { PROFILE_ICON_SNAPSHOT, encodeProfileIcon, isSnapshotProfileIcon, normalizeProfileIcon, profileIconBackground } from "../../../shared/profile-icons";
import { createProfileSnapshots } from "./profile-snapshots";
import { preloadProfileIcons } from "../../app/profile-icon-preload";

export type ProfilePresentation = {
  identity: string;
  identityValue: Identity;
  displayName: string;
  profileIcon?: number;
  playerSprite?: number;
  skinTone?: number;
  gender?: number;
  isGuest?: boolean;
};

type ProfileDirectoryDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  localIsGuestFallback: () => boolean;
  shouldRetain: (identity: string) => boolean;
  renameRemotePlayer: (identity: string, displayName: string) => void;
  rememberCharacter: (displayName: string) => void;
  rememberGender: (gender: PlayerGender) => void;
  completeAccountReturn: () => void;
  markChatPresentationChanged: () => void;
};

type ProfileRow = {
  identity: Identity;
  displayName: string;
  profileIcon: number;
  playerSprite?: number;
  skinTone?: number;
  gender?: number;
};

export function generatedDisplayName(identity: string) {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const adjective = NAME_ADJECTIVES[(hash >>> 0) % NAME_ADJECTIVES.length];
  const creature = NAME_CREATURES[((hash >>> 8) >>> 0) % NAME_CREATURES.length];
  const number = String((hash >>> 16) % 1000).padStart(3, "0");
  return `${adjective} ${creature} ${number}`;
}

export function isGeneratedDisplayName(displayName: string) {
  const [adjective, creature, suffix, ...extra] = displayName.split(" ");
  return extra.length === 0 &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_CREATURES.includes(creature) &&
    /^\d{3}$/.test(suffix ?? "");
}

export function createProfileDirectory(dependencies: ProfileDirectoryDependencies) {
  const patreon = createPatreonService(dependencies.reducers, dependencies.localIdentity);
  const names = new Map<string, string>();
  const icons = new Map<string, number>();
  const sprites = new Map<string, number>();
  const skinTones = new Map<string, number>();
  const genders = new Map<string, PlayerGender>();
  const identities = new Map<string, Identity>();
  const guests = new Map<string, boolean>();
  const chatPortraits = createChatPortraits({
    connection: () => dependencies.reducers?.connection() ?? null,
    changed: () => { dependencies.markChatPresentationChanged(); dependencies.notify(); },
  });
  const snapshots = createProfileSnapshots({
    connection: () => dependencies.reducers?.connection() ?? null,
    changed: () => dependencies.notify(),
  });
  let localDisplayName = "";
  let localReady = false;
  function trimPresentations() {
    if (identities.size <= 2048) return;
    for (const identity of identities.keys()) {
      if (identity === dependencies.localIdentity() || dependencies.shouldRetain(identity)) continue;
      identities.delete(identity); names.delete(identity); icons.delete(identity); sprites.delete(identity);
      skinTones.delete(identity); genders.delete(identity); guests.delete(identity);
      if (identities.size <= 2048) break;
    }
  }

  function rememberPresentation(presentation: ProfilePresentation) {
    identities.delete(presentation.identity);
    identities.set(presentation.identity, presentation.identityValue);
    names.set(presentation.identity, presentation.displayName);
    if (presentation.profileIcon !== undefined) {
      const icon = normalizeProfileIcon(Number(presentation.profileIcon));
      // A player who just switched to their snapshot has likely just taken it: fetch it fresh.
      if (isSnapshotProfileIcon(icon) && icons.has(presentation.identity) && icons.get(presentation.identity) !== icon) snapshots.refresh(presentation.identity);
      icons.set(presentation.identity, icon);
      chatPortraits.remember(presentation.identity, icon);
    }
    if (presentation.playerSprite !== undefined) {
      sprites.set(presentation.identity, Math.max(0, Math.min(3, Number(presentation.playerSprite) || 0)));
    }
    if (presentation.skinTone !== undefined) {
      const requested = Number(presentation.skinTone);
      skinTones.set(presentation.identity, Number.isFinite(requested) ? Math.max(0, Math.min(19, Math.floor(requested))) : 3);
    }
    if (presentation.gender !== undefined) genders.set(presentation.identity, normalizePlayerGender(presentation.gender));
    if (presentation.isGuest !== undefined) guests.set(presentation.identity, presentation.isGuest);
    trimPresentations();
  }

  function upsertProfile(row: ProfileRow) {
    const identity = row.identity.toHexString();
    const gender = normalizePlayerGender(row.gender);
    rememberPresentation({
      identity,
      identityValue: row.identity,
      displayName: row.displayName,
      profileIcon: row.profileIcon,
      playerSprite: row.playerSprite,
      skinTone: row.skinTone,
      gender,
    });
    if (identity === dependencies.localIdentity()) {
      patreon.sync();
      localDisplayName = row.displayName;
      localReady = true;
      dependencies.rememberCharacter(row.displayName);
      dependencies.rememberGender(gender);
      dependencies.completeAccountReturn();
    }
    dependencies.renameRemotePlayer(identity, row.displayName);
    dependencies.markChatPresentationChanged();
    dependencies.notify();
  }

  function removeProfile(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    if (dependencies.shouldRetain(identity)) return;
    names.delete(identity);
    icons.delete(identity);
    sprites.delete(identity);
    skinTones.delete(identity);
    genders.delete(identity);
    if (identity === dependencies.localIdentity()) {
      localDisplayName = "";
      localReady = false;
    }
    dependencies.markChatPresentationChanged();
    dependencies.notify();
  }

  function upsertAccountStatus(row: { identity: Identity; isGuest: boolean }) {
    guests.set(row.identity.toHexString(), row.isGuest);
    dependencies.markChatPresentationChanged();
    dependencies.notify();
  }

  function removeAccountStatus(row: { identity: Identity }) {
    const identity = row.identity.toHexString();
    if (dependencies.shouldRetain(identity)) return;
    guests.delete(identity);
    dependencies.markChatPresentationChanged();
    dependencies.notify();
  }

  return {
    tables: { upsertProfile, removeProfile, upsertAccountStatus, removeAccountStatus,
      upsertNameTag(row: { identity: Identity; guildTag: string; showDevTag: boolean }) {
        updatePlayerNameTag(row.identity.toHexString(), row);
        dependencies.markChatPresentationChanged(); dependencies.notify();
      },
      removeNameTag(row: { identity: Identity }) {
        removePlayerNameTag(row.identity.toHexString());
        dependencies.markChatPresentationChanged(); dependencies.notify();
      },
    },
    api: {
      ...patreon.api,
      playerNamePrefix, playerNameTagsRevision,
      developerNameTagVisible: () => developerNameTagVisible(dependencies.localIdentity()),
      async setDeveloperNameTag(visible: boolean) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        try { await connection.reducers.setDeveloperNameTag({ visible }); return { ok: true }; }
        catch (error) { return { ok: false, error: dependencies.reducers.errorMessage(error) }; }
      },
      localDisplayName: () => localDisplayName,
      hasChosenDisplayName: () => localReady && Boolean(localDisplayName) && localDisplayName !== generatedDisplayName(dependencies.localIdentity()),
      playerDisplayName(identity: string) {
        return names.get(identity) ?? generatedDisplayName(identity);
      },
      isDisplayNameTaken(displayName: string) {
        const normalized = displayName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
        return [...names].some(([identity, name]) => identity !== dependencies.localIdentity() && name.toLocaleLowerCase() === normalized);
      },
      profileIcon(identity = dependencies.localIdentity()) {
        const sender = identities.get(identity);
        if (sender && identity !== dependencies.localIdentity()) chatPortraits.request(sender);
        return chatPortraits.icon(identity) ?? icons.get(identity) ?? 0;
      },
      async prepareChatPortraits(senders: readonly string[]) {
        await chatPortraits.ready(senders);
        await preloadProfileIcons(senders.map(sender => chatPortraits.icon(sender) ?? icons.get(sender) ?? 0));
      },
      playerSprite(identity = dependencies.localIdentity()) {
        return sprites.get(identity) ?? 0;
      },
      skinTone(identity = dependencies.localIdentity()) {
        return skinTones.get(identity) ?? 3;
      },
      playerGender(identity = dependencies.localIdentity()) {
        return genders.get(identity) ?? PLAYER_GENDER_UNSET;
      },
      localProfileReady: () => localReady,
      isGuest(identity = dependencies.localIdentity()) {
        return guests.get(identity) ?? (identity === dependencies.localIdentity() ? dependencies.localIsGuestFallback() : false);
      },
      async getNameChangeStatus() {
        if (dependencies.reducers.protocolBlocked()) throw new Error("UPDATE REQUIRED");
        const connection = dependencies.reducers.connection();
        if (!connection) throw new Error("NOT CONNECTED");
        const identity = dependencies.localIdentity();
        const status = await connection.procedures.getNameChangeStatus({});
        if (identity !== dependencies.localIdentity() || connection !== dependencies.reducers.connection()) throw new Error("Connection changed. Reopen the name editor.");
        return status;
      },
      async setDisplayName(displayName: string, expectedCost = 0) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        try {
          const identity = dependencies.localIdentity();
          await dependencies.reducers.runWorldReducer(() => expectedCost === 0
            ? connection.reducers.setDisplayName({ displayName })
            : connection.reducers.changeDisplayName({ displayName, expectedCost }));
          if (identity === dependencies.localIdentity()) {
            localDisplayName = displayName.trim().replace(/\s+/g, " ");
            names.set(identity, localDisplayName);
            dependencies.rememberCharacter(localDisplayName);
            dependencies.notify();
          }
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("display-name update", error);
          console.warn("WildStat display-name update rejected:", message);
          return { ok: false, error: message };
        }
      },
      async setProfileIcon(profileIcon: number) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const normalized = normalizeProfileIcon(profileIcon);
        const identity = dependencies.localIdentity();
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setProfileIcon({ profileIcon: normalized }));
          if (identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) {
            icons.set(identity, normalized); chatPortraits.remember(identity, normalized);
            dependencies.markChatPresentationChanged(); dependencies.notify();
          }
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("profile icon update", error);
          return { ok: false, error: message };
        }
      },
      /** A player's snapshotted look, fetched on first ask; undefined until it arrives or when there is none. */
      profileSnapshot(identity = dependencies.localIdentity()) {
        return snapshots.look(identity);
      },
      profileSnapshotsRevision: () => snapshots.revision(),
      /** Freezes the character as it looks now and makes it the profile picture. The server reads the look itself. */
      async snapshotProfileCharacter() {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const identity = dependencies.localIdentity();
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.snapshotProfileCharacter({}));
          if (identity === dependencies.localIdentity() && connection === dependencies.reducers.connection()) {
            const icon = encodeProfileIcon(PROFILE_ICON_SNAPSHOT, profileIconBackground(icons.get(identity) ?? 0));
            icons.set(identity, icon); chatPortraits.remember(identity, icon);
            snapshots.refresh(identity);
            dependencies.markChatPresentationChanged(); dependencies.notify();
          }
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("profile snapshot", error);
          return { ok: false, error: message };
        }
      },
      async setGender(gender: number) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const normalized = normalizePlayerGender(gender);
        if (normalized !== gender) return { ok: false, error: "INVALID GENDER" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setGender({ gender: normalized }));
          genders.set(dependencies.localIdentity(), normalized);
          dependencies.rememberGender(normalized);
          dependencies.markChatPresentationChanged();
          dependencies.notify();
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("gender update", error);
          return { ok: false, error: message };
        }
      },
      async setPlayerSprite(playerSprite: number) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const normalized = Math.max(0, Math.min(3, Math.floor(playerSprite)));
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setPlayerSprite({ playerSprite: normalized }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("player-sprite update", error);
          return { ok: false, error: message };
        }
      },
      async setSkinTone(skinTone: number) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        const connection = dependencies.reducers.connection();
        if (!connection) return { ok: false, error: "NOT CONNECTED" };
        const normalized = Math.max(0, Math.min(19, Math.floor(skinTone)));
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setSkinTone({ skinTone: normalized }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("skin-tone update", error);
          return { ok: false, error: message };
        }
      },
    },
    identityFor: (identity: string) => identities.get(identity),
    nameFor: (identity: string) => names.get(identity),
    genderFor: (identity: string) => genders.get(identity) ?? PLAYER_GENDER_UNSET,
    guestFor: (identity: string) => guests.get(identity),
    rememberPresentation,
    rememberChatSender(sender: { identity: string; identityValue: Identity; name: string; isGuest: boolean }) {
      identities.delete(sender.identity);
      identities.set(sender.identity, sender.identityValue);
      if (!names.has(sender.identity)) names.set(sender.identity, sender.name);
      if (!guests.has(sender.identity)) guests.set(sender.identity, sender.isGuest);
      if (sender.identity !== dependencies.localIdentity()) chatPortraits.request(sender.identityValue);
      trimPresentations();
    },
    prepareSession(displayName: string) {
      localReady = false;
      localDisplayName = displayName;
    },
    clearSession() {
      patreon.clear(); clearAvatarFrames();
      chatPortraits.clear(); snapshots.clear();
      clearPlayerNameTags();
      names.clear();
      icons.clear();
      sprites.clear();
      skinTones.clear();
      genders.clear();
      identities.clear();
      guests.clear();
      localReady = false;
    },
  };
}

export type ProfileDirectory = ReturnType<typeof createProfileDirectory>;
