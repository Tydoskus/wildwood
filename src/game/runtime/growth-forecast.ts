/**
 * Growth forecast: how much power a farming option would add a minute, for
 * the player's live build, before trying it. An option is a map (this one or
 * the next), Pull Whole Group or one group at a time, and the stat groups it
 * farms. Each is played out for a while on the Balance Lab's death model
 * (src/balance/death-model.ts): who joins a fight (aggro radii, group camps),
 * when each one's hits start (the chase ramp, the ranged hold band and shot
 * speed), hits played one by one against the health the player has left with
 * regeneration throughout, and a death costing the death screen and the walk
 * back. What it adds to the Lab's: the player's own volleys (multishot, bow
 * skills, crits, perks), enemies dying mid-fight, a pulled group arriving at
 * once and respawning into the fight, the game's hit cooldown on the player
 * (one hit a tenth of a second) and the ring a melee crowd can stand in.
 *
 * Pure: it reads nothing live. forecast-inputs.ts builds its inputs from the
 * game (and the next map's balance from coop.mapIndexBalance).
 */
import {
  DEATH_SCREEN_SECONDS, DIED_TO_CAMP_SECONDS, chaseSpeedFor, closeGapSeconds, enemyAggroRadius, fightParticipants, participantAttackers,
  type Point,
} from '../../balance/death-model';
import { rankFarmCandidates, pickRankedCandidate, AUTO_REPLAN_SECONDS, type FarmReward } from './auto-farm-plan';
import { AUTO_FARM_DEFEAT_LIMIT, AUTO_FARM_DEFEAT_WINDOW_MS, AUTO_FARM_REACH_MARGIN, BITE_SHARE } from './auto-farm-controller';
import { rangedEnemyHoldBand } from './ranged-enemy-range';
import { AUTO_FARM_EVASION, orbitRadii } from './auto-farm-dodge';
import { contactCapacity, kitedHitInterval, perkFightLoss, tankableCount, TANK_RESERVE, type ChaserThreat, type TankPerks } from './auto-farm-kite-model';
import { worldReflectDamage } from '../../../shared/prestige-perks';
import type { EnemyDefinition } from '../enemies';
import { ATTACK_WINDUP_SECONDS, ATTACK_ANIMATION_SECONDS } from '../attack-timeline';
import { curveArmorReduction } from '../../../shared/balance-curve';
import { unroundedPlayerPower, type PlayerPowerStats } from '../../../shared/player-power';
import { PLAYER_RADIUS } from '../../../shared/rules';
import {
  ARROW_STORM_ARROWS, ARROW_STORM_DAMAGE_SHARE, PIERCING_SHOT_MAX_EXTRA_TARGETS, RICOCHET_DAMAGE_SHARE, RICOCHET_MAX_BOUNCES,
  bowSkillChance, type BowSkillRoll,
} from '../../../shared/bow-skills';

/** One spawn site as the forecast sees it: where it stands, what stands there, and what a kill pays. */
export type ForecastSite = Point & {
  id: number;
  campName: string;
  groupAggro?: boolean;
  leashRange: number;
  definition: EnemyDefinition;
  /** Its farm group ("stat:health", "soul:armor"): auto-farm-priority.ts farmGroupOf. */
  group: string;
  /** What one kill adds to the build (soul rewards are flat). */
  reward: FarmReward;
  /** Seconds until it stands again; 0 (or less) when it stands now. */
  respawnIn: number;
};

export type ForecastMap = {
  mapId: string;
  sites: readonly ForecastSite[];
  /** Where a death (or a portal) puts the player. */
  arrival: Point;
  /** A regular enemy's respawn, research included. */
  respawnSeconds: number;
  /** The map's armor rule for hits the player takes (its balance's ARMOR_CURVE, or the authored rule). */
  hitAfterArmor: (damage: number, armor: number) => number;
};

export type ForecastBuild = {
  /** The earned base stats, as autofarm's evaluator reads them (player.damage, baseMaxHp, attackRate, armor, regen). */
  base: PlayerPowerStats;
  /** Gear and research on top: what combat and the power number use (player-power.ts preparePlayerPowerStats). */
  effective: (base: PlayerPowerStats) => PlayerPowerStats;
  /** Research, prestige and guild bonus on every non-flat reward. */
  rewardMultiplier: number;
  minAttackInterval: number;
  criticalChance: number;
  criticalMultiplier: number;
  projectileCount: number;
  melee: boolean;
  /** The weapon's reach (weaponAttackRange), research and Long Shot included. */
  reach: number;
  projectileSpeed: number;
  bowSkills?: Partial<BowSkillRoll> | null;
  /** Prestige perks, as values (prestigePerkValue): chances and the Second Wind heal share. */
  doubleStrike: number;
  splitShot: number;
  reflect: number;
  secondWind: number;
  /** Movement speed, research and boots included. */
  moveSpeed: number;
  /** Reflect Only: the bow deals nothing. */
  reflectOnly?: boolean;
  /**
   * Autofarm steps out of shots in flight and, with a bow, backs away from a
   * melee enemy closing in (auto-farm-dodge.ts). Default: on, unless the weapon
   * is melee or the run is Reflect Only (which wants the hits).
   */
  evades?: boolean;
  /**
   * Real damage dealt over modelled, as measured on this build (1 = the model's own).
   * Autofarm can measure it from its kills (time to kill against the model's), as measuredDps once did.
   */
  damageCalibration?: number;
  /** Real damage taken over modelled (dodging and kiting take less), measured the same way. */
  incomingCalibration?: number;
};

export type ForecastOption = {
  /** Pull Whole Group: every enemy of the farmed groups comes at once, and the player stands. */
  pull: boolean;
  /**
   * The groups farmed; null for every group, Auto picking which. Pulled, a list
   * comes all at once; null pulls Auto's pick, `pullCamps` groups of it at a
   * time (the controller's pullCamps: one, one more per Aggro win).
   */
  groups: readonly string[] | null;
  pullCamps?: number;
  /**
   * Kite melee enemies (back away from each, shooting) or stand and take them.
   * Default: what autofarm does, kiting with a bow (auto-farm-dodge.ts), never with a melee weapon or in Reflect Only.
   */
  kite?: boolean;
  /**
   * Pull brings only as many of the pulled groups at once as the build can stand
   * through (auto-farm-kite-model.ts tankableCount, as the controller pulls);
   * false brings the whole of them (pullTankCheck). Default true.
   */
  tankLimit?: boolean;
};

export type ForecastRun = {
  /** Seconds played out; the rate is over all of it. */
  horizonSeconds: number;
  /** Where the player stands as it starts (default: the arrival). */
  start?: Point;
  /** Health share as it starts (default: full). */
  health?: number;
  /** Seconds before farming starts, gaining nothing: the walk to the portal and the map change. */
  leadSeconds?: number;
  /** Never dies: health may go below zero, and the lowest it reaches is reported (pullTankCheck). */
  immortal?: boolean;
};

export type ForecastResult = {
  option: ForecastOption;
  powerPerMinute: number;
  deathsPerHour: number;
  /** Farmable for good: it never trips autofarm's defeat limit (5 deaths in 3 minutes walks it back a map). */
  sustainable: boolean;
  tripsDefeatLimit: boolean;
  startPower: number;
  endPower: number;
  kills: number;
  deaths: number;
  /** Where the time went, in seconds. */
  time: { lead: number; walk: number; fight: number; wait: number; dead: number };
  /** Hits the player took, melee and shots, and shots it stepped out of; and the health they took in all. */
  hits: { melee: number; shots: number; dodged: number; damage: number };
  /** Kills by the group they paid. */
  killsByGroup: Record<string, number>;
  /** Melee enemies on the player at once while it fought: on average over the fighting, and at most. */
  chasers: { mean: number; peak: number };
  /** The lowest health reached, as a share of max health (below 0 only when immortal). */
  lowestHealth: number;
  /** Max health as it started: hits.damage over it is damage taken in shares. */
  maxHealth: number;
};

