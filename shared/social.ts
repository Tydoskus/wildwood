export type SocialConversation = {
  identity: string; name: string; profileIcon?: number;
  lastMessage?: string; lastSentAtMs?: number; lastMessageMine?: boolean;
};
/** Social records are private to their participants; IDs are decimal/hex strings on UI boundaries. */
export type SocialSnapshot = {
  identity: string; signedIn: boolean;
  conversations?: SocialConversation[];
  friends: (SocialConversation & { online?: boolean })[];
  incomingRequests: { id: string; identity: string; name: string }[];
  outgoingRequests: { id: string; identity: string; name: string }[];
  guildInvitations: { id: string; guildId: string; guildName: string; inviterName: string; inviterIdentity?: string }[];
  outgoingGuildInvitations: { id: string; identity: string; name: string; guildId: string }[];
  currentGuild: { id: string; name: string } | null;
  /** This player is a President or Vice President and may invite others. */
  canInviteToGuild?: boolean;
};
export type SocialAction =
  | { action: "requestFriend"; username: string }
  | { action: "acceptFriend" | "declineFriend" | "cancelFriend"; requestId: string }
  | { action: "removeFriend"; identity: string }
  | { action: "inviteGuild"; username: string }
  | { action: "acceptGuildInvite" | "declineGuildInvite" | "revokeGuildInvite"; invitationId: string };
export const SOCIAL_FRIEND_LIMIT = 100;
export const SOCIAL_REQUEST_LIMIT = 50;
export const SOCIAL_MESSAGE_LIMIT = 100;
/**
 * Guild chat stays visible for a full week when a guild has fewer than
 * SOCIAL_MESSAGE_LIMIT messages; busier guilds roll off older messages by count.
 */
export const GUILD_CHAT_RETENTION_DAYS = 7;
/**
 * Private messages expire, so the per-recipient view grows with what players
 * still read, not with account age. A year is long enough that no conversation
 * a player returns to is lost.
 */
export const SOCIAL_MESSAGE_RETENTION_DAYS = 365;
