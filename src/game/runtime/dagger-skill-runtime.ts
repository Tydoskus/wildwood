import { bossSurfaceDistance, bossVerticalRadius } from "../../../shared/boss-hitbox";
import { daggerSkillChance, DaggerSkillRoll, isSkillDagger } from "../../../shared/dagger-skills";
import { segmentCircleHit, segmentEllipseHit } from "../weapon-combat";
import { isSkillSecondaryTarget } from "./bow-skill-procs";
import type { DamageSource } from "./dps-meter";
import type { BossTarget, EnemyShot, EnemyState, PlayerState, Position } from "./types";

type Target = EnemyState | BossTarget;
export type DaggerSkillEffects = {
  spawnDaggerBackstab?: (x: number, y: number) => void;
  spawnDaggerPoison?: (target: Target) => void;
};

/** Timed sword hits use the controller's ordinary hit/reward path. They never trigger more skills. */
export function createDaggerSkillRuntime(options: {
  player: PlayerState; enemies: EnemyState[];
  currentMapId: () => string; equippedWeapon: () => string; activeBoss: () => BossTarget | null;
  roll: () => Partial<DaggerSkillRoll> | null | undefined; nowSeconds: () => number;
  random: () => number; isDueling: () => boolean; onCombat?: () => void;
  effects?: DaggerSkillEffects;
  poison: (target: Target, damage: number) => void;
  hit: (target: Target, damage: number, critical: boolean, angle: number, source: DamageSource, reflected?: boolean) => void;
}) {
  const { player, enemies } = options;
  const backstabStack: Position[] = [];
  let blinkCooldown = 0;
  let map = options.currentMapId(), weapon = options.equippedWeapon();
  const present = (target: Target) => !target.dead && (target.isBoss ? options.activeBoss() === target : !target.remoteCombatGhost && enemies.includes(target));
  const boss = (target: Target) => target.isBoss || target.generatedBoss;

  function clear() {
    backstabStack.length = 0;
  }

  function ready() {
    const nextMap = options.currentMapId(), nextWeapon = options.equippedWeapon();
    if (map !== nextMap || weapon !== nextWeapon) {
      clear(); map = nextMap; weapon = nextWeapon;
    }
    if (player.hp <= 0 || options.isDueling() || !isSkillDagger(weapon)) { clear(); return false; }
    return true;
  }

  /*
    My roll things are still broken but I wanted something working, so I hardcoded all the proc percentages to 15 atm
  */

  const BACKSTAB_GAP = 0;
  const BACKSTAB_BONUS_CRIT_RATE = 0.1;
  const BACKSTAB_BONUS_CRIT_DAMAGE = 0.1;

  function backstab(target: Target, damage: (crit: boolean) => number, critRate: number, angle: number) {
    if (!ready()) return;
    const chance = 0.15;//daggerSkillChance(options.roll(), "backstab");
    if (chance <= 0 || options.random() >= chance) return false;
    const normalize = (v: Position): Position => { const mag = Math.hypot(v.x, v.y); if (mag) return { x: v.x / mag, y: v.y / mag }; return v; };
    const vector = normalize({ x: target.x - player.x, y: target.y - player.y });
    const particleLocation = { x: target.x + vector.x * (target.r + player.r), y: target.y + vector.y * (target.r + player.r) };
    const blinkLocation = { x: target.x + vector.x * (target.r + player.r + BACKSTAB_GAP), y: target.y + vector.y * (target.r + player.r + BACKSTAB_GAP) };
    backstabStack.push({ x: player.x, y: player.y });
    const now = options.nowSeconds();
    blinkCooldown = now + DAGGER_BLINK_RETURN_START_COOLDOWN;
    player.x = blinkLocation.x;
    player.y = blinkLocation.y;
    player.facing += Math.PI;
    const critical = options.random() < critRate + BACKSTAB_BONUS_CRIT_RATE;
    const finalDamage = critical ? damage(critical) * (1 + BACKSTAB_BONUS_CRIT_DAMAGE) : damage(critical);
    options.hit(target, finalDamage, critical, angle, 'dagger-backstab');
    // spawn a dagger stab blood burst / other animation here
    return true;
  }

  function poison(target: Target, damage: number) {
    const chance = 0.15;
    if (chance <= 0 || options.random() >= chance) return false;
    options.poison(target, damage);
  }

  function dodge() {
    const chance = 0.15;
    if (chance <= 0 || options.random() >= chance) return false;
    console.log(`Dodge :3`);
    return true;
  }

  const DAGGER_BLINK_BACK_COOLDOWN = 0.05;
  const DAGGER_BLINK_RETURN_START_COOLDOWN = 0.2;

  function update() {
    if (!ready()) return;
    const now = options.nowSeconds();
    if (backstabStack.length && now > blinkCooldown) {
      const pos = backstabStack.pop();
      if (pos) {
        player.x = pos.x;
        player.y = pos.y;
        blinkCooldown = now + DAGGER_BLINK_BACK_COOLDOWN;
      }
    }
  }
  return { backstab, poison, dodge, update, clear };
}
