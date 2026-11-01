import { bossSurfaceDistance } from "../../../shared/boss-hitbox";
import {
  CHAIN_DAMAGE_SHARE, CHAIN_MAX_JUMPS, CHAIN_RANGE, FROST_NOVA_RADIUS, FROST_NOVA_SECONDS, FROST_NOVA_SLOW,
  METEOR_DAMAGE_SHARE, METEOR_DELAY_SECONDS, METEOR_MAX_TARGETS, METEOR_RADIUS, STAFF_SPLASH_MAX_TARGETS, STAFF_SPLASH_RADIUS,
  isStaff, staffSkillChance, type BoltSkillProcs, type StaffSkillRoll,
} from "../../../shared/staff-skills";
import { METEOR_SHOWER_GAP_SECONDS } from "../../../shared/mastery-techniques";
import { isSkillSecondaryTarget } from "./bow-skill-procs";
import type { BossTarget, EnemyState, PlayerState } from "./types";
import type { DamageSource } from "./dps-meter";

type Target = EnemyState | BossTarget;
export type StaffSkillEffects = {
  spawnStaffBurst?: (x: number, y: number, radius: number, color: string) => void;
  spawnMeteor?: (x: number, y: number, radius: number, delay: number) => void;
  spawnFrostNova?: (x: number, y: number, radius: number) => void;
  spawnSkillStreak?: (x: number, y: number, toX: number, toY: number, color: string, width?: number, life?: number, jagged?: boolean) => void;
};
type Meteor = { x: number; y: number; damage: number; critical: boolean; landAt: number };

const edge = (x: number, y: number, target: Target) => target.isBoss
  ? bossSurfaceDistance(x - target.x, y - target.y, target.r, target.ry, target.hitboxOffsetY)
  : Math.hypot(target.x - x, target.y - y) - target.r;

/** Regular enemies within `radius` of a point, nearest first, leaving out those already struck. */
export function enemiesAround<T extends EnemyState>(enemies: readonly T[], x: number, y: number, radius: number, struck: ReadonlySet<object>) {
  return enemies.filter(enemy => !struck.has(enemy) && isSkillSecondaryTarget(enemy) && edge(x, y, enemy) <= radius)
    .sort((a, b) => edge(x, y, a) - edge(x, y, b));
}

/**
 * A staff's bolt bursting, and its three skills. Every hit goes through the controller's own hit path, so kills
 * pay as any kill does, and the server bounds them (shared/staff-skills.ts staffSkillReachMultiplier).
 */
