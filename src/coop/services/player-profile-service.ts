import type { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";
import { createEmptyResearchRanks } from "../../../shared/research";
import { normalizePlayerGender } from "../../../shared/player-gender";
import { resolvePlayerPresenceMap } from "./profile-presence";
import type { LeaderboardEntry, PlayerProfileData } from "../contracts";
import type { ProfileDirectory } from "./profile-directory";
import type { ProgressionService } from "./progression-service";

const SUBSCRIPTION_LOAD_TIMEOUT_MS = 10_000;

type PlayerProfileServiceDependencies = {
  connection: () => DbConnection | null;
  notify: () => void;
  localIdentity: () => string;
  localMapId: () => string | null | undefined;
  nearbyMapFor: (identity: string) => string | undefined;
  directory: ProfileDirectory;
  progression: ProgressionService;
  developerIdentityFor: (identity: string) => Identity | undefined;
};

type LeaderboardRow = {
  identity: Identity;
  displayName: string;
  profileIcon: number;
  power: number;
  powerLevel: number;
  damage: number;
  maxHp: number;
  armor: number;
  regen: number;
  playedMicros: bigint;
  isGuest: boolean;
  gender: number;
  skinTone?: number;
  headItem?: string;
  chestItem?: string;
  feetItem?: string;
  rightHandItem?: string;
  leftHandItem?: string;
};

function leaderboardEntryFromRow(row: LeaderboardRow): LeaderboardEntry {
  const identity = row.identity.toHexString();
  return {
    identity,
    name: row.displayName,
    gender: normalizePlayerGender(row.gender),
    power: row.powerLevel,
    damage: row.damage,
    maxHp: row.maxHp,
    armor: row.armor,
    regen: row.regen,
    playedSeconds: Number(row.playedMicros) / 1_000_000,
    isGuest: row.isGuest,
    skinTone: Number.isInteger(row.skinTone) ? Math.max(0, Math.min(19, Number(row.skinTone))) : 3,
    headItem: row.headItem ?? "",
    chestItem: row.chestItem ?? "",
    feetItem: row.feetItem ?? "",
    rightHandItem: row.rightHandItem ?? "",
    leftHandItem: row.leftHandItem ?? "",
  };
}

export function createPlayerProfileService(dependencies: PlayerProfileServiceDependencies) {
  const leaderboardEntries = new Map<string, LeaderboardEntry>();
  const profilePlayerMaps = new Map<string, string>();
  const playerProfileLoads = new Map<string, Promise<PlayerProfileData | null>>();
  let leaderboardSnapshotSubscription: { unsubscribe: () => void } | null = null;
  let leaderboardSnapshotLoad: Promise<LeaderboardEntry[]> | null = null;
  let cancelLeaderboardSnapshotLoad: (() => void) | null = null;
  let activeIdentity = "";
  let activeSubscription: { unsubscribe: () => void } | null = null;
  let cancelActiveLoad: (() => void) | null = null;

  function activePlayerMap(identity: string) {
    const nearbyMaps = { get: (key: string) => dependencies.nearbyMapFor(key) } as ReadonlyMap<string, string>;
    return resolvePlayerPresenceMap(
      identity,
      dependencies.localIdentity(),
      dependencies.localMapId(),
      profilePlayerMaps,
      nearbyMaps,
    );
  }

  function cachedPlayerProfile(identity: string): PlayerProfileData | null {
    const progress = dependencies.progression.progressFor(identity);
    const lifetime = dependencies.progression.lifetimeFor(identity);
    if (!progress || !lifetime) return null;
    return {
      identity,
      name: dependencies.directory.nameFor(identity) ?? "PLAYER",
      gender: dependencies.directory.genderFor(identity),
      progress: { ...progress },
      research: { ...dependencies.progression.researchFor(identity) ?? createEmptyResearchRanks() },
      itemUpgradeLevels: dependencies.progression.upgradeLevelsFor(identity),
      lifetime: { ...lifetime },
      mapId: activePlayerMap(identity) ?? undefined,
    };
  }

  function releasePlayerProfile() {
    activeSubscription?.unsubscribe();
    cancelActiveLoad?.();
    cancelActiveLoad = null;
    if (activeIdentity && activeIdentity !== dependencies.localIdentity()) {
      dependencies.progression.clearProfile(activeIdentity);
      profilePlayerMaps.delete(activeIdentity);
      playerProfileLoads.delete(activeIdentity);
    }
    activeSubscription = null;
    activeIdentity = "";
  }

  function loadPlayerProfile(identity: string): Promise<PlayerProfileData | null> {
    const existing = cachedPlayerProfile(identity);
    if (existing && (identity === dependencies.localIdentity() || identity === activeIdentity)) return Promise.resolve(existing);
    const loading = playerProfileLoads.get(identity);
    if (loading) return loading;
    const connection = dependencies.connection();
    const dbIdentity = dependencies.directory.identityFor(identity) ?? dependencies.developerIdentityFor(identity);
    if (!connection || !dbIdentity) return Promise.resolve(null);

    releasePlayerProfile();
    activeIdentity = identity;

    let settled = false;
    const request = new Promise<PlayerProfileData | null>((resolve) => {
      let timeoutId: number | null = null;
      const finish = (profile: PlayerProfileData | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        playerProfileLoads.delete(identity);
        if (cancelActiveLoad === cancel) cancelActiveLoad = null;
        resolve(profile);
      };
      const cancel = () => finish(null);
      cancelActiveLoad = cancel;
      activeSubscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (dependencies.connection() !== connection || activeIdentity !== identity) return finish(null);
          for (const row of connection.db.playerProgress.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertProgress(row);
          }
          for (const row of connection.db.playerLifetime.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertLifetime(row);
          }
          for (const row of connection.db.playerResearch.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertResearch(row);
          }
          for (const row of connection.db.playerItemUpgrade.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertItemUpgrade(row);
          }
          for (const row of connection.db.playerProfile.iter()) {
            if (row.identity.toHexString() === identity) dependencies.directory.tables.upsertProfile(row);
          }
          for (const row of connection.db.playerAccountStatus.iter()) {
            if (row.identity.toHexString() === identity) dependencies.directory.tables.upsertAccountStatus(row);
          }
          for (const row of connection.db.player.iter()) {
            if (row.identity.toHexString() !== identity) continue;
            if (row.isVisible) profilePlayerMaps.set(identity, row.mapId);
            else profilePlayerMaps.delete(identity);
          }
          finish(cachedPlayerProfile(identity));
        })
        .onError(() => finish(null))
        .subscribe([
          tables.playerProfile.where((profile) => profile.identity.eq(dbIdentity)),
          tables.playerAccountStatus.where((status) => status.identity.eq(dbIdentity)),
          tables.playerProgress.where((progress) => progress.identity.eq(dbIdentity)),
          tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dbIdentity)),
          tables.playerResearch.where((research) => research.identity.eq(dbIdentity)),
          tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dbIdentity)),
          tables.player.where((player) => player.identity.eq(dbIdentity)),
        ]);
      if (!settled) {
        timeoutId = window.setTimeout(() => {
          if (activeIdentity === identity) releasePlayerProfile();
          else finish(null);
        }, SUBSCRIPTION_LOAD_TIMEOUT_MS);
      }
    });
    playerProfileLoads.set(identity, request);
    if (settled) playerProfileLoads.delete(identity);
    return request;
  }

  function loadLeaderboardSnapshot(): Promise<LeaderboardEntry[]> {
    if (leaderboardSnapshotLoad) return leaderboardSnapshotLoad;
    const connection = dependencies.connection();
    if (!connection) return Promise.resolve([]);

    let settled = false;
    const request = new Promise<LeaderboardEntry[]>((resolve) => {
      let subscription: { unsubscribe: () => void } | null = null;
      let unsubscribeAfterSubscribe = false;
      let timeoutId: number | null = null;
      const release = () => {
        if (subscription) {
          const current = subscription;
          current.unsubscribe();
          subscription = null;
          if (leaderboardSnapshotSubscription === current) leaderboardSnapshotSubscription = null;
        } else {
          unsubscribeAfterSubscribe = true;
        }
      };
      const finish = (entries: LeaderboardEntry[]) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        leaderboardSnapshotLoad = null;
        cancelLeaderboardSnapshotLoad = null;
        release();
        resolve(entries);
      };
      cancelLeaderboardSnapshotLoad = () => finish([]);
      timeoutId = window.setTimeout(() => finish([]), SUBSCRIPTION_LOAD_TIMEOUT_MS);

      subscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (dependencies.connection() !== connection) return finish([]);
          leaderboardEntries.clear();
          for (const row of connection.db.leaderboardEntry.iter()) {
            const entry = leaderboardEntryFromRow(row);
            leaderboardEntries.set(entry.identity, entry);
            dependencies.directory.rememberPresentation({
              identity: entry.identity,
              identityValue: row.identity,
              displayName: entry.name,
              profileIcon: row.profileIcon,
              skinTone: entry.skinTone,
              gender: entry.gender,
              isGuest: entry.isGuest,
            });
          }
          dependencies.notify();
          finish([...leaderboardEntries.values()]);
        })
        .onError(() => finish([]))
        .subscribe([tables.leaderboardEntry]);
      leaderboardSnapshotSubscription = subscription;
      if (unsubscribeAfterSubscribe) release();
    });
    leaderboardSnapshotLoad = request;
    if (settled) leaderboardSnapshotLoad = null;
    return request;
  }

  return {
    api: {
      leaderboardEntries() {
        return [...leaderboardEntries.values()].map((entry) => ({
          ...entry,
          isGuest: dependencies.directory.guestFor(entry.identity) ?? entry.isGuest,
        }));
      },
      loadLeaderboardSnapshot,
      playerProfile(identity = dependencies.localIdentity()) {
        const profile = cachedPlayerProfile(identity);
        return profile
          ? { ...profile, progress: { ...profile.progress }, itemUpgradeLevels: { ...profile.itemUpgradeLevels }, lifetime: { ...profile.lifetime } }
          : null;
      },
      activePlayerMap(identity = dependencies.localIdentity()) {
        return activePlayerMap(identity);
      },
      loadPlayerProfile,
      releasePlayerProfile,
    },
    activeIdentity: () => activeIdentity,
    isActive: (identity: string) => activeIdentity === identity,
    hasLeaderboard: (identity: string) => leaderboardEntries.has(identity),
    activeSubscriptionCount: () => Number(Boolean(activeSubscription)),
    observePlayerMap(identity: string, mapId: string, visible = true) {
      if (activeIdentity !== identity) return false;
      if (visible) profilePlayerMaps.set(identity, mapId);
      else profilePlayerMaps.delete(identity);
      return true;
    },
    forgetPlayerMap(identity: string) {
      return profilePlayerMaps.delete(identity);
    },
    loadLeaderboardSnapshot,
    clearSession() {
      releasePlayerProfile();
      cancelLeaderboardSnapshotLoad?.();
      leaderboardSnapshotSubscription?.unsubscribe();
      leaderboardSnapshotSubscription = null;
      leaderboardSnapshotLoad = null;
      cancelLeaderboardSnapshotLoad = null;
      leaderboardEntries.clear();
      profilePlayerMaps.clear();
      playerProfileLoads.clear();
    },
  };
}

export type PlayerProfileService = ReturnType<typeof createPlayerProfileService>;
