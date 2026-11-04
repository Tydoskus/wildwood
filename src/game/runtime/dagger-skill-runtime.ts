import { BACKSTAB_CRIT_CHANCE, BACKSTAB_CRIT_DAMAGE, DAGGER_POISON_SECONDS, DAGGER_POISON_SHARE, daggerSkillChance, isSkillDagger, type DaggerSkillId, type DaggerSkillRoll } from "../../../shared/dagger-skills";
import type { BossTarget, EnemyState, PlayerState } from "./types";

type Target = EnemyState | BossTarget;
const BACKSTAB_COLOR = "#b98cff", POISON_COLOR = "#7bd65a", DODGE_COLOR = "#ffffff";

/**
 * A dagger's skills in play (shared/dagger-skills.ts), each at its own rolled chance: Backstab and Poison on a strike
 * that lands, Dodge on a hit about to be taken. None fires in a duel.
 */
export function createDaggerSkillRuntime(options: {
  player: PlayerState; equippedWeapon: () => string; roll: () => Partial<DaggerSkillRoll> | null | undefined;
  random: () => number; isDueling: () => boolean;
  poison: (target: Target, damage: number, seconds: number) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number, speed?: number) => void;
}) {
  const procs = (skill: DaggerSkillId) =>
    !options.isDueling() && isSkillDagger(options.equippedWeapon()) && options.random() < daggerSkillChance(options.roll(), skill);

  return {
    /** A strike about to land: its crit chance and crit damage bonus when it is a Backstab, else none. */
    backstab(target: Target) {
      if (!procs("backstab")) return { critChance: 0, critDamage: 0 };
      options.spawnBurst(target.x, target.y, BACKSTAB_COLOR, 8, 70);
      return { critChance: BACKSTAB_CRIT_CHANCE, critDamage: BACKSTAB_CRIT_DAMAGE };
    },
    /** A strike that landed may poison its target with its damage again, dealt over a few seconds. */
    poison(target: Target, damage: number) {
      if (target.dead || !procs("poison")) return;
      options.poison(target, damage * DAGGER_POISON_SHARE, DAGGER_POISON_SECONDS);
      options.spawnBurst(target.x, target.y, POISON_COLOR, 6, 50);
    },
    /** True when the hit about to land is dodged. */
    dodge() {
      if (!procs("dodge")) return false;
      options.spawnBurst(options.player.x, options.player.y, DODGE_COLOR, 8, 90);
      return true;
    },
  };
}
