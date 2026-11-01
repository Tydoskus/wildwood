import {
  BLOODLUST_HEAL_SHARE, CLEAVE_DAMAGE_SHARE, CLEAVE_TARGETS, MARK_DAMAGE_BONUS, MARK_SECONDS, MOMENTUM_MAX, MOMENTUM_PER_HIT,
  OVERCHARGE_CHAIN_BONUS, PARRY_RETURN_BONUS, TAILWIND_SECONDS, TAILWIND_SPEED_BONUS, VOLLEY_SPLIT_SHOT_BONUS,
  hasTechnique, masteryCritEvery, masteryDamageTakenAt, masteryMarks, masteryTechniqueBound, type MasteryTechniqueId,
} from "../../../shared/mastery-techniques";
import type { MasteryInPlay } from "../../../shared/weapon-mastery";
import { isSkillSecondaryTarget } from "./bow-skill-procs";
import { healPlayer } from "./player-health";
import type { BossTarget, EnemyState, PlayerState } from "./types";

/**
 * The client side of Weapon Mastery's techniques (shared/mastery-techniques.ts): the shot count behind Steady Aim
 * and Focus, the marks Hunter's Mark and Hex leave, Momentum's run of hits and Tailwind's last kill. The combat
 * controller asks it; with no technique learned every answer is the plain one.
 */
export function createMasteryTechniqueRuntime(options: {
  mastery: () => MasteryInPlay; player: PlayerState; enemies: readonly EnemyState[]; nowSeconds: () => number;
}) {
  const { player } = options;
  const has = (id: MasteryTechniqueId) => hasTechnique(options.mastery(), id);
  let shots = 0, streak = 0, lastKillAt = -Infinity;
  let marks = new WeakMap<object, number>();

  return {
    /** Steady Aim and Focus: counts one arrow or bolt and says whether it is the one that crits. */
    shotCrits() {
      const every = masteryCritEvery(options.mastery());
      if (!every) { shots = 0; return false; }
      shots = (shots + 1) % every;
      return shots === 0;
    },
    /** Volley: a Split Shot arrow's damage factor. */
    splitShotFactor: () => has("volley") ? 1 + VOLLEY_SPLIT_SHOT_BONUS : 1,
    /**
     * Hunter's Mark and Hex: a weapon hit's factor on a marked target. A critical hit marks its target after it
     * lands, so the hit that marks is not raised by its own mark.
     */
    hitFactor(target: EnemyState | BossTarget, critical: boolean) {
      if (!masteryMarks(options.mastery())) return 1;
      const now = options.nowSeconds(), factor = (marks.get(target) ?? -Infinity) > now ? 1 + MARK_DAMAGE_BONUS : 1;
      if (critical) marks.set(target, now + MARK_SECONDS);
      return factor;
    },
    /** Cleave: the nearest other regular enemies within `reach` of the player, each struck for CLEAVE_DAMAGE_SHARE. */
    cleaveTargets(primary: EnemyState | BossTarget, reach: number) {
      if (!has("cleave")) return [];
      const distance = (enemy: EnemyState) => Math.hypot(player.x - enemy.x, player.y - enemy.y) - enemy.r;
      return options.enemies.filter(enemy => enemy !== primary && isSkillSecondaryTarget(enemy) && distance(enemy) <= reach)
        .sort((a, b) => distance(a) - distance(b)).slice(0, CLEAVE_TARGETS);
    },
    cleaveShare: CLEAVE_DAMAGE_SHARE,
    /** A swing that landed: Bloodlust heals and Momentum's run grows. */
    swingLanded() {
      if (has("bloodlust")) healPlayer(player, player.maxHp * BLOODLUST_HEAL_SHARE, "bloodlust");
      streak = has("momentum") ? streak + 1 : 0;
    },
    /** A swing that hit nothing ends Momentum's run. */
    swingMissed() { streak = 0; },
    /** Momentum's attack speed factor: the attack interval is divided by it. */
    attackSpeed: () => has("momentum") ? 1 + Math.min(MOMENTUM_MAX, streak * MOMENTUM_PER_HIT) : 1,
    kill() { lastKillAt = options.nowSeconds(); },
    /** Tailwind's move speed share, 0 outside its window. */
    tailwind: () => has("tailwind") && options.nowSeconds() - lastKillAt < TAILWIND_SECONDS ? TAILWIND_SPEED_BONUS : 0,
    stormWaves: () => masteryTechniqueBound(options.mastery(), false).stormWaves,
    whirlwindTicks: () => masteryTechniqueBound(options.mastery(), false).whirlwindTicks,
    meteorFalls: () => masteryTechniqueBound(options.mastery(), false).meteorFalls,
    deflectReturn: () => has("parry") ? 1 + PARRY_RETURN_BONUS : 1,
    chainScale: () => has("overcharge") ? 1 + OVERCHARGE_CHAIN_BONUS : 1,
    /** The share of a hit that lands: Swordplay's Guard, and Mana Shield above half health. */
    damageTaken: () => masteryDamageTakenAt(options.mastery(), player.hp, player.maxHp),
    clear() { shots = 0; streak = 0; lastKillAt = -Infinity; marks = new WeakMap(); },
  };
}