/**
 * The model's own fitted constants: FORECAST_CALIBRATION=fit in
 * forecast-calibration.test.ts fits them to the real-combat harness (441
 * options, 23 builds, 2026-10-07, checked on held-out halves). Exported so the
 * calibration can try others.
 */
export const FORECAST_TUNING = {
  /** Seconds between one fight ending and the walk to the next starting: retargeting, the route, loot. */
  retargetSeconds: 0,
  /** The player's hit cooldown after a hit lands (player.hurtClock). */
  hurtSeconds: .1,
  /** Melee enemies that fit around the player at once, as a share of the ring's room. */
  contactPacking: 1.25,
  /** Share of multishot side arrows that find another enemy in a crowd. */
  sideArrowHitShare: 1,
  /** Share of a crowd a Piercing Shot arrow passes through. */
  pierceLineShare: 0,
  /** Damage that lands on others in a crowd, as a share of what the model gives it. */
  splashEfficiency: 1,
  /** Damage on the target, as a share of the volley the model gives it (aim, overkill drift). */
  primaryEfficiency: 1,
  /** Incoming damage, as a share of the model's. */
  incomingEfficiency: 1,
  /** Kiting: seconds between a kited melee enemy's blows, as a share of the kite model's (kitedHitInterval). */
  kiteScale: .5,
  /** Kiting a crowd: each further melee enemy near the player shortens every one's gap between hits by this share. */
  kiteCrowdPenalty: .1,
  /** Share of enemy shots that land on a player stepping out of them, one group at a time... */
  shotLandShare: 0,
  /** ...and with a pulled crowd shooting at once. */
  pullShotLandShare: .5,
  /**
   * How far past its aggro radius a resting enemy is woken by a fight: the
   * player kiting and stepping about carries it that much further, and a walk
   * wakes what it passes the same way.
   */
  wakeDrift: 0,
  /**
   * Share of the player's volleys lost while it kites. The rules lose none:
   * player-controller.ts calls autoAttack every frame, moving or not, and the
   * circle stays inside the weapon's reach (auto-farm-dodge.ts chooseOrbit maxRadius).
   */
  kiteShotLoss: 0,
  /** On a circle that holds the chasers, the share of their swings that still land. */
  orbitLeak: 0,
};
export type ForecastTuning = typeof FORECAST_TUNING;

type Foe = {
  site: ForecastSite;
  hp: number;
  /** When the player can first shoot it. */
  reachAt: number;
  /** When it first can hit (arrived in contact, or its first shot landing). */
  readyAt: number;
  /** Its next hit; Infinity while it has no room in the ring. */
  nextHit: number;
  interval: number;
  hit: number;
  raw: number;
  melee: boolean;
  slotted: boolean;
  /** Kited: a melee enemy the player backs away from (no ring to wait for, its hits spaced by kiting). */
  kited: boolean;
  /** Shots dodged and landed, as a running share (evasion): a shot lands each time it passes 1. */
  landing: number;
  /** Arrived next to the player: shot at point blank, in the crowd. */
  closeAt: number;
};

type Volley = { at: number; target: Foe; primary: number; splash: number };

const FAN_STEP = .13;
const PROJECTILE_RADIUS = 6;

/** Arrows of a fan of `count` that strike a target of `radius` at `distance` (player-combat-controller.ts launchPlayerStone). */
export function fanArrowsOnTarget(count: number, distance: number, radius: number) {
  let hits = 0;
  for (let index = 0; index < count; index++) {
    const angle = Math.abs(index - (count - 1) / 2) * FAN_STEP;
    if (distance * Math.sin(angle) < radius + PROJECTILE_RADIUS) hits++;
  }
  return Math.max(1, hits);
}

const holdCache = new Map<string, boolean>();
/**
 * Whether a circle holds `count` chasers of radius `r` off a player running at
 * `speed`: on a small enough circle a chaser settles trailing inside it and
 * never lands a blow (auto-farm-dodge.ts orbitTrail / orbitRadii), so for that
 * many, kiting costs nothing.
 */
export function orbitHolds(count: number, r: number, speed: number, chaseSpeed: number, reach: number) {
  if (count <= 0) return true;
  const key = `${count}|${Math.round(r)}|${Math.round(speed)}|${Math.round(chaseSpeed)}|${Math.round(reach)}`;
  let holds = holdCache.get(key);
  if (holds === undefined) {
    const chasers = Array.from({ length: count }, () => ({ x: 0, y: 0, r }));
    holds = orbitRadii({ speed, chaseSpeed, r: PLAYER_RADIUS, chasers, maxRadius: reach }).band !== null;
    if (holdCache.size > 256) holdCache.clear();
    holdCache.set(key, holds);
  }
  return holds;
}

/**
 * The kite and pull rules as plain formulas, for one melee enemy against the
 * player (what forecastOption plays out hit by hit, and what the panel can show):
 * - standing, it lands one blow per 1 / attackSpeed (enemy-simulation.ts: attackClock
 *   reset to 1 / attackSpeed on each blow, a blow only while the two overlap);
 * - kited, one per max(1 / attackSpeed, kitedHitInterval): the blow stops it dead and
 *   it ramps back over ENEMY_HIT_SPEED_RECOVERY_SECONDS, then closes the gap that opened
 *   at the 25 a second it has on the player (shared/rules.ts ENEMY_CHASE_SPEED_MARGIN);
 *   none at all while a circle holds it (orbitHolds).
 * Both are capped by the player's hurt window: one landed blow per FORECAST_TUNING.hurtSeconds.
 */
export function meleeBlowsPerMinute(enemy: Pick<EnemyDefinition, 'attackSpeed'>, playerSpeed: number, options: { kited: boolean; holds?: boolean }) {
  const swing = 1 / Math.max(.01, enemy.attackSpeed);
  if (!options.kited) return 60 / swing;
  if (options.holds) return 0;
  return 60 / Math.max(swing, kitedHitInterval(playerSpeed, chaseSpeedFor(playerSpeed)));
}

function applyReward(base: PlayerPowerStats, reward: FarmReward, multiplier: number, minAttackInterval: number): PlayerPowerStats {
  const amount = reward.amount * (reward.flat ? 1 : multiplier);
  const next = { ...base };
  // As player-combat-controller.ts applyReward (and auto-farm-build.ts) do it.
  if (reward.type === 'damage') next.damage += amount;
  else if (reward.type === 'health') next.maxHp += amount;
  else if (reward.type === 'armor') next.armor += amount;
  else if (reward.type === 'regen') next.regen += amount;
  else if (reward.type === 'speed') next.attackRate = 1 / Math.min(1 / minAttackInterval, 1 / next.attackRate + amount);
  return next;
}

