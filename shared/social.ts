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
  guildInvitations: { id: string; guildId: string; guildName: string; inviterName: string }[];
  outgoingGuildInvitations: { id: string; identity: string; name: string; guildId: string }[];
  currentGuild: { id: string; name: string } | null;
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
 * Private messages were kept forever, so the per-recipient view grew with the
 * age of the account rather than with what anyone still reads. A year is long
 * enough that no conversation a player returns to is lost.
 */
export const SOCIAL_MESSAGE_RETENTION_DAYS = 365;
