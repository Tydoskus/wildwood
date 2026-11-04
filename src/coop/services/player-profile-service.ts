import { isDeveloperIdentity } from "../../../shared/developer-identity";
import { withRequestDeadline } from "./request-deadline";
import { unsubscribeIfActive, type ActiveSubscription } from "./subscription-handoff";
import type { LeaderboardBoard, LeaderboardPage, LeaderboardStat } from "../../../shared/leaderboard-window";
import { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";
import { createEmptyResearchRanks } from "../../../shared/research";
import { cleanSoulStats } from "../../../shared/soul-dimension";
import { normalizePlayerGender } from "../../../shared/player-gender";
import { resolvePlayerPresenceMap } from "./profile-presence";
import { withWideProgress } from "./wide-progress";
import { activeCardsOfRow } from "../../../shared/active-cards";
import { parseBonusOff } from "../../../shared/bonus-toggles";
import { isWeaponSchool, masteryLevel, type WeaponSchool } from "../../../shared/weapon-mastery";
import { CRAFT_SKILLS, craftLevel, type CraftSkill } from "../../../shared/crafting";
import { fishingLevel } from "../../../shared/fishing";
import { daggerSkillsOf, isSkillDagger } from "../../../shared/dagger-skills";
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
  const questBonuses = new Map<string, number>();
  let leaderboardGeneration = 0;
  const leaderboardRequests = new Map<LeaderboardStat, Promise<LeaderboardEntry[]>>();
  const leaderboardPages = new Map<string, Promise<LeaderboardPage<LeaderboardEntry>>>();
  let activeIdentity = "";
  let activeSubscription: ActiveSubscription | null = null;
  let profileGeneration = 0;
  let cancelActiveLoad: (() => void) | null = null;
  let detachPresence: (() => void) | null = null;

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

  /** A player's weapon rolls: our own from my_weapon_stats, another's from the profile's player_weapon_stat subscription. */
  function weaponStatRows(identity: string) {
    const db = dependencies.connection()?.db;
    return identity === dependencies.localIdentity() ? [...(db?.myWeaponStats?.iter() ?? [])]
      : [...(db?.playerWeaponStat?.iter() ?? [])].filter(row => row.identity.toHexString() === identity);
  }

  function cachedPlayerProfile(identity: string): PlayerProfileData | null {
    const progress = dependencies.progression.progressFor(identity);
    const lifetime = dependencies.progression.lifetimeFor(identity);
    if (!progress || !lifetime) return null;
    return {
      identity,
      prestigeChallenge: (() => { const row = [...(dependencies.connection()?.db.playerPrestigeChallenge.iter() ?? [])].find(row => row.identity.toHexString() === identity); return { active: row?.active ?? false, completed: row?.completed ?? 0 }; })(),
      aggroChallenge: (() => { const row = [...(dependencies.connection()?.db.playerAggroChallenge?.iter() ?? [])].find(row => row.identity.toHexString() === identity); return { active: row?.active ?? false, completed: row?.completed ?? 0 }; })(),
      prestigeLevel: [...(dependencies.connection()?.db.playerPrestige.iter() ?? [])].find(row => row.identity.toHexString() === identity)?.level ?? 0,
      questBonus: questBonuses.get(identity),
      prestigePerks: (() => {
        const row = [...(dependencies.connection()?.db.playerPrestigePerk.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        const expansion = [...(dependencies.connection()?.db.playerPrestigeExpansionPerk.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        const cards = [...(dependencies.connection()?.db.playerPrestigeCardPerk?.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        return { keenEdge: row?.keenEdge ?? 0, doubleStrike: row?.doubleStrike ?? 0, splitShot: row?.splitShot ?? 0, riposte: row?.riposte ?? 0,
          bossSlayer: expansion?.bossSlayer ?? 0, secondWind: expansion?.secondWind ?? 0, longShot: expansion?.longShot ?? 0, fleetFoot: expansion?.fleetFoot ?? 0,
          quickDraw: expansion?.quickDraw ?? 0, weaponCards: cards?.weaponCards ?? 0, helmetCards: cards?.helmetCards ?? 0, armorCards: cards?.armorCards ?? 0 };
      })(),
      soulStats: (() => { const row = [...(dependencies.connection()?.db.profileSoulStats?.iter() ?? [])].find(row => row.identity.toHexString() === identity); return row ? cleanSoulStats(row) : null; })(),
      bonusOff: (() => { const row = [...(dependencies.connection()?.db.playerBonusToggle?.iter() ?? [])].find(row => row.identity.toHexString() === identity); return [...parseBonusOff(row?.off)]; })(),
      name: dependencies.directory.nameFor(identity) ?? "PLAYER",
      gender: dependencies.directory.genderFor(identity),
      progress: { ...progress },
      research: { ...dependencies.progression.researchFor(identity) ?? createEmptyResearchRanks() },
      itemUpgradeLevels: dependencies.progression.upgradeLevelsFor(identity),
      // Our own come through my_item_refines; another player's through the profile's player_item_refine subscription.
      itemRefines: (() => {
        const db = dependencies.connection()?.db;
        const rows = identity === dependencies.localIdentity() ? [...(db?.myItemRefines?.iter() ?? [])]
          : [...(db?.playerItemRefine?.iter() ?? [])].filter(row => row.identity.toHexString() === identity);
        return Object.fromEntries(rows.map(row => [row.itemId, row.level]));
      })(),
      // Their weapons' rolled speed and crit (first copies).
      weaponStats: Object.fromEntries(weaponStatRows(identity).filter(row => !row.copyId && !row.offerId)
        .map(row => [row.itemId, { attackSpeed: row.attackSpeed, critDamage: row.critDamage }])),
      // Their looks' kept refines, from my_cosmetic_refines or the profile's player_cosmetic_refine subscription.
      cosmeticRefines: (() => {
        const db = dependencies.connection()?.db;
        const rows = identity === dependencies.localIdentity() ? [...(db?.myCosmeticRefines?.iter() ?? [])]
          : [...(db?.playerCosmeticRefine?.iter() ?? [])].filter(row => row.identity.toHexString() === identity);
        return Object.fromEntries(rows.map(row => [row.itemId, row.level]));
      })(),
      // Their active cards, from my_active_cards or the profile's player_active_card subscription.
      activeCards: (() => {
        const db = dependencies.connection()?.db;
        const rows = identity === dependencies.localIdentity() ? [...(db?.myActiveCards?.iter() ?? [])]
          : [...(db?.playerActiveCard?.iter() ?? [])].filter(row => row.identity.toHexString() === identity);
        return activeCardsOfRow(rows[0]);
      })(),
      wornSkill: ((): { itemId: string; roll: Record<string, number> } | null => {
        const db = dependencies.connection()?.db;
        // A dagger's skills are its first copy's weapon roll row.
        const weapon = progress.equippedRightHand || progress.equippedLeftHand || "";
        if (isSkillDagger(weapon)) {
          const row = weaponStatRows(identity).find(row => row.itemId === weapon && !row.copyId && !row.offerId);
          return row ? { itemId: weapon, roll: daggerSkillsOf(row) } : null;
        }
        // Your own weapon reads its roll from my_bow_skills / my_sword_skills / my_staff_skills; another player's
        // from player_worn_skill, or player_worn_staff_skill for a staff.
        if (identity === dependencies.localIdentity()) {
          const weapon = progress.equippedRightHand || progress.equippedLeftHand || "";
          const staff = [...(db?.myStaffSkills?.iter() ?? [])].find(row => row.itemId === weapon && !row.copyId && !row.offerId);
          if (staff) return { itemId: weapon, roll: { meteor: staff.meteor, chain: staff.chain, frostNova: staff.frostNova } };
          const own = [...(db?.myBowSkills?.iter() ?? []), ...(db?.mySwordSkills?.iter() ?? [])].find(row => row.itemId === weapon) as Record<string, any> | undefined;
          return own ? { itemId: weapon, roll: { arrowStorm: own.arrowStorm ?? 0, ricochet: own.ricochet ?? 0, piercingShot: own.piercingShot ?? 0,
            whirlwind: own.whirlwind ?? 0, deflect: own.deflect ?? 0, shockwave: own.shockwave ?? 0 } } : null;
        }
        const staff = [...(db?.playerWornStaffSkill?.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        if (staff) return { itemId: staff.itemId, roll: { meteor: staff.meteor, chain: staff.chain, frostNova: staff.frostNova } };
        const row = [...(db?.playerWornSkill?.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        return row ? { itemId: row.itemId, roll: { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot,
          whirlwind: row.whirlwind, deflect: row.deflect, shockwave: row.shockwave } } : null;
      })(),
      mining: (() => {
        const db = dependencies.connection()?.db;
        const row = identity === dependencies.localIdentity() ? [...(db?.myMining?.iter() ?? [])][0]
          : [...(db?.playerMiningLevel?.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        return row ? row.mining : null;
      })(),
      woodcutting: (() => {
        const db = dependencies.connection()?.db;
        const row = identity === dependencies.localIdentity() ? [...(db?.myWoodcutting?.iter() ?? [])][0]
          : [...(db?.playerWoodcuttingLevel?.iter() ?? [])].find(row => row.identity.toHexString() === identity);
        return row ? row.woodcutting : null;
      })(),
      fishing: (() => {
        const db = dependencies.connection()?.db;
        if (identity === dependencies.localIdentity()) {
          const own = [...(db?.myFishing?.iter() ?? [])][0];
          return own ? fishingLevel(own.experience) : null;
        }
        return [...(db?.playerFishingLevel?.iter() ?? [])].find(row => row.identity.toHexString() === identity)?.level ?? null;
      })(),
      mastery: (() => {
        const db = dependencies.connection()?.db;
        const levels: Partial<Record<WeaponSchool, number>> = {};
        if (identity === dependencies.localIdentity()) {
          for (const row of db?.playerWeaponMastery?.iter() ?? []) if (row.identity.toHexString() === identity && isWeaponSchool(row.school)) levels[row.school] = masteryLevel(row.points);
        } else {
          for (const row of db?.playerMasteryLevel?.iter() ?? []) if (isWeaponSchool(row.school) && row.identity.toHexString() === identity) levels[row.school] = row.level;
        }
        return levels;
      })(),
      crafts: (() => {
        const db = dependencies.connection()?.db, own = identity === dependencies.localIdentity();
        const levels: Partial<Record<CraftSkill, number>> = {};
        const rows = own ? db?.myCraftSkills?.iter() ?? [] : [...(db?.playerCraftLevel?.iter() ?? [])].filter(row => row.identity.toHexString() === identity);
        for (const row of rows as Iterable<{ skill: string; experience?: bigint; level?: number }>) {
          const skill = row.skill as CraftSkill;
          if (CRAFT_SKILLS.includes(skill)) levels[skill] = own ? craftLevel(row.experience ?? 0n) : row.level ?? 1;
        }
        return levels;
      })(),
      lifetime: { ...lifetime },
      mapId: activePlayerMap(identity) ?? undefined,
    };
  }

  function releasePlayerProfile() {
    profileGeneration++;
    detachPresence?.();
    detachPresence = null;
    unsubscribeIfActive(activeSubscription);
    cancelActiveLoad?.();
    cancelActiveLoad = null;
    if (activeIdentity && activeIdentity !== dependencies.localIdentity()) {
      dependencies.progression.clearProfile(activeIdentity);
      profilePlayerMaps.delete(activeIdentity);
      questBonuses.delete(activeIdentity);
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
    const dbIdentity = dependencies.directory.identityFor(identity) ?? dependencies.developerIdentityFor(identity)
      ?? (/^[a-f0-9]{64}$/i.test(identity) ? Identity.fromString(identity) : undefined);
    if (!connection || !dbIdentity) return Promise.resolve(null);

    releasePlayerProfile();
    activeIdentity = identity;
    const generation = profileGeneration;
    // Eye/idle state suppresses movement, not account presence. Watch only the
    // profile already being inspected, on the root connection, without polling.
    const current = () => generation === profileGeneration && dependencies.connection() === connection && activeIdentity === identity;
    const rememberMap = (mapId: string) => {
      if (!current() || profilePlayerMaps.get(identity) === mapId) return;
      profilePlayerMaps.set(identity, mapId);
      dependencies.notify();
    };
    const observe: Parameters<typeof connection.db.player.onInsert>[0] = (_ctx, row) => {
      if (row.identity.toHexString() === identity) rememberMap(
        isDeveloperIdentity(identity) && !row.isVisible ? "" : row.mapId,
      );
    };
    const update: Parameters<typeof connection.db.player.onUpdate>[0] = (ctx, _old, row) => observe(ctx, row);
    /**
     * An eye-off player's row is withheld from other clients, and is shown while they idle or autofarm,
     * so it comes and goes as they play: asked the server instead, which knows whether they are on. Until it
     * answers the profile keeps what it showed, rather than flashing "Last seen" at every switch.
     */
    const askPresence = () => {
      void Promise.resolve().then(() => connection.procedures.getPlayerPresence({ identity: dbIdentity })).then(json => {
        const presence = JSON.parse(json) as { online?: boolean; mapId?: string };
        if (connection.db.player.identity?.find(dbIdentity)) return;
        rememberMap(presence.online && presence.mapId ? presence.mapId : "");
      }).catch(() => rememberMap(""));
    };
    const remove: Parameters<typeof connection.db.player.onDelete>[0] = (_ctx, row) => {
      if (row.identity.toHexString() === identity) askPresence();
    };
    // The guild bonus is worked out on the server from rows other players cannot read.
    void Promise.resolve().then(() => connection.procedures.getStatGainBonus({ identity: dbIdentity })).then(bonus => {
      if (!current() || !Number.isFinite(bonus)) return;
      questBonuses.set(identity, bonus);
      dependencies.notify();
    }).catch(() => undefined);
    connection.db.player.onInsert(observe);
    connection.db.player.onUpdate(update);
    connection.db.player.onDelete(remove);
    detachPresence = () => {
      connection.db.player.removeOnInsert(observe);
      connection.db.player.removeOnUpdate(update);
      connection.db.player.removeOnDelete(remove);
    };

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
      let handle: ActiveSubscription | null = null;
      try {
      handle = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (generation !== profileGeneration || dependencies.connection() !== connection || activeIdentity !== identity) {
            unsubscribeIfActive(handle);
            return finish(null);
          }
          for (const row of connection.db.playerProgress.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertProgress(withWideProgress(connection, row));
          }
          for (const row of connection.db.playerChatHearts.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertChatHearts(row);
          }
          for (const row of connection.db.playerLifetime.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertLifetime(row);
          }
          for (const row of connection.db.playerResearch.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertResearch(row);
          }
          for (const row of connection.db.playerLuckResearch.iter()) {
            if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertLuckResearch(row);
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
          profilePlayerMaps.set(identity, "");
          let rowVisible = false;
          for (const row of connection.db.player.iter()) {
            if (row.identity.toHexString() !== identity) continue;
            rowVisible = true;
            profilePlayerMaps.set(identity, isDeveloperIdentity(identity) && !row.isVisible ? "" : row.mapId);
          }
          // An eye-off player's row is withheld from other clients, so
          // ask the server whether they are on; an older server without it leaves them offline.
          if (!rowVisible) askPresence();
          finish(cachedPlayerProfile(identity));
        })
        .onError(() => {
          if (generation === profileGeneration) releasePlayerProfile();
          finish(null);
        })
        .subscribe([
          tables.playerProfile.where((profile) => profile.identity.eq(dbIdentity)),
          tables.playerAccountStatus.where((status) => status.identity.eq(dbIdentity)),
          tables.playerProgress.where((progress) => progress.identity.eq(dbIdentity)),
          tables.playerInventory.where((bag) => bag.identity.eq(dbIdentity)),
          tables.playerChatHearts.where(row => row.identity.eq(dbIdentity)),
          tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dbIdentity)),
          tables.playerResearch.where((research) => research.identity.eq(dbIdentity)),
          tables.playerLuckResearch.where((research) => research.identity.eq(dbIdentity)),
          tables.playerPrestige.where(row => row.identity.eq(dbIdentity)),
          tables.playerPrestigePerk.where(row => row.identity.eq(dbIdentity)),
          tables.playerPrestigeChallenge.where(row => row.identity.eq(dbIdentity)),
          tables.playerAggroChallenge.where(row => row.identity.eq(dbIdentity)),
          tables.playerPrestigeExpansionPerk.where(row => row.identity.eq(dbIdentity)),
          tables.profileSoulStats.where(row => row.identity.eq(dbIdentity)),
          tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dbIdentity)),
          tables.playerItemRefine.where(row => row.identity.eq(dbIdentity)),
          tables.playerWeaponStat.where(row => row.identity.eq(dbIdentity)),
          tables.playerCosmeticRefine.where(row => row.identity.eq(dbIdentity)),
          tables.playerActiveCard.where(row => row.identity.eq(dbIdentity)),
          tables.playerPrestigeCardPerk.where(row => row.identity.eq(dbIdentity)),
          tables.playerBonusToggle.where(row => row.identity.eq(dbIdentity)),
          tables.playerWornSkill.where(row => row.identity.eq(dbIdentity)),
          tables.playerWornStaffSkill.where(row => row.identity.eq(dbIdentity)),
          tables.playerMiningLevel.where(row => row.identity.eq(dbIdentity)),
          tables.playerWoodcuttingLevel.where(row => row.identity.eq(dbIdentity)),
          tables.playerFishingLevel.where(row => row.identity.eq(dbIdentity)),
          tables.playerMasteryLevel.where(row => row.identity.eq(dbIdentity)),
          tables.playerCraftLevel.where(row => row.identity.eq(dbIdentity)),
          tables.player.where((player) => player.identity.eq(dbIdentity)),
        ]);
      if (generation === profileGeneration) activeSubscription = handle;
      else unsubscribeIfActive(handle);
      } catch {
        if (generation === profileGeneration) releasePlayerProfile();
        finish(null);
      }
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

  function loadLeaderboardSnapshot(stat: LeaderboardStat = "power"): Promise<LeaderboardEntry[]> {
    const existing = leaderboardRequests.get(stat);
    if (existing) return existing;
    const connection = dependencies.connection();
    if (!connection?.isActive) return Promise.reject(new Error("Not connected. Try again."));
    const generation = leaderboardGeneration;
    const identity = dependencies.localIdentity();
    const request = withRequestDeadline(connection.procedures.getLeaderboardWindow({ stat })).then(rows => {
      if (generation !== leaderboardGeneration || connection !== dependencies.connection() || identity !== dependencies.localIdentity()) throw new Error("Session changed. Reopen the leaderboard.");
      const entries = rows.map(({ rank, entry: row }) => {
        const entry = { ...leaderboardEntryFromRow(row), rank };
        dependencies.directory.rememberPresentation({ identity: entry.identity, identityValue: row.identity,
          displayName: entry.name, profileIcon: row.profileIcon, skinTone: entry.skinTone, gender: entry.gender, isGuest: entry.isGuest });
        return entry;
      });
      leaderboardEntries.clear();
      for (const entry of entries) leaderboardEntries.set(entry.identity, entry);
      dependencies.notify();
      return entries;
    }).finally(() => { if (leaderboardRequests.get(stat) === request) leaderboardRequests.delete(stat); });
    leaderboardRequests.set(stat, request);
    return request;
  }

  /** One board's ranks; a start of 0 opens at the viewer. */
  function loadLeaderboardPage(board: LeaderboardBoard, startRank = 0, count = 100): Promise<LeaderboardPage<LeaderboardEntry>> {
    const key = `${board}:${startRank}:${count}`;
    const existing = leaderboardPages.get(key);
    if (existing) return existing;
    const connection = dependencies.connection();
    if (!connection?.isActive) return Promise.reject(new Error("Not connected. Try again."));
    const generation = leaderboardGeneration, identity = dependencies.localIdentity();
    const request = withRequestDeadline(connection.procedures.getLeaderboardRanks({ board, startRank, count })).then(page => {
      if (generation !== leaderboardGeneration || connection !== dependencies.connection() || identity !== dependencies.localIdentity()) throw new Error("Session changed. Reopen the leaderboard.");
      const entries = page.entries.map(({ rank, entry: row, joinedAtMicros }) => {
        const entry = { ...leaderboardEntryFromRow(row), rank, joinedAt: Number(joinedAtMicros / 1000n) || undefined };
        dependencies.directory.rememberPresentation({ identity: entry.identity, identityValue: row.identity,
          displayName: entry.name, profileIcon: row.profileIcon, skinTone: entry.skinTone, gender: entry.gender, isGuest: entry.isGuest });
        return entry;
      });
      return { ...page, entries };
    }).finally(() => { if (leaderboardPages.get(key) === request) leaderboardPages.delete(key); });
    leaderboardPages.set(key, request);
    return request;
  }

  /** Where a searched player stands on a board. Rank 0 is unranked. */
  function findLeaderboardSpot(board: LeaderboardBoard, identity: string): Promise<number> {
    const connection = dependencies.connection();
    if (!connection?.isActive) return Promise.reject(new Error("Not connected. Try again."));
    return withRequestDeadline(connection.procedures.findLeaderboardPlayer({ stat: board, prestige: -1, identity: Identity.fromString(identity.replace(/^0x/, "")) }))
      .then(spot => spot.rank);
  }

  return {
    api: {
      findLeaderboardSpot,
      leaderboardEntries() {
        return [...leaderboardEntries.values()].map((entry) => ({
          ...entry,
          isGuest: dependencies.directory.guestFor(entry.identity) ?? entry.isGuest,
        }));
      },
      loadLeaderboardSnapshot,
      loadLeaderboardPage,
      playerProfile(identity = dependencies.localIdentity()) {
        const profile = cachedPlayerProfile(identity);
        return profile
          ? { ...profile, progress: { ...profile.progress }, itemUpgradeLevels: { ...profile.itemUpgradeLevels }, itemRefines: { ...profile.itemRefines }, ...(profile.weaponStats ? { weaponStats: { ...profile.weaponStats } } : {}), ...(profile.cosmeticRefines ? { cosmeticRefines: { ...profile.cosmeticRefines } } : {}), ...(profile.activeCards ? { activeCards: { ...profile.activeCards } } : {}), lifetime: { ...profile.lifetime } }
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
      leaderboardGeneration++;
      leaderboardRequests.clear();
      leaderboardPages.clear();
      leaderboardEntries.clear();
      profilePlayerMaps.clear();
      playerProfileLoads.clear();
    },
  };
}

export type PlayerProfileService = ReturnType<typeof createPlayerProfileService>;
