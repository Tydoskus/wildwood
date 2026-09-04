# Map databases hosted entirely in SpacetimeDB

The existing account database remains authoritative for characters, inventory,
research, world unlocks, chat, and duels. Each map instance is a separate child
SpacetimeDB database. Its restricted module accepts movement and boss combat;
account mutation reducers are absent. This separates realtime database execution
across shards while preserving one durable account and global duel service.

The account database reserves at most **10 players** per instance, fills the
fullest available instance first, and starts provisioning another at **9**.
Scheduled procedures publish child databases and synchronize account snapshots.
No Node server, worker host, or always-running local command is required.

Occupied instances synchronize once per second. Account snapshots are sent only
when changed; movement remains regional. Empty instances keep their provisioned
database but stop coordinator heartbeats once admissions and rewards are drained.
A new reservation wakes them. Program source is kept outside the heartbeat's
small configuration row so it is not decoded on every synchronization.

## Build and configure

1. Run `npm run sharding:build` and `npm run spacetime:generate`.
2. Publish the account module and the matching browser client (protocol 88).
3. Supply the owner's credential through `WILDSTAT_SHARD_OPERATOR_TOKEN` and set
   `WILDSTAT_ROOT_DATABASE` to the intended account database.
4. Run `npm run sharding:configure` to upload the map program in bounded chunks
   and update existing map programs without clearing data. Add `-- --enable`
   only when ready to enable the account database's sharding switch.

The configuration command exits after deployment. SpacetimeDB subsequently runs
all coordination. Credentials and program parts are private server tables, never
browser subscriptions. Credential rotation uses the same configuration command.
Do not put the credential in source files, command arguments, or client settings.
The server accepts the project's existing database owner as its operator.

Updates preserve child database identities and data. Root and region schemas must
remain compatible during a deployment; the configuration command rejects failed
publishes instead of resetting databases. New regions receive the current uploaded
program. Existing regions receive it during the one-shot configuration run.

## Handoffs and recovery

The browser retains its account connection and opens its assigned map connection
with the same player identity. Admission binds the player, controlling tab, and
reservation generation. Old generations and late synchronization batches cannot
revive revoked access. A new map waits for the old map to confirm revocation;
if the old database is unavailable, the handoff waits beyond its authority lease.
The regional lease expires after 45 seconds without account coordination.

Boss rewards first enter the regional durable outbox. The root applies each
shard/boss/encounter/player reward once, then acknowledges it. A retry after an
interrupted acknowledgment cannot pay twice. Outbox entries survive disconnects.
Checkpoint positions are accepted only for the matching active reservation.

To return to single-database operation, call the owner-only `configure_sharding`
reducer with role `root`, enabled `false`, empty map ID, and shard ID `0`.
Root movement resumes; scheduled work revokes regional admissions, drains rewards,
and stops. Re-enabling recreates schedules for existing map databases.

## Verification

`npm run sharding:smoke` exercises 11 accounts, regional movement, actual boss HP
isolation, rejected account saves, and reconnection. It allows loopback servers
or explicitly named `wildstat-shard-validation-<digits>` databases on Maincloud;
it refuses the live game database. Unit tests cover capacity, warmup, admission
fences, expired batches, reward outboxes/retries, and browser routing.

SpacetimeDB 2.9 blocks procedure HTTP calls to private/loopback addresses, so the
complete internal provisioning smoke test needs isolated Maincloud test databases.
Local reducer tests remain available without any cloud connection. Production
sharding is opt-in and is not enabled just by publishing the modules.

References: [SpacetimeDB scaling](https://spacetimedb.com/blog/how-does-spacetime-scale),
[procedures](https://spacetimedb.com/docs/functions/procedures/),
[database HTTP API](https://spacetimedb.com/docs/http/database/).
