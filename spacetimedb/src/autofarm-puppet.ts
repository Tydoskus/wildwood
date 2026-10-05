import { table, t, SenderError } from "spacetimedb/server";
import type { default as spacetimedbType } from "./index";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { AUTO_FARM_PUPPET_CAMP_MAX, AUTO_FARM_PUPPET_GROUP_MAX, AUTO_FARM_PUPPET_MIN_RESEND_MICROS } from "../../shared/autofarm-puppet";

/**
 * Autofarm puppets: an autofarming player sends what they farm, not where they
 * walk. Every viewer on the map plays them locally from this one row (the
 * group, an anchor and its time; shared/autofarm-puppet.ts),
 * and the farmer drops to the hidden player's 30-second movement checkpoints,
 * so the movement stream and the nearest-5 detail slots are left to players
 * who steer. Close enough, not exact: their real route follows their own kills.
 *
 * Only visible players have a row. Going invisible (syncPlayerMotionIdentity)
 * or leaving (removePlayerRealtimeState) clears it, as does the farmer when
 * they stop. A map change leaves it to the farmer, who re-sends it for the map
 * they reach (their plan's key holds the map); until then it names the old
 * map, where no client draws them, since they are no longer visible there.
 */
export const playerAutoFarmPuppet = table({
  name: "player_auto_farm_puppet",
  public: true,
  indexes: [{ accessor: "byMap", algorithm: "btree", columns: ["mapId"] as const }],
}, {
  identity: t.identity().primaryKey(),
  mapId: t.string(),
  /** The autofarm group ("stat:damage", or an enemy kind) and the camp when one is chosen. */
  group: t.string(),
  camp: t.string(),
  /** Where the farmer stood when this was sent, from their validated motion, and when. */
  x: t.f32(),
  y: t.f32(),
  startedAt: t.timestamp(),
});

export function clearAutoFarmPuppet(ctx: any, identity: any) {
  if (ctx.db.playerAutoFarmPuppet.identity.find(identity)) ctx.db.playerAutoFarmPuppet.identity.delete(identity);
}

type PuppetDeps = {
  blockedSession: (ctx: any) => boolean;
  requireControllingPlayer: (ctx: any) => any;
  playerWithMotion: (ctx: any, player: any) => any;
};

export function setAutoFarmPuppetFor(ctx: any, group: string, camp: string, deps: PuppetDeps) {
  if (deps.blockedSession(ctx)) return;
  const player = deps.requireControllingPlayer(ctx);
  const current = ctx.db.playerAutoFarmPuppet.identity.find(ctx.sender);
  const motion = ctx.db.playerMotion.identity.find(ctx.sender);
  if (!group || !motion?.isVisible || player.mapId === HOME_EXTERIOR_MAP_ID) {
    if (current) ctx.db.playerAutoFarmPuppet.identity.delete(ctx.sender);
    return;
  }
  if (group.length > AUTO_FARM_PUPPET_GROUP_MAX || camp.length > AUTO_FARM_PUPPET_CAMP_MAX) throw new SenderError("Autofarm group name is too long.");
  // The same plan again within a few seconds says nothing new; every write goes to the whole map.
  if (current && current.mapId === player.mapId && current.group === group && current.camp === camp
    && ctx.timestamp.microsSinceUnixEpoch - current.startedAt.microsSinceUnixEpoch < AUTO_FARM_PUPPET_MIN_RESEND_MICROS) return;
  // The anchor is where the server last validated them, not a position the client names.
  const at = deps.playerWithMotion(ctx, player);
  const next = { identity: ctx.sender, mapId: player.mapId, group, camp, x: at.x, y: at.y, startedAt: ctx.timestamp };
  if (current) ctx.db.playerAutoFarmPuppet.identity.update(next);
  else ctx.db.playerAutoFarmPuppet.insert(next);
}

export function registerAutoFarmPuppetReducers(spacetimedb: typeof spacetimedbType, deps: PuppetDeps) {
  const setAutoFarmPuppet = spacetimedb.reducer({ group: t.string(), camp: t.string() }, (ctx, { group, camp }) => setAutoFarmPuppetFor(ctx, group, camp, deps));
  return { setAutoFarmPuppet };
}
