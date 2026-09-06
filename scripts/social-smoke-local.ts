/** Real server authorization check using three isolated local player identities. */
import assert from "node:assert/strict";
import { DbConnection, tables } from "../src/module_bindings";
import { PROTOCOL_VERSION } from "../shared/rules";
import { TERMS_VERSION, AGE_BAND_ADULT } from "../shared/legal";
const database = "wildstat-social-test";
const connections: DbConnection[] = [];
const run = Date.now().toString(36).slice(-5);
async function waitFor(read: () => boolean) {
  const end = Date.now() + 10_000;
  while (!read()) { if (Date.now() > end) throw new Error("Social subscription timed out"); await new Promise(resolve => setTimeout(resolve, 25)); }
}
async function player(label: string) {
  const result = await new Promise<{ conn: DbConnection; token: string }>((resolve, reject) => {
    DbConnection.builder().withUri("ws://127.0.0.1:3000").withDatabaseName(database)
      .onConnect((conn, _id, token) => resolve({ conn, token })).onConnectError((_ctx, error) => reject(error)).build();
  });
  const { conn } = result; connections.push(conn);
  await conn.reducers.registerProtocol({ protocolVersion: PROTOCOL_VERSION });
  await conn.reducers.acceptTerms({ termsVersion: TERMS_VERSION, ageBand: AGE_BAND_ADULT });
  await conn.reducers.enterWorld({ tabId: `social-${run}-${label}` });
  const name = `${label}${run}`;
  await conn.reducers.setDisplayName({ displayName: name });
  await new Promise<void>((resolve, reject) => conn.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event))
    .subscribe([tables.mySocialHub, tables.mySocialMessages, tables.chatMessage]));
  const hub = () => JSON.parse([...conn.db.mySocialHub.iter()][0].snapshot);
  return { ...result, name, hub, messages: () => [...conn.db.mySocialMessages.iter()] };
}
try {
  const a = await player("Alice"), b = await player("Bob"), c = await player("Cara");
  await a.conn.reducers.friendAction({ action: "request", target: b.name });
  await waitFor(() => b.hub().incomingRequests.length === 1);
  const requestId = b.hub().incomingRequests[0].id;
  await assert.rejects(c.conn.reducers.friendAction({ action: "accept", target: requestId }));
  await b.conn.reducers.friendAction({ action: "accept", target: requestId });
  await waitFor(() => a.hub().friends.length === 1 && b.hub().friends.length === 1);
  const guildName = Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + ((Date.now() >> (i * 4)) & 15))).join("");
  await a.conn.reducers.createGuild({ name: guildName });
  await a.conn.reducers.guildInviteAction({ action: "invite", target: b.name, invitationId: 0n });
  await waitFor(() => b.hub().guildInvitations.length === 1);
  const invitationId = BigInt(b.hub().guildInvitations[0].id);
  await assert.rejects(c.conn.reducers.guildInviteAction({ action: "accept", target: "", invitationId }));
  await b.conn.reducers.guildInviteAction({ action: "accept", target: "", invitationId });
  await waitFor(() => b.hub().currentGuild?.id === a.hub().currentGuild?.id);
  await a.conn.reducers.sendSocialMessage({ channel: "dm", target: b.name, message: "private secret", replyToMessageId: 0n });
  await waitFor(() => b.messages().some(row => row.message === "private secret"));
  const dm = b.messages().find(row => row.channel === "dm")!;
  await assert.rejects(c.conn.reducers.reportSocialMessage({ messageId: dm.id, reason: "harassment" }));
  await assert.rejects(b.conn.reducers.sendSocialMessage({ channel: "guild", target: "", message: "cross-channel quote", replyToMessageId: dm.id }));
  await b.conn.reducers.sendSocialMessage({ channel: "guild", target: "", message: "guild secret", replyToMessageId: 0n });
  await waitFor(() => a.messages().some(row => row.message === "guild secret"));
  assert.equal(c.messages().length, 0);
  assert.equal([...c.conn.db.chatMessage.iter()].some(row => row.message.includes("secret")), false);
  const sql = await fetch(`http://127.0.0.1:3000/v1/database/${database}/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${c.token}` }, body: "SELECT * FROM social_message",
  });
  assert.equal(sql.ok, false, "Private backing table must reject unrelated SQL access");
  await b.conn.reducers.leaveGuild({});
  await waitFor(() => !b.hub().currentGuild && b.messages().every(row => row.channel !== "guild"));
  await b.conn.reducers.setPlayerBlocked({ target: a.conn.identity!, blocked: true });
  await waitFor(() => b.messages().length === 0 && a.messages().every(row => row.channel !== "dm"));
  await assert.rejects(a.conn.reducers.sendSocialMessage({ channel: "dm", target: b.name, message: "blocked", replyToMessageId: 0n }));
  console.log("PASS: persistent friends, invitation ownership, DM/guild isolation, private SQL denial, cross-channel reply rejection, leave/block revocation.");
} finally { for (const conn of connections) conn.disconnect(); }
