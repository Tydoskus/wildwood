import {
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  FROSTCLAW_AGGRO_RANGE,
  FROSTCLAW_RIFT_HALF_ANGLE,
  FROSTCLAW_RIFT_RANGE,
  FROSTCLAW_ROAR_RANGE,
  GLOOMROOT_AGGRO_RANGE,
  GLOOMROOT_SWEEP_HALF_ANGLE,
  GLOOMROOT_SWEEP_RANGE,
  MAGMALISK_AGGRO_RANGE,
  MAGMALISK_BITE_HALF_ANGLE,
  MAGMALISK_BITE_RANGE,
  TIDEWYRM_AGGRO_RANGE,
  TIDEWYRM_SURGE_HALF_ANGLE,
  TIDEWYRM_SURGE_RANGE,
  TAU,
  WORLD,
} from "../constants";
import {
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  DRAGON_REWARD_DAMAGE,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  SPIDER_REWARD_DAMAGE,
  SPIDER_REWARD_HEALTH,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
} from "../../../shared/rules";
import { REWARD_DATA, rewardLabel, type RewardType } from "../enemies";
import { clamp, rand } from "../math";
import type { PlayerGender } from "../../../shared/player-gender";
import type {
  BossRainStrike,
  DragonBossState,
  FrostclawBossState,
  FrostclawIcefall,
  GloomrootBloom,
  GloomrootBossState,
  MagmaliskBossState,
  MagmaliskEruption,
  PlayerState,
  SpiderBossState,
  SpiderVenomPool,
  TidewyrmBossState,
  TidewyrmWhirlpool,
} from "./types";
import { addPlayerBaseMaxHealth } from "./player-health";

export const BOSS_HP_LOSS_FLASH_DURATION = .18;
export const SPIDER_WEB_RANGE = 720;

const DRAGON_CONE_WINDUP = .75;
const DRAGON_CONE_DURATION = 1.2;
const DRAGON_RAIN_DAMAGE = 200;
const DRAGON_CONE_DAMAGE = 1_000;
const SPIDER_AGGRO_RANGE = 1150;
const SPIDER_WEB_DAMAGE = 900_000;
const SPIDER_VENOM_DAMAGE = 1_100_000;
const SPIDER_CONTACT_DAMAGE = 1_000_000;
const DRAGON_CONTACT_DAMAGE = 2_000;
const DRAGON_CONTACT_DAMAGE_COOLDOWN = .75;
const FROSTCLAW_ROAR_WINDUP = .85;
const FROSTCLAW_ROAR_DURATION = .95;
const FROSTCLAW_RIFT_WINDUP = .7;
const FROSTCLAW_RIFT_DURATION = 1.05;
const FROSTCLAW_ROAR_DAMAGE = 28_000_000;
const FROSTCLAW_ICEFALL_DAMAGE = 40_000_000;
const FROSTCLAW_RIFT_DAMAGE = 52_000_000;
const FROSTCLAW_CONTACT_DAMAGE = 45_000_000;
const FROSTCLAW_PUSH_DURATION = .55;
const FROSTCLAW_PUSH_SPEED = 860;
const MAGMALISK_BITE_WINDUP = .72;
const MAGMALISK_BITE_DURATION = .9;
const MAGMALISK_BITE_DAMAGE = 260_000_000_000;
const MAGMALISK_ERUPTION_DAMAGE = 200_000_000_000;
const MAGMALISK_CONTACT_DAMAGE = 225_000_000_000;
const GLOOMROOT_SWEEP_WINDUP = .85;
const GLOOMROOT_SWEEP_DURATION = 1;
const GLOOMROOT_SWEEP_DAMAGE = 4_200_000_000_000;
const GLOOMROOT_BLOOM_DAMAGE = 3_500_000_000_000;
const GLOOMROOT_CONTACT_DAMAGE = 3_800_000_000_000;
const TIDEWYRM_SURGE_WINDUP = .82;
const TIDEWYRM_SURGE_DURATION = 1.05;
const TIDEWYRM_SURGE_DAMAGE = 180_000_000_000_000;
const TIDEWYRM_WHIRLPOOL_DAMAGE = 150_000_000_000_000;
const TIDEWYRM_CONTACT_DAMAGE = 165_000_000_000_000;
const DEATH_PARTICLE_COLOR = "#e53935";

type SharedBossState = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
};

type BossResult = {
  encounter: bigint;
  totalDamage: number;
  contributors: Array<{ identity: string; name: string; gender: PlayerGender; damage: number; percentage: number }>;
};

type NoticeElements = {
  result: HTMLElement;
  resultTitle: HTMLElement;
  resultTotal: HTMLElement;
  resultContributors: HTMLElement;
  worldNotice: HTMLElement;
  worldNoticeDetail: HTMLElement;
};

export type BossController = {
  resetBoss: () => void;
  resetSpiderBoss: () => void;
  resetFrostclawBoss: () => void;
  resetMagmaliskBoss: () => void;
  resetGloomrootBoss: () => void;
  resetTidewyrmBoss: () => void;
  syncDragonState: () => void;
  syncSpiderState: () => void;
  syncFrostclawState: () => void;
  syncMagmaliskState: () => void;
  syncGloomrootState: () => void;
  syncTidewyrmState: () => void;
  updateBoss: (dt: number) => void;
  updateSpiderBoss: (dt: number) => void;
  updateFrostclawBoss: (dt: number) => void;
  updateMagmaliskBoss: (dt: number) => void;
  updateGloomrootBoss: (dt: number) => void;
  updateTidewyrmBoss: (dt: number) => void;
  resolveDragonCollision: () => void;
  resolveSpiderCollision: () => void;
  resolveFrostclawCollision: () => void;
  resolveMagmaliskCollision: () => void;
  resolveGloomrootCollision: () => void;
  resolveTidewyrmCollision: () => void;
  applyDragonConePush: (dt: number) => void;
  applyFrostclawPush: (dt: number) => void;
  onPortalCutsceneFinished: (wasPreview: boolean) => void;
};

/**
 * Owns world-boss state synchronization, attacks, collision, and reward UI.
 * The application entry point supplies DOM and multiplayer boundaries only.
 */
