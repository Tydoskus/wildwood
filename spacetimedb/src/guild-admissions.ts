import { sendPersonalMail } from "./dev-review-mail";
import { moderatePublicChatMessage } from "./chat-moderation";
import { GUILD_MEMBER_LIMIT } from "../../shared/guilds";
import { SenderError } from "spacetimedb/server";
import type { ModuleReducerCtx as Ctx } from "./index";
import type { Identity } from "spacetimedb";

export const guildRequestOnly = (ctx: Ctx, guildId: bigint) => ctx.db.guildAdmissionPolicy.guildId.find(guildId)?.requestOnly ?? false;
export function requireGuildOfficer(ctx: Ctx) {
  const member = ctx.db.guildMember.identity.find(ctx.sender);
  const guild = member && ctx.db.guild.id.find(member.guildId);
  if (!guild || (!guild.leader.equals(ctx.sender) && !member?.vicePresident)) throw new SenderError("Only the President or Vice President can manage guild requests.");
  return guild;
}
export function guildAdmissionAction(ctx: Ctx, action: string, guildId: bigint, applicant: Identity,
  join: (ctx: Ctx, guildId: bigint, identity: Identity) => void, note = "") {
  if (action === "cancel") { ctx.db.guildJoinRequest.identity.delete(ctx.sender); return; }
  if (action === "request") {
    if (ctx.db.guildMember.identity.find(ctx.sender)) throw new SenderError("Leave your current guild first.");
    const guild = ctx.db.guild.id.find(guildId);
    if (!guild) throw new SenderError("Guild no longer exists.");
    if (!guildRequestOnly(ctx, guildId)) throw new SenderError("This guild is open. Join directly.");
    if (guild.members >= GUILD_MEMBER_LIMIT) throw new SenderError("This guild is full.");
    const pending = ctx.db.guildJoinRequest.identity.find(ctx.sender);
    if (pending?.guildId === guildId) return;
    if (pending) throw new SenderError("Cancel your current request before requesting another guild.");
    if ([...ctx.db.guildJoinRequest.guildId.filter(guildId)].length >= 50) throw new SenderError("This guild's request inbox is full.");
    ctx.db.guildJoinRequest.insert({ identity: ctx.sender, guildId, requestedAt: ctx.timestamp.microsSinceUnixEpoch });
    return;
  }
  const guild = requireGuildOfficer(ctx);
  if (action === "open" || action === "requestOnly") {
    const row = { guildId: guild.id, requestOnly: action === "requestOnly" };
    if (ctx.db.guildAdmissionPolicy.guildId.find(guild.id)) ctx.db.guildAdmissionPolicy.guildId.update(row);
    else ctx.db.guildAdmissionPolicy.insert(row);
    return;
  }
  if (action !== "accept" && action !== "decline") throw new SenderError("Unknown guild request action.");
  const request = ctx.db.guildJoinRequest.identity.find(applicant);
  if (!request || request.guildId !== guild.id) throw new SenderError("Request no longer exists.");
  const trimmed = note.trim();
  if (trimmed.length > 300) throw new SenderError("Keep the note to 300 characters or fewer.");
  const safeNote = trimmed ? moderatePublicChatMessage(trimmed).message : "";
  if (action === "accept") join(ctx, guild.id, applicant);
  sendPersonalMail(ctx, { key: `guild-request-${guild.id}-${applicant.toHexString()}-${request.requestedAt}`,
    identity: applicant, title: `${guild.name}: Join request ${action === "accept" ? "accepted" : "denied"}`,
    body: `${guild.name} ${action === "accept" ? "accepted" : "denied"} your request to join.${action === "accept" ? " You are now a member." : ""}${safeNote ? `\n\nNote from guild leadership:\n${safeNote}` : ""}` });
  ctx.db.guildJoinRequest.identity.delete(applicant);
}
