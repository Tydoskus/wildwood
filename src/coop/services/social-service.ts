import type { Identity } from "spacetimedb";
import type { SocialAction, SocialSnapshot } from "../../../shared/social";
import type { ChatReportReason } from "../../../shared/chat-report";
import { normalizePlayerGender } from "../../../shared/player-gender";
import type { ChatMessage } from "../contracts";
import type { ReducerPort } from "../ports";

type Dependencies = {
  reducers: ReducerPort; localIdentity: () => string; notify: () => void;
  drainPendingProgress: () => Promise<boolean>;
  rememberSender?: (sender: { identity: string; identityValue: Identity; name: string; isGuest: boolean }) => void;
};
type MessageRow = {
  id: bigint; channel: string; guildId: bigint; sender: Identity; recipient: Identity;
  senderName: string; recipientName: string; senderGender: number; powerLevel: number; senderIsGuest?: boolean;
  message: string; moderated: boolean; sentAt: { microsSinceUnixEpoch: bigint };
  replyToMessageId: bigint; replyToSenderName: string; replyToMessage: string;
};
type SocialMessage = ChatMessage & { channel: string; guildId: string; recipient: string; recipientName: string };
const emptySnapshot = (): SocialSnapshot => ({ identity: "", signedIn: false, friends: [], incomingRequests: [],
  outgoingRequests: [], guildInvitations: [], outgoingGuildInvitations: [], currentGuild: null });

/** These caches contain only rows authorized by the server's per-viewer views. */
export function createSocialService(deps: Dependencies) {
  let snapshot = emptySnapshot();
  const messages = new Map<bigint, SocialMessage>();
  let generation = 0, revision = 0, hubRevision = 0;
  let pending: symbol | null = null;
  function changed() { revision++; deps.notify(); }
  function request() {
    const connection = deps.reducers.connection();
    if (deps.reducers.protocolBlocked()) throw new Error("Update the game to continue.");
    if (!connection?.isActive || !deps.localIdentity()) throw new Error("Connect to your character to continue.");
    const started = generation, identity = deps.localIdentity();
    return { connection, check() {
      if (started !== generation || connection !== deps.reducers.connection() || identity !== deps.localIdentity()) {
        throw new Error("This session changed. Reopen the panel to refresh.");
      }
    } };
  }
  async function mutate(action: (connection: NonNullable<ReturnType<ReducerPort["connection"]>>) => Promise<unknown>, drain = false) {
    const current = request();
    if (drain && !await deps.drainPendingProgress()) throw new Error("Your progress is still syncing. Try again shortly.");
    current.check();
    try { await deps.reducers.runWorldReducer(() => action(current.connection)); current.check(); }
    catch (error) { throw new Error(deps.reducers.errorMessage(error)); }
  }
  function sorted() { return [...messages.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  function peerMatches(row: SocialMessage, target: string) {
    const mine = row.sender === deps.localIdentity();
    const peer = mine ? row.recipient : row.sender, name = mine ? row.recipientName : row.senderName;
    const friend = snapshot.friends.find(friend => friend.identity === target || friend.name.toLowerCase() === target.toLowerCase());
    if (friend) return peer === friend.identity;
    if (/^(?:0x)?[a-f0-9]{64}$/i.test(target)) return peer === target.replace(/^0x/, "");
    return name.toLowerCase() === target.toLowerCase();
  }
  async function send(channel: string, target: string, message: string, replyToMessageId = 0n) {
    try { await mutate(connection => connection.reducers.sendSocialMessage({ channel, target, message, replyToMessageId })); return { ok: true }; }
    catch (error) { return { ok: false, error: deps.reducers.errorMessage(error) }; }
  }
  const api = {
    revision: () => revision,
    friends: () => snapshot.friends,
    currentGuild: () => snapshot.currentGuild,
    snapshot: () => snapshot,
    guildMessages: () => sorted().filter(row => row.channel === "guild" && row.guildId === snapshot.currentGuild?.id),
    privateMessages: (target: string) => sorted().filter(row => row.channel === "dm" && peerMatches(row, target)),
    privateConversations: () => {
      const peers = new Map<string, { identity: string; name: string }>();
      for (const row of sorted().reverse()) if (row.channel === "dm") {
        const mine = row.sender === deps.localIdentity();
        const identity = mine ? row.recipient : row.sender;
        if (!peers.has(identity)) peers.set(identity, { identity, name: snapshot.friends.find(friend => friend.identity === identity)?.name ?? (mine ? row.recipientName : row.senderName) });
      }
      return [...peers.values()];
    },
    async loadSocial(): Promise<SocialSnapshot> {
      const current = request(), started = hubRevision;
      const result = await current.connection.procedures.getSocialHub({});
      current.check();
      if (hubRevision === started) { snapshot = JSON.parse(result) as SocialSnapshot; changed(); }
      return snapshot;
    },
    async socialAction(action: SocialAction) {
      if (pending) throw new Error("An action is already being saved.");
      const token = Symbol("social-action"); pending = token;
      try {
        await mutate(async connection => {
          switch (action.action) {
            case "requestFriend": return connection.reducers.friendAction({ action: "request", target: action.username });
            case "acceptFriend": case "declineFriend": case "cancelFriend":
              return connection.reducers.friendAction({ action: action.action.replace("Friend", ""), target: action.requestId });
            case "removeFriend": return connection.reducers.friendAction({ action: "remove", target: action.identity });
            case "inviteGuild": return connection.reducers.guildInviteAction({ action: "invite", target: action.username, invitationId: 0n });
            default: return connection.reducers.guildInviteAction({ action: action.action.replace("GuildInvite", ""), target: "", invitationId: BigInt(action.invitationId) });
          }
        }, action.action === "acceptGuildInvite");
        await api.loadSocial();
      } finally { if (pending === token) pending = null; }
    },
    sendGuildMessage: (message: string, replyToMessageId = 0n) => send("guild", "", message, replyToMessageId),
    sendPrivateMessage: (target: string, message: string, replyToMessageId = 0n) => send("dm", target, message, replyToMessageId),
    async reportMessage(messageId: bigint, reason: ChatReportReason) {
      try { await mutate(connection => connection.reducers.reportSocialMessage({ messageId, reason })); return { ok: true }; }
      catch (error) { return { ok: false, error: deps.reducers.errorMessage(error) }; }
    },
  };
  return { api, tables: {
    upsertHub(row: { identity: Identity; snapshot: string }) {
      if (row.identity.toHexString() !== deps.localIdentity()) return;
      snapshot = JSON.parse(row.snapshot) as SocialSnapshot; hubRevision++; changed();
    },
    removeHub() { snapshot = emptySnapshot(); messages.clear(); hubRevision++; changed(); },
    upsertMessage(row: MessageRow) {
      deps.rememberSender?.({ identity: row.sender.toHexString(), identityValue: row.sender, name: row.senderName, isGuest: row.senderIsGuest ?? true });
      messages.set(row.id, { ...row, sender: row.sender.toHexString(), recipient: row.recipient.toHexString(),
        guildId: String(row.guildId), replayId: 0n, senderGender: normalizePlayerGender(row.senderGender),
        sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1_000n) }); changed();
    },
    removeMessage(row: { id: bigint }) { if (messages.delete(row.id)) changed(); },
  }, resetSession() { generation++; pending = null; snapshot = emptySnapshot(); messages.clear(); hubRevision++; changed(); } };
}
export type SocialApi = ReturnType<typeof createSocialService>["api"];