export function createStaffSkillRuntime(options: {
  player: PlayerState; enemies: EnemyState[];
  currentMapId: () => string; equippedWeapon: () => string; activeBoss: () => BossTarget | null;
  roll: () => Partial<StaffSkillRoll> | null | undefined; nowSeconds: () => number;
  random: () => number; isDueling: () => boolean;
  boltColor: () => string;
  /** The bolt's blast radius, Sorcery's Blast included; STAFF_SPLASH_RADIUS without. */
  blastRadius?: () => number;
  /** Overcharge's Chain damage factor and Meteor Shower's extra falls (mastery-techniques.ts); none without. */
  chainScale?: () => number;
  extraMeteorFalls?: () => number;
  effects?: StaffSkillEffects;
  hit: (target: Target, damage: number, critical: boolean, angle: number, source: DamageSource) => void;
}) {
  const { enemies } = options;
  const meteors: Meteor[] = [];
  let map = options.currentMapId(), weapon = options.equippedWeapon();

  function clear() { meteors.length = 0; }
  function ready() {
    const nextMap = options.currentMapId(), nextWeapon = options.equippedWeapon();
    if (map !== nextMap || weapon !== nextWeapon) { clear(); map = nextMap; weapon = nextWeapon; }
    if (options.player.hp <= 0 || options.isDueling() || !isStaff(weapon)) { clear(); return false; }
    return true;
  }

  /**
   * A bolt landing on `primary` at (x, y): the full hit on it and on every regular enemy around the impact (up to
   * STAFF_SPLASH_MAX_TARGETS in all), then a Chain on to enemies the burst missed and a Frost Nova around it.
   */
  function burst(primary: Target, x: number, y: number, damage: number, critical: boolean, angle: number, procs: BoltSkillProcs | null | undefined) {
    const struck = new Set<object>([primary]), radius = options.blastRadius?.() ?? STAFF_SPLASH_RADIUS;
    options.hit(primary, damage, critical, angle, 'staff-direct');
    for (const enemy of enemiesAround(enemies, x, y, radius, struck).slice(0, STAFF_SPLASH_MAX_TARGETS - 1)) {
      struck.add(enemy);
      options.hit(enemy, damage, critical, Math.atan2(enemy.y - y, enemy.x - x), 'staff-splash');
    }
    options.effects?.spawnStaffBurst?.(x, y, radius, options.boltColor());
    if (!ready()) return;
    if (procs?.chain && !primary.isBoss && !primary.generatedBoss) {
      let from: { x: number; y: number } = primary;
      const share = CHAIN_DAMAGE_SHARE * (options.chainScale?.() ?? 1);
      for (let jump = 0; jump < CHAIN_MAX_JUMPS; jump++) {
        const [next] = enemiesAround(enemies, from.x, from.y, CHAIN_RANGE, struck);
        if (!next) break;
        struck.add(next);
        options.effects?.spawnSkillStreak?.(from.x, from.y - 10, next.x, next.y - 10, "#bfe6ff", 3, .3, true);
        options.hit(next, damage * share, critical, Math.atan2(next.y - from.y, next.x - from.x), 'staff-chain');
        from = next;
      }
    }
    if (procs?.frostNova) {
      // Regular enemies only: bosses are not slowed.
      for (const enemy of enemiesAround(enemies, x, y, FROST_NOVA_RADIUS, new Set())) {
        const status = enemy.cardStatus ??= {};
        status.slow = { share: Math.max(FROST_NOVA_SLOW, status.slow?.share ?? 0), left: Math.max(FROST_NOVA_SECONDS, status.slow?.left ?? 0) };
      }
      options.effects?.spawnFrostNova?.(x, y, FROST_NOVA_RADIUS);
    }
  }

  /**
   * On each cast: a chance to call a meteor down on the target, which lands METEOR_DELAY_SECONDS later. Meteor
   * Shower drops more on the same spot, METEOR_SHOWER_GAP_SECONDS apart.
   */
  function cast(target: { x: number; y: number }, damage: number, critical: boolean) {
    if (!ready()) return;
    const chance = staffSkillChance(options.roll(), "meteor");
    if (chance <= 0 || options.random() >= chance) return;
    const falls = 1 + Math.max(0, options.extraMeteorFalls?.() ?? 0);
    for (let fall = 0; fall < falls; fall++) {
      const delay = METEOR_DELAY_SECONDS + fall * METEOR_SHOWER_GAP_SECONDS;
      meteors.push({ x: target.x, y: target.y, damage: damage * METEOR_DAMAGE_SHARE, critical, landAt: options.nowSeconds() + delay });
      options.effects?.spawnMeteor?.(target.x, target.y, METEOR_RADIUS, delay);
    }
  }

  function update() {
    if (!meteors.length || !ready()) return;
    const now = options.nowSeconds();
    for (let index = meteors.length - 1; index >= 0; index--) {
      const meteor = meteors[index];
      if (now < meteor.landAt) continue;
      meteors.splice(index, 1);
      // A boss in the blast takes it too; regular enemies up to METEOR_MAX_TARGETS, nearest first.
      const boss = options.activeBoss();
      const targets: Target[] = boss && !boss.dead && edge(meteor.x, meteor.y, boss) <= METEOR_RADIUS ? [boss] : [];
      for (const enemy of enemies) {
        if (enemy.generatedBoss && !enemy.dead && !enemy.remoteCombatGhost && edge(meteor.x, meteor.y, enemy) <= METEOR_RADIUS) targets.push(enemy);
      }
      targets.push(...enemiesAround(enemies, meteor.x, meteor.y, METEOR_RADIUS, new Set()).slice(0, METEOR_MAX_TARGETS));
      for (const target of targets) {
        if (!target.dead) options.hit(target, meteor.damage, meteor.critical, Math.atan2(target.y - meteor.y, target.x - meteor.x), 'staff-meteor');
      }
    }
  }

  return { burst, cast, update, clear };
}