/** Plays one option out for `run.horizonSeconds`. */
export function forecastOption(map: ForecastMap, build: ForecastBuild, option: ForecastOption, run: ForecastRun, tuning: ForecastTuning = FORECAST_TUNING): ForecastResult {
  const horizon = Math.max(1, run.horizonSeconds);
  const sites = map.sites.filter(site => site.definition.hp > 0);
  const groups = option.groups ? new Set(option.groups) : null;
  const farmed = (site: ForecastSite) => !groups || groups.has(site.group);
  const enemyOf = (site: ForecastSite) => site.definition;
  const availableAt = new Map<ForecastSite, number>(sites.map(site => [site, Math.max(0, site.respawnIn)]));
  const alive = (site: ForecastSite, at: number) => availableAt.get(site)! <= at + 1e-9;

  let base = { ...build.base };
  let stats = build.effective(base);
  const startPower = unroundedPlayerPower(stats);
  let hp = stats.maxHp * Math.max(0, Math.min(1, run.health ?? 1));
  let t = 0;
  let position: Point = { ...(run.start ?? map.arrival) };
  const time = { lead: 0, walk: 0, fight: 0, wait: 0, dead: 0 };
  const deaths: number[] = [];
  let kills = 0;
  const hits = { melee: 0, shots: 0, dodged: 0, damage: 0 };
  const killsByGroup: Record<string, number> = {};
  const diedTo = new Map<string, number>();

  const critAverage = 1 + Math.max(0, Math.min(1, build.criticalChance)) * (Math.max(1, build.criticalMultiplier) - 1);
  const damageCalibration = build.damageCalibration ?? 1;
  // What enemies deal: each hit as the enemy's own (the model's efficiency aside), and the measured correction
  // as how often they land. A hit's size is known from its definition; what the forecast misses is the blows it
  // does not see coming (walk-bys, a dodge that fails), and a correction on the size would turn a few of those
  // into a lethal hit the build never takes.
  const incoming = tuning.incomingEfficiency, incomingRate = Math.max(1e-6, build.incomingCalibration ?? 1);
  const storm = bowSkillChance(build.bowSkills, 'arrowStorm');
  const ricochet = bowSkillChance(build.bowSkills, 'ricochet');
  const pierce = bowSkillChance(build.bowSkills, 'piercingShot');
  const arrows = build.melee ? 1 : Math.max(1, Math.floor(build.projectileCount));
  const chase = chaseSpeedFor(build.moveSpeed);
  const speed = Math.max(1, build.moveSpeed);
  const evades = build.evades ?? (AUTO_FARM_EVASION && !build.melee && !build.reflectOnly);
  /** Reflect and Second Wind, as the kite model weighs them; a Reflect build takes the hits it can stand (auto-farm-controller.ts worthAvoiding). */
  const perks: TankPerks = { reflect: Math.max(0, build.reflect), reflectOnly: Boolean(build.reflectOnly), secondWind: Math.max(0, build.secondWind) };
  const reflects = perks.reflect > 0;
  const kites = (option.kite ?? evades) && !build.melee && !build.reflectOnly;
  let lowest = 1, chaserSeconds = 0, fightSeconds = 0, peakChasers = 0;

  function regenerate(seconds: number) {
    if (seconds > 0 && (hp > 0 || run.immortal)) hp = Math.min(stats.maxHp, hp + Math.max(0, stats.regen) * seconds);
  }
  /** Time passing with nothing fighting: walking, waiting, dead. */
  function pass(seconds: number, bucket: keyof typeof time) {
    const spent = Math.max(0, Math.min(seconds, horizon - t));
    regenerate(spent);
    t += spent;
    time[bucket] += spent;
    return spent >= seconds - 1e-9;
  }

  function reachFor(site: ForecastSite) {
    return Math.max(8, build.reach + (build.melee ? site.definition.r : 0) - AUTO_FARM_REACH_MARGIN);
  }
  function contactDistance(site: ForecastSite) { return PLAYER_RADIUS + site.definition.r; }
  /** Melee enemies that fit around the player at once (auto-farm-kite-model.ts contactCapacity: a ring, shoulder to shoulder). */
  function ringRoom(site: ForecastSite) {
    return Math.max(1, Math.floor(contactCapacity(PLAYER_RADIUS, Math.max(4, site.definition.r)) * tuning.contactPacking));
  }

  /** A site waking against a player at `standing`, `at` seconds in: when it can be shot, and when its hits start. */
  function engage(site: ForecastSite, standing: Point, at: number): Foe | null {
    const enemy = site.definition;
    const distance = Math.hypot(site.x - standing.x, site.y - standing.y);
    const [found] = participantAttackers([site], standing, new Set(), enemyOf, stats.armor, incoming, build.moveSpeed, map.hitAfterArmor);
    const attacker = found && { ...found, interval: found.interval / incomingRate, start: found.start / incomingRate };
    const melee = !enemy.ranged;
    const reach = reachFor(site);
    const reachAt = at + closeGapSeconds(distance - reach, chase);
    const hold = rangedEnemyHoldBand(build.reach, PLAYER_RADIUS + enemy.r + 4).approachAbove;
    const closeAt = at + closeGapSeconds(distance - (melee ? contactDistance(site) : hold), chase);
    const kited = kites && melee && Boolean(attacker);
    const readyAt = !attacker ? Infinity : at + attacker.start;
    return {
      site, hp: enemy.hp, reachAt, readyAt, closeAt,
      nextHit: attacker ? (melee ? Infinity : readyAt) : Infinity,
      interval: attacker?.interval ?? Infinity,
      // Reflect throws back the hit as it arrived: the enemy's own, before armor.
      hit: attacker?.hit ?? 0, raw: enemy.damage,
      melee, slotted: false, kited, landing: 0,
    };
  }

  // ---- The fight: volleys out, hits in, until everyone engaged is dead (or the player is) ----
  let foes: Foe[] = [];
  /** Sites with a living foe in the fight, and whether a kill left the dead in `foes`. */
  const living = new Set<ForecastSite>();
  let culled = true;
  const adopt = (list: Foe[]) => { for (const foe of list) living.add(foe.site); return list; };
  let volleys: Volley[] = [];
  let nextFire = 0;
  let lastLanded = -Infinity;

  /** What a volley at `target` deals to it and splashes onto the rest, from what stands near it at `at`. */
  function volleyDamage(target: Foe, at: number) {
    if (build.reflectOnly) return { primary: 0, splash: 0 };
    const near = foes.filter(foe => foe !== target && foe.hp > 0 && foe.closeAt <= at).length;
    const enemy = target.site.definition;
    const armorFactor = enemy.armor ? 1 - curveArmorReduction(enemy.armor) : 1;
    const perArrow = stats.damage * critAverage * (1 + Math.max(0, build.doubleStrike)) * damageCalibration * armorFactor;
    const distance = target.closeAt <= at ? (target.melee ? contactDistance(target.site) : reachFor(target.site)) : reachFor(target.site);
    const onTarget = build.melee ? 1 : fanArrowsOnTarget(arrows, distance, enemy.r);
    // Arrow Storm's arrows land on the target and anyone within its radius: an even share each.
    const stormShare = 1 / (1 + Math.min(near, ARROW_STORM_ARROWS));
    const stormDamage = storm * ARROW_STORM_ARROWS * ARROW_STORM_DAMAGE_SHARE;
    const primary = perArrow * onTarget * (1 + stormDamage * stormShare) * tuning.primaryEfficiency;
    if (!near) return { primary, splash: 0 };
    const skills = stormDamage * (1 - stormShare)
      + ricochet * RICOCHET_DAMAGE_SHARE * Math.min(RICOCHET_MAX_BOUNCES, near)
      + pierce * Math.min(PIERCING_SHOT_MAX_EXTRA_TARGETS, near * tuning.pierceLineShare);
    const side = (arrows - onTarget) * tuning.sideArrowHitShare;
    const split = Math.max(0, build.splitShot) * (1 + stormDamage);
    const splash = perArrow * ((arrows) * skills + side + split) * tuning.splashEfficiency;
    return { primary, splash };
  }

  function windup() { return ATTACK_WINDUP_SECONDS * Math.min(1, stats.attackRate / ATTACK_ANIMATION_SECONDS); }

  /** The foe the player shoots at `at`: the first to come within reach. */
  function targetAt(at: number) {
    let best: Foe | null = null;
    for (const foe of foes) if (foe.hp > 0 && foe.reachAt <= at + 1e-9 && (!best || foe.reachAt < best.reachAt)) best = foe;
    return best;
  }
  function nextReach() {
    let at = Infinity;
    for (const foe of foes) if (foe.hp > 0) at = Math.min(at, foe.reachAt);
    return at;
  }
  /** Gives free places in the ring to the melee enemies that have arrived, first come first served. */
  function seatMelee(at: number) {
    if (!foes.some(foe => foe.melee && !foe.slotted && foe.hp > 0 && foe.readyAt <= at + 1e-9)) return;
    const slotted = foes.filter(foe => foe.melee && foe.slotted && foe.hp > 0).length;
    let room = foes.length ? ringRoom(foes.find(foe => foe.melee)?.site ?? foes[0].site) - slotted : 0;
    if (room <= 0) return;
    const waiting = foes.filter(foe => foe.melee && !foe.slotted && foe.hp > 0 && Number.isFinite(foe.readyAt) && foe.readyAt <= at + 1e-9)
      .sort((a, b) => a.readyAt - b.readyAt);
    for (const foe of waiting) {
      if (room-- <= 0) break;
      foe.slotted = true;
      foe.nextHit = Math.max(at, foe.readyAt);
    }
  }
  /** The next melee arrival that could take a seat. */
  function nextMeleeArrival(at: number) {
    let next = Infinity;
    for (const foe of foes) if (foe.melee && !foe.slotted && foe.hp > 0 && foe.readyAt > at) next = Math.min(next, foe.readyAt);
    return next;
  }

  /**
   * What autofarm's kite does about the melee enemies on the player now
   * (auto-farm-controller.ts kiteWorth, on the kite model): 'hold' on a circle
   * that holds them all, when standing would cost health regeneration does not
   * put back (no blows land); past what a circle holds, 'kite' (each lands one
   * blow per kite cycle) only when standing the fight out would take the
   * player below TANK_RESERVE and kiting costs less; otherwise 'stand' (each
   * one in the ring round the player lands one per swing).
   */
  let kiteCache = { at: -1, mode: 'stand' as 'hold' | 'kite' | 'stand' };
  function kiteMode(at: number): 'hold' | 'kite' | 'stand' {
    if (!kites) return 'stand';
    if (kiteCache.at === at) return kiteCache.mode;
    const chasing = foes.filter(foe => foe.kited && foe.hp > 0);
    let mode: 'hold' | 'kite' | 'stand' = 'stand';
    if (chasing.length) {
      const meanR = chasing.reduce((sum, foe) => sum + foe.site.definition.r, 0) / chasing.length;
      const room = ringRoom(chasing[0].site);
      const rates = chasing.map(foe => foe.hit / Math.max(1e-9, foe.interval)).sort((a, b) => b - a);
      const standing = rates.slice(0, room).reduce((sum, rate) => sum + rate, 0);
      const cycle = kitedHitInterval(speed, chase) * tuning.kiteScale / incomingRate;
      const kitedRate = chasing.reduce((sum, foe) => sum + foe.hit / Math.max(cycle, foe.interval), 0);
      const regen = Math.max(0, stats.regen);
      // As the controller weighs it (auto-farm-controller.ts kiteWorth): what a fight costs, Reflect and Second Wind counted.
      const dps = Math.max(1e-9, stats.damage * critAverage / Math.max(build.minAttackInterval, stats.attackRate));
      const threats: ChaserThreat[] = chasing.map(foe => ({ damage: foe.hit, raw: foe.raw, attackSpeed: 1 / Math.max(1e-9, foe.interval), hp: Math.max(0, foe.hp), r: foe.site.definition.r }));
      const standingHits = chasing.map(foe => 1 / Math.max(1e-9, foe.interval)).sort((a, b) => b - a).slice(0, room).reduce((sum, rate) => sum + rate, 0);
      const kitedHits = chasing.reduce((sum, foe) => sum + 1 / Math.max(cycle, foe.interval), 0);
      const loss = (rate: number, hitsPerSecond: number) => perkFightLoss({ damagePerSecond: rate, hitsPerSecond, chasers: threats, maxHp: stats.maxHp, regen, dps, perks });
      const breaks = loss(standing, standingHits) > hp - stats.maxHp * TANK_RESERVE;
      // A circle that holds is free, so a build whose hits are only a cost circles whenever standing costs health;
      // a Reflect build's hits are its damage, so it stands while it can stand it.
      if (orbitHolds(chasing.length, meanR, speed, chase, build.reach)) mode = (reflects ? breaks : standing > regen) ? 'hold' : 'stand';
      else mode = breaks && loss(kitedRate, kitedHits) < loss(standing, standingHits) ? 'kite' : 'stand';
    }
    kiteCache = { at, mode };
    return mode;
  }

  let stream: ((at: number) => Foe[]) | null = null;
  let streamNext: (() => number) | null = null;

  function kill(foe: Foe, at: number) {
    foe.hp = 0;
    living.delete(foe.site);
    culled = false;
    kills++;
    killsByGroup[foe.site.group] = (killsByGroup[foe.site.group] ?? 0) + 1;
    availableAt.set(foe.site, at + map.respawnSeconds);
    const before = stats.maxHp;
    base = applyReward(base, foe.site.reward, build.rewardMultiplier, build.minAttackInterval);
    stats = build.effective(base);
    // More health raises the bar and what is in it alike (player-health.ts addPlayerBaseMaxHealth).
    hp = Math.min(stats.maxHp, hp + Math.max(0, stats.maxHp - before));
    if (build.secondWind > 0 && hp > 0) hp = Math.min(stats.maxHp, hp + stats.maxHp * build.secondWind);
  }

  function damageFoe(foe: Foe, amount: number, at: number) {
    if (foe.hp <= 0 || amount <= 0) return;
    foe.hp -= amount;
    if (foe.hp <= 1e-9) kill(foe, at);
  }

  function die(at: number) {
    deaths.push(at);
    foes = []; volleys = []; living.clear();
  }

  /**
   * Fights everything engaged (and whatever `stream` adds) until it is all
   * dead, the player falls, or time runs out. Returns false on a death.
   */
  function fight(): boolean {
    nextFire = Math.max(nextFire, t);
    let stall = 0;
    for (let guard = 0; guard < 2_000_000; guard++) {
      if (!culled) { foes = foes.filter(foe => foe.hp > 0); culled = true; }
      seatMelee(t);
      const anyone = foes.length > 0;
      const streaming = stream ? (streamNext?.() ?? Infinity) : Infinity;
      if (!anyone && !volleys.length && !(streaming < horizon && stream)) return true;
      // The next thing to happen.
      const reachable = anyone ? Math.max(nextFire, nextReach()) : Infinity;
      let landing = Infinity, landingIndex = -1;
      volleys.forEach((volley, index) => { if (volley.at < landing) { landing = volley.at; landingIndex = index; } });
      let hitter: Foe | null = null;
      for (const foe of foes) if (foe.nextHit < (hitter?.nextHit ?? Infinity)) hitter = foe;
      const hitAt = hitter ? Math.max(hitter.nextHit, lastLanded + tuning.hurtSeconds) : Infinity;
      const arrival = nextMeleeArrival(t);
      const next = Math.min(reachable, landing, hitAt, arrival, streaming, horizon);
      // A guard: an instant that keeps producing events without time moving is stepped past.
      if (next <= t) { if (++stall > 10_000) { t += 1e-6; stall = 0; } } else stall = 0;
      // Regeneration up to it.
      const elapsed = Math.max(0, next - t);
      regenerate(elapsed);
      time.fight += elapsed;
      if (elapsed > 0) {
        let near = 0;
        for (const foe of foes) if (foe.melee && foe.hp > 0 && foe.closeAt <= t) near++;
        chaserSeconds += near * elapsed; fightSeconds += elapsed; peakChasers = Math.max(peakChasers, near);
      }
      t = next;
      if (t >= horizon - 1e-9) return true;
      if (next === streaming && stream) { foes.push(...adopt(stream(t))); continue; }
      if (next === hitAt && hitter) {
        if (!hitter.melee) {
          hitter.nextHit = Math.max(t, hitter.nextHit) + hitter.interval;
          // A shot is stepped out of when it is worth it (auto-farm-controller.ts worthAvoiding): the player hurt at
          // all, or the shot a real bite; at full health a small one is left to land, regeneration keeping up.
          const worth = evades && (reflects ? hp - hitter.hit < stats.maxHp * TANK_RESERVE : hp < stats.maxHp - 1e-9 || hitter.raw >= stats.maxHp * BITE_SHARE);
          if (worth) {
            hitter.landing += option.pull ? tuning.pullShotLandShare : tuning.shotLandShare;
            if (hitter.landing < 1) { hits.dodged++; continue; }
            hitter.landing -= 1;
          }
        } else {
          const mode = hitter.kited ? kiteMode(t) : 'stand';
          if (mode === 'hold') {
            // A circle that holds keeps nearly every blow off; the share that still lands (the circle's entry, a chaser
            // joining it, a turn at the map's edge) is measured (orbitLeak).
            hitter.nextHit = t + hitter.interval;
            hitter.landing += tuning.orbitLeak;
            if (hitter.landing < 1) continue;
            hitter.landing -= 1;
          } else hitter.nextHit = t + (mode === 'kite' ? Math.max(hitter.interval, kitedHitInterval(speed, chase) * tuning.kiteScale / incomingRate) : hitter.interval);
        }
        // A hit lands: armor already off it; Reflect throws some back. Reflect is damage the build
        // deals, so the measured damage correction applies to it too: a Reflect Only build has no
        // other, and a correction that moved nothing would run on to its bound.
        if (hitter.melee) hits.melee++; else hits.shots++;
        hp -= hitter.hit;
        hits.damage += hitter.hit;
        lastLanded = t;
        if (build.reflect > 0) damageFoe(hitter, worldReflectDamage(hitter.raw, stats.maxHp, Boolean(build.reflectOnly)) * Math.min(1, build.reflect) * damageCalibration, t);
        lowest = Math.min(lowest, hp / Math.max(1e-9, stats.maxHp));
        if (hp <= 0 && !run.immortal) { die(t); return false; }
        continue;
      }
      if (next === landing && landingIndex >= 0) {
        const [volley] = volleys.splice(landingIndex, 1);
        damageFoe(volley.target, volley.primary, t);
        if (volley.splash > 0) {
          const others = foes.filter(foe => foe !== volley.target && foe.hp > 0 && foe.closeAt <= t);
          for (const other of others) damageFoe(other, volley.splash / others.length, t);
        }
        continue;
      }
      if (next === reachable) {
        const target = targetAt(t);
        if (!target) { nextFire = Math.max(nextFire, nextReach()); continue; }
        const damage = volleyDamage(target, t);
        const distance = target.closeAt <= t ? (target.melee ? contactDistance(target.site) : reachFor(target.site)) : reachFor(target.site);
        volleys.push({ at: t + windup() + (build.melee ? 0 : distance / Math.max(1, build.projectileSpeed)), target, ...damage });
        const kitingNow = kites && tuning.kiteShotLoss > 0 && foes.some(foe => foe.kited && foe.hp > 0 && foe.closeAt <= t);
        nextFire = t + Math.max(build.minAttackInterval, stats.attackRate) / (kitingNow ? Math.max(.05, 1 - tuning.kiteShotLoss) : 1);
        continue;
      }
      // A melee enemy arrived: seated at the top of the loop.
    }
    return true;
  }

  function respawnAfterDeath() {
    if (!pass(DEATH_SCREEN_SECONDS, 'dead')) return false;
    stats = build.effective(base);
    hp = stats.maxHp;
    position = { ...map.arrival };
    nextFire = t;
    return true;
  }

  function defeatLimitTripped() {
    const window = AUTO_FARM_DEFEAT_WINDOW_MS / 1_000;
    return deaths.some((at, index) => index + AUTO_FARM_DEFEAT_LIMIT - 1 < deaths.length && deaths[index + AUTO_FARM_DEFEAT_LIMIT - 1] - at < window);
  }

  if (run.leadSeconds && run.leadSeconds > 0) pass(run.leadSeconds, 'lead');

  // ---- Auto's pick of group (auto-farm-controller.ts chooseCamp): the most power a second of killing and walking ----
  let selected: string | null = null;
  let planClock = -Infinity;
  const groupKeys = [...new Set(sites.filter(farmed).map(site => site.group))].filter(group => group !== 'soul:critDamage' || groups?.has(group));
  const powerWith = (reward?: FarmReward) => {
    const after = reward ? applyReward(base, reward, build.rewardMultiplier, build.minAttackInterval) : base;
    return { power: unroundedPlayerPower(build.effective(after)) };
  };
  /** Auto's ranking, best first. */
  const ranking = () => {
    const dps = Math.max(1e-9, stats.damage * critAverage / Math.max(build.minAttackInterval, stats.attackRate));
    const died = (group: string) => t - (diedTo.get(group) ?? -Infinity) < DIED_TO_CAMP_SECONDS;
    const entries = groupKeys.map(group => {
      const members = sites.filter(site => site.group === group);
      const standing = members.filter(site => alive(site, t));
      const nearest = Math.min(...standing.map(site => Math.hypot(site.x - position.x, site.y - position.y)));
      const reward = members.reduce((low, site) => site.reward.amount < low.amount ? site.reward : low, members[0].reward);
      const hpAverage = members.reduce((sum, site) => sum + site.definition.hp, 0) / members.length;
      return { key: group, alive: standing.length, reward, died: died(group),
        secondsPerKill: hpAverage / dps + (Number.isFinite(nearest) ? Math.max(0, nearest - build.reach) / speed : 0) };
    });
    const pool = entries.some(entry => entry.alive > 0 && !entry.died) ? entries.filter(entry => !entry.died) : entries;
    return rankFarmCandidates(pool, powerWith);
  };
  const choose = () => pickRankedCandidate(ranking(), selected);

  /** Resting enemies a fight at `standing` (reached from `from`) wakes: in aggro of the walk or the fight, the drift added. */
  function wokenAt(standing: Point, from: Point, at: number, already: (site: ForecastSite) => boolean) {
    const woken = new Set<ForecastSite>();
    for (const site of sites) {
      if (already(site) || !alive(site, at)) continue;
      const radius = enemyAggroRadius(site.definition) + tuning.wakeDrift;
      if (segmentDistance(site, from, standing) <= radius) woken.add(site);
    }
    // A group camp wakes whole (death-model.ts fightParticipants).
    const camps = new Set([...woken].filter(site => site.groupAggro).map(site => site.campName));
    if (camps.size) for (const site of sites) if (site.groupAggro && camps.has(site.campName) && !already(site) && alive(site, at)) woken.add(site);
    return woken;
  }

  if (option.pull) {
    // ---- Pull: every enemy of the farmed groups comes from wherever it stands, the player holds its ground ----
    // Anything else whose aggro covers the player wakes as usual.
    // Pulled: the listed groups; with none listed, Auto's pick of `pullCamps` groups, looked at again as it farms.
    const pullCamps = Math.max(1, option.pullCamps ?? (groups ? groupKeys.length : 1));
    let pulled = new Set<string>(groups ? groupKeys : []);
    // The sites that come to the player standing here: the pulled groups', and any whose aggro covers it.
    let comers: ForecastSite[] = [], comersKey = '';
    const refreshComers = () => {
      const key = `${[...pulled].join()}|${position.x}|${position.y}`;
      if (key === comersKey) return;
      comersKey = key;
      comers = sites.filter(site => pulled.has(site.group)
        || Math.hypot(site.x - position.x, site.y - position.y) <= enemyAggroRadius(site.definition) + tuning.wakeDrift);
    };
    const repick = () => {
      if (groups || t < planClock) return;
      planClock = t + AUTO_REPLAN_SECONDS;
      selected = choose();
      const order = [selected, ...ranking().map(entry => entry.key)].filter((group): group is string => Boolean(group));
      pulled = new Set([...new Set(order)].slice(0, pullCamps));
    };
    repick();
    const engagedSites = new Set<ForecastSite>();
    // As many pulled at once as the build can stand through (auto-farm-controller.ts pullable): looked at again every 10 seconds.
    let limit = Infinity, limitAt = -Infinity;
    const pulledLiving = () => { let count = 0; for (const foe of foes) if (foe.hp > 0 && pulled.has(foe.site.group)) count++; return count; };
    const room = (at: number) => {
      if (option.tankLimit === false) return Infinity;
      if (at - limitAt >= 10) {
        limitAt = at;
        const group = comers.filter(site => pulled.has(site.group) && alive(site, at))
          .sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y));
        const dps = Math.max(1e-9, stats.damage * critAverage / Math.max(build.minAttackInterval, stats.attackRate));
        limit = !group.length ? Infinity : tankableCount({ playerR: PLAYER_RADIUS, maxHp: stats.maxHp, regen: Math.max(0, stats.regen), dps, perks,
          chasers: group.map(site => ({ damage: map.hitAfterArmor(site.definition.damage * incoming, stats.armor), raw: site.definition.damage, attackSpeed: site.definition.attackSpeed * incomingRate, hp: site.definition.hp, r: site.definition.r })) });
      }
      return Math.max(0, limit - pulledLiving());
    };
    const wake = (at: number) => {
      repick();
      refreshComers();
      const woken: Foe[] = [];
      let free = room(at);
      for (const site of comers) {
        if (engagedSites.has(site) || !alive(site, at)) continue;
        if (pulled.has(site.group) && !(Math.hypot(site.x - position.x, site.y - position.y) <= enemyAggroRadius(site.definition) + tuning.wakeDrift)) {
          if (free <= 0) continue;
          free--;
        }
        const foe = engage(site, position, at);
        if (foe) { woken.push(foe); engagedSites.add(site); }
      }
      // A group camp wakes whole.
      for (const site of wokenAt(position, position, at, entry => engagedSites.has(entry))) {
        const foe = engage(site, position, at);
        if (foe) { woken.push(foe); engagedSites.add(site); }
      }
      return woken;
    };
    stream = at => {
      // A site killed is free to come again once it respawns.
      for (const site of [...engagedSites]) if (!living.has(site)) engagedSites.delete(site);
      return wake(at);
    };
    streamNext = () => {
      let next = Infinity;
      refreshComers();
      const full = room(t) <= 0;
      for (const site of comers) {
        // A pulled site waiting its turn comes once one of those coming is killed (the fight's own events).
        if (full && pulled.has(site.group) && !(Math.hypot(site.x - position.x, site.y - position.y) <= enemyAggroRadius(site.definition) + tuning.wakeDrift)) continue;
        const at = availableAt.get(site)!;
        if (at > t + 1e-9) next = Math.min(next, at);
        else if (!living.has(site)) next = Math.min(next, t);
      }
      return next;
    };
    while (t < horizon - 1e-9) {
      engagedSites.clear();
      foes = adopt(wake(t));
      const survived = fight();
      if (t >= horizon - 1e-9) break;
      if (!survived) { engagedSites.clear(); if (!respawnAfterDeath()) break; continue; }
      // Nothing left to come: wait for the next respawn.
      const next = streamNext();
      if (!Number.isFinite(next)) { pass(horizon - t, 'wait'); break; }
      pass(Math.max(0, next - t), 'wait');
    }
  } else {
    // ---- One group at a time: walk to the nearest enemy of the farmed group, fight whatever joins ----
    stream = null; streamNext = null;
    while (t < horizon - 1e-9) {
      const current = selected ? sites.filter(site => site.group === selected && alive(site, t)) : [];
      if (groupKeys.length > 1 && (!current.length || t >= planClock)) {
        selected = choose();
        planClock = t + AUTO_REPLAN_SECONDS;
      } else if (!selected) selected = groupKeys[0] ?? null;
      if (!selected) { pass(horizon - t, 'wait'); break; }
      const standing = sites.filter(site => site.group === selected && alive(site, t));
      if (!standing.length) {
        // Walk to the group and wait for its next respawn there.
        const members = sites.filter(site => site.group === selected);
        const soonest = members.reduce((best, site) => availableAt.get(site)! < availableAt.get(best)! ? site : best, members[0]);
        if (!soonest) { pass(horizon - t, 'wait'); break; }
        const walk = Math.max(0, Math.hypot(soonest.x - position.x, soonest.y - position.y) - reachFor(soonest)) / speed;
        if (!pass(walk, 'walk')) break;
        position = toward(position, soonest, reachFor(soonest));
        if (!pass(Math.max(0, availableAt.get(soonest)! - t), 'wait')) break;
        continue;
      }
      const target = standing.reduce((best, site) => distanceTo(site) < distanceTo(best) ? site : best);
      const walk = Math.max(0, distanceTo(target) - reachFor(target)) / speed;
      if (!pass(walk, 'walk')) break;
      const from = position;
      position = toward(position, target, reachFor(target));
      const awake = sites.filter(site => alive(site, t));
      const participants = fightParticipants(target, awake, position, new Set(), enemyOf);
      for (const site of wokenAt(position, from, t, entry => participants.has(entry))) participants.add(site);
      foes = adopt([...participants].map(site => engage(site, position, t)).filter((foe): foe is Foe => Boolean(foe)));
      const survived = fight();
      if (t >= horizon - 1e-9) break;
      if (!survived) {
        diedTo.set(selected, t);
        planClock = -Infinity;
        if (!respawnAfterDeath()) break;
        continue;
      }
      if (!pass(tuning.retargetSeconds, 'walk')) break;
    }
  }

  function distanceTo(site: Point) { return Math.hypot(site.x - position.x, site.y - position.y); }

  const endPower = unroundedPlayerPower(build.effective(base));
  const minutes = horizon / 60;
  const tripsDefeatLimit = defeatLimitTripped();
  return {
    option, startPower, endPower, kills, deaths: deaths.length,
    powerPerMinute: (endPower - startPower) / minutes,
    deathsPerHour: deaths.length / (horizon / 3_600),
    sustainable: !tripsDefeatLimit && endPower > startPower,
    tripsDefeatLimit, time, hits, killsByGroup,
    chasers: { mean: fightSeconds > 0 ? chaserSeconds / fightSeconds : 0, peak: peakChasers }, lowestHealth: lowest,
    maxHealth: build.effective(build.base).maxHp,
  };
}

