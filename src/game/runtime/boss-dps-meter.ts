import type { DamageSource } from './dps-meter';

export type DpsBossTarget = { dead: boolean; hp: number; encounter?: bigint | null };

/** Only source totals are retained for a fight, rather than a growing list of hits. */
export function createBossDpsMeter<Source extends string = DamageSource>(now: () => number) {
  let target: DpsBossTarget | null = null;
  let encounter: bigint | null | undefined;
  let started = 0, ended: number | null = null;
  let finished = false;
  const totals = new Map<Source, number>();
  function tick() {
    if (target && ended === null && (target.dead || target.encounter !== encounter)) {
      ended = now();
      finished = target.hp <= 0 && target.encounter === encounter;
    }
  }
  return {
    tick,
    record(amount: number, source: Source, boss: DpsBossTarget) {
      tick();
      if (boss.dead) return;
      if (target !== boss || encounter !== boss.encounter) {
        target = boss; encounter = boss.encounter; started = now(); ended = null; finished = false; totals.clear();
      }
      if (ended !== null) return;
      totals.set(source, (totals.get(source) ?? 0) + amount);
    },
    snapshot() {
      tick();
      const elapsedMs = target ? Math.max(0, (ended ?? now()) - started) : 0;
      const seconds = Math.max(1, elapsedMs / 1000);
      return { elapsedMs, finished, interrupted: ended !== null && !finished,
        rows: [...totals].map(([source, amount]) => ({ source, perSecond: amount / seconds }))
          .sort((a, b) => b.perSecond - a.perSecond) };
    },
    reset() { target = null; ended = null; finished = false; totals.clear(); },
  };
}
