import { table, t } from "spacetimedb/server";
import { isProceduralMap, proceduralMapNumber } from "../../shared/procedural-maps";
import type { GameViewContext, GameReducerContext } from "./index";

export const proceduralMapTables = {
  // A narrow, revocable testing permission; it grants no other developer tools.
  endlessTravelAccess: table(
    { public: false },
    { identity: t.identity().primaryKey() },
  ),
  // Keep deployed table layouts intact. The boss and contribution tables held
  // the retired shared Endless fight and are no longer written; permanent
  // proceduralProgress rows are live.
  proceduralBoss: table(
    { public: true },
    {
      mapId: t.string().primaryKey(),
      encounter: t.u64(),
      hp: t.f64(),
      maxHp: t.f64(),
      respawnAtMicros: t.u64(),
    },
  ),
  proceduralContribution: table(
    {
      public: false,
      indexes: [
        { accessor: "byMap", algorithm: "btree", columns: ["mapId"] },
        { accessor: "byIdentity", algorithm: "btree", columns: ["identity"] },
      ],
    },
    {
      key: t.string().primaryKey(),
      mapId: t.string(),
      identity: t.identity(),
      encounter: t.u64(),
      damage: t.f64(),
      windowAt: t.u64(),
      hits: t.u32(),
    },
  ),
  proceduralInstanceBoss: table(
    { public: false },
    {
      key: t.string().primaryKey(),
      mapId: t.string(),
      encounter: t.u64(),
      hp: t.f64(),
      maxHp: t.f64(),
      respawnAtMicros: t.u64(),
    },
  ),
  proceduralProgress: table(
    { public: true },
    { identity: t.identity().primaryKey(), completed: t.f64() },
  ),
  proceduralInstanceContribution: table(
    {
      public: false,
      indexes: [
        { accessor: "byBoss", algorithm: "btree", columns: ["bossKey"] },
        { accessor: "byIdentity", algorithm: "btree", columns: ["identity"] },
      ],
    },
    {
      key: t.string().primaryKey(),
      bossKey: t.string(),
      identity: t.identity(),
      encounter: t.u64(),
      damage: t.f64(),
      windowAt: t.u64(),
      hits: t.u32(),
    },
  ),
};
export function generatedMapUnlocked(
  mapId: string,
  completed: number,
  campaignComplete: boolean,
) {
  const number = proceduralMapNumber(mapId);
  return number !== null && campaignComplete && number <= completed + 1;
}
/**
 * Key of a generated map's retained shared-boss row, read by the
 * my_procedural_boss view. The `:root` suffix is left over from per-instance
 * bosses and is kept because live rows carry it.
 */
export function proceduralBossKey(
  _ctx: GameViewContext | GameReducerContext,
  mapId: string,
): string | null {
  return isProceduralMap(mapId) ? `${mapId}:root` : null;
}
export function clearProceduralProgress(
  ctx: GameReducerContext,
  identity: typeof ctx.sender,
) {
  ctx.db.proceduralProgress.identity.delete(identity);
  for (const row of ctx.db.proceduralContribution.byIdentity.filter(identity))
    ctx.db.proceduralContribution.key.delete(row.key);
  for (const row of ctx.db.proceduralInstanceContribution.byIdentity.filter(
    identity,
  ))
    ctx.db.proceduralInstanceContribution.key.delete(row.key);
}
export function mergeProceduralProgress(
  ctx: GameReducerContext,
  guest: typeof ctx.sender,
) {
  const source = ctx.db.proceduralProgress.identity.find(guest);
  const target = ctx.db.proceduralProgress.identity.find(ctx.sender);
  if (source && source.completed > (target?.completed ?? 0)) {
    const next = { identity: ctx.sender, completed: source.completed };
    if (target) ctx.db.proceduralProgress.identity.update(next);
    else ctx.db.proceduralProgress.insert(next);
  }
  clearProceduralProgress(ctx, guest);
}
