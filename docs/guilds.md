# Guilds and asynchronous battles

## Mini plan

1. Add account-owned guild membership and leader management without map-local subscriptions.
2. Save three authoritative character builds and resolve asynchronous team battles using the existing duel simulator.
3. Add daily participation limits, weekly standings, bounded reports, and an on-demand guild panel.
4. Verify authorization, membership lifecycle, battle retries, rollover, and indexed read bounds before release.

## Rules implemented

Registered accounts can create a unique named guild or join an open guild, up to twenty members. Names normalize Unicode, whitespace and case for uniqueness. Guilds are free to create. Guild management uses the root account connection so map changes do not move membership.

The leader selects three different guild members as champions. Selecting a champion captures their persisted combat stats; a champion can refresh their own saved build. No client-supplied stats or results are accepted. Saved teams fight while members are offline, in stable identity order, with three simultaneous-build duels using the existing deterministic combat rules. Two round wins beat one; otherwise the number of round wins decides the team result, with equal wins producing a draw.

Leaders can challenge another guild once per UTC day. Each guild has three outgoing attacks per UTC day. Directory entries indicate opponents already challenged today so the client can disable repeat challenges before submission; the hint resets at the UTC day boundary. Outgoing victories award three weekly points, draws one, and defeats zero. Defensive matches do not alter points or consume attacks. Ties sort by wins, fewer attacks, then guild creation ID. There are no gem or item battle payouts in this first version.

Leaving or being removed starts a 24-hour cooldown before joining or creating another guild. Initial membership is immediately playable. Leader and champion identities also retain the guild they attacked for that day, preventing reuse through membership changes. A departing leader passes ownership to the longest-serving remaining member, with identity as a stable tie-breaker. Explicit leadership transfer and removal are leader-only operations.

A character reset preserves membership and participation history but clears its champion snapshot. Account deletion removes membership, transfers leadership if necessary, deletes the account's guild metadata, and anonymizes its champion name in every retained battle-report copy, including former guilds and opponent histories. Six indexed identity references accompany each report; pruning or disbanding deletes those references with the report. Guests cannot join, so guest migration has no guild membership to merge. Empty guilds and their report records are removed.

Weekly points roll over Monday at 00:00 UTC. Rollover is calculated when reading or changing a guild; it requires no scheduled global maintenance. Historical battle reports remain available, with the ten latest reports retained separately for each guild.

## Storage and scan bounds

The guild window has three views: Guild, Battles, and Rankings. The Guild view shows a three-slot champion lineup and a compact roster; leader controls appear only for the selected member. Creation, guild options, battle rules, and report details expand on request. Registered players can join from the directory; guests can browse. A champion's build refresh appears only for that champion, and battle results are presented from the viewing guild's perspective.

The panel reuses a single snapshot when switching views. Opening, refreshing, pagination, and completed actions fetch fresh data; there is no background database polling. Closing or switching accounts discards late responses. A committed action followed by a failed refresh clears stale action controls and asks the player to refresh, avoiding accidental resubmission. Journey stages, idle supplies, forging, and Journey offers are not part of this release.

All guild tables are private. The root snapshot procedure returns only the caller's membership/roster, twenty directory entries, the cached top fifty standings and at most ten reports. Directory pagination reads twenty-one indexed records to determine whether another page exists. No subscription or periodic panel polling scans the guild tables.

The directory uses a nonunique B-tree `directoryId` mirror of the primary key because the TypeScript SDK exposes point lookup only for unique indexes. Ranking rows use an indexed string combining week, descending score, descending wins, ascending attacks and ID. There is at most one ranking row per guild, replaced when it changes; old weeks are excluded by the index range.

The leaderboard cache updates transactionally on a scored battle, membership change or guild removal. The host chains transaction-local index entries ahead of committed B-tree entries, so simply taking the first fifty after inserting a ranking row is incorrect. Each service operation changes at most one guild's ranking: it includes that row separately, reads fifty other committed candidates and sorts at most fifty-one entries. This also refills the cache accurately when a ranked guild disbands. Do not call multiple rank-changing service operations in one transaction without revisiting this constraint.

Host behavior reference: [SpacetimeDB ScanMutTx::combine](https://github.com/clockworklabs/SpacetimeDB/blob/master/crates/datastore/src/locking_tx_datastore/mut_tx.rs). Tests explicitly simulate this transaction-first ordering.

## Verification

`spacetimedb/src/guild-service.test.ts` exercises duplicate names/membership, maximum membership, leader authorization, exact cooldown boundary, leadership succession, server-owned saved stats, reset/deletion cleanup, offline results, idempotent retry rejection, daily limits, same-identity participation, weekly reset, ten-report retention, indexed directory pagination, and top-fifty refill with transaction-local index ordering. The fixture fails on global guild table iteration and counts bounded index reads. Root integration tests separately exercise authenticated reducer wrappers.

These rules establish a functional first leaderboard, not skill-based matchmaking or a purchased-power-normalized competition. Observe population size, repeated weak-opponent targeting and participation before adding ranked rewards or a rating system.
