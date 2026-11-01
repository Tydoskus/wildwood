import { bossSurfaceDistance, bossVerticalRadius } from "../../../shared/boss-hitbox";
import {
  DEFLECT_RETURN_SPEED, SHOCKWAVE_DAMAGE_SHARE, SHOCKWAVE_MAX_TARGETS, SHOCKWAVE_RADIUS, SHOCKWAVE_RANGE,
  SHOCKWAVE_SPEED, WHIRLWIND_DAMAGE_SHARE, WHIRLWIND_MAX_TARGETS, WHIRLWIND_RADIUS,
  WHIRLWIND_TICKS, WHIRLWIND_TICK_SECONDS, isSkillSword, whirlwindRadius, swordSkillChance, type SwordSkillRoll,
} from "../../../shared/sword-skills";
import { segmentCircleHit, segmentEllipseHit } from "../weapon-combat";
import { isSkillSecondaryTarget } from "./bow-skill-procs";
import type { DamageSource } from "./dps-meter";
import type { BossTarget, EnemyShot, EnemyState, PlayerState } from "./types";

type Target = EnemyState | BossTarget;
export type SwordSkillEffects = {
  spawnSwordSpin?: (x: number, y: number, radius: number, life: number, anchor?: { x: number; y: number }) => void;
  spawnSwordWave?: (x: number, y: number, toX: number, toY: number, radius: number, life: number) => void;
  spawnDeflectedShot?: (x: number, y: number, toX: number, toY: number, life: number) => void;
};
type Swing = { primary: Target; damage: number; critical: boolean };
type Spin = Swing & { startedAt: number; tick: number; ticks: number; radius: number };
type Wave = Swing & { x: number; y: number; angle: number; startedAt: number; traveled: number; struck: Set<Target> };

