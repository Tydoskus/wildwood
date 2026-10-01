import { buildGuildEntrance, GUILD_MOVE_SPEED } from "./guild-entrance";
import { damageAfterArmor } from "./combat";
import { duelHitMultiplier, type DuelFighter } from "./duel-combat";
import { itemDefinition } from "./items";
import { DEFAULT_ATTACK_RANGE } from "./rules";

export const GUILD_COMBAT_VERSION = 4;
export const GUILD_COMBAT_STEP = .1;
export const GUILD_COMBAT_LIMIT = 60;
export type GuildAppearance = { skinTone?: number; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
export type GuildFighter = { identity: string; name: string; fighter: DuelFighter; appearance?: GuildAppearance; range?: number; moveSpeed?: number; weaponItem?: string };
/** Freeze real equipment reach separately from its cosmetic appearance. */
export function guildWeaponRange(item: string | undefined, rangedRange: number) {
  const weapon = itemDefinition(item)?.weapon;
  return weapon?.mode === "MELEE" ? (weapon.range ?? 75) + Math.max(0, rangedRange - DEFAULT_ATTACK_RANGE) : rangedRange;
}
export type GuildActorState = { x: number; y: number; hp: number; target: number; cooldown: number; attacks: number; hitAt: number };
export type GuildCombatFrame = { time: number; actors: GuildActorState[] };
export type GuildBattleResult = {
  version: 2 | 3 | 4; attackers: GuildFighter[]; defenders: GuildFighter[];
  outcome: "VICTORY" | "DEFEAT" | "DRAW"; duration: number;
  attackerSurvivors: number; defenderSurvivors: number;
};

function validateTeam(team: GuildFighter[]) {
  if (!team.length || team.length > 20) throw new Error("Each guild needs 1–20 members.");
  for (const { fighter: f, range, moveSpeed } of team) {
    if (moveSpeed !== undefined && (!Number.isFinite(moveSpeed) || moveSpeed <= 0 || moveSpeed > 1000)) throw new Error("A member's movement speed is unavailable.");
    if (Object.values(f).some(value => !Number.isFinite(value) || value < 0) || f.maxHp <= 0 || f.attackRate < .05 || (range !== undefined && (!Number.isFinite(range) || range < 40 || range > 250))) throw new Error("A member's combat stats are unavailable.");
  }
}
export function initialGuildCombat(attackers: GuildFighter[], defenders: GuildFighter[]): GuildCombatFrame {
  validateTeam(attackers); validateTeam(defenders);
  return { time: 0, actors: [attackers, defenders].flatMap((team, side) => team.map((member, i) => {
    const rows = Math.min(5, team.length), row = i % rows, column = Math.floor(i / rows);
    const staggerY = member.moveSpeed === undefined ? 0 : (column - (Math.ceil(team.length / rows) - 1) / 2) * 104 / Math.ceil(team.length / rows);
    return { x: side ? 730 + column * 52 : 270 - column * 52, y: 320 + (row - (rows - 1) / 2) * 86 + staggerY,
      hp: member.fighter.maxHp, target: -1, cooldown: member.fighter.attackRate, attacks: 0, hitAt: -10 };
  })) };
}
const living = (actors: GuildActorState[], from: number, to: number) => actors.slice(from, to).filter(actor => actor.hp > 0).length;
export function guildAttackDamage(attacker: DuelFighter, defender: DuelFighter, time: number, count = 1) {
  return count * damageAfterArmor(attacker.damage * duelHitMultiplier(time, 1), defender.armor);
}
export function guildCombatFinished(frame: GuildCombatFrame, split: number) {
  return frame.time >= GUILD_COMBAT_LIMIT || !living(frame.actors, 0, split) || !living(frame.actors, split, frame.actors.length);
}
/** Fixed, simultaneous ticks shared by server resolution and replay. At most 40
 * actors and 600 ticks. Targets stay fixed until a knockout or reinforcement wave. */
export function advanceGuildCombat(fighters: GuildFighter[], split: number, previous: GuildCombatFrame, arrivals?: readonly number[], version: GuildBattleResult["version"] = GUILD_COMBAT_VERSION): GuildCombatFrame {
  const time = Math.round((previous.time + GUILD_COMBAT_STEP) * 10) / 10;
  const actors = previous.actors.map(actor => ({ ...actor }));
  const hits = new Float64Array(actors.length);
  const active = (index: number) => !arrivals || previous.time >= arrivals[index];
  // Rebalance only when reinforcements become active, not every render/tick.
  const newWave = version >= 4 && arrivals?.some(at => previous.time >= at && previous.time - GUILD_COMBAT_STEP < at);
  const assigned = new Uint8Array(actors.length);
  if (!newWave) for (const [i, actor] of previous.actors.entries()) {
    if (actor.hp > 0 && active(i) && actor.target >= 0 && previous.actors[actor.target].hp > 0 && active(actor.target)) assigned[actor.target]++;
  }
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i], before = previous.actors[i], member = fighters[i], stats = member.fighter;
    if (before.hp <= 0 || !active(i)) continue;
    actor.hp = Math.min(stats.maxHp, actor.hp + stats.regen * GUILD_COMBAT_STEP);
    const from = i < split ? split : 0, to = i < split ? actors.length : split;
    if (newWave || actor.target < from || actor.target >= to || previous.actors[actor.target].hp <= 0 || !active(actor.target)) {
      let distance = Infinity; actor.target = -1;
      for (let j = from; j < to; j++) {
        const candidate = previous.actors[j];
        if (candidate.hp <= 0 || !active(j)) continue;
        // Mirrored teams share the same random tie-breaks. No names/IDs enter
        // the seed, so renaming a player cannot change a recorded outcome.
        let seed = Math.imul((i < split ? i : i - split) + 1, 73856093)
          ^ Math.imul(j - from + 1, 19349663) ^ Math.imul(Math.round(time * 10), 83492791);
        seed = Math.imul(seed ^ seed >>> 16, 2246822507);
        const d = version >= 4 ? assigned[j] + ((seed ^ seed >>> 13) >>> 0) / 4294967296
          : (candidate.x - before.x) ** 2 + (candidate.y - before.y) ** 2;
        if (d < distance - (arrivals ? 1e-8 : 0)) { distance = d; actor.target = j; }
      }
    }
    if (actor.target < 0) continue;
    if (version >= 4 && (newWave || actor.target !== before.target)) assigned[actor.target]++;
    const target = previous.actors[actor.target];
    const dx = target.x - before.x, dy = target.y - before.y, distance = Math.hypot(dx, dy);
    const reach = member.range ?? 72;
    if (distance > reach) {
      const step = Math.min(distance - reach, (member.moveSpeed ?? GUILD_MOVE_SPEED) * GUILD_COMBAT_STEP);
      actor.x += dx / distance * step; actor.y += dy / distance * step;
    }
    actor.cooldown -= GUILD_COMBAT_STEP;
    if (distance <= reach + .01 && actor.cooldown <= 1e-9) {
      const count = 1 + Math.floor(Math.max(0, -actor.cooldown - 1e-9) / stats.attackRate);
      hits[actor.target] += guildAttackDamage(stats, fighters[actor.target].fighter, time, count);
      actor.attacks += count; actor.hitAt = time; actor.cooldown += count * stats.attackRate;
    } else if (distance > reach + .01) actor.cooldown = Math.max(0, actor.cooldown);
  }
  // Apply spacing simultaneously for arriving teams to avoid a first-side bias.
  // Version 2 retains its original sequential spacing for saved reports.
  const spacing = arrivals ? actors.map(() => ({ x: 0, y: 0 })) : undefined;
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    const a = actors[i], b = actors[j];
    if (a.hp <= 0 || b.hp <= 0 || !active(i) || !active(j)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length >= 28) continue;
    const push = (28 - length) * .25, nx = length ? dx / length : 0, ny = length ? dy / length : 1;
    const left = spacing?.[i] ?? a, right = spacing?.[j] ?? b;
    left.x -= nx * push; left.y -= ny * push; right.x += nx * push; right.y += ny * push;
  }
  actors.forEach((actor, i) => {
    if (spacing) { actor.x += spacing[i].x; actor.y += spacing[i].y; }
    actor.hp = Math.max(0, actor.hp - hits[i]);
  });
  return { time, actors };
}
export function simulateGuildBattle(attackers: GuildFighter[], defenders: GuildFighter[], onFrame?: (frame: GuildCombatFrame) => void, version: GuildBattleResult["version"] = GUILD_COMBAT_VERSION): GuildBattleResult {
  const fighters = [...attackers, ...defenders], split = attackers.length;
  let frame = initialGuildCombat(attackers, defenders);
  const arrivals = version >= 3 ? buildGuildEntrance({ attackers, defenders, version }).arrivals.map(entry => entry.start + entry.travel) : undefined;
  onFrame?.(frame);
  while (!guildCombatFinished(frame, split)) { frame = advanceGuildCombat(fighters, split, frame, arrivals, version); onFrame?.(frame); }
  const attackerSurvivors = living(frame.actors, 0, split), defenderSurvivors = living(frame.actors, split, fighters.length);
  const fraction = (from: number, to: number) => frame.actors.slice(from, to).reduce((sum, actor) => sum + actor.hp, 0) / fighters.slice(from, to).reduce((sum, member) => sum + member.fighter.maxHp, 0);
  const difference = fraction(0, split) - fraction(split, fighters.length);
  const outcome = !attackerSurvivors && !defenderSurvivors ? "DRAW" : !defenderSurvivors ? "VICTORY" : !attackerSurvivors ? "DEFEAT" : Math.abs(difference) < 1e-9 ? "DRAW" : difference > 0 ? "VICTORY" : "DEFEAT";
  return { version, attackers, defenders, outcome, duration: frame.time, attackerSurvivors, defenderSurvivors };
}