/** How far `point` is from the segment `a`-`b`. */
function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const share = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (a.x + dx * share), point.y - (a.y + dy * share));
}

/** The point `distance` short of `target`, coming from `from`. */
function toward(from: Point, target: Point, distance: number): Point {
  const dx = from.x - target.x, dy = from.y - target.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) return { x: from.x, y: from.y };
  return { x: target.x + dx / length * distance, y: target.y + dy / length * distance };
}

/**
 * Whether the build can stand and take a whole pull: every enemy of `groups`
 * coming at once from where it stands, killed in the order they arrive, no
 * kiting, no respawns. Over the time to kill it, the most damage taken net of
 * regeneration (each hit as the death model times it, one a hurt window at
 * most) has to stay under the health it starts with:
 *   max over t of [ sum of hits landed by t - regen * t ] < health.
 */
export function pullTankCheck(map: ForecastMap, build: ForecastBuild, groups: readonly string[] | null, run: Omit<ForecastRun, 'horizonSeconds' | 'immortal'> = {},
  tuning: ForecastTuning = FORECAST_TUNING) {
  const once = { ...map, respawnSeconds: Infinity };
  const result = forecastOption(once, build, { pull: true, groups, pullCamps: groups?.length ?? Infinity, kite: false, tankLimit: false },
    { ...run, horizonSeconds: 1_800, immortal: true }, tuning);
  const maxHp = build.effective(build.base).maxHp;
  const startShare = Math.max(0, Math.min(1, run.health ?? 1));
  return {
    tankable: result.lowestHealth > 0,
    /** And with the share of health autofarm keeps in hand through a pull (auto-farm-kite-model.ts TANK_RESERVE) still left. */
    withinReserve: result.lowestHealth >= TANK_RESERVE,
    /** The worst the health bar got, as a share of max health, and the damage (net of regen) that took it there. */
    lowestHealth: result.lowestHealth,
    peakDamage: (startShare - Math.min(startShare, result.lowestHealth)) * maxHp,
    maxHp,
    seconds: result.time.fight,
    enemies: result.kills,
  };
}

