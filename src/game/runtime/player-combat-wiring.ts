import { regularEnemySimulationTick } from "../../../shared/regular-enemy-simulation";
import type { SoulStatId } from "../../../shared/soul-dimension";
import { TUTORIAL_FOREST_MAP_ID, type MapId, type SpawnSite } from "../world";
import type { createMapMusicController } from "./audio";
import type { createCombatEffects } from "./combat-effects";
import type { CoopAccess } from "./coop-access";
import type { claimCoopClient } from "./coop-session-controller";
import type { createGameBootstrap } from "./game-bootstrap";
import { LOCAL_REGULAR_ENEMY_TARGET_ID } from "./enemies/enemy-simulation";
import { createPlayerCombatController } from "./player-combat-controller";
import type { createResearchController } from "./research-controller";
import type { createRewardDisplay } from "./reward-display";
import type { EnemyState } from "./types";
import { playerDps, statTrackerDps } from "./dps-meter";

export type PlayerCombatWiringDeps = {
  coop: CoopAccess;
  world: Pick<ReturnType<typeof createGameBootstrap>, "player" | "enemies" | "spawnSites" | "projectileStore" | "bosses" | "inventory">;
  effects: ReturnType<typeof createCombatEffects>;
  mapMusic: Pick<ReturnType<typeof createMapMusicController>, "playBowAttackSound" | "playSwordAttackSound">;
  research: ReturnType<typeof createResearchController>;
  rewardDisplay: ReturnType<typeof createRewardDisplay>;
  healthMultiplierBonus: () => number;
  isDueling: () => boolean;
  currentMapId: () => MapId;
  inTutorial: () => boolean;
  /** The session's game time, or 0 before it exists. */
  nowSeconds: () => number;
  engageEnemy: (enemy: EnemyState, targetId: string | null, startedAtTick: number) => void;
  personalBosses: { hit: (mapId: string, damage: number) => void };
  scheduleEnemyRespawn: (site: SpawnSite) => void;
  gameBridge: ReturnType<typeof claimCoopClient>["gameBridge"];
  autoFarm: { targetType: () => unknown; stop: (reason?: string) => void };
  incrementKills: () => void;
  logPickup: (text: string, color: string, value?: number) => void;
  saveProgress: () => void;
  endGame: () => void;
  /** Systems created after combat. Combat reads them only once a fight is under way. */
  later: {
    soul: () => {
      defeated: (enemy: EnemyState) => boolean;
      soulStatOf: (enemy: EnemyState) => SoulStatId | null;
      soulKill: (stat: SoulStatId) => void;
      rewardMultiplier: () => number;
      critDamage: () => number;
      playerDied: () => void;
    };
    onboarding: () => { enemyDefeated: () => boolean } | undefined;
    quests: () => { noteKill: (mapId: string, enemy: string) => void };
  };
};

/**
 * The local player's attacks, hits taken and kills, fed by research, prestige
 * perks, cards, mastery and the worn gear's skills and refine levels.
 */
