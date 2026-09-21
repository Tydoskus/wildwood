import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx } from "./index";
import { AVATAR_FRAME_RANK, type AvatarFrame } from "../../shared/avatar-frames";
import { updatePublicChatCursor } from "./public-chat-history";

/**
 * Persistent receipt prevents renewals, retries, or unlink/relink from spamming
 * chat. A supporter is thanked once per tier on the way up and never on the way
 * down: the receipt remembers the highest tier already thanked, so Gold to
 * Diamond is announced and Diamond back to Gold is not.
 */
export function announcePatreonSupport(ctx: ModuleReducerCtx, identity: Identity, userId: string, tier: AvatarFrame) {
  if (tier === "none") return;
  const previous = ctx.db.patreonAnnouncement.userId.find(userId);
  const diamondThanked = Boolean(ctx.db.patreonDiamondAnnouncement.userId.find(userId));
  const thankedRank = diamondThanked ? AVATAR_FRAME_RANK.diamond : previous?.goldAnnounced ? AVATAR_FRAME_RANK.gold
    : previous?.silverAnnounced ? AVATAR_FRAME_RANK.silver : AVATAR_FRAME_RANK.none;
  if (AVATAR_FRAME_RANK[tier] <= thankedRank) return;
  const profile = ctx.db.playerProfile.identity.find(identity);
  if (!profile) return;
  const tierName = tier[0].toUpperCase() + tier.slice(1);
  const inserted = ctx.db.chatMessage.insert({
    id: 0n, sender: identity, senderName: profile.displayName,
    senderIsGuest: ctx.db.playerAccountStatus.identity.find(identity)?.isGuest ?? false,
    message: `Became a ${tierName} supporter on Patreon. Thank you for supporting WildStat! ♥`,
    sentAt: ctx.timestamp, replayId: 0n, powerLevel: 0, senderGender: profile.gender ?? 0,
    moderated: false, replyToMessageId: 0n, replyToSenderName: "", replyToMessage: "", guildReplayKey: "",
  });
  updatePublicChatCursor(ctx, inserted.id);
  const announcedAtMs = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  // Thanking a tier thanks every tier below it, so a later downgrade stays quiet.
  const receipt = { userId, identity, silverAnnounced: true, goldAnnounced: AVATAR_FRAME_RANK[tier] >= AVATAR_FRAME_RANK.gold,
    messageId: inserted.id, announcedAtMs };
  if (previous) ctx.db.patreonAnnouncement.userId.update(receipt);
  else ctx.db.patreonAnnouncement.insert(receipt);
  if (tier === "diamond") ctx.db.patreonDiamondAnnouncement.insert({ userId, announcedAtMs });
}
