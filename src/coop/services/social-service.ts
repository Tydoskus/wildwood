import type { Identity } from "spacetimedb";
import type { SocialAction, SocialSnapshot, SocialConversation } from "../../../shared/social";
import type { ChatReportReason } from "../../../shared/chat-report";
import { normalizePlayerGender } from "../../../shared/player-gender";
import type { ChatMessage } from "../contracts";
import type { ReducerPort } from "../ports";
import { withRequestDeadline } from "./request-deadline";
import { parsePlayerDirectory, type PlayerDirectoryEntry } from "../../../shared/player-search";

type Dependencies = {
  reducers: ReducerPort; localIdentity: () => string; notify: () => void;
  drainPendingProgress: () => Promise<boolean>;
  rememberSender?: (sender: { identity: string; identityValue: Identity; name: string; isGuest: boolean }) => void;
};
type MessageRow = {
  reactionCountsJson?: string;
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
  let orderedMessages: SocialMessage[] | null = null;
  let generation = 0, revision = 0, hubRevision = 0, snapshotRevision = 0;
  let pending: symbol | null = null;
  // Private messages that carry a duel result, to the replay they link (social_duel_message).
  const duelReplays = new Map<bigint, bigint>();
  // Player search loads every active name once and filters locally; the server rebuilds it every ten minutes.
  const DIRECTORY_CACHE_MS = 10 * 60_000;
  let directory: { loadedAt: number; players: PlayerDirectoryEntry[] } | null = null;
  let directoryRequest: Promise<PlayerDirectoryEntry[]> | null = null;
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
  function sorted() { return orderedMessages ??= [...messages.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  let indexRevision = -1, indexIdentity = "";
  let guildRows: SocialMessage[] = [], conversations: SocialConversation[] = [];
  const byIdentity = new Map<string, SocialMessage[]>(), byName = new Map<string, SocialMessage[]>();
  const friendIds = new Map<string, string>();
  const noMessages: SocialMessage[] = [];
  function indexed() {
    const local = deps.localIdentity();
    if (indexRevision === revision && indexIdentity === local) return;
    indexRevision = revision; indexIdentity = local;
    byIdentity.clear(); byName.clear(); friendIds.clear(); guildRows = [];
    const friends = new Map(snapshot.friends.map(friend => [friend.identity, friend]));
    for (const friend of snapshot.friends) {
      friendIds.set(friend.identity, friend.identity);
      friendIds.set(friend.name.toLowerCase(), friend.identity);
    }
    const ordered = sorted(), peers = new Map<string, SocialConversation>();
    for (const row of ordered) {
      if (row.channel === "guild" && row.guildId === snapshot.currentGuild?.id) guildRows.push(row);
      if (row.channel !== "dm") continue;
      const mine = row.sender === local, identity = mine ? row.recipient : row.sender;
      const name = (mine ? row.recipientName : row.senderName).toLowerCase();
      if (!byIdentity.has(identity)) byIdentity.set(identity, []);
      if (!byName.has(name)) byName.set(name, []);
      byIdentity.get(identity)!.push(row); byName.get(name)!.push(row);
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const row = ordered[i];
      if (row.channel !== "dm") continue;
      const mine = row.sender === local, identity = mine ? row.recipient : row.sender;
      if (!peers.has(identity)) peers.set(identity, { identity,
        name: friends.get(identity)?.name ?? (mine ? row.recipientName : row.senderName),
        lastMessage: row.message, lastSentAtMs: row.sentAtMs, lastMessageMine: mine });
    }
    for (const person of snapshot.conversations ?? []) {
      const live = peers.get(person.identity);
      peers.set(person.identity, !live || (person.lastSentAtMs ?? 0) >= (live.lastSentAtMs ?? 0) ? person : { ...person, ...live });
    }
    conversations = [...peers.values()];
  }
  async function send(channel: string, target: string, message: string, replyToMessageId = 0n) {
    try { await mutate(connection => connection.reducers.sendSocialMessage({ channel, target, message, replyToMessageId })); return { ok: true }; }
    catch (error) { return { ok: false, error: deps.reducers.errorMessage(error) }; }
  }
  function presentation(row: MessageRow): SocialMessage {
    deps.rememberSender?.({ identity: row.sender.toHexString(), identityValue: row.sender, name: row.senderName, isGuest: row.senderIsGuest ?? true });
    return { ...row, sender: row.sender.toHexString(), recipient: row.recipient.toHexString(),
      guildId: String(row.guildId), replayId: duelReplays.get(row.id) ?? 0n, senderGender: normalizePlayerGender(row.senderGender),
      sentAtMs: Number(row.sentAt.microsSinceUnixEpoch / 1_000n) };
  }
  const api = {
    async loadChatHistory(channel: "guild" | "dm", peer: string, beforeId: bigint) {
      const current = request();
      const hub = hubRevision;
      // Procedure rejections can be strings, unlike reducer failures. Keep the
      // server's explanation so chat does not replace it with a generic error.
      const page = await withRequestDeadline(current.connection.procedures.getSocialChatHistoryWithReactions({ channel, peer, beforeId }))
        .catch(error => { throw new Error(deps.reducers.errorMessage(error)); });
      current.check();
      if (hub !== hubRevision) throw new Error("Conversation changed. Reopen chat.");
      return { messages: page.messages.map(presentation), hasMore: page.hasMore, beforeId: page.messages[0]?.id ?? beforeId };
    },
    historyRevision: () => hubRevision,
    revision: () => revision,
    friends: () => snapshot.friends,
    currentGuild: () => snapshot.currentGuild,
    snapshot: () => snapshot,
    guildMessages: () => { indexed(); return guildRows; },
    privateMessages: (target: string) => {
      indexed();
      const friend = friendIds.get(target) ?? friendIds.get(target.toLowerCase());
      if (friend) return byIdentity.get(friend) ?? noMessages;
      if (/^(?:0x)?[a-f0-9]{64}$/i.test(target)) return byIdentity.get(target.replace(/^0x/, "")) ?? noMessages;
      return byName.get(target.toLowerCase()) ?? noMessages;
    },
    privateConversations: () => { indexed(); return conversations; },
    async loadSocial(): Promise<SocialSnapshot> {
      const current = request(), started = snapshotRevision;
      const result = await withRequestDeadline(current.connection.procedures.getSocialHub({}))
        .catch(error => { throw new Error(deps.reducers.errorMessage(error)); });
      current.check();
      if (snapshotRevision === started) { snapshot = JSON.parse(result) as SocialSnapshot; changed(); }
      return snapshot;
    },
    /** Every recently active player's name, for search. One request per ten minutes, however much is typed. */
    loadPlayerDirectory(): Promise<PlayerDirectoryEntry[]> {
      if (directory && Date.now() - directory.loadedAt < DIRECTORY_CACHE_MS) return Promise.resolve(directory.players);
      directoryRequest ??= (async () => {
        const current = request();
        const result = await withRequestDeadline(current.connection.procedures.getPlayerDirectory({}))
          .catch(error => { throw new Error(deps.reducers.errorMessage(error)); });
        directory = { loadedAt: Date.now(), players: parsePlayerDirectory(result) };
        return directory.players;
      })().finally(() => { directoryRequest = null; });
      return directoryRequest;
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
      const next = JSON.parse(row.snapshot) as SocialSnapshot;
      const access = (value: SocialSnapshot) => JSON.stringify([value.identity, value.currentGuild?.id,
        value.friends.map(person => person.identity).sort(), (value.conversations ?? []).map(person => person.identity).sort()]);
      if (access(next) !== access(snapshot)) hubRevision++;
      snapshot = next; snapshotRevision++; changed();
    },
    removeHub() { snapshot = emptySnapshot(); messages.clear(); orderedMessages = null; hubRevision++; changed(); },
    upsertMessage(row: MessageRow) {
      orderedMessages = null;
      messages.set(row.id, presentation(row)); changed();
    },
    removeMessage(row: { id: bigint }) { if (messages.delete(row.id)) { orderedMessages = null; changed(); } },
    /** A duel result's replay, from social_duel_message; the message may already be on screen. */
    upsertDuelLink(row: { messageId: bigint; replayId: bigint }) {
      duelReplays.set(row.messageId, row.replayId);
      const message = messages.get(row.messageId);
      if (message && message.replayId !== row.replayId) { messages.set(row.messageId, { ...message, replayId: row.replayId }); orderedMessages = null; changed(); }
    },
    removeDuelLink(row: { messageId: bigint }) { duelReplays.delete(row.messageId); },
  }, resetSession() { generation++; pending = null; snapshot = emptySnapshot(); messages.clear(); orderedMessages = null; hubRevision++; changed(); } };
}
export type SocialApi = ReturnType<typeof createSocialService>["api"];
