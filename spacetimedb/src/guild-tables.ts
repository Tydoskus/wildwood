import { table, t } from "spacetimedb/server";

const guild = table({ name: "guild", public: false }, {
  id: t.u64().primaryKey().autoInc(), directoryId: t.u64().index("btree"), nameKey: t.string().unique(), name: t.string(), leader: t.identity(),
  members: t.u32(), champions: t.u32(), week: t.u32(), score: t.u32(), wins: t.u32(), battles: t.u32(),
  attackDay: t.u32(), attacks: t.u32(), opponents: t.string(),
});
const guildMember = table({ name: "guild_member", public: false }, {
  identity: t.identity().primaryKey(), guildId: t.u64().index("btree"), name: t.string(),
  joinedAt: t.u64(), eligibleAt: t.u64(), champion: t.bool(), fighter: t.string(), power: t.f64(),
});
const guildAccount = table({ name: "guild_account", public: false }, {
  identity: t.identity().primaryKey(), joinAfter: t.u64(), lastAttackDay: t.u32(), attackGuild: t.u64(),
});
const guildRank = table({ name: "guild_rank", public: false }, {
  guildId: t.u64().primaryKey(), rankKey: t.string().index("btree"), payload: t.string(),
});
const guildStanding = table({ name: "guild_standing", public: false }, {
  id: t.u8().primaryKey(), week: t.u32(), entries: t.string(),
});
// Bounded ring: ten recent battle reports per guild, indexed for a single guild's panel.
const guildBattleReport = table({ name: "guild_battle_report", public: false }, {
  key: t.string().primaryKey(), guildId: t.u64().index("btree"), sequence: t.u64(), payload: t.string(),
});
// Six identity references per stored team report make account erasure indexed.
const guildReportParticipant = table({ name: "guild_report_participant", public: false }, {
  key: t.string().primaryKey(), identity: t.identity().index("btree"),
  reportKey: t.string().index("btree"), side: t.string(), round: t.u8(),
});
const guildBattleCounter = table({ name: "guild_battle_counter", public: false }, { id: t.u8().primaryKey(), next: t.u64() });
export const guildTables = { guild, guildMember, guildAccount, guildRank, guildStanding, guildBattleReport, guildReportParticipant, guildBattleCounter };
