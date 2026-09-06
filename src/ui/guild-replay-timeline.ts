import { simulateGuildBattle, type GuildBattleResult, type GuildCombatFrame } from "../../shared/guild-combat";

export type GuildReplayShot = { actor: number; target: number; launch: number; impact: number; from: { x: number; y: number }; to: { x: number; y: number } };
export function buildGuildReplayTimeline(battle: GuildBattleResult) {
  const frames: GuildCombatFrame[] = [];
  simulateGuildBattle(battle.attackers, battle.defenders, frame => frames.push(frame));
  const fighters = [...battle.attackers, ...battle.defenders];
  const deaths = fighters.map(() => Infinity);
  const attacks = fighters.map(() => [] as GuildReplayShot[]);
  function sample(time: number) {
    const bounded = Math.max(0, Math.min(battle.duration, time));
    const index = Math.min(frames.length - 1, Math.floor(bounded * 10 + 1e-8));
    const frame = frames[index], next = frames[Math.min(index + 1, frames.length - 1)];
    const blend = Math.min(1, Math.max(0, bounded * 10 - index));
    return frame.actors.map((actor, i) => ({ ...actor,
      x: actor.x + (next.actors[i].x - actor.x) * blend,
      y: actor.y + (next.actors[i].y - actor.y) * blend,
      moving: actor.hp > 0 && Math.hypot(next.actors[i].x - actor.x, next.actors[i].y - actor.y) > .1,
    }));
  }
  for (let step = 1; step < frames.length; step++) {
    const frame = frames[step], before = frames[step - 1];
    frame.actors.forEach((actor, i) => {
      if (actor.hp <= 0 && deaths[i] === Infinity) deaths[i] = frame.time;
      if (actor.attacks <= before.actors[i].attacks || actor.target < 0) return;
      const target = frame.actors[actor.target];
      const flight = Math.min(.28, Math.max(.12, Math.hypot(target.x - actor.x, target.y - actor.y) / 800));
      const launch = Math.max(0, frame.time - flight), from = sample(launch)[i];
      attacks[i].push({ actor: i, target: actor.target, launch, impact: frame.time,
        from: { x: from.x, y: from.y + 1 }, to: { x: target.x, y: target.y - 3 } });
    });
  }
  const shots = attacks.flat().sort((a, b) => a.launch - b.launch);
  return { fighters, frames, deaths, attacks, shots, sample };
}
export type GuildReplayTimeline = ReturnType<typeof buildGuildReplayTimeline>;

/** Binary search keeps seeking/restarting independent of previous playback. */
export function replayEventIndex<T>(events: T[], time: number, timestamp: (event: T) => number) {
  let low = 0, high = events.length;
  while (low < high) { const mid = (low + high) >>> 1; if (timestamp(events[mid]) < time) low = mid + 1; else high = mid; }
  return low;
}