export type GrowthMode = 'pull' | 'standing' | 'kited';
export type ForecastedOption = ForecastResult & {
  map: 'current' | 'next';
  mode: GrowthMode;
  /** For a pull: whether the build could stand through the whole of it at once (pullTankCheck). */
  tank?: ReturnType<typeof pullTankCheck>;
};

/** Seconds to stop farming here and stand on the next map: the walk to its portal, and the map change. */
export const MAP_CHANGE_SECONDS = 2;
export function mapSwitchSeconds(from: Point, portal: Point | null, moveSpeed: number) {
  return portal ? Math.hypot(portal.x - from.x, portal.y - from.y) / Math.max(1, moveSpeed) + MAP_CHANGE_SECONDS : 0;
}


/**
 * Every option, on this map and (when given) the next, each one: Pull Whole
 * Group (as many at once as the build can stand: tankLimit), one group at a time standing,
 * and one at a time kited; for every group together (Auto's pick for one at a
 * time) and for each stat group alone. Groups that pay no power (Soul Crit
 * Damage) are left out, as Auto leaves them.
 */
export type GrowthInput = {
  current: ForecastMap;
  next?: ForecastMap | null;
  build: ForecastBuild;
  /** Where the player stands, and its health share. */
  start?: Point;
  health?: number;
  /** Seconds each option is played out for (default: 10 minutes, autofarm's trial of a new map). */
  horizonSeconds?: number;
  /** The walk to the next map's portal and the change (mapSwitchSeconds). */
  nextLeadSeconds?: number;
  /** Price each stat group alone too (default true). */
  perGroup?: boolean;
  /** The ways of fighting to price (default all three; Pull only when the player has it on, say). */
  modes?: readonly GrowthMode[];
  /** The build as priced on the next map, when it differs (another correction); default `build`. */
  nextBuild?: ForecastBuild;
  tuning?: ForecastTuning;
};
export function forecastGrowth(input: GrowthInput): ForecastedOption[] {
  const steps = forecastGrowthSteps(input);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}