/** Timed sword hits use the controller's ordinary hit/reward path. They never trigger more skills. */
export function createSwordSkillRuntime(options: {
  player: PlayerState; enemies: EnemyState[];
  currentMapId: () => string; equippedWeapon: () => string; activeBoss: () => BossTarget | null;
  roll: () => Partial<SwordSkillRoll> | null | undefined; nowSeconds: () => number;
  random: () => number; isDueling: () => boolean; onCombat?: () => void;
  effects?: SwordSkillEffects;
  /** Blade Storm's extra Whirlwind ticks and Parry's bigger Deflect return (mastery-techniques.ts); none without. */
  extraWhirlwindTicks?: () => number;
  /** The sword's reach, which widens Whirlwind (whirlwindRadius). */
  reach?: () => number;
  deflectReturn?: () => number;
  hit: (target: Target, damage: number, critical: boolean, angle: number, source: DamageSource, reflected?: boolean) => void;
}) {
  const { player, enemies } = options;
  const spins: Spin[] = [], waves: Wave[] = [];
  const returns: { target: EnemyState; damage: number; landAt: number }[] = [];
  let map = options.currentMapId(), weapon = options.equippedWeapon();
  const present = (target: Target) => !target.dead && (target.isBoss ? options.activeBoss() === target : !target.remoteCombatGhost && enemies.includes(target));
  const boss = (target: Target) => target.isBoss || target.generatedBoss;
  const candidates = (primary: Target): Target[] => boss(primary)
    ? present(primary) ? [primary] : [] : enemies.filter(isSkillSecondaryTarget);
  const distance = (target: Target) => target.isBoss
    ? bossSurfaceDistance(player.x - target.x, player.y - target.y, target.r, target.ry, target.hitboxOffsetY)
    : Math.hypot(target.x - player.x, target.y - player.y) - target.r;

  function clear() {
    spins.length = 0; waves.length = 0; returns.length = 0;
    player.swordSpinClock = 0;
  }
  function ready() {
    const nextMap = options.currentMapId(), nextWeapon = options.equippedWeapon();
    if (map !== nextMap || weapon !== nextWeapon) {
      clear(); map = nextMap; weapon = nextWeapon;
    }
    if (player.hp <= 0 || options.isDueling() || !isSkillSword(weapon)) { clear(); return false; }
    return true;
  }

  function swing(primary: Target, damage: number, critical: boolean, angle: number) {
    if (!ready()) return;
    const roll = options.roll(), startedAt = options.nowSeconds();
    const whirlwind = swordSkillChance(roll, "whirlwind"), shockwave = swordSkillChance(roll, "shockwave");
    if (whirlwind > 0 && options.random() < whirlwind) {
      const ticks = WHIRLWIND_TICKS + Math.max(0, options.extraWhirlwindTicks?.() ?? 0), seconds = ticks * WHIRLWIND_TICK_SECONDS;
      const radius = options.reach ? whirlwindRadius(options.reach()) : WHIRLWIND_RADIUS;
      spins.push({ primary, damage, critical, startedAt, tick: 0, ticks, radius });
      player.swordSpinClock = seconds;
      options.effects?.spawnSwordSpin?.(player.x, player.y, radius, seconds, player);
    }
    if (shockwave > 0 && options.random() < shockwave) {
      waves.push({ primary, damage, critical, angle, startedAt, x: player.x, y: player.y, traveled: 0, struck: new Set() });
      options.effects?.spawnSwordWave?.(player.x, player.y, player.x + Math.cos(angle) * SHOCKWAVE_RANGE,
        player.y + Math.sin(angle) * SHOCKWAVE_RANGE, SHOCKWAVE_RADIUS, SHOCKWAVE_RANGE / SHOCKWAVE_SPEED);
    }
  }

  /** Only a real incoming projectile can be parried. It consumes the same hurt window as taking a hit. */
  function deflect(shot: EnemyShot) {
    if (!ready() || player.hurtClock > 0 || !shot.source || !present(shot.source)) return false;
    const chance = swordSkillChance(options.roll(), "deflect");
    if (chance <= 0 || options.random() >= chance) return false;
    const target = shot.source, flight = Math.max(.04, Math.hypot(target.x - player.x, target.y - player.y) / DEFLECT_RETURN_SPEED);
    // The cap also applies in Reflect Only; the server bounds a parry without assuming lost health.
    returns.push({ target, damage: Math.max(0, Math.min(shot.damage, player.maxHp)) * (options.deflectReturn?.() ?? 1), landAt: options.nowSeconds() + flight });
    options.effects?.spawnDeflectedShot?.(player.x, player.y, target.x, target.y, flight);
    player.hurtClock = .1;
    options.onCombat?.();
    shot.life = 0;
    return true;
  }

  function update() {
    if (!ready()) return;
    const now = options.nowSeconds();
    player.swordSpinClock = 0;
    for (let index = spins.length - 1; index >= 0; index--) {
      const spin = spins[index];
      while (spin.tick < spin.ticks && now + 1e-8 >= spin.startedAt + (spin.tick + 1) * WHIRLWIND_TICK_SECONDS) {
        spin.tick++;
        const targets = candidates(spin.primary).filter(target => distance(target) <= spin.radius)
          .sort((a, b) => distance(a) - distance(b)).slice(0, WHIRLWIND_MAX_TARGETS);
        for (const target of targets) options.hit(target, spin.damage * WHIRLWIND_DAMAGE_SHARE, spin.critical,
          Math.atan2(target.y - player.y, target.x - player.x), 'sword-spin');
      }
      player.swordSpinClock = Math.max(player.swordSpinClock, spin.startedAt + spin.ticks * WHIRLWIND_TICK_SECONDS - now);
      if (spin.tick >= spin.ticks) spins.splice(index, 1);
    }
    for (let index = waves.length - 1; index >= 0; index--) {
      const wave = waves[index];
      const traveled = Math.min(SHOCKWAVE_RANGE, Math.max(0, now - wave.startedAt) * SHOCKWAVE_SPEED);
      const step = traveled - wave.traveled;
      if (step <= 0) continue;
      const dx = Math.cos(wave.angle) * step, dy = Math.sin(wave.angle) * step;
      // Sweep the whole segment, ordered by first contact, so a slow frame cannot skip enemies.
      const hits = candidates(wave.primary).filter(target => !wave.struck.has(target)).map(target => ({
        target, t: target.isBoss
          ? segmentEllipseHit(target.x - wave.x, target.y + (target.hitboxOffsetY ?? 0) - wave.y, dx, dy,
            target.r + SHOCKWAVE_RADIUS, bossVerticalRadius(target.r, target.ry) + SHOCKWAVE_RADIUS)
          : segmentCircleHit(target.x - wave.x, target.y - wave.y, dx, dy, target.r + SHOCKWAVE_RADIUS),
      })).filter((hit): hit is { target: Target; t: number } => hit.t !== null).sort((a, b) => a.t - b.t);
      for (const { target } of hits) {
        if (wave.struck.size >= SHOCKWAVE_MAX_TARGETS) break;
        wave.struck.add(target);
        options.hit(target, wave.damage * SHOCKWAVE_DAMAGE_SHARE, wave.critical, wave.angle, 'sword-wave');
      }
      wave.x += dx; wave.y += dy; wave.traveled = traveled;
      if (traveled >= SHOCKWAVE_RANGE || wave.struck.size >= SHOCKWAVE_MAX_TARGETS) waves.splice(index, 1);
    }
    for (let index = returns.length - 1; index >= 0; index--) {
      const returned = returns[index];
      if (now < returned.landAt) continue;
      returns.splice(index, 1);
      if (present(returned.target)) options.hit(returned.target, returned.damage, false,
        Math.atan2(returned.target.y - player.y, returned.target.x - player.x), 'sword-deflect', true);
    }
  }
  return { swing, deflect, update, clear };
}