export function createBossController(options: {
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  frostclawBoss: FrostclawBossState;
  magmaliskBoss: MagmaliskBossState;
  gloomrootBoss: GloomrootBossState;
  tidewyrmBoss: TidewyrmBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  frostclawIcefalls: FrostclawIcefall[];
  magmaliskEruptions: MagmaliskEruption[];
  gloomrootBlooms: GloomrootBloom[];
  tidewyrmWhirlpools: TidewyrmWhirlpool[];
  player: PlayerState;
  getDragonBoss: () => SharedBossState | null | undefined;
  getSpiderBoss: () => SharedBossState | null | undefined;
  getFrostclawBoss: () => SharedBossState | null | undefined;
  getMagmaliskBoss: () => SharedBossState | null | undefined;
  getGloomrootBoss: () => SharedBossState | null | undefined;
  getTidewyrmBoss: () => SharedBossState | null | undefined;
  getDragonResult: () => BossResult | null | undefined;
  getSpiderResult: () => BossResult | null | undefined;
  getFrostclawResult: () => BossResult | null | undefined;
  getMagmaliskResult: () => BossResult | null | undefined;
  getGloomrootResult: () => BossResult | null | undefined;
  getTidewyrmResult: () => BossResult | null | undefined;
  localIdentity: () => string | undefined;
  running: () => boolean;
  currentMapIsDesert: () => boolean;
  currentMapIsSnow: () => boolean;
  currentMapIsLava: () => boolean;
  currentMapIsInfernal: () => boolean;
  currentMapIsWater: () => boolean;
  portalCutsceneActive: () => boolean;
  hasSeenDragonPortalCutscene: () => boolean;
  hasSeenSnowlandsPortalCutscene: () => boolean;
  hasSeenLavaPortalCutscene: () => boolean;
  hasSeenInfernalPortalCutscene: () => boolean;
  hasSeenWaterPortalCutscene: () => boolean;
  hasSeenSamuraiPortalCutscene: () => boolean;
  startDragonPortalCutscene: () => void;
  startSnowlandsPortalCutscene: () => void;
  startLavaPortalCutscene: () => void;
  startInfernalPortalCutscene: () => void;
  startWaterPortalCutscene: () => void;
  startSamuraiPortalCutscene: () => void;
  elements: NoticeElements;
  renderPlayerName: (element: HTMLElement, identity: string, name: string, gender?: PlayerGender) => void;
  spawnBurst: (x: number, y: number, color: string, count: number, speed: number) => void;
  damagePlayer: (amount: number) => boolean;
  logPickup: (text: string, color: string) => void;
  showMessage: (text: string, color: string) => void;
  saveProgress: () => void;
  healthMultiplier?: () => number;
  rewardMultiplier?: () => number;
}): BossController {
  const {
    boss, spiderBoss, frostclawBoss, magmaliskBoss, gloomrootBoss, tidewyrmBoss, bossRain, spiderVenom, frostclawIcefalls, magmaliskEruptions, gloomrootBlooms, tidewyrmWhirlpools, player, elements,
    getDragonBoss, getSpiderBoss, getFrostclawBoss, getMagmaliskBoss, getGloomrootBoss, getTidewyrmBoss, getDragonResult, getSpiderResult, getFrostclawResult, getMagmaliskResult, getGloomrootResult, getTidewyrmResult,
    localIdentity, running, currentMapIsDesert, currentMapIsSnow, currentMapIsLava, currentMapIsInfernal, currentMapIsWater, portalCutsceneActive,
    hasSeenDragonPortalCutscene, hasSeenSnowlandsPortalCutscene, hasSeenLavaPortalCutscene, hasSeenInfernalPortalCutscene, hasSeenWaterPortalCutscene, hasSeenSamuraiPortalCutscene,
    startDragonPortalCutscene, startSnowlandsPortalCutscene, startLavaPortalCutscene, startInfernalPortalCutscene, startWaterPortalCutscene, startSamuraiPortalCutscene,
    renderPlayerName, spawnBurst, damagePlayer, logPickup, showMessage, saveProgress,
  } = options;
  let dragonWorldNoticeTimer: number | null = null;
  let observedDragonEncounter: bigint | null = null;
  let dragonWasAlive: boolean | null = null;
  let pendingDragonResultEncounter: bigint | null = null;
  let shownDragonResultEncounter: bigint | null = null;
  let observedSpiderEncounter: bigint | null = null;
  let spiderWasAlive: boolean | null = null;
  let pendingSpiderResultEncounter: bigint | null = null;
  let shownSpiderResultEncounter: bigint | null = null;
  let queuedDragonResult: BossResult | null = null;
  let queuedSpiderResult: BossResult | null = null;
  let queuedFrostclawResult: BossResult | null = null;
  let queuedMagmaliskResult: BossResult | null = null;
  let observedFrostclawEncounter: bigint | null = null;
  let frostclawWasAlive: boolean | null = null;
  let pendingFrostclawResultEncounter: bigint | null = null;
  let shownFrostclawResultEncounter: bigint | null = null;
  let observedMagmaliskEncounter: bigint | null = null;
  let magmaliskWasAlive: boolean | null = null;
  let pendingMagmaliskResultEncounter: bigint | null = null;
  let shownMagmaliskResultEncounter: bigint | null = null;
  let queuedGloomrootResult: BossResult | null = null;
  let observedGloomrootEncounter: bigint | null = null;
  let gloomrootWasAlive: boolean | null = null;
  let pendingGloomrootResultEncounter: bigint | null = null;
  let shownGloomrootResultEncounter: bigint | null = null;
  let queuedTidewyrmResult: BossResult | null = null;
  let observedTidewyrmEncounter: bigint | null = null;
  let tidewyrmWasAlive: boolean | null = null;
  let pendingTidewyrmResultEncounter: bigint | null = null;
  let shownTidewyrmResultEncounter: bigint | null = null;
  const locallyRewardedDragonEncounters = new Set<string>();
  const locallyRewardedSpiderEncounters = new Set<string>();
  const locallyRewardedFrostclawEncounters = new Set<string>();
  const locallyRewardedMagmaliskEncounters = new Set<string>();
  const locallyRewardedGloomrootEncounters = new Set<string>();
  const locallyRewardedTidewyrmEncounters = new Set<string>();

  function scaledReward(type: RewardType, baseAmount: number) {
    const multiplier = options.rewardMultiplier?.() ?? 1;
    return {
      type,
      amount: baseAmount * (Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1),
    };
  }

  function resetBoss() {
    const shared = getDragonBoss();
    if (shared) {
      boss.encounter = shared.encounter;
      boss.hp = shared.hp;
      boss.maxHp = shared.maxHp;
      boss.dead = !shared.alive;
    }
    boss.hurt = 0;
    boss.hpLossFlashFrom = boss.hp;
    boss.hpLossFlashTimer = 0;
    boss.contactDamageClock = 0;
    boss.attackClock = 3;
    boss.nextAttack = "cone";
    boss.cone = null;
    bossRain.length = 0;
  }

  function resetSpiderBoss() {
    const shared = getSpiderBoss();
    if (shared) {
      spiderBoss.encounter = shared.encounter;
      spiderBoss.hp = shared.hp;
      spiderBoss.maxHp = shared.maxHp;
      spiderBoss.dead = !shared.alive;
    }
    spiderBoss.hpLossFlashFrom = spiderBoss.hp;
    spiderBoss.hpLossFlashTimer = 0;
    spiderBoss.contactDamageClock = 0;
    spiderBoss.attackClock = 3;
    spiderBoss.nextAttack = "web";
    spiderBoss.web = null;
    spiderVenom.length = 0;
  }

  function resetFrostclawBoss() {
    const shared = getFrostclawBoss();
    if (shared) {
      frostclawBoss.encounter = shared.encounter;
      frostclawBoss.hp = shared.hp;
      frostclawBoss.maxHp = shared.maxHp;
      frostclawBoss.dead = !shared.alive;
    }
    frostclawBoss.hurt = 0;
    frostclawBoss.hpLossFlashFrom = frostclawBoss.hp;
    frostclawBoss.hpLossFlashTimer = 0;
    frostclawBoss.contactDamageClock = 0;
    frostclawBoss.attackClock = 3;
    frostclawBoss.nextAttack = "roar";
    frostclawBoss.roar = null;
    frostclawBoss.rift = null;
    frostclawBoss.pushTimer = 0;
    frostclawIcefalls.length = 0;
  }

  function resetMagmaliskBoss() {
    const shared = getMagmaliskBoss();
    if (shared) {
      magmaliskBoss.encounter = shared.encounter;
      magmaliskBoss.hp = shared.hp;
      magmaliskBoss.maxHp = shared.maxHp;
      magmaliskBoss.dead = !shared.alive;
    }
    magmaliskBoss.hurt = 0;
    magmaliskBoss.hpLossFlashFrom = magmaliskBoss.hp;
    magmaliskBoss.hpLossFlashTimer = 0;
    magmaliskBoss.contactDamageClock = 0;
    magmaliskBoss.attackClock = 3;
    magmaliskBoss.nextAttack = "bite";
    magmaliskBoss.bite = null;
    magmaliskEruptions.length = 0;
  }

  function resetGloomrootBoss() {
    const shared = getGloomrootBoss();
    if (shared) {
      gloomrootBoss.encounter = shared.encounter;
      gloomrootBoss.hp = shared.hp;
      gloomrootBoss.maxHp = shared.maxHp;
      gloomrootBoss.dead = !shared.alive;
    }
    gloomrootBoss.hurt = 0;
    gloomrootBoss.hpLossFlashFrom = gloomrootBoss.hp;
    gloomrootBoss.hpLossFlashTimer = 0;
    gloomrootBoss.contactDamageClock = 0;
    gloomrootBoss.attackClock = 3;
    gloomrootBoss.nextAttack = "sweep";
    gloomrootBoss.sweep = null;
    gloomrootBlooms.length = 0;
  }

  function resetTidewyrmBoss() {
    const shared = getTidewyrmBoss();
    if (shared) {
      tidewyrmBoss.encounter = shared.encounter;
      tidewyrmBoss.hp = shared.hp;
      tidewyrmBoss.maxHp = shared.maxHp;
      tidewyrmBoss.dead = !shared.alive;
    }
    tidewyrmBoss.hurt = 0;
    tidewyrmBoss.hpLossFlashFrom = tidewyrmBoss.hp;
    tidewyrmBoss.hpLossFlashTimer = 0;
    tidewyrmBoss.contactDamageClock = 0;
    tidewyrmBoss.attackClock = 3;
    tidewyrmBoss.nextAttack = "surge";
    tidewyrmBoss.surge = null;
    tidewyrmWhirlpools.length = 0;
  }

  function showWorldResult(result: BossResult, heading: string) {
    const title = elements.worldNotice.querySelector("strong");
    if (title) title.textContent = heading;
    elements.worldNoticeDetail.replaceChildren();
    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-world-notice-row";
      const name = document.createElement("span");
      renderPlayerName(name, contributor.identity, contributor.name, contributor.gender);
      const percentage = document.createElement("span");
      percentage.textContent = `${Math.round(contributor.percentage)}%`;
      row.append(name, percentage);
      elements.worldNoticeDetail.appendChild(row);
    }
    elements.worldNotice.hidden = false;
    if (dragonWorldNoticeTimer !== null) window.clearTimeout(dragonWorldNoticeTimer);
    dragonWorldNoticeTimer = window.setTimeout(() => {
      elements.worldNotice.hidden = true;
      dragonWorldNoticeTimer = null;
    }, 6_000);
  }

  function renderResult(result: BossResult, title: string, showEmpty = false) {
    elements.resultTitle.textContent = title;
    elements.resultTotal.textContent = `${Math.round(result.totalDamage).toLocaleString()} TOTAL DAMAGE`;
    elements.resultContributors.replaceChildren();
    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-result-row";
      const name = document.createElement("span");
      name.className = "dragon-result-name";
      renderPlayerName(name, contributor.identity, contributor.name, contributor.gender);
      const damage = document.createElement("span");
      damage.className = "dragon-result-damage";
      damage.textContent = Math.round(contributor.damage).toLocaleString();
      const percentage = document.createElement("span");
      percentage.className = "dragon-result-percentage";
      percentage.textContent = `${contributor.percentage.toFixed(1)}%`;
      row.append(name, damage, percentage);
      elements.resultContributors.append(row);
    }
    if (showEmpty && !result.contributors.length) {
      const empty = document.createElement("div");
      empty.className = "dragon-result-row";
      empty.textContent = "NO DAMAGE RECORDS";
      elements.resultContributors.append(empty);
    }
    elements.result.hidden = false;
  }

  function showSpiderResult(result: BossResult | null | undefined) {
    if (!result || shownSpiderResultEncounter === result.encounter || (portalCutsceneActive() && queuedSpiderResult?.encounter === result.encounter)) return;
    pendingSpiderResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (!localContribution) {
      showWorldResult(result, "DESERT SPIDER DEFEATED");
      return;
    }
    if (currentMapIsDesert() && !hasSeenSnowlandsPortalCutscene()) {
      queuedSpiderResult = result;
      startSnowlandsPortalCutscene();
      return;
    }
    shownSpiderResultEncounter = result.encounter;
    renderResult(result, "Desert Spider Defeated");
    const damageReward = scaledReward("damage", SPIDER_REWARD_DAMAGE);
    const healthReward = scaledReward("health", SPIDER_REWARD_HEALTH);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedSpiderEncounters.has(encounterKey)) {
      // The authoritative reward arrives through the server result. Mirror it
      // into the active runtime now so the overhead HP and Power labels change
      // in the same frame as the reward notice, not after a later save sync.
      locallyRewardedSpiderEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    showMessage(`${rewardLabel(damageReward)} · ${rewardLabel(healthReward)}`, "#f5e9c4");
  }

  function showFrostclawResult(result: BossResult | null | undefined) {
    if (!result || shownFrostclawResultEncounter === result.encounter || (portalCutsceneActive() && queuedFrostclawResult?.encounter === result.encounter)) return;
    pendingFrostclawResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (!localContribution) {
      showWorldResult(result, "FROSTCLAW DEFEATED");
      return;
    }
    if (currentMapIsSnow() && !hasSeenLavaPortalCutscene()) {
      queuedFrostclawResult = result;
      startLavaPortalCutscene();
      return;
    }
    shownFrostclawResultEncounter = result.encounter;
    renderResult(result, "Frostclaw Defeated");
    const damageReward = scaledReward("damage", FROSTCLAW_REWARD_DAMAGE);
    const healthReward = scaledReward("health", FROSTCLAW_REWARD_HEALTH);
    const armorReward = scaledReward("armor", FROSTCLAW_REWARD_ARMOR);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedFrostclawEncounters.has(encounterKey)) {
      locallyRewardedFrostclawEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    showMessage(`${rewardLabel(damageReward)} · ${rewardLabel(healthReward)} · ${rewardLabel(armorReward)}`, "#dff7ff");
  }

  function showMagmaliskResult(result: BossResult | null | undefined) {
    if (!result || shownMagmaliskResultEncounter === result.encounter || (portalCutsceneActive() && queuedMagmaliskResult?.encounter === result.encounter)) return;
    pendingMagmaliskResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (!localContribution) {
      shownMagmaliskResultEncounter = result.encounter;
      showWorldResult(result, "MAGMALISK DEFEATED");
      return;
    }
    if (currentMapIsLava() && !hasSeenInfernalPortalCutscene()) {
      queuedMagmaliskResult = result;
      startInfernalPortalCutscene();
      return;
    }
    shownMagmaliskResultEncounter = result.encounter;
    renderResult(result, "Magmalisk Defeated");
    const damageReward = scaledReward("damage", MAGMALISK_REWARD_DAMAGE);
    const healthReward = scaledReward("health", MAGMALISK_REWARD_HEALTH);
    const armorReward = scaledReward("armor", MAGMALISK_REWARD_ARMOR);
    const regenReward = scaledReward("regen", MAGMALISK_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedMagmaliskEncounters.has(encounterKey)) {
      locallyRewardedMagmaliskEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
    showMessage(
      `${rewardLabel(damageReward)} · ${rewardLabel(healthReward)} · ${rewardLabel(armorReward)} · ${rewardLabel(regenReward)}`,
      "#ffcf8f",
    );
  }

  function showGloomrootResult(result: BossResult | null | undefined) {
    if (!result || shownGloomrootResultEncounter === result.encounter || (portalCutsceneActive() && queuedGloomrootResult?.encounter === result.encounter)) return;
    pendingGloomrootResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (!localContribution) {
      shownGloomrootResultEncounter = result.encounter;
      showWorldResult(result, "GLOOMROOT DEFEATED");
      return;
    }
    if (currentMapIsInfernal() && !hasSeenWaterPortalCutscene()) {
      queuedGloomrootResult = result;
      startWaterPortalCutscene();
      return;
    }
    shownGloomrootResultEncounter = result.encounter;
    renderResult(result, "Gloomroot Defeated");
    const damageReward = scaledReward("damage", GLOOMROOT_REWARD_DAMAGE);
    const healthReward = scaledReward("health", GLOOMROOT_REWARD_HEALTH);
    const armorReward = scaledReward("armor", GLOOMROOT_REWARD_ARMOR);
    const regenReward = scaledReward("regen", GLOOMROOT_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedGloomrootEncounters.has(encounterKey)) {
      locallyRewardedGloomrootEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
    showMessage(
      `${rewardLabel(damageReward)} · ${rewardLabel(healthReward)} · ${rewardLabel(armorReward)} · ${rewardLabel(regenReward)}`,
      "#8eefff",
    );
  }

  function showTidewyrmResult(result: BossResult | null | undefined) {
    if (!result || shownTidewyrmResultEncounter === result.encounter || (portalCutsceneActive() && queuedTidewyrmResult?.encounter === result.encounter)) return;
    pendingTidewyrmResultEncounter = null;
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (!localContribution) {
      shownTidewyrmResultEncounter = result.encounter;
      showWorldResult(result, "TIDEWYRM DEFEATED");
      return;
    }
    if (currentMapIsWater() && !hasSeenSamuraiPortalCutscene()) {
      queuedTidewyrmResult = result;
      startSamuraiPortalCutscene();
      return;
    }
    shownTidewyrmResultEncounter = result.encounter;
    renderResult(result, "Tidewyrm Defeated");
    const damageReward = scaledReward("damage", TIDEWYRM_REWARD_DAMAGE);
    const healthReward = scaledReward("health", TIDEWYRM_REWARD_HEALTH);
    const armorReward = scaledReward("armor", TIDEWYRM_REWARD_ARMOR);
    const regenReward = scaledReward("regen", TIDEWYRM_REWARD_REGEN);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedTidewyrmEncounters.has(encounterKey)) {
      locallyRewardedTidewyrmEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      addPlayerBaseMaxHealth(player, healthReward.amount, options.healthMultiplier?.() ?? 1);
      player.armor += armorReward.amount;
      player.regen += regenReward.amount;
    }
    logPickup(rewardLabel(damageReward), "#ff655a");
    logPickup(rewardLabel(healthReward), "#6fe48e");
    logPickup(rewardLabel(armorReward), REWARD_DATA.armor.color);
    logPickup(rewardLabel(regenReward), REWARD_DATA.regen.color);
    showMessage(
      `${rewardLabel(damageReward)} · ${rewardLabel(healthReward)} · ${rewardLabel(armorReward)} · ${rewardLabel(regenReward)}`,
      "#74e9ff",
    );
  }

  function killBoss() {
    if (boss.dead) return;
    boss.dead = true;
    boss.cone = null;
    bossRain.length = 0;
    spawnBurst(boss.x, boss.y, DEATH_PARTICLE_COLOR, 64, 230);
  }

  function showDragonResult(result: BossResult | null | undefined) {
    if (!result || shownDragonResultEncounter === result.encounter) return;
    if (portalCutsceneActive() && queuedDragonResult?.encounter === result.encounter) return;
    if (!running()) {
      shownDragonResultEncounter = result.encounter;
      pendingDragonResultEncounter = null;
      return;
    }
    const localContribution = result.contributors.find((entry) => entry.identity === localIdentity());
    if (localContribution && !hasSeenDragonPortalCutscene()) {
      queuedDragonResult = result;
      startDragonPortalCutscene();
      return;
    }
    shownDragonResultEncounter = result.encounter;
    pendingDragonResultEncounter = null;
    if (!localContribution) {
      showWorldResult(result, "DRAGON DEFEATED");
      elements.worldNotice.style.animation = "none";
      void elements.worldNotice.offsetWidth;
      elements.worldNotice.style.animation = "";
      return;
    }
    renderResult(result, "Dragon Defeated", true);
    const damageReward = scaledReward("damage", DRAGON_REWARD_DAMAGE);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedDragonEncounters.has(encounterKey)) {
      locallyRewardedDragonEncounters.add(encounterKey);
      player.damage += damageReward.amount;
      logPickup(rewardLabel(damageReward), "#ff655a");
      showMessage(rewardLabel(damageReward), "#ff655a");
      saveProgress();
    }
  }

  function syncSpiderState() {
    const shared = getSpiderBoss();
    if (!shared) return;
    const initialized = observedSpiderEncounter !== null;
    const encounterChanged = initialized && observedSpiderEncounter !== shared.encounter;
    const previousHp = spiderBoss.hp;
    if (!initialized || encounterChanged) {
      observedSpiderEncounter = shared.encounter;
      spiderWasAlive = shared.alive;
      spiderBoss.dead = !shared.alive;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
      spiderBoss.web = null;
      spiderVenom.length = 0;
      spiderBoss.hpLossFlashFrom = shared.hp;
      spiderBoss.hpLossFlashTimer = 0;
    } else if (spiderWasAlive && !shared.alive) {
      spiderWasAlive = false;
      spiderBoss.dead = true;
      spiderBoss.web = null;
      spiderVenom.length = 0;
      pendingSpiderResultEncounter = shared.encounter;
      spawnBurst(spiderBoss.x, spiderBoss.y, DEATH_PARTICLE_COLOR, 64, 230);
    } else if (!spiderWasAlive && shared.alive) {
      spiderWasAlive = true;
      spiderBoss.dead = false;
      spiderBoss.attackClock = 3;
      spiderBoss.nextAttack = "web";
    } else if (shared.alive && shared.hp < previousHp) {
      spiderBoss.hpLossFlashFrom = spiderBoss.hpLossFlashTimer > 0 ? Math.max(spiderBoss.hpLossFlashFrom, previousHp) : previousHp;
      spiderBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    }
    spiderBoss.encounter = shared.encounter;
    spiderBoss.maxHp = shared.maxHp;
    spiderBoss.hp = shared.hp;
    if (pendingSpiderResultEncounter !== null) {
      const result = getSpiderResult();
      if (result?.encounter === pendingSpiderResultEncounter) showSpiderResult(result);
    }
  }

  function syncFrostclawState() {
    const shared = getFrostclawBoss();
    if (!shared) return;
    const initialized = observedFrostclawEncounter !== null;
    const encounterChanged = initialized && observedFrostclawEncounter !== shared.encounter;
    const previousHp = frostclawBoss.hp;
    if (!initialized || encounterChanged) {
      observedFrostclawEncounter = shared.encounter;
      frostclawWasAlive = shared.alive;
      frostclawBoss.dead = !shared.alive;
      frostclawBoss.attackClock = 3;
      frostclawBoss.nextAttack = "roar";
      frostclawBoss.roar = null;
      frostclawBoss.rift = null;
      frostclawBoss.pushTimer = 0;
      frostclawIcefalls.length = 0;
      frostclawBoss.hpLossFlashFrom = shared.hp;
      frostclawBoss.hpLossFlashTimer = 0;
    } else if (frostclawWasAlive && !shared.alive) {
      frostclawWasAlive = false;
      frostclawBoss.dead = true;
      frostclawBoss.roar = null;
      frostclawBoss.rift = null;
      frostclawBoss.pushTimer = 0;
      frostclawIcefalls.length = 0;
      pendingFrostclawResultEncounter = shared.encounter;
      spawnBurst(frostclawBoss.x, frostclawBoss.y, "#8eeeff", 76, 260);
    } else if (!frostclawWasAlive && shared.alive) {
      frostclawWasAlive = true;
      frostclawBoss.dead = false;
      frostclawBoss.attackClock = 3;
      frostclawBoss.nextAttack = "roar";
    } else if (shared.alive && shared.hp < previousHp) {
      frostclawBoss.hpLossFlashFrom = frostclawBoss.hpLossFlashTimer > 0
        ? Math.max(frostclawBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      frostclawBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      frostclawBoss.hpLossFlashFrom = shared.hp;
      frostclawBoss.hpLossFlashTimer = 0;
    }
    frostclawBoss.encounter = shared.encounter;
    frostclawBoss.maxHp = shared.maxHp;
    frostclawBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsSnow() && !hasSeenLavaPortalCutscene()) {
      const result = getFrostclawResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedFrostclawEncounters.add(String(result.encounter));
        showFrostclawResult(result);
      }
    }
    if (pendingFrostclawResultEncounter !== null) {
      const result = getFrostclawResult();
      if (result?.encounter === pendingFrostclawResultEncounter) showFrostclawResult(result);
    }
  }

  function syncMagmaliskState() {
    const shared = getMagmaliskBoss();
    if (!shared) return;
    const initialized = observedMagmaliskEncounter !== null;
    const encounterChanged = initialized && observedMagmaliskEncounter !== shared.encounter;
    const previousHp = magmaliskBoss.hp;
    if (!initialized || encounterChanged) {
      observedMagmaliskEncounter = shared.encounter;
      magmaliskWasAlive = shared.alive;
      magmaliskBoss.dead = !shared.alive;
      magmaliskBoss.attackClock = 3;
      magmaliskBoss.nextAttack = "bite";
      magmaliskBoss.bite = null;
      magmaliskEruptions.length = 0;
      magmaliskBoss.hpLossFlashFrom = shared.hp;
      magmaliskBoss.hpLossFlashTimer = 0;
    } else if (magmaliskWasAlive && !shared.alive) {
      magmaliskWasAlive = false;
      magmaliskBoss.dead = true;
      magmaliskBoss.bite = null;
      magmaliskEruptions.length = 0;
      pendingMagmaliskResultEncounter = shared.encounter;
      spawnBurst(magmaliskBoss.x, magmaliskBoss.y, "#ff6b24", 88, 280);
    } else if (!magmaliskWasAlive && shared.alive) {
      magmaliskWasAlive = true;
      magmaliskBoss.dead = false;
      magmaliskBoss.attackClock = 3;
      magmaliskBoss.nextAttack = "bite";
    } else if (shared.alive && shared.hp < previousHp) {
      magmaliskBoss.hpLossFlashFrom = magmaliskBoss.hpLossFlashTimer > 0
        ? Math.max(magmaliskBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      magmaliskBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      magmaliskBoss.hpLossFlashFrom = shared.hp;
      magmaliskBoss.hpLossFlashTimer = 0;
    }
    magmaliskBoss.encounter = shared.encounter;
    magmaliskBoss.maxHp = shared.maxHp;
    magmaliskBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsLava()) {
      const result = getMagmaliskResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedMagmaliskEncounters.add(String(result.encounter));
        showMagmaliskResult(result);
      }
    }
    if (pendingMagmaliskResultEncounter !== null) {
      const result = getMagmaliskResult();
      if (result?.encounter === pendingMagmaliskResultEncounter) showMagmaliskResult(result);
    }
  }

  function syncGloomrootState() {
    const shared = getGloomrootBoss();
    if (!shared) return;
    const initialized = observedGloomrootEncounter !== null;
    const encounterChanged = initialized && observedGloomrootEncounter !== shared.encounter;
    const previousHp = gloomrootBoss.hp;
    if (!initialized || encounterChanged) {
      observedGloomrootEncounter = shared.encounter;
      gloomrootWasAlive = shared.alive;
      gloomrootBoss.dead = !shared.alive;
      gloomrootBoss.attackClock = 3;
      gloomrootBoss.nextAttack = "sweep";
      gloomrootBoss.sweep = null;
      gloomrootBlooms.length = 0;
      gloomrootBoss.hpLossFlashFrom = shared.hp;
      gloomrootBoss.hpLossFlashTimer = 0;
    } else if (gloomrootWasAlive && !shared.alive) {
      gloomrootWasAlive = false;
      gloomrootBoss.dead = true;
      gloomrootBoss.sweep = null;
      gloomrootBlooms.length = 0;
      pendingGloomrootResultEncounter = shared.encounter;
      spawnBurst(gloomrootBoss.x, gloomrootBoss.y, "#43d9e6", 96, 290);
    } else if (!gloomrootWasAlive && shared.alive) {
      gloomrootWasAlive = true;
      gloomrootBoss.dead = false;
      gloomrootBoss.attackClock = 3;
      gloomrootBoss.nextAttack = "sweep";
    } else if (shared.alive && shared.hp < previousHp) {
      gloomrootBoss.hpLossFlashFrom = gloomrootBoss.hpLossFlashTimer > 0
        ? Math.max(gloomrootBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      gloomrootBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      gloomrootBoss.hpLossFlashFrom = shared.hp;
      gloomrootBoss.hpLossFlashTimer = 0;
    }
    gloomrootBoss.encounter = shared.encounter;
    gloomrootBoss.maxHp = shared.maxHp;
    gloomrootBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsInfernal()) {
      const result = getGloomrootResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedGloomrootEncounters.add(String(result.encounter));
        showGloomrootResult(result);
      }
    }
    if (pendingGloomrootResultEncounter !== null) {
      const result = getGloomrootResult();
      if (result?.encounter === pendingGloomrootResultEncounter) showGloomrootResult(result);
    }
  }

  function syncTidewyrmState() {
    const shared = getTidewyrmBoss();
    if (!shared) return;
    const initialized = observedTidewyrmEncounter !== null;
    const encounterChanged = initialized && observedTidewyrmEncounter !== shared.encounter;
    const previousHp = tidewyrmBoss.hp;
    if (!initialized || encounterChanged) {
      observedTidewyrmEncounter = shared.encounter;
      tidewyrmWasAlive = shared.alive;
      tidewyrmBoss.dead = !shared.alive;
      tidewyrmBoss.attackClock = 3;
      tidewyrmBoss.nextAttack = "surge";
      tidewyrmBoss.surge = null;
      tidewyrmWhirlpools.length = 0;
      tidewyrmBoss.hpLossFlashFrom = shared.hp;
      tidewyrmBoss.hpLossFlashTimer = 0;
    } else if (tidewyrmWasAlive && !shared.alive) {
      tidewyrmWasAlive = false;
      tidewyrmBoss.dead = true;
      tidewyrmBoss.surge = null;
      tidewyrmWhirlpools.length = 0;
      pendingTidewyrmResultEncounter = shared.encounter;
      spawnBurst(tidewyrmBoss.x, tidewyrmBoss.y, "#40d9f2", 104, 310);
    } else if (!tidewyrmWasAlive && shared.alive) {
      tidewyrmWasAlive = true;
      tidewyrmBoss.dead = false;
      tidewyrmBoss.attackClock = 3;
      tidewyrmBoss.nextAttack = "surge";
    } else if (shared.alive && shared.hp < previousHp) {
      tidewyrmBoss.hpLossFlashFrom = tidewyrmBoss.hpLossFlashTimer > 0
        ? Math.max(tidewyrmBoss.hpLossFlashFrom, previousHp)
        : previousHp;
      tidewyrmBoss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      tidewyrmBoss.hpLossFlashFrom = shared.hp;
      tidewyrmBoss.hpLossFlashTimer = 0;
    }
    tidewyrmBoss.encounter = shared.encounter;
    tidewyrmBoss.maxHp = shared.maxHp;
    tidewyrmBoss.hp = shared.hp;
    if (!initialized && !shared.alive && currentMapIsWater()) {
      const result = getTidewyrmResult();
      if (result?.encounter === shared.encounter && result.contributors.some((entry) => entry.identity === localIdentity())) {
        locallyRewardedTidewyrmEncounters.add(String(result.encounter));
        showTidewyrmResult(result);
      }
    }
    if (pendingTidewyrmResultEncounter !== null) {
      const result = getTidewyrmResult();
      if (result?.encounter === pendingTidewyrmResultEncounter) showTidewyrmResult(result);
    }
  }

  function syncDragonState() {
    const shared = getDragonBoss();
    if (!shared) return;
    const initialized = observedDragonEncounter !== null;
    const encounterChanged = initialized && observedDragonEncounter !== shared.encounter;
    const previousHp = boss.hp;
    if (!initialized) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      boss.dead = !shared.alive;
      if (boss.dead) { boss.cone = null; bossRain.length = 0; }
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (encounterChanged) {
      observedDragonEncounter = shared.encounter;
      dragonWasAlive = shared.alive;
      pendingDragonResultEncounter = null;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      boss.dead = !shared.alive;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (dragonWasAlive && !shared.alive) {
      pendingDragonResultEncounter = shared.encounter;
      killBoss();
      dragonWasAlive = false;
    } else if (!dragonWasAlive && shared.alive) {
      dragonWasAlive = true;
      boss.dead = false;
      boss.attackClock = 3;
      boss.nextAttack = "cone";
      boss.cone = null;
      bossRain.length = 0;
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    } else if (shared.alive && shared.hp < previousHp) {
      boss.hpLossFlashFrom = boss.hpLossFlashTimer > 0 ? Math.max(boss.hpLossFlashFrom, previousHp) : previousHp;
      boss.hpLossFlashTimer = BOSS_HP_LOSS_FLASH_DURATION;
    } else if (shared.hp > previousHp) {
      boss.hpLossFlashFrom = shared.hp;
      boss.hpLossFlashTimer = 0;
    }
    boss.encounter = shared.encounter;
    boss.maxHp = shared.maxHp;
    boss.hp = shared.hp;
    if (!shared.alive) boss.dead = true;
    if (pendingDragonResultEncounter !== null && shownDragonResultEncounter !== pendingDragonResultEncounter) {
      const result = getDragonResult();
      if (result?.encounter === pendingDragonResultEncounter) showDragonResult(result);
    }
  }

  function startBossCone() {
    boss.cone = { angle: Math.atan2(player.y - boss.y, player.x - boss.x), windup: DRAGON_CONE_WINDUP, timer: DRAGON_CONE_DURATION, duration: DRAGON_CONE_DURATION, hitPlayer: false, pushAngle: null };
    boss.nextAttack = "rain";
  }

  function startBossRain() {
    for (let i = 0; i < 8; i++) {
      const angle = i * TAU / 8 + rand(-.25, .25);
      const radius = rand(24, BOSS_RAIN_RANGE);
      const timer = .8 + i * .14;
      bossRain.push({ x: clamp(player.x + Math.cos(angle) * radius, 60, WORLD.w - 60), y: clamp(player.y + Math.sin(angle) * radius, 60, WORLD.h - 60), timer, maxTimer: timer, r: 52 });
    }
    boss.attackClock = 4.8;
    boss.nextAttack = "cone";
  }

  function updateBoss(dt: number) {
    boss.hpLossFlashTimer = Math.max(0, boss.hpLossFlashTimer - dt);
    boss.contactDamageClock = Math.max(0, boss.contactDamageClock - dt);
    if (boss.dead) return;
    boss.hurt = Math.max(0, boss.hurt - dt);
    for (let i = bossRain.length - 1; i >= 0; i--) {
      const strike = bossRain[i];
      strike.timer -= dt;
      if (strike.timer <= 0) {
        const dx = player.x - strike.x;
        const dy = player.y - strike.y;
        if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(DRAGON_RAIN_DAMAGE);
        spawnBurst(strike.x, strike.y, "#ff5d32", 22, 170);
        bossRain.splice(i, 1);
      }
    }
    if (boss.cone) {
      const cone = boss.cone;
      if (cone.windup > 0) { cone.windup -= dt; return; }
      const previousProgress = clamp(1 - cone.timer / cone.duration, 0, 1);
      cone.timer -= dt;
      const progress = clamp(1 - cone.timer / cone.duration, 0, 1);
      const minRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * previousProgress;
      const maxRadius = boss.r + (BOSS_CONE_RANGE - boss.r) * progress;
      if (!cone.hitPlayer) {
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(Math.sin(Math.atan2(dy, dx) - cone.angle), Math.cos(Math.atan2(dy, dx) - cone.angle));
        if (distance >= minRadius - 34 && distance <= maxRadius + 34 && Math.abs(angleDelta) <= BOSS_CONE_HALF_ANGLE) {
          cone.hitPlayer = true;
          damagePlayer(DRAGON_CONE_DAMAGE);
          cone.pushAngle = Math.atan2(dy, dx);
          spawnBurst(player.x, player.y, "#ffb14a", 18, 165);
        }
      }
      if (cone.timer <= 0) {
        spawnBurst(boss.x + Math.cos(cone.angle) * BOSS_CONE_RANGE, boss.y + Math.sin(cone.angle) * BOSS_CONE_RANGE, "#ff9b3d", 28, 210);
        boss.cone = null;
        boss.attackClock = 2.8;
      }
      return;
    }
    if (boss.attackClock > 0) { boss.attackClock -= dt; return; }
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    if (dx * dx + dy * dy > BOSS_AGGRO_RANGE * BOSS_AGGRO_RANGE) return;
    if (boss.nextAttack === "cone") startBossCone(); else startBossRain();
  }

  function updateSpiderBoss(dt: number) {
    spiderBoss.hpLossFlashTimer = Math.max(0, spiderBoss.hpLossFlashTimer - dt);
    spiderBoss.contactDamageClock = Math.max(0, spiderBoss.contactDamageClock - dt);
    if (spiderBoss.dead) return;
    for (let i = spiderVenom.length - 1; i >= 0; i--) {
      const pool = spiderVenom[i];
      pool.timer -= dt;
      if (pool.timer <= 0) {
        const dx = player.x - pool.x;
        const dy = player.y - pool.y;
        if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(SPIDER_VENOM_DAMAGE);
        spawnBurst(pool.x, pool.y, "#89e255", 22, 150);
        spiderVenom.splice(i, 1);
      }
    }
    if (spiderBoss.web) {
      const web = spiderBoss.web;
      const previousProgress = clamp(1 - web.timer / web.duration, 0, 1);
      web.timer -= dt;
      const progress = clamp(1 - web.timer / web.duration, 0, 1);
      const minRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * previousProgress;
      const maxRadius = spiderBoss.r + (SPIDER_WEB_RANGE - spiderBoss.r) * progress;
      const distance = Math.hypot(player.x - spiderBoss.x, player.y - spiderBoss.y);
      if (!web.hitPlayer && distance >= minRadius - 30 && distance <= maxRadius + 30) { web.hitPlayer = true; damagePlayer(SPIDER_WEB_DAMAGE); }
      if (web.timer <= 0) { spiderBoss.web = null; spiderBoss.attackClock = 2.5; }
      return;
    }
    spiderBoss.attackClock -= dt;
    if (spiderBoss.attackClock > 0) return;
    const dx = player.x - spiderBoss.x;
    const dy = player.y - spiderBoss.y;
    if (dx * dx + dy * dy > SPIDER_AGGRO_RANGE * SPIDER_AGGRO_RANGE) return;
    if (spiderBoss.nextAttack === "web") {
      spiderBoss.web = { timer: 1.15, duration: 1.15, hitPlayer: false };
      spiderBoss.nextAttack = "venom";
    } else {
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6 + rand(-.25, .25);
        const radius = rand(15, 125);
        const timer = .9 + i * .13;
        spiderVenom.push({ x: clamp(player.x + Math.cos(angle) * radius, 60, WORLD.w - 60), y: clamp(player.y + Math.sin(angle) * radius, 60, WORLD.h - 60), timer, maxTimer: timer, r: 58 });
      }
      spiderBoss.attackClock = 4.2;
      spiderBoss.nextAttack = "web";
    }
  }

  function startFrostclawRoar() {
    frostclawBoss.roar = {
      windup: FROSTCLAW_ROAR_WINDUP,
      timer: FROSTCLAW_ROAR_DURATION,
      duration: FROSTCLAW_ROAR_DURATION,
      hitPlayer: false,
    };
    frostclawBoss.nextAttack = "icefall";
  }

  function startFrostclawIcefall() {
    for (let index = 0; index < 9; index += 1) {
      const angle = index * TAU / 9 + rand(-.32, .32);
      const radius = index === 0 ? 0 : rand(42, 185);
      const timer = .8 + index * .13;
      frostclawIcefalls.push({
        x: clamp(player.x + Math.cos(angle) * radius, 70, WORLD.w - 70),
        y: clamp(player.y + Math.sin(angle) * radius, 70, WORLD.h - 70),
        r: 66,
        timer,
        maxTimer: timer,
      });
    }
    frostclawBoss.attackClock = 4.8;
    frostclawBoss.nextAttack = "rift";
  }

  function startFrostclawRift() {
    frostclawBoss.rift = {
      angle: Math.atan2(player.y - frostclawBoss.y, player.x - frostclawBoss.x),
      windup: FROSTCLAW_RIFT_WINDUP,
      timer: FROSTCLAW_RIFT_DURATION,
      duration: FROSTCLAW_RIFT_DURATION,
      hitPlayer: false,
    };
    frostclawBoss.nextAttack = "roar";
  }

  function updateFrostclawBoss(dt: number) {
    frostclawBoss.hpLossFlashTimer = Math.max(0, frostclawBoss.hpLossFlashTimer - dt);
    frostclawBoss.contactDamageClock = Math.max(0, frostclawBoss.contactDamageClock - dt);
    if (frostclawBoss.dead) return;
    frostclawBoss.hurt = Math.max(0, frostclawBoss.hurt - dt);

    for (let index = frostclawIcefalls.length - 1; index >= 0; index -= 1) {
      const strike = frostclawIcefalls[index];
      strike.timer -= dt;
      if (strike.timer > 0) continue;
      const dx = player.x - strike.x;
      const dy = player.y - strike.y;
      if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(FROSTCLAW_ICEFALL_DAMAGE);
      spawnBurst(strike.x, strike.y, "#a9f5ff", 28, 190);
      frostclawIcefalls.splice(index, 1);
    }

    if (frostclawBoss.roar) {
      const roar = frostclawBoss.roar;
      if (roar.windup > 0) {
        roar.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - roar.timer / roar.duration, 0, 1);
      roar.timer -= dt;
      const progress = clamp(1 - roar.timer / roar.duration, 0, 1);
      const minRadius = frostclawBoss.r + (FROSTCLAW_ROAR_RANGE - frostclawBoss.r) * previousProgress;
      const maxRadius = frostclawBoss.r + (FROSTCLAW_ROAR_RANGE - frostclawBoss.r) * progress;
      if (!roar.hitPlayer) {
        const dx = player.x - frostclawBoss.x;
        const dy = player.y - frostclawBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance >= minRadius - 38 && distance <= maxRadius + 38) {
          roar.hitPlayer = true;
          damagePlayer(FROSTCLAW_ROAR_DAMAGE);
          frostclawBoss.pushAngle = Math.atan2(dy, dx);
          frostclawBoss.pushTimer = FROSTCLAW_PUSH_DURATION;
          spawnBurst(player.x, player.y, "#d8fbff", 24, 210);
        }
      }
      if (roar.timer <= 0) {
        frostclawBoss.roar = null;
        frostclawBoss.attackClock = 2.6;
      }
      return;
    }

    if (frostclawBoss.rift) {
      const rift = frostclawBoss.rift;
      if (rift.windup > 0) {
        rift.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - rift.timer / rift.duration, 0, 1);
      rift.timer -= dt;
      const progress = clamp(1 - rift.timer / rift.duration, 0, 1);
      const minRadius = frostclawBoss.r + (FROSTCLAW_RIFT_RANGE - frostclawBoss.r) * previousProgress;
      const maxRadius = frostclawBoss.r + (FROSTCLAW_RIFT_RANGE - frostclawBoss.r) * progress;
      if (!rift.hitPlayer) {
        const dx = player.x - frostclawBoss.x;
        const dy = player.y - frostclawBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const playerAngle = Math.atan2(dy, dx);
        const inRift = [-.28, 0, .28].some((offset) => {
          const angleDelta = Math.atan2(
            Math.sin(playerAngle - rift.angle - offset),
            Math.cos(playerAngle - rift.angle - offset),
          );
          return Math.abs(angleDelta) <= FROSTCLAW_RIFT_HALF_ANGLE + 24 / distance;
        });
        if (inRift && distance >= minRadius - 32 && distance <= maxRadius + 32) {
          rift.hitPlayer = true;
          damagePlayer(FROSTCLAW_RIFT_DAMAGE);
          spawnBurst(player.x, player.y, "#71dfff", 26, 220);
        }
      }
      if (rift.timer <= 0) {
        frostclawBoss.rift = null;
        frostclawBoss.attackClock = 2.9;
      }
      return;
    }

    frostclawBoss.attackClock -= dt;
    if (frostclawBoss.attackClock > 0) return;
    const dx = player.x - frostclawBoss.x;
    const dy = player.y - frostclawBoss.y;
    if (dx * dx + dy * dy > FROSTCLAW_AGGRO_RANGE * FROSTCLAW_AGGRO_RANGE) return;
    if (frostclawBoss.nextAttack === "roar") startFrostclawRoar();
    else if (frostclawBoss.nextAttack === "icefall") startFrostclawIcefall();
    else startFrostclawRift();
  }

  function startMagmaliskBite() {
    magmaliskBoss.bite = {
      angle: Math.atan2(player.y - magmaliskBoss.y, player.x - magmaliskBoss.x),
      windup: MAGMALISK_BITE_WINDUP,
      timer: MAGMALISK_BITE_DURATION,
      duration: MAGMALISK_BITE_DURATION,
      hitPlayer: false,
      pushAngle: null,
    };
    magmaliskBoss.nextAttack = "eruption";
  }

  function startMagmaliskEruption() {
    for (let index = 0; index < 11; index += 1) {
      const angle = index * TAU / 11 + rand(-.3, .3);
      const radius = index === 0 ? 0 : rand(48, 230);
      const timer = .8 + index * .11;
      magmaliskEruptions.push({
        x: clamp(player.x + Math.cos(angle) * radius, 72, WORLD.w - 72),
        y: clamp(player.y + Math.sin(angle) * radius, 72, WORLD.h - 72),
        r: 72,
        timer,
        maxTimer: timer,
      });
    }
    magmaliskBoss.attackClock = 3.1;
    magmaliskBoss.nextAttack = "bite";
  }

  function updateMagmaliskBoss(dt: number) {
    magmaliskBoss.hpLossFlashTimer = Math.max(0, magmaliskBoss.hpLossFlashTimer - dt);
    magmaliskBoss.contactDamageClock = Math.max(0, magmaliskBoss.contactDamageClock - dt);
    if (magmaliskBoss.dead) return;
    magmaliskBoss.hurt = Math.max(0, magmaliskBoss.hurt - dt);

    for (let index = magmaliskEruptions.length - 1; index >= 0; index -= 1) {
      const eruption = magmaliskEruptions[index];
      eruption.timer -= dt;
      if (eruption.timer > 0) continue;
      const dx = player.x - eruption.x;
      const dy = player.y - eruption.y;
      if (dx * dx + dy * dy <= eruption.r * eruption.r) damagePlayer(MAGMALISK_ERUPTION_DAMAGE);
      spawnBurst(eruption.x, eruption.y, "#ff7a24", 32, 220);
      magmaliskEruptions.splice(index, 1);
    }
    if (magmaliskEruptions.length > 0) return;

    if (magmaliskBoss.bite) {
      const bite = magmaliskBoss.bite;
      if (bite.windup > 0) {
        bite.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - bite.timer / bite.duration, 0, 1);
      bite.timer -= dt;
      const progress = clamp(1 - bite.timer / bite.duration, 0, 1);
      const minRadius = magmaliskBoss.r + (MAGMALISK_BITE_RANGE - magmaliskBoss.r) * previousProgress;
      const maxRadius = magmaliskBoss.r + (MAGMALISK_BITE_RANGE - magmaliskBoss.r) * progress;
      if (!bite.hitPlayer) {
        const dx = player.x - magmaliskBoss.x;
        const dy = player.y - magmaliskBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - bite.angle),
          Math.cos(Math.atan2(dy, dx) - bite.angle),
        );
        if (distance >= minRadius - 38 && distance <= maxRadius + 38 && Math.abs(angleDelta) <= MAGMALISK_BITE_HALF_ANGLE) {
          bite.hitPlayer = true;
          damagePlayer(MAGMALISK_BITE_DAMAGE);
          spawnBurst(player.x, player.y, "#ffb13b", 28, 230);
        }
      }
      if (bite.timer <= 0) {
        magmaliskBoss.bite = null;
        magmaliskBoss.attackClock = 2.4;
      }
      return;
    }

    magmaliskBoss.attackClock -= dt;
    if (magmaliskBoss.attackClock > 0) return;
    const dx = player.x - magmaliskBoss.x;
    const dy = player.y - magmaliskBoss.y;
    if (dx * dx + dy * dy > MAGMALISK_AGGRO_RANGE * MAGMALISK_AGGRO_RANGE) return;
    if (magmaliskBoss.nextAttack === "bite") startMagmaliskBite();
    else startMagmaliskEruption();
  }

  function startGloomrootSweep() {
    gloomrootBoss.sweep = {
      angle: Math.atan2(player.y - gloomrootBoss.y, player.x - gloomrootBoss.x),
      windup: GLOOMROOT_SWEEP_WINDUP,
      timer: GLOOMROOT_SWEEP_DURATION,
      duration: GLOOMROOT_SWEEP_DURATION,
      hitPlayer: false,
      pushAngle: null,
    };
    gloomrootBoss.nextAttack = "bloom";
  }

  function startGloomrootBloom() {
    for (let index = 0; index < 12; index += 1) {
      const angle = index * TAU / 12 + rand(-.28, .28);
      const radius = index === 0 ? 0 : rand(55, 255);
      const timer = .9 + index * .1;
      gloomrootBlooms.push({
        x: clamp(player.x + Math.cos(angle) * radius, 74, WORLD.w - 74),
        y: clamp(player.y + Math.sin(angle) * radius, 74, WORLD.h - 74),
        r: 74,
        timer,
        maxTimer: timer,
      });
    }
    gloomrootBoss.attackClock = 3.2;
    gloomrootBoss.nextAttack = "sweep";
  }

  function updateGloomrootBoss(dt: number) {
    gloomrootBoss.hpLossFlashTimer = Math.max(0, gloomrootBoss.hpLossFlashTimer - dt);
    gloomrootBoss.contactDamageClock = Math.max(0, gloomrootBoss.contactDamageClock - dt);
    if (gloomrootBoss.dead) return;
    gloomrootBoss.hurt = Math.max(0, gloomrootBoss.hurt - dt);

    for (let index = gloomrootBlooms.length - 1; index >= 0; index -= 1) {
      const bloom = gloomrootBlooms[index];
      bloom.timer -= dt;
      if (bloom.timer > 0) continue;
      const dx = player.x - bloom.x;
      const dy = player.y - bloom.y;
      if (dx * dx + dy * dy <= bloom.r * bloom.r) damagePlayer(GLOOMROOT_BLOOM_DAMAGE);
      spawnBurst(bloom.x, bloom.y, "#58e2ee", 34, 225);
      gloomrootBlooms.splice(index, 1);
    }
    if (gloomrootBlooms.length > 0) return;

    if (gloomrootBoss.sweep) {
      const sweep = gloomrootBoss.sweep;
      if (sweep.windup > 0) {
        sweep.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - sweep.timer / sweep.duration, 0, 1);
      sweep.timer -= dt;
      const progress = clamp(1 - sweep.timer / sweep.duration, 0, 1);
      const minRadius = gloomrootBoss.r + (GLOOMROOT_SWEEP_RANGE - gloomrootBoss.r) * previousProgress;
      const maxRadius = gloomrootBoss.r + (GLOOMROOT_SWEEP_RANGE - gloomrootBoss.r) * progress;
      if (!sweep.hitPlayer) {
        const dx = player.x - gloomrootBoss.x;
        const dy = player.y - gloomrootBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - sweep.angle),
          Math.cos(Math.atan2(dy, dx) - sweep.angle),
        );
        if (distance >= minRadius - 40 && distance <= maxRadius + 40 && Math.abs(angleDelta) <= GLOOMROOT_SWEEP_HALF_ANGLE) {
          sweep.hitPlayer = true;
          damagePlayer(GLOOMROOT_SWEEP_DAMAGE);
          spawnBurst(player.x, player.y, "#8af4f3", 30, 235);
        }
      }
      if (sweep.timer <= 0) {
        gloomrootBoss.sweep = null;
        gloomrootBoss.attackClock = 2.5;
      }
      return;
    }

    gloomrootBoss.attackClock -= dt;
    if (gloomrootBoss.attackClock > 0) return;
    const dx = player.x - gloomrootBoss.x;
    const dy = player.y - gloomrootBoss.y;
    if (dx * dx + dy * dy > GLOOMROOT_AGGRO_RANGE * GLOOMROOT_AGGRO_RANGE) return;
    if (gloomrootBoss.nextAttack === "sweep") startGloomrootSweep();
    else startGloomrootBloom();
  }

  function startTidewyrmSurge() {
    tidewyrmBoss.surge = {
      angle: Math.atan2(player.y - tidewyrmBoss.y, player.x - tidewyrmBoss.x),
      windup: TIDEWYRM_SURGE_WINDUP,
      timer: TIDEWYRM_SURGE_DURATION,
      duration: TIDEWYRM_SURGE_DURATION,
      hitPlayer: false,
      pushAngle: null,
    };
    tidewyrmBoss.nextAttack = "whirlpool";
  }

  function startTidewyrmWhirlpools() {
    for (let index = 0; index < 11; index += 1) {
      const angle = index * TAU / 11 + rand(-.25, .25);
      const radius = index === 0 ? 0 : rand(70, 290);
      const timer = .85 + index * .11;
      tidewyrmWhirlpools.push({
        x: clamp(player.x + Math.cos(angle) * radius, 82, WORLD.w - 82),
        y: clamp(player.y + Math.sin(angle) * radius, 82, WORLD.h - 82),
        r: 82,
        timer,
        maxTimer: timer,
      });
    }
    tidewyrmBoss.attackClock = 3.15;
    tidewyrmBoss.nextAttack = "surge";
  }

  function updateTidewyrmBoss(dt: number) {
    tidewyrmBoss.hpLossFlashTimer = Math.max(0, tidewyrmBoss.hpLossFlashTimer - dt);
    tidewyrmBoss.contactDamageClock = Math.max(0, tidewyrmBoss.contactDamageClock - dt);
    if (tidewyrmBoss.dead) return;
    tidewyrmBoss.hurt = Math.max(0, tidewyrmBoss.hurt - dt);

    for (let index = tidewyrmWhirlpools.length - 1; index >= 0; index -= 1) {
      const pool = tidewyrmWhirlpools[index];
      pool.timer -= dt;
      if (pool.timer > 0) continue;
      const dx = player.x - pool.x;
      const dy = player.y - pool.y;
      if (dx * dx + dy * dy <= pool.r * pool.r) damagePlayer(TIDEWYRM_WHIRLPOOL_DAMAGE);
      spawnBurst(pool.x, pool.y, "#5eeaff", 38, 245);
      tidewyrmWhirlpools.splice(index, 1);
    }
    if (tidewyrmWhirlpools.length > 0) return;

    if (tidewyrmBoss.surge) {
      const surge = tidewyrmBoss.surge;
      if (surge.windup > 0) {
        surge.windup -= dt;
        return;
      }
      const previousProgress = clamp(1 - surge.timer / surge.duration, 0, 1);
      surge.timer -= dt;
      const progress = clamp(1 - surge.timer / surge.duration, 0, 1);
      const minRadius = tidewyrmBoss.r + (TIDEWYRM_SURGE_RANGE - tidewyrmBoss.r) * previousProgress;
      const maxRadius = tidewyrmBoss.r + (TIDEWYRM_SURGE_RANGE - tidewyrmBoss.r) * progress;
      if (!surge.hitPlayer) {
        const dx = player.x - tidewyrmBoss.x;
        const dy = player.y - tidewyrmBoss.y;
        const distance = Math.hypot(dx, dy) || 1;
        const angleDelta = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - surge.angle),
          Math.cos(Math.atan2(dy, dx) - surge.angle),
        );
        if (distance >= minRadius - 42 && distance <= maxRadius + 42 && Math.abs(angleDelta) <= TIDEWYRM_SURGE_HALF_ANGLE) {
          surge.hitPlayer = true;
          damagePlayer(TIDEWYRM_SURGE_DAMAGE);
          spawnBurst(player.x, player.y, "#b7f7ff", 32, 250);
        }
      }
      if (surge.timer <= 0) {
        tidewyrmBoss.surge = null;
        tidewyrmBoss.attackClock = 2.45;
      }
      return;
    }

    tidewyrmBoss.attackClock -= dt;
    if (tidewyrmBoss.attackClock > 0) return;
    const dx = player.x - tidewyrmBoss.x;
    const dy = player.y - tidewyrmBoss.y;
    if (dx * dx + dy * dy > TIDEWYRM_AGGRO_RANGE * TIDEWYRM_AGGRO_RANGE) return;
    if (tidewyrmBoss.nextAttack === "surge") startTidewyrmSurge();
    else startTidewyrmWhirlpools();
  }

  function resolveCollision(target: DragonBossState | SpiderBossState | FrostclawBossState | MagmaliskBossState | GloomrootBossState | TidewyrmBossState, damage: number, cooldown: number) {
    if (target.dead) return;
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    const minimumDistance = player.r + target.r;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) return;
    if (target.contactDamageClock <= 0) { damagePlayer(damage); target.contactDamageClock = cooldown; }
    const distance = Math.sqrt(distanceSquared);
    const nx = distance > .001 ? dx / distance : 1;
    const ny = distance > .001 ? dy / distance : 0;
    player.x = target.x + nx * minimumDistance;
    player.y = target.y + ny * minimumDistance;
  }

  function applyDragonConePush(dt: number) {
    if (typeof boss.cone?.pushAngle !== "number") return;
    const waveSpeed = (BOSS_CONE_RANGE - boss.r) / boss.cone.duration;
    player.x += Math.cos(boss.cone.pushAngle) * waveSpeed * dt;
    player.y += Math.sin(boss.cone.pushAngle) * waveSpeed * dt;
  }

  function applyFrostclawPush(dt: number) {
    if (frostclawBoss.pushTimer <= 0) return;
    const strength = clamp(frostclawBoss.pushTimer / FROSTCLAW_PUSH_DURATION, 0, 1);
    const distance = FROSTCLAW_PUSH_SPEED * (.45 + strength * .55) * dt;
    player.x = clamp(player.x + Math.cos(frostclawBoss.pushAngle) * distance, player.r, WORLD.w - player.r);
    player.y = clamp(player.y + Math.sin(frostclawBoss.pushAngle) * distance, player.r, WORLD.h - player.r);
    frostclawBoss.pushTimer = Math.max(0, frostclawBoss.pushTimer - dt);
  }

  return {
    resetBoss,
    resetSpiderBoss,
    resetFrostclawBoss,
    resetMagmaliskBoss,
    resetGloomrootBoss,
    resetTidewyrmBoss,
    syncDragonState,
    syncSpiderState,
    syncFrostclawState,
    syncMagmaliskState,
    syncGloomrootState,
    syncTidewyrmState,
    updateBoss,
    updateSpiderBoss,
    updateFrostclawBoss,
    updateMagmaliskBoss,
    updateGloomrootBoss,
    updateTidewyrmBoss,
    resolveDragonCollision: () => resolveCollision(boss, DRAGON_CONTACT_DAMAGE, DRAGON_CONTACT_DAMAGE_COOLDOWN),
    resolveSpiderCollision: () => resolveCollision(spiderBoss, SPIDER_CONTACT_DAMAGE, .75),
    resolveFrostclawCollision: () => resolveCollision(frostclawBoss, FROSTCLAW_CONTACT_DAMAGE, .75),
    resolveMagmaliskCollision: () => resolveCollision(magmaliskBoss, MAGMALISK_CONTACT_DAMAGE, .75),
    resolveGloomrootCollision: () => resolveCollision(gloomrootBoss, GLOOMROOT_CONTACT_DAMAGE, .75),
    resolveTidewyrmCollision: () => resolveCollision(tidewyrmBoss, TIDEWYRM_CONTACT_DAMAGE, .75),
    applyDragonConePush,
    applyFrostclawPush,
    onPortalCutsceneFinished(wasPreview) {
      const dragon = queuedDragonResult;
      queuedDragonResult = null;
      if (dragon && !wasPreview) showDragonResult(dragon);
      const spider = queuedSpiderResult;
      queuedSpiderResult = null;
      if (spider && !wasPreview) showSpiderResult(spider);
      const frostclaw = queuedFrostclawResult;
      queuedFrostclawResult = null;
      if (frostclaw && !wasPreview) showFrostclawResult(frostclaw);
      const magmalisk = queuedMagmaliskResult;
      queuedMagmaliskResult = null;
      if (magmalisk && !wasPreview) showMagmaliskResult(magmalisk);
      const gloomroot = queuedGloomrootResult;
      queuedGloomrootResult = null;
      if (gloomroot && !wasPreview) showGloomrootResult(gloomroot);
      const tidewyrm = queuedTidewyrmResult;
      queuedTidewyrmResult = null;
      if (tidewyrm && !wasPreview) showTidewyrmResult(tidewyrm);
    },
  };
}
