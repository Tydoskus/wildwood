# Scheduled releases

Use prepared releases for planned updates. This separates builds and testing from
player interruption. No live update is scheduled by building this feature.

## One-time activation

First publish the new release-control server tables/reducers with data
preserved, then ship this client and the two GitHub workflows. Keep protocol 104:
this feature does not justify a protocol bump. Existing 0.695 clients cannot show
the new countdown or acknowledge it. Let players adopt the supporting client
before the first scheduled rollout. If older online clients remain, the rollout
will postpone rather than assume they saved.

## Prepare while players keep playing

1. Set the version/release notes as usual. Prepare a committed release branch
   (`codex/release-<version>`) and push that branch, not main. Main still has the
   existing immediate deployment workflow for explicitly urgent releases.
2. Package requested mobile builds before the announcement. Upload/distribute
   them before any separate change that would require those native versions.
   Optional `--android <versioned.aab>` and `--ios <versioned.ipa>` attach verified
   copies to the release plan; these flags do not upload or approve store releases.
3. Run `npm run release:prepare -- --base <last-released-commit>`.
   This checks/tests the candidate, builds changed server modules, prepares the
   exact commit in GitHub Actions, and records a plan under `local-data/releases/`.
   Preparation never announces an update or changes a live database.

The prepared web artifact is tested once, retained for seven days, and deployed
without repeating installation, tests, or compilation. Server artifacts are
copied and SHA-256 checked before use. The last released commit is required so
client-only edits leave the server alone. Any change under `shared/` or
`spacetimedb/` republishes the one database.

## Announce and roll out

Set `WILDSTAT_ROOT_DATABASE` and `WILDSTAT_SHARD_OPERATOR_TOKEN` in the environment
(the database owner's credential; the variable name predates the single-database
model and is kept so existing shells keep working). Do not put tokens in
arguments, source, or the plan file.

```
npm run release:rollout -- --plan local-data/releases/<id>/plan.json
```

The default announcement is five minutes ahead. To choose a time, add
`--at <ISO-8601-time-with-timezone>`. Migration checks happen before the announcement;
an explicit time must still be at least 30 seconds ahead after those checks.

- A small green countdown uses the ad reward timer font/shadow near top center.
  It does not block movement, fighting, or inventory during the countdown.
- At the switch, supporting clients pause local gameplay, persist and drain enemy
  reward batches, cutscene rewards, and loadout saves, then acknowledge the release.
  Online players must acknowledge within 30 seconds or the rollout postpones.
- Changed servers publish without clearing data, with client compatibility enforced.
  There is one database to publish. Failed/manual/client-breaking migrations stop the run.
- Server releases publish backend changes before a client can request new tables.
  Existing compatible clients resume as soon as server work finishes; web artifact
  distribution happens afterward and does not extend their pause. Client-only
  releases distribute the prepared artifact during the countdown.
- Individual web updates save again and record the guest/account resume marker
  before reloading. No tokens are deleted. A failed save postpones the reload.
- `timings.json` records announcement, pause start, completion, and interruption
  duration. Use measured times rather than promising a fixed downtime.

The public countdown adds one tiny table to the existing base subscription, leaving
all existing table layouts unchanged.
Only phase changes and a 15-second lease heartbeat write to the server; client
clock animation makes no reducer calls. Save acknowledgements are private, one
row per account, overwritten at its next release rather than growing per update.

## Cancel or recover

```
npm run release:cancel -- --plan local-data/releases/<id>/plan.json
```

Cancellation resumes gameplay. A failed rollout attempts cancellation. If the
operator process dies or the root cannot be reached, its lease expires after
90 seconds (scheduled notices expire 90 seconds after their target time). Clients
stop the planned pause even if no final event arrives. Normal connection recovery
continues if the service itself is still down. Cancellation never rolls back or
clears server data; a partially published compatible fleet can be retried with a
new plan/release ID.

## Protocol changes

The normal path rejects protocol changes and client-breaking migrations. Do not
re-enable protocol 103: it predates authoritative kill rewards. For a future
compatible protocol transition, ship a separately reviewed bridge that explicitly
lists the supported protocols in `COMPATIBLE_PROTOCOL_VERSIONS`, distribute the
new clients, then retire the old protocol in a later planned update. Never infer
compatibility simply from adjacent version numbers. A genuinely incompatible
migration needs its own migration plan and an available client for each affected
platform; the ordinary rollout must not force it through.

SpacetimeDB's [migration policy](https://docs.rs/spacetimedb-schema/latest/spacetimedb_schema/auto_migrate/enum.MigrationPolicy.html)
provides the `Compatible` publish guard; deployment uses the existing
[database HTTP API](https://spacetimedb.com/docs/http/database/).
