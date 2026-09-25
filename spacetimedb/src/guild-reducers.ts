import { t, SenderError } from "spacetimedb/server";
import type spacetimedbType from "./index";
import type { ModuleReducerCtx } from "./index";
import type { createGuildService } from "./guild-service";
import { GUILD_CREATION_MIN_POWER } from "../../shared/guilds";

export function registerGuildReducers(spacetimedb: typeof spacetimedbType, deps: {
  guildService: ReturnType<typeof createGuildService>;
  requireGuildPlayer: (ctx: ModuleReducerCtx) => void;
  effectivePowerForProgress: (ctx: ModuleReducerCtx, progress: NonNullable<ReturnType<ModuleReducerCtx["db"]["playerProgress"]["identity"]["find"]>>) => number;
  isPublicDisplayNameAllowed: (name: string) => boolean;
}) {
  const { guildService, requireGuildPlayer, effectivePowerForProgress, isPublicDisplayNameAllowed } = deps;
const createGuild = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireGuildPlayer(ctx);
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress || effectivePowerForProgress(ctx, progress) < GUILD_CREATION_MIN_POWER) {
    throw new SenderError("Reach 1 billion power to create a guild.");
  }
  if (!isPublicDisplayNameAllowed(name)) throw new SenderError("Choose a different guild name.");
  guildService.create(ctx, name);
});
const joinGuild = spacetimedb.reducer({ guildId: t.u64() }, (ctx, { guildId }) => { requireGuildPlayer(ctx); guildService.join(ctx, guildId); });
const leaveGuild = spacetimedb.reducer((ctx) => { requireGuildPlayer(ctx); guildService.leave(ctx); });
const transferGuildLeadership = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => { requireGuildPlayer(ctx); guildService.transfer(ctx, identity); });
const setGuildVicePresident = spacetimedb.reducer({ identity: t.identity(), enabled: t.bool() }, (ctx, { identity, enabled }) => { requireGuildPlayer(ctx); guildService.setVicePresident(ctx, identity, enabled); });
const setGuildEmblem = spacetimedb.reducer({ emblem: t.u8() }, (ctx, { emblem }) => { requireGuildPlayer(ctx); guildService.setEmblem(ctx, emblem); });
const kickGuildMember = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => { requireGuildPlayer(ctx); guildService.kick(ctx, identity); });
const challengeGuild = spacetimedb.reducer({ opponentGuildId: t.u64() }, (ctx, { opponentGuildId }) => { requireGuildPlayer(ctx); guildService.challenge(ctx, opponentGuildId); });
const guildAdmission = spacetimedb.reducer({ action: t.string(), guildId: t.u64(), identity: t.identity(), note: t.string() }, (ctx, { action, guildId, identity, note }) => { requireGuildPlayer(ctx); guildService.admission(ctx, action, guildId, identity, note); });
  return { createGuild, joinGuild, leaveGuild, transferGuildLeadership, setGuildVicePresident, setGuildEmblem, kickGuildMember, challengeGuild, guildAdmission };
}
