/** Social records are private to their participants; IDs are decimal/hex strings on UI boundaries. */
export type SocialSnapshot = {
  identity: string; signedIn: boolean;
  friends: { identity: string; name: string; online?: boolean }[];
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
