import {
  CARD_EFFECT_DEFAULTS, NO_CARDS, cardChance, cardDamageDealtMultiplier, cardDamageTakenMultiplier, cardValue, type CardTotals,
} from "../../../shared/card-effects";
import { CARD_CHAIN_RANGE, CARD_SPLASH_MAX_TARGETS, CARD_SPLASH_RADIUS, PRISM_MAX_TARGETS, PRISM_REPEAT_SECONDS } from "../../../shared/card-bounds";
import { FIRE_ARROW_BURN, type ArrowEffect } from "../../../shared/arrows";
import { ENEMY_TYPES } from "../enemies";
import type { BossTarget, EnemyCardStatus, EnemyState, PlayerState } from "./types";
import type { DamageSource } from "./dps-meter";
import { healPlayer } from "./player-health";

type Target = EnemyState | BossTarget;
type DamageOverTime = { dps: number; left: number; pending: number; tick: number; color: string };

const DOT_TICK_SECONDS = .5;
const KNOCKBACK_FORCE = 520;
const COLORS = { burn: "#ff8a3d", poison: "#7be05a", chill: "#9fe3ff", stun: "#ffe27a", weaken: "#c9a4ff", splash: "#ffd27a", chain: "#9fd8ff", shield: "#8fd3ff" };

const isRegular = (target: Target): target is EnemyState => !target.isBoss && !(target as EnemyState).generatedBoss;
const baseOf = (enemy: EnemyState) => enemy.definition ?? ENEMY_TYPES[enemy.type];

/** How a stunned, slowed or weakened enemy moves, attacks and hits: 1 is untouched. */
// Shared by every enemy without a status: asked for each enemy every step.
const UNTOUCHED = Object.freeze({ move: 1, attack: 1, damage: 1 });
export function enemyCardControl(enemy: EnemyState): { readonly move: number; readonly attack: number; readonly damage: number } {
  const status = enemy.cardStatus;
  if (!status) return UNTOUCHED;
  if ((status.stun ?? 0) > 0) return { move: 0, attack: 0, damage: 1 - (status.weaken?.share ?? 0) };
  const slow = 1 - (status.slow?.share ?? 0);
  return { move: slow, attack: slow, damage: 1 - (status.weaken?.share ?? 0) };
}

/**
 * The active cards in a fight (shared/card-effects.ts): what a weapon hit is multiplied by and what it sets off,
 * what a hit taken comes to, and the statuses, damage over time, shield and momentum they leave running.
 * Card damage (burn, splash, chain lightning) neither crits nor sets off more cards.
 */
