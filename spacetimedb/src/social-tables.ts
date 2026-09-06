import { table, t } from "spacetimedb/server";
const socialFriend = table({ name: "social_friend", public: false }, {
  key: t.string().primaryKey(), owner: t.identity().index("btree"), peer: t.identity().index("btree"),
});
const socialRequest = table({ name: "social_request", public: false }, {
  id: t.u64().primaryKey().autoInc(), sender: t.identity().index("btree"), recipient: t.identity().index("btree"),
});
const socialGuildInvite = table({ name: "social_guild_invite", public: false }, {
  id: t.u64().primaryKey().autoInc(), guildId: t.u64().index("btree"), sender: t.identity().index("btree"), recipient: t.identity().index("btree"),
});
const socialMessage = table({ name: "social_message", public: false }, {
  id: t.u64().primaryKey().autoInc(), channel: t.string(), conversation: t.string().index("btree"), guildId: t.u64(),
  sender: t.identity().index("btree"), recipient: t.identity().index("btree"), recipientName: t.string(),
  senderName: t.string(), senderGender: t.u8(), powerLevel: t.f64(), senderIsGuest: t.bool(),
  message: t.string(), moderated: t.bool(), sentAt: t.timestamp(),
  replySender: t.identity().index("btree"), replyToMessageId: t.u64(), replyToSenderName: t.string(), replyToMessage: t.string(),
});
const socialReport = table({ name: "social_report", public: false }, {
  key: t.string().primaryKey(), reporter: t.identity().index("btree"), accused: t.identity().index("btree"),
  messageId: t.u64(), message: t.string(), reason: t.string(), reportedAt: t.timestamp(),
});
export const socialTables = { socialFriend, socialRequest, socialGuildInvite, socialMessage, socialReport };