/** forecastGrowth one forecast at a time: each `next()` plays out one option, so a caller can spread the work over frames. */
export function* forecastGrowthSteps(input: GrowthInput): Generator<void, ForecastedOption[], void> {
  const horizonSeconds = input.horizonSeconds ?? 600;
  const results: ForecastedOption[] = [];
  const canKite = AUTO_FARM_EVASION && !input.build.melee && !input.build.reflectOnly;
  for (const which of ['current', 'next'] as const) {
    const map = which === 'current' ? input.current : input.next;
    if (!map) continue;
    // The next map's own correction, if the caller has one (the planner's: what enemies deal is the map's).
    const build = which === 'next' && input.nextBuild ? input.nextBuild : input.build;
    const run: ForecastRun = which === 'current'
      ? { horizonSeconds, start: input.start, health: input.health }
      : { horizonSeconds, leadSeconds: input.nextLeadSeconds ?? 0 };
    const all = [...new Set(map.sites.map(site => site.group))].filter(group => group !== 'soul:critDamage');
    const sets: (readonly string[] | null)[] = [null, ...(input.perGroup === false ? [] : all.map(group => [group]))];
    for (const groups of sets) {
      // Pull: the whole of every group in the set at once, where the player stands.
      const pulled = groups ?? all;
      const priced = (mode: GrowthMode) => !input.modes || input.modes.includes(mode);
      if (priced('pull')) {
        const tank = pullTankCheck(map, build, pulled, which === 'current' ? { start: input.start, health: input.health } : {}, input.tuning);
        yield;
        const pull = forecastOption(map, build, { pull: true, groups: pulled, pullCamps: pulled.length }, run, input.tuning);
        results.push({ ...pull, option: { pull: true, groups, pullCamps: pulled.length }, map: which, mode: 'pull', tank });
        yield;
      }
      if (priced('standing')) {
        const standing = forecastOption(map, build, { pull: false, groups, kite: false }, run, input.tuning);
        results.push({ ...standing, map: which, mode: 'standing' });
        yield;
      }
      if (canKite && priced('kited')) {
        const kited = forecastOption(map, build, { pull: false, groups, kite: true }, run, input.tuning);
        results.push({ ...kited, map: which, mode: 'kited' });
        yield;
      }
    }
  }
  return results;
}

