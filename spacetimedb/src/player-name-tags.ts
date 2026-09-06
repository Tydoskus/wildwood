import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";

export function syncGuildTag(ctx: ModuleReducerCtx, identity: Identity) {
  const member = ctx.db.guildMember.identity.find(identity);
  const guildTag = member ? ctx.db.guild.id.find(member.guildId)?.name ?? "" : "";
  const previous = ctx.db.playerNameTag.identity.find(identity);
  if (previous) ctx.db.playerNameTag.identity.update({ ...previous, guildTag });
  else if (guildTag) ctx.db.playerNameTag.insert({ identity, guildTag, showDevTag: true });
}

export function migrateGuildTags(ctx: ModuleReducerCtx) {
  const guild = ctx.db.guild.nameKey.find("the guilds");
  if (guild) {
    ctx.db.guild.id.update({ ...guild, name: "TheG", nameKey: "theg" });
    const rank = ctx.db.guildRank.guildId.find(guild.id);
    if (rank) ctx.db.guildRank.guildId.update({ ...rank, payload: JSON.stringify({ ...JSON.parse(rank.payload), name: "TheG" }) });
    const standing = ctx.db.guildStanding.id.find(0);
    if (standing) ctx.db.guildStanding.id.update({ ...standing, entries: JSON.stringify(JSON.parse(standing.entries).map((entry: { id: string; name: string }) => entry.id === String(guild.id) ? { ...entry, name: "TheG" } : entry)) });
  }
  for (const member of ctx.db.guildMember.iter()) syncGuildTag(ctx, member.identity);
}