export function createPlayerCombat(deps: PlayerCombatWiringDeps) {
  const { coop, effects, research, later, currentMapId } = deps;
  const { player, inventory } = deps.world;
  const client = coop.client;
  const equippedWeapon = () => inventory.equippedRightHand || inventory.equippedLeftHand;
  const spawnBossDamage = (x: number, y: number, damage: number, critical: boolean, reflected?: boolean) =>
    effects.spawnDamageNumber(x, y, damage, critical, false, reflected);

  return createPlayerCombatController({
    onDamageDealt: (amount, source, target) => {
      playerDps.record(amount, source);
      statTrackerDps.record(amount, source, target.isBoss || target.generatedBoss ? target : undefined);
    },
    onCombatTick: statTrackerDps.tickBoss,
    arrowInPlay: () => client?.arrowInPlay?.() ?? null,
    onArrowShot: arrowId => client?.recordArrowShot?.(arrowId),
    onEnemyDefeated: enemy => later.soul().defeated(enemy) || (later.onboarding()?.enemyDefeated() ?? false),
    soulStatOf: enemy => later.soul().soulStatOf(enemy),
    onSoulKill: stat => later.soul().soulKill(stat),
    soulRewardMultiplier: () => later.soul().rewardMultiplier(),
    player, enemies: deps.world.enemies, spawnSites: deps.world.spawnSites, projectileStore: deps.world.projectileStore,
    bosses: deps.world.bosses,
    nowSeconds: deps.nowSeconds,
    localIdentity: coop.localIdentity,
    engageEnemy: enemy => deps.engageEnemy(
      enemy,
      coop.localIdentity() || LOCAL_REGULAR_ENEMY_TARGET_ID,
      regularEnemySimulationTick(coop.serverNowMs()),
    ),
    researchDamageMultiplier: research.damageMultiplier,
    researchCriticalChance: research.criticalChance,
    researchCriticalDamageMultiplier: () => research.criticalDamageMultiplier(later.soul().critDamage()),
    researchRewardMultiplier: research.rewardMultiplier,
    displayRewardAmount: deps.rewardDisplay.displayedAmount,
    prestigeBossSlayer: () => coop.prestigePerk("bossSlayer"),
    prestigeSecondWind: () => coop.prestigePerk("secondWind"),
    prestigeDoubleStrike: () => coop.prestigePerk("doubleStrike"),
    prestigeSplitShot: () => coop.prestigePerk("splitShot"),
    prestigeReflect: () => coop.prestigePerk("riposte"),
    weaponSkills: () => coop.weaponSkills(equippedWeapon()),
    cards: () => client?.activeCardTotals?.(),
    weaponMastery: () => client?.weaponMasteryInPlay?.(),
    equippedWeapon,
    equippedRightHand: () => inventory.equippedRightHand,
    equippedWeaponUpgradeLevel: () => coop.itemLevel(equippedWeapon()),
    equippedHead: () => inventory.equippedHead,
    equippedHeadUpgradeLevel: () => coop.itemLevel(inventory.equippedHead),
    equippedChest: () => inventory.equippedChest,
    equippedChestUpgradeLevel: () => coop.itemLevel(inventory.equippedChest),
    equippedFeet: () => inventory.equippedFeet,
    equippedFeetUpgradeLevel: () => coop.itemLevel(inventory.equippedFeet),
    healthMultiplierBonus: deps.healthMultiplierBonus,
    minAttackInterval: coop.attackCap,
    reflectOnly: () => Boolean(client?.prestigeChallenge?.()?.active),
    effectiveArmor: research.effectiveArmor,
    isDueling: deps.isDueling,
    hitGeneratedBoss: (enemy, damage, critical, reflected) => {
      if (!enemy.generatedBoss) return false;
      deps.personalBosses.hit(currentMapId(), damage);
      spawnBossDamage(enemy.x, enemy.y, damage, critical, reflected);
      return true;
    },
    hitPersonalBoss: (damage, x, y, critical, reflected) => {
      deps.personalBosses.hit(currentMapId(), damage);
      spawnBossDamage(x, y, damage, critical, reflected);
    },
    scheduleEnemyRespawn: deps.scheduleEnemyRespawn,
    recordRegularEnemyDefeat: (mapId, enemy) => {
      deps.gameBridge?.recordRegularEnemyDefeat(mapId, enemy, Boolean(deps.autoFarm.targetType()));
      later.quests().noteKill(mapId, enemy);
    },
    incrementKills: deps.incrementKills,
    currentMapId,
    spawnBurst: effects.spawnBurst,
    spawnParticle: effects.spawnParticle,
    spawnDamageNumber: effects.spawnDamageNumber, skillEffects: effects, onCombat: () => deps.gameBridge?.engaged(),
    playBowAttackSound: deps.mapMusic.playBowAttackSound, playSwordAttackSound: deps.mapMusic.playSwordAttackSound,
    logPickup: deps.logPickup,
    saveProgress: deps.saveProgress,
    recordDeath: () => {
      later.soul().playerDied();
      if (client?.aggroChallenge?.()?.active && currentMapId() !== TUTORIAL_FOREST_MAP_ID) {
        deps.autoFarm.stop("Autofarm stopped: a death restarts the Aggro run");
      }
      if (!deps.inTutorial()) void client?.recordPlayerDeath?.(currentMapId());
    },
    endGame: deps.endGame,
  });
}