/** How much better a forecast has to be before autofarm leaves what it is doing for it. */
export const SWITCH_MARGIN = 1.15;
/** And before it walks to another map for it: the walk and a new map's trial are a risk of their own. */
export const MAP_SWITCH_MARGIN = 1.3;

const sameOption = (a: ForecastedOption, b: { map: 'current' | 'next'; mode: GrowthMode; groups: readonly string[] | null }) =>
  a.map === b.map && a.mode === b.mode && (a.option.groups === null) === (b.groups === null) && (a.option.groups ?? []).join() === (b.groups ?? []).join();

/**
 * The decision rule: of the options that are sustainable, the most
 * power a minute; but what it is doing now (`current`, priced in the same set)
 * is kept unless the best beats it by the switch margin. Null when nothing is.
 */
export function chooseGrowthOption(results: readonly ForecastedOption[],
  current: { map: 'current' | 'next'; mode: GrowthMode; groups: readonly string[] | null } | null = null) {
  const open = results.filter(result => result.sustainable);
  if (!open.length) return null;
  const best = open.reduce((a, b) => b.powerPerMinute > a.powerPerMinute ? b : a);
  const held = current && open.find(result => sameOption(result, current));
  if (!held) return best;
  const margin = best.map !== held.map ? MAP_SWITCH_MARGIN : SWITCH_MARGIN;
  return best.powerPerMinute > held.powerPerMinute * margin ? best : held;
}

/**
 * Which stat to farm for growth, not for the power one kill shows. A kill
 * adds its own power (what Auto's Best Gain ranks by), and it changes the
 * build, which changes the best power a minute the build can reach from here
 * (the best sustainable option of forecastGrowth: a pull of what it can stand,
 * one at a time standing or kited, the next map). Damage and attack speed
 * raise that by killing faster; health, armor and regeneration raise it only
 * where they relax what holds the build back (a pull that would kill it, the
 * next map, deaths). Each group is priced by a probe: its reward added until
 * the stat it pays has grown by `probeShare`, and the best rate the build can
 * then reach, read as a slope (rise per kill). A group's own rate is forecast
 * too, one at a time standing and kited (and pulled, with Pull on), that group alone: a single kill's
 * power over its time (Best Gain) misses the arrows a fan lands on a whole camp,
 * the chasers a kite holds, and the deaths. Then, per second of farming it:
 *   score = its power a second (that forecast)
 *         + rise per kill x (horizonMinutes - chunkMinutes) x its kills a second
 * the rise being earned after a chunk of farming it (`chunkMinutes`) and kept
 * for the rest of the horizon. The probe is big enough to see a threshold
 * coming (the next map opening, a pull becoming tankable) and is not lost in
 * the forecast's whole-volley steps, which a single kill's nudge is.
 */
