import { damageAfterArmor } from "./combat";
import { duelHitMultiplier, type DuelFighter } from "./duel-combat";

export const GUILD_COMBAT_VERSION = 2;
export const GUILD_COMBAT_STEP = .1;
export const GUILD_COMBAT_LIMIT = 60;
export type GuildAppearance = { skinTone?: number; headItem?: string; chestItem?: string; feetItem?: string; rightHandItem?: string; leftHandItem?: string };
export type GuildFighter = { identity: string; name: string; fighter: DuelFighter; appearance?: GuildAppearance; range?: number };
export type GuildActorState = { x: number; y: number; hp: number; target: number; cooldown: number; attacks: number; hitAt: number };
export type GuildCombatFrame = { time: number; actors: GuildActorState[] };
export type GuildBattleResult = {
  version: 2; attackers: GuildFighter[]; defenders: GuildFighter[];
  outcome: "VICTORY" | "DEFEAT" | "DRAW"; duration: number;
  attackerSurvivors: number; defenderSurvivors: number;
};

function validateTeam(team: GuildFighter[]) {
  if (!team.length || team.length > 20) throw new Error("Each guild needs 1–20 members.");
  for (const { fighter: f, range } of team) {
    if (Object.values(f).some(value => !Number.isFinite(value) || value < 0) || f.maxHp <= 0 || f.attackRate < .05 || (range !== undefined && (!Number.isFinite(range) || range < 40 || range > 240))) throw new Error("A member's combat stats are unavailable.");
  }
}
export function initialGuildCombat(attackers: GuildFighter[], defenders: GuildFighter[]): GuildCombatFrame {
  validateTeam(attackers); validateTeam(defenders);
  return { time: 0, actors: [attackers, defenders].flatMap((team, side) => team.map((member, i) => {
    const rows = Math.min(5, team.length), row = i % rows, column = Math.floor(i / rows);
    return { x: side ? 730 + column * 52 : 270 - column * 52, y: 320 + (row - (rows - 1) / 2) * 86,
      hp: member.fighter.maxHp, target: -1, cooldown: member.fighter.attackRate, attacks: 0, hitAt: -10 };
  })) };
}
const living = (actors: GuildActorState[], from: number, to: number) => actors.slice(from, to).filter(actor => actor.hp > 0).length;
export function guildCombatFinished(frame: GuildCombatFrame, split: number) {
  return frame.time >= GUILD_COMBAT_LIMIT || !living(frame.actors, 0, split) || !living(frame.actors, split, frame.actors.length);
}
/** Fixed, simultaneous ticks shared by server resolution and replay. At most 40
 * actors and 600 ticks. Target searches happen only when a target falls. */
export function advanceGuildCombat(fighters: GuildFighter[], split: number, previous: GuildCombatFrame): GuildCombatFrame {
  const time = Math.round((previous.time + GUILD_COMBAT_STEP) * 10) / 10;
  const actors = previous.actors.map(actor => ({ ...actor }));
  const hits = new Float64Array(actors.length);
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i], before = previous.actors[i], member = fighters[i], stats = member.fighter;
    if (before.hp <= 0) continue;
    actor.hp = Math.min(stats.maxHp, actor.hp + stats.regen * GUILD_COMBAT_STEP);
    const from = i < split ? split : 0, to = i < split ? actors.length : split;
    if (actor.target < from || actor.target >= to || previous.actors[actor.target].hp <= 0) {
      let distance = Infinity; actor.target = -1;
      for (let j = from; j < to; j++) {
        const candidate = previous.actors[j];
        if (candidate.hp <= 0) continue;
        const d = (candidate.x - before.x) ** 2 + (candidate.y - before.y) ** 2;
        if (d < distance) { distance = d; actor.target = j; }
      }
    }
    if (actor.target < 0) continue;
    const target = previous.actors[actor.target];
    const dx = target.x - before.x, dy = target.y - before.y, distance = Math.hypot(dx, dy);
    const reach = member.range ?? 72;
    if (distance > reach) {
      const step = Math.min(distance - reach, 90 * GUILD_COMBAT_STEP);
      actor.x += dx / distance * step; actor.y += dy / distance * step;
    }
    actor.cooldown -= GUILD_COMBAT_STEP;
    if (distance <= reach + .01 && actor.cooldown <= 1e-9) {
      const count = 1 + Math.floor(Math.max(0, -actor.cooldown - 1e-9) / stats.attackRate);
      hits[actor.target] += count * damageAfterArmor(stats.damage * duelHitMultiplier(time, 1), fighters[actor.target].fighter.armor);
      actor.attacks += count; actor.hitAt = time; actor.cooldown += count * stats.attackRate;
    } else if (distance > reach + .01) actor.cooldown = Math.max(0, actor.cooldown);
  }
  // Soft spacing keeps the melee readable when many members share a target.
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    const a = actors[i], b = actors[j];
    if (a.hp <= 0 || b.hp <= 0) continue;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length >= 28) continue;
    const push = (28 - length) * .25, nx = length ? dx / length : 0, ny = length ? dy / length : 1;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  }
  actors.forEach((actor, i) => { actor.hp = Math.max(0, actor.hp - hits[i]); });
  return { time, actors };
}
export function simulateGuildBattle(attackers: GuildFighter[], defenders: GuildFighter[], onFrame?: (frame: GuildCombatFrame) => void): GuildBattleResult {
  const fighters = [...attackers, ...defenders], split = attackers.length;
  let frame = initialGuildCombat(attackers, defenders); onFrame?.(frame);
  while (!guildCombatFinished(frame, split)) { frame = advanceGuildCombat(fighters, split, frame); onFrame?.(frame); }
  const attackerSurvivors = living(frame.actors, 0, split), defenderSurvivors = living(frame.actors, split, fighters.length);
  const fraction = (from: number, to: number) => frame.actors.slice(from, to).reduce((sum, actor) => sum + actor.hp, 0) / fighters.slice(from, to).reduce((sum, member) => sum + member.fighter.maxHp, 0);
  const difference = fraction(0, split) - fraction(split, fighters.length);
  const outcome = !attackerSurvivors && !defenderSurvivors ? "DRAW" : !defenderSurvivors ? "VICTORY" : !attackerSurvivors ? "DEFEAT" : Math.abs(difference) < 1e-9 ? "DRAW" : difference > 0 ? "VICTORY" : "DEFEAT";
  return { version: GUILD_COMBAT_VERSION, attackers, defenders, outcome, duration: frame.time, attackerSurvivors, defenderSurvivors };
}
