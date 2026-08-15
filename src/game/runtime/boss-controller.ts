import {
  BOSS_AGGRO_RANGE,
  BOSS_CONE_HALF_ANGLE,
  BOSS_CONE_RANGE,
  BOSS_RAIN_RANGE,
  TAU,
  WORLD,
} from "../constants";
import { SPIDER_REWARD_DAMAGE, SPIDER_REWARD_HEALTH } from "../../../shared/rules";
import { clamp, rand } from "../math";
import type {
  BossRainStrike,
  DragonBossState,
  PlayerState,
  SpiderBossState,
  SpiderVenomPool,
} from "./types";

export const BOSS_HP_LOSS_FLASH_DURATION = .18;
export const SPIDER_WEB_RANGE = 720;

const DRAGON_CONE_WINDUP = .75;
const DRAGON_CONE_DURATION = 1.2;
const SPIDER_AGGRO_RANGE = 1150;
const SPIDER_WEB_DAMAGE = 900_000;
const SPIDER_VENOM_DAMAGE = 1_100_000;
const SPIDER_CONTACT_DAMAGE = 1_000_000;
const DRAGON_CONTACT_DAMAGE = 1000;
const DRAGON_CONTACT_DAMAGE_COOLDOWN = .75;
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
  contributors: Array<{ identity: string; name: string; damage: number; percentage: number }>;
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
  syncDragonState: () => void;
  syncSpiderState: () => void;
  updateBoss: (dt: number) => void;
  updateSpiderBoss: (dt: number) => void;
  resolveDragonCollision: () => void;
  resolveSpiderCollision: () => void;
  applyDragonConePush: (dt: number) => void;
  onPortalCutsceneFinished: (wasPreview: boolean) => void;
};

/**
 * Owns world-boss state synchronization, attacks, collision, and reward UI.
 * The application entry point supplies DOM and multiplayer boundaries only.
 */
export function createBossController(options: {
  boss: DragonBossState;
  spiderBoss: SpiderBossState;
  bossRain: BossRainStrike[];
  spiderVenom: SpiderVenomPool[];
  player: PlayerState;
  getDragonBoss: () => SharedBossState | null | undefined;
  getSpiderBoss: () => SharedBossState | null | undefined;
  getDragonResult: () => BossResult | null | undefined;
  getSpiderResult: () => BossResult | null | undefined;
  localIdentity: () => string | undefined;
  running: () => boolean;
  currentMapIsDesert: () => boolean;
  portalCutsceneActive: () => boolean;
  hasSeenDragonPortalCutscene: () => boolean;
  hasSeenSnowlandsPortalCutscene: () => boolean;
  startDragonPortalCutscene: () => void;
  startSnowlandsPortalCutscene: () => void;
  elements: NoticeElements;
  renderPlayerName: (element: HTMLElement, identity: string, name: string) => void;
  spawnBurst: (x: number, y: number, color: string, count: number, speed: number) => void;
  damagePlayer: (amount: number) => boolean;
  logPickup: (text: string, color: string) => void;
  showMessage: (text: string, color: string) => void;
  saveProgress: () => void;
}): BossController {
  const {
    boss, spiderBoss, bossRain, spiderVenom, player, elements,
    getDragonBoss, getSpiderBoss, getDragonResult, getSpiderResult,
    localIdentity, running, currentMapIsDesert, portalCutsceneActive,
    hasSeenDragonPortalCutscene, hasSeenSnowlandsPortalCutscene,
    startDragonPortalCutscene, startSnowlandsPortalCutscene,
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
  const locallyRewardedDragonEncounters = new Set<string>();
  const locallyRewardedSpiderEncounters = new Set<string>();

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

  function showWorldResult(result: BossResult, heading: string) {
    const title = elements.worldNotice.querySelector("strong");
    if (title) title.textContent = heading;
    elements.worldNoticeDetail.replaceChildren();
    for (const contributor of result.contributors) {
      const row = document.createElement("div");
      row.className = "dragon-world-notice-row";
      const name = document.createElement("span");
      renderPlayerName(name, contributor.identity, contributor.name);
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
      renderPlayerName(name, contributor.identity, contributor.name);
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
    renderResult(result, "DESERT SPIDER DEFEATED");
    const encounterKey = String(result.encounter);
    if (!locallyRewardedSpiderEncounters.has(encounterKey)) {
      // The authoritative reward arrives through the server result. Mirror it
      // into the active runtime now so the overhead HP and Power labels change
      // in the same frame as the reward notice, not after a later save sync.
      locallyRewardedSpiderEncounters.add(encounterKey);
      player.damage += SPIDER_REWARD_DAMAGE;
      player.maxHp += SPIDER_REWARD_HEALTH;
      player.hp = Math.min(player.maxHp, player.hp + SPIDER_REWARD_HEALTH);
    }
    logPickup("+75K DAMAGE", "#ff655a");
    logPickup("+200K MAX HEALTH", "#6fe48e");
    showMessage("+75K DAMAGE · +200K MAX HEALTH", "#f5e9c4");
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
    renderResult(result, "DRAGON DEFEATED", true);
    const encounterKey = String(result.encounter);
    if (!locallyRewardedDragonEncounters.has(encounterKey)) {
      locallyRewardedDragonEncounters.add(encounterKey);
      player.damage += 650;
      logPickup("+650 DAMAGE", "#ff655a");
      showMessage("+650 DAMAGE", "#ff655a");
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
        if (dx * dx + dy * dy <= strike.r * strike.r) damagePlayer(100);
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
          damagePlayer(500);
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

  function resolveCollision(target: DragonBossState | SpiderBossState, damage: number, cooldown: number) {
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

  return {
    resetBoss,
    resetSpiderBoss,
    syncDragonState,
    syncSpiderState,
    updateBoss,
    updateSpiderBoss,
    resolveDragonCollision: () => resolveCollision(boss, DRAGON_CONTACT_DAMAGE, DRAGON_CONTACT_DAMAGE_COOLDOWN),
    resolveSpiderCollision: () => resolveCollision(spiderBoss, SPIDER_CONTACT_DAMAGE, .75),
    applyDragonConePush,
    onPortalCutsceneFinished(wasPreview) {
      const dragon = queuedDragonResult;
      queuedDragonResult = null;
      if (dragon && !wasPreview) showDragonResult(dragon);
      const spider = queuedSpiderResult;
      queuedSpiderResult = null;
      if (spider && !wasPreview) showSpiderResult(spider);
    },
  };
}