export type StatChoiceInput = {
  current: ForecastMap;
  next?: ForecastMap | null;
  build: ForecastBuild;
  start?: Point;
  health?: number;
  /** How long a gain in the rate is worth having: the farming still ahead, in minutes (default 60). */
  horizonMinutes?: number;
  /** Seconds each option is played out for, per look (default 120: quick enough every 20 seconds). */
  horizonSeconds?: number;
  nextLeadSeconds?: number;
  /** Minutes of farming one group before its rise counts (default 10). */
  chunkMinutes?: number;
  /** The probe: the stat a group pays grown by this share (default 25%), and at least this many kills (default 10). */
  probeShare?: number;
  sampleKills?: number;
  /** The ways of fighting to price (forecastGrowth modes). */
  modes?: readonly GrowthMode[];
  /** The best option for the build as it stands, when the caller has it already. */
  now?: ForecastedOption | null;
  /** How the next map's pricing differs from `build` (the planner's own correction there), applied to each probe too. */
  nextAdjust?: (build: ForecastBuild) => ForecastBuild;
  /**
   * The groups being farmed, where the damage-taken correction was measured
   * (null: every group, Auto's pick). Another group's enemies may hit harder or
   * softer: there the correction only ever raises what it takes.
   */
  measuredGroups?: readonly string[] | null;
  tuning?: ForecastTuning;
};
export function growthStatChoice(input: StatChoiceInput) {
  const steps = growthStatChoiceSteps(input);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}

/** growthStatChoice one forecast at a time (forecastGrowthSteps): about 6 x (groups + 1) steps of a few milliseconds each. */
export function* growthStatChoiceSteps(input: StatChoiceInput) {
  const horizonMinutes = input.horizonMinutes ?? 60, sample = Math.max(1, input.sampleKills ?? 10);
  const chunkMinutes = Math.min(horizonMinutes, input.chunkMinutes ?? 10), probeShare = input.probeShare ?? .25;
  const rewardSize = (reward: FarmReward) => reward.amount * (reward.flat ? 1 : input.build.rewardMultiplier);
  const statSize = (base: PlayerPowerStats, type: FarmReward['type']) => type === 'damage' ? base.damage : type === 'health' ? base.maxHp
    : type === 'armor' ? Math.max(1, base.armor) : type === 'regen' ? Math.max(.1, base.regen) : 1 / Math.max(1e-9, base.attackRate);
  function* best(build: ForecastBuild) {
    const options: ForecastedOption[] = yield* forecastGrowthSteps({ current: input.current, next: input.next, build, nextBuild: input.nextAdjust?.(build), start: input.start, health: input.health,
      horizonSeconds: input.horizonSeconds ?? 120, nextLeadSeconds: input.nextLeadSeconds, perGroup: false, modes: input.modes, tuning: input.tuning });
    const open = options.filter(option => option.sustainable);
    return open.length ? open.reduce((a, b) => b.powerPerMinute > a.powerPerMinute ? b : a) : null;
  }
  const now = input.now !== undefined ? input.now : yield* best(input.build);
  const nowRate = now?.powerPerMinute ?? 0;
  const power = (base: PlayerPowerStats) => unroundedPlayerPower(input.build.effective(base));
  const stats = input.build.effective(input.build.base);
  const critAverage = 1 + Math.max(0, Math.min(1, input.build.criticalChance)) * (Math.max(1, input.build.criticalMultiplier) - 1);
  const dps = Math.max(1e-9, stats.damage * critAverage / Math.max(input.build.minAttackInterval, stats.attackRate));
  const from = input.start ?? input.current.arrival;
  const groups = [...new Set(input.current.sites.map(site => site.group))].filter(group => group !== 'soul:critDamage');
  const run: ForecastRun = { horizonSeconds: input.horizonSeconds ?? 120, start: input.start, health: input.health };
  const canKite = AUTO_FARM_EVASION && !input.build.melee && !input.build.reflectOnly;
  const scored = [];
  for (const group of groups) {
    // The group farmed alone, as autofarm would: its best way, one at a time.
    const own: ForecastResult[] = [];
    const measured = !input.measuredGroups || input.measuredGroups.includes(group);
    const priced = measured ? input.build : { ...input.build, incomingCalibration: Math.max(1, input.build.incomingCalibration ?? 1) };
    for (const kite of canKite ? [false, true] : [false]) {
      if (input.modes && !input.modes.includes(kite ? 'kited' : 'standing')) continue;
      own.push(forecastOption(input.current, priced, { pull: false, groups: [group], kite }, run, input.tuning));
      yield;
    }
    // And pulled, where Pull is on: the group brought in as many at once as the build can stand.
    if (input.modes?.includes('pull')) {
      own.push(forecastOption(input.current, priced, { pull: true, groups: [group], pullCamps: 1 }, run, input.tuning));
      yield;
    }
    const lasting = own.filter(result => result.sustainable);
    const farmed = (lasting.length ? lasting : own).reduce<ForecastResult | null>((a, b) => !a || b.powerPerMinute > a.powerPerMinute ? b : a, null);
    const members = input.current.sites.filter(site => site.group === group);
    const reward = members.reduce((low, site) => site.reward.amount < low.amount ? site.reward : low, members[0].reward);
    const hp = members.reduce((sum, site) => sum + site.definition.hp, 0) / members.length;
    const nearest = Math.min(...members.map(site => Math.hypot(site.x - from.x, site.y - from.y)));
    // As Auto prices a kill's time (auto-farm-controller.ts chooseCamp): the kill, and the walk to the nearest.
    const secondsPerKill = hp / dps + Math.max(0, nearest - input.build.reach) / Math.max(1, input.build.moveSpeed);
    // The probe: kills enough to grow the stat by probeShare (attack speed counted in attacks a second), at least sampleKills.
    const kills = Math.min(100_000, Math.max(sample, Math.ceil(probeShare * statSize(input.build.base, reward.type) / Math.max(1e-12, rewardSize(reward)))));
    let base = input.build.base;
    for (let kill = 0; kill < kills; kill++) base = applyReward(base, reward, input.build.rewardMultiplier, input.build.minAttackInterval);
    const killPower = (power(base) - power(input.build.base)) / kills;
    const after = yield* best({ ...input.build, base });
    const rateRise = ((after?.powerPerMinute ?? 0) - nowRate) / kills;
    // Its kills a second: the forecast's, or Auto's estimate when nothing was priced.
    const minutes = run.horizonSeconds / 60;
    const killsPerSecond = farmed ? farmed.kills / minutes / 60 : 1 / Math.max(.1, secondsPerKill);
    const gainPerSecond = farmed ? Math.max(0, farmed.powerPerMinute) / 60 : killPower / Math.max(.1, secondsPerKill);
    scored.push({
      group, secondsPerKill, killPower,
      /** The rise in the best power a minute, per kill. */
      rateRise,
      /** The best option once this group has been farmed a while: what its rise is a rise to. */
      unlocks: after ? { map: after.map, mode: after.mode } : null,
      /** Its own power a second, farmed alone as autofarm would (the forecast). */
      gainPerSecond, killsPerSecond,
      score: gainPerSecond + Math.max(0, rateRise) * (horizonMinutes - chunkMinutes) * killsPerSecond,
      /** Auto's Best Gain, for comparison: the kill's power alone, per second. */
      bestGain: killPower / Math.max(.1, secondsPerKill),
      sampledKills: kills,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return { group: scored[0]?.group ?? null, best: now ? { map: now.map, mode: now.mode, powerPerMinute: now.powerPerMinute } : null, groups: scored };
}