export function createCardCombat(deps: {
  cards: () => CardTotals;
  player: PlayerState;
  enemies: EnemyState[];
  random: () => number;
  mapId: () => string;
  isDueling: () => boolean;
  /** Card damage on a target: no crit and no cards; a kill pays as any kill does. Prism's is reflected damage. */
  strike: (target: Target, damage: number, source: DamageSource, reflected?: boolean) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
  spawnParticle?: (x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, color: string) => void;
  streak?: (fromX: number, fromY: number, toX: number, toY: number, color: string) => void;
}) {
  const { player } = deps;
  const dots = new Map<Target, { burn?: DamageOverTime; poison?: DamageOverTime }>();
  const touched = new WeakSet<Target>();
  let momentum: number[] = [];
  /** Game time, and when Prism last struck each enemy. */
  let clock = 0;
  const prismStruckAt = new WeakMap<Target, number>();
  let shield = 0, shieldWait = 0, lastStandReady = true, map = "";

  const cards = () => deps.cards();
  const statusOf = (enemy: EnemyState): EnemyCardStatus => (enemy.cardStatus ??= {});

  /** What a weapon hit on this target is multiplied by: slayers, execute, opener, berserk, steady and momentum. */
  function hitMultiplier(target: Target) {
    const worn = cards();
    if (worn === NO_CARDS) return 1;
    const regular = isRegular(target) ? target : null;
    const base = regular ? baseOf(regular) : null;
    // Boss Slayer cards add to the perk, which bosses already get (player-combat-controller.ts applyPlayerHit).
    let bonus = regular ? (cardDamageDealtMultiplier(worn, { elite: Boolean(base?.elite), ranged: Boolean(base?.ranged), mapId: deps.mapId() }) - 1) * 100 : 0;
    const health = target.hp / Math.max(1, target.maxHp);
    if (health < CARD_EFFECT_DEFAULTS.execute.below) bonus += cardValue(worn, "execute");
    if (health >= .999) bonus += cardValue(worn, "opener");
    if (player.hp < player.maxHp * CARD_EFFECT_DEFAULTS.berserk.below) bonus += cardValue(worn, "berserk");
    if (!player.moving) bonus += cardValue(worn, "steady");
    bonus += cardValue(worn, "momentum") * momentum.length;
    return 1 + Math.max(0, bonus) / 100;
  }

  /** Iaido: the first hit on each enemy, or on a boss at full health, is always a critical. */
  function firstHitCrit(target: Target) {
    const fresh = !touched.has(target) || target.hp >= target.maxHp;
    touched.add(target);
    return fresh && cardValue(cards(), "iaido") > 0;
  }

  function damageOverTime(target: Target, kind: "burn" | "poison", total: number, seconds: number) {
    if (!(total > 0) || !(seconds > 0)) return;
    const entry = dots.get(target) ?? {};
    const current = entry[kind];
    const dps = total / seconds;
    entry[kind] = { dps: Math.max(dps, current?.dps ?? 0), left: Math.max(seconds, current?.left ?? 0), pending: current?.pending ?? 0,
      tick: current?.tick ?? 0, color: COLORS[kind] };
    dots.set(target, entry);
  }

  function setStatus(enemy: EnemyState, kind: "slow" | "weaken", share: number, seconds: number) {
    const status = statusOf(enemy), current = status[kind];
    status[kind] = { share: Math.max(share, current?.share ?? 0), left: Math.max(seconds, current?.left ?? 0) };
  }

  /** Enemies within reach of a point, nearest first, never the one struck. */
  function near(x: number, y: number, radius: number, exclude: ReadonlySet<Target>) {
    return deps.enemies
      .filter(enemy => !enemy.dead && !enemy.remoteCombatGhost && !exclude.has(enemy) && Math.hypot(enemy.x - x, enemy.y - y) - enemy.r <= radius)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  }

  /** Splash and Prism reach the nearest few, as the server bounds them, not a whole pack. */
  function splashAround(target: Target, damage: number) {
    if (!(damage > 0)) return;
    deps.spawnBurst(target.x, target.y, COLORS.splash, 10, 120);
    for (const enemy of near(target.x, target.y, CARD_SPLASH_RADIUS, new Set([target])).slice(0, CARD_SPLASH_MAX_TARGETS)) deps.strike(enemy, damage, 'card-splash');
  }

  function chainLightning(target: Target, damage: number, targets: number) {
    const struck = new Set<Target>([target]);
    let from: Target = target;
    for (let arc = 0; arc < targets; arc++) {
      const [next] = near(from.x, from.y, CARD_CHAIN_RANGE, struck);
      if (!next) return;
      deps.streak?.(from.x, from.y, next.x, next.y, COLORS.chain);
      struck.add(next);
      deps.strike(next, damage, 'card-chain');
      from = next;
    }
  }

  /**
   * Reap finishes a regular enemy, not an elite, left under its threshold: after any hit, whatever dealt it (weapon,
   * skill, splash, chain, damage over time, Reflect).
   */
  function reap(target: Target) {
    const worn = cards();
    if (worn === NO_CARDS || !isRegular(target) || target.dead || baseOf(target).elite || !(target.hp > 0)) return false;
    const threshold = cardValue(worn, "reap");
    if (!(threshold > 0) || target.hp >= target.maxHp * threshold / 100) return false;
    deps.spawnBurst(target.x, target.y, "#d7b8ff", 14, 140);
    deps.strike(target, target.hp, 'card-reap');
    return true;
  }

  /** After a weapon hit lands (reflected hits are not weapon hits): lifesteal, splash and each proc's roll. */
  function afterHit(target: Target, damage: number, angle: number) {
    const worn = cards();
    if (worn === NO_CARDS || !(damage > 0)) return;
    const steal = cardValue(worn, "lifesteal");
    if (steal > 0) healPlayer(player, damage * steal / 100, "lifesteal");
    const regular = isRegular(target) ? target : null;
    splashAround(target, damage * cardValue(worn, "splash") / 100);
    const defaults = CARD_EFFECT_DEFAULTS;
    for (const proc of worn.procs) {
      if (deps.random() * 100 >= proc.chance) continue;
      if (proc.effect === "burn") damageOverTime(target, "burn", damage * (proc.share ?? defaults.burn.share), proc.seconds ?? defaults.burn.seconds);
      else if (proc.effect === "poison") {
        damageOverTime(target, "poison", damage * defaults.poison.share, defaults.poison.seconds);
        if (regular) setStatus(regular, "weaken", defaults.poison.weaken, defaults.poison.seconds);
      } else if (proc.effect === "splash") splashAround(target, damage * (proc.share ?? 0));
      else if (proc.effect === "chainLightning") {
        chainLightning(target, damage * (proc.share ?? defaults.chainLightning.share), proc.targets ?? defaults.chainLightning.targets);
      } else if (!regular || regular.dead) continue;
      else if (proc.effect === "chill") { setStatus(regular, "slow", defaults.chill.slow, defaults.chill.seconds); deps.spawnBurst(regular.x, regular.y, COLORS.chill, 8, 60); }
      else if (proc.effect === "stun") {
        const status = statusOf(regular);
        status.stun = Math.max(status.stun ?? 0, proc.seconds ?? defaults.stun.seconds);
        deps.spawnBurst(regular.x, regular.y, COLORS.stun, 8, 60);
      } else if (proc.effect === "weaken") { setStatus(regular, "weaken", defaults.weaken.weaken, defaults.weaken.seconds); deps.spawnBurst(regular.x, regular.y, COLORS.weaken, 8, 60); }
      else if (proc.effect === "knockback") {
        regular.vx += Math.cos(angle) * KNOCKBACK_FORCE;
        regular.vy += Math.sin(angle) * KNOCKBACK_FORCE;
      }
    }
  }

  /** Each kill adds a stack of Momentum, for a few seconds, up to its limit. */
  function onKill() {
    if (cardValue(cards(), "momentum") <= 0) return;
    momentum = [...momentum, CARD_EFFECT_DEFAULTS.momentum.seconds].slice(-CARD_EFFECT_DEFAULTS.momentum.stacks);
  }

  /** What Second Wind cards add to the perk's heal on a kill, as a share of max health. */
  const secondWind = () => Math.max(0, cardValue(cards(), "secondWind")) / 100;

  /** A hit about to land: null when dodged, else its amount after the guards that apply to the attacker. */
  function incoming(amount: number, source?: Target | null) {
    const worn = cards();
    if (worn === NO_CARDS || deps.isDueling()) return amount;
    if (deps.random() * 100 < cardChance(worn, "dodge")) {
      deps.spawnBurst(player.x, player.y, "#ffffff", 8, 90);
      return null;
    }
    const regular = source && isRegular(source) ? source : null;
    const base = regular ? baseOf(regular) : null;
    return amount * cardDamageTakenMultiplier(worn, {
      boss: Boolean(source && !regular), elite: Boolean(base?.elite), ranged: Boolean(base?.ranged), mapId: regular ? deps.mapId() : undefined,
    });
  }

  /** The shield takes what it can of a hit that got through armor; the rest reaches health. It refills after a quiet spell. */
  function absorb(dealt: number) {
    const worn = cards();
    if (worn === NO_CARDS || dealt <= 0) return dealt;
    shieldWait = worn.timing.shield;
    if (shield <= 0) return dealt;
    // The hit that breaks the shield is spent on it whole: one blow that would one-shot is stopped once a refill.
    shield = Math.max(0, shield - dealt);
    deps.spawnBurst(player.x, player.y, COLORS.shield, 6, 70);
    return 0;
  }

  /** After a hit: Last Stand catches a killing blow once a map visit, Panic Heal may heal, and Web slows the attacker. */
  function afterHurt(source?: Target | null) {
    const worn = cards();
    if (worn === NO_CARDS) return;
    const lastStand = cardValue(worn, "lastStand");
    if (player.hp <= 0 && lastStand > 0 && lastStandReady) {
      lastStandReady = false;
      player.hp = Math.max(1, player.maxHp * Math.min(100, lastStand) / 100);
      deps.spawnBurst(player.x, player.y, "#ffe9a8", 24, 170);
    }
    const panic = CARD_EFFECT_DEFAULTS.panicHeal;
    if (player.hp > 0 && player.hp < player.maxHp * panic.below && deps.random() * 100 < cardChance(worn, "panicHeal")) {
      healPlayer(player, player.maxHp * panic.heal, "panic-heal");
      deps.spawnBurst(player.x, player.y, "#7cf08f", 14, 120);
    }
    const web = cardValue(worn, "web");
    if (source && isRegular(source) && !source.dead && web > 0) setStatus(source, "slow", Math.min(.9, web / 100), worn.timing.web);
  }

  /**
   * Prism: a reflected hit also strikes up to four enemies near its attacker, the nearest not struck by one in the
   * last second, so a pack hitting the player does not stack every reflect on the enemies in its middle.
   */
  function afterReflect(source: Target, damage: number) {
    if (!(cardValue(cards(), "prism") > 0) || !(damage > 0)) return;
    deps.spawnBurst(source.x, source.y, COLORS.splash, 10, 120);
    const fresh = near(source.x, source.y, CARD_SPLASH_RADIUS, new Set([source]))
      .filter(enemy => !(clock - (prismStruckAt.get(enemy) ?? -Infinity) < PRISM_REPEAT_SECONDS)).slice(0, PRISM_MAX_TARGETS);
    for (const enemy of fresh) { prismStruckAt.set(enemy, clock); deps.strike(enemy, damage, 'card-reflect-splash', true); }
  }

  function tickDamage(target: Target, entry: DamageOverTime, dt: number, source: DamageSource) {
    const step = Math.min(dt, entry.left);
    entry.left -= step;
    entry.pending += entry.dps * step;
    entry.tick += step;
    if (entry.tick < DOT_TICK_SECONDS && entry.left > 0) return;
    entry.tick = 0;
    const amount = entry.pending;
    entry.pending = 0;
    if (amount > 0 && !target.dead) {
      deps.spawnParticle?.(target.x, target.y - 10, 0, -40, .5, .5, 4, entry.color);
      deps.strike(target, amount, source);
    }
  }

  function update(dt: number) {
    clock += dt;
    // A new map visit gives Last Stand back and leaves the last map's burns and momentum behind.
    if (map && deps.mapId() !== map) {
      lastStandReady = true;
      momentum = [];
      dots.clear();
    }
    map = deps.mapId();
    momentum = momentum.map(left => left - dt).filter(left => left > 0);
    const worn = cards();
    const shieldMax = player.maxHp * Math.max(0, cardValue(worn, "shield")) / 100;
    shieldWait = Math.max(0, shieldWait - dt);
    if (shieldWait <= 0) shield = shieldMax;
    shield = Math.min(shield, shieldMax);
    for (const [target, entry] of dots) {
      for (const kind of ["burn", "poison"] as const) {
        const dot = entry[kind];
        if (!dot) continue;
        tickDamage(target, dot, dt, `card-${kind}`);
        if (dot.left <= 0) delete entry[kind];
      }
      if (target.dead || (!entry.burn && !entry.poison)) dots.delete(target);
    }
    for (const enemy of deps.enemies) {
      const status = enemy.cardStatus;
      if (!status) continue;
      if (status.stun !== undefined) status.stun = status.stun > dt ? status.stun - dt : undefined;
      for (const kind of ["slow", "weaken"] as const) {
        const effect = status[kind];
        if (!effect) continue;
        if (effect.left > dt) effect.left -= dt;
        else delete status[kind];
      }
      if (status.stun === undefined && !status.slow && !status.weaken) enemy.cardStatus = undefined;
    }
  }

  /** A nocked arrow's hit (arrows.ts): Fire burns, Venom poisons and weakens, Frost chills, on every hit, cards or not. */
  function arrowHit(target: Target, damage: number, effect: ArrowEffect) {
    if (!(damage > 0) || target.dead) return;
    const regular = isRegular(target) ? target : null, defaults = CARD_EFFECT_DEFAULTS;
    if (effect === "burn") damageOverTime(target, "burn", damage * FIRE_ARROW_BURN.share, FIRE_ARROW_BURN.seconds);
    else if (effect === "poison") {
      damageOverTime(target, "poison", damage * defaults.poison.share, defaults.poison.seconds);
      if (regular) setStatus(regular, "weaken", defaults.poison.weaken, defaults.poison.seconds);
    } else if (effect === "chill" && regular) setStatus(regular, "slow", defaults.chill.slow, defaults.chill.seconds);
  }

  return {
    hitMultiplier, firstHitCrit, afterHit, arrowHit, reap, onKill, secondWind, incoming, absorb, afterHurt, afterReflect, update,
    /** The shield in play and its most, for the health bar. */
    shield: () => ({ amount: shield, max: player.maxHp * Math.max(0, cardValue(cards(), "shield")) / 100 }),
  };
}
