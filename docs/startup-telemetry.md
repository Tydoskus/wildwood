# Startup telemetry

WildStat records coarse startup timings and fixed error categories so connection,
authentication, asset, and hydration regressions can be diagnosed after a user
leaves the page. Telemetry is best-effort and must never delay gameplay.

## Privacy and storage boundaries

- Event rows are private and contain no player identity, connection ID, token,
  character name, user agent, map, URL, query string, or free-form error text.
- `startup_telemetry_rate_limit` temporarily stores a sender identity solely to
  enforce 24 accepted samples per 15 minutes. Maintenance deletes expired rows.
- A browser tab retains at most 24 allowlisted samples in `sessionStorage`, which
  survives the OAuth round trip and a reload without correlating different tabs.
- Each reducer call processes at most 8 samples. The private event table retains
  at most 5,000 rows and at most 7 days of history.
- Values are operational signals, not trusted analytics. The server validates
  every string against the shared allowlists and derives protocol version from
  the active server session.

## Client integration

Create one collector in the multiplayer composition root:

```ts
const startupTelemetry = createStartupTelemetry({ clientVersion: GAME_VERSION });
let connectionTelemetry: ConnectionTelemetryAttempt | null = null;
```

Mirror connection lifecycle calls without passing exception objects or messages:

```ts
const nextAttempt = connectionLifecycle.snapshot().attempt + 1;
connectionTelemetry = startupTelemetry.beginConnectionAttempt(nextAttempt);
connectionLifecycle.beginAttempt(CONNECTION_OPEN_TIMEOUT_MS);

connectionTelemetry?.advance("preparing-session");
connectionLifecycle.transition("preparing-session", SESSION_PREPARE_TIMEOUT_MS);

connectionTelemetry?.advance("hydrating");
connectionLifecycle.transition("hydrating", SUBSCRIPTION_HYDRATION_TIMEOUT_MS);

connectionTelemetry?.fail(issueCode); // before the lifecycle failure/disconnect
connectionTelemetry?.ready();         // immediately before/after ready()
```

Use `beginStage` for non-connection work such as account restore, authentication,
the deferred game bundle, and current-map assets. Finish it with an allowlisted
outcome and issue code; never derive the code from an exception message.
For a new character, `gameplay-ready` ends when the interactive name screen is
available so player decision time is not misreported as startup latency.

Once a connection is stable, drain the queue through the generated reducer:

```ts
void startupTelemetry.flush((samples) =>
  connection.reducers.recordStartupTelemetry({ samples })
);
```

Failed sends stay queued for the next stable connection. Concurrent flush calls
coalesce, and successful sends drain the queue in batches of eight.

## Reading production diagnostics

The table has no public subscription or client view. The database owner can query
aggregates with the SpacetimeDB CLI, for example:

```sql
SELECT stage, outcome, issue_code, client_version, protocol_version,
       connectivity, COUNT(*) AS samples, AVG(duration_ms) AS average_ms
FROM startup_telemetry_event
GROUP BY stage, outcome, issue_code, client_version, protocol_version, connectivity;
```

For recent individual samples, query the fixed fields only:

```sql
SELECT id, recorded_at, stage, outcome, issue_code, duration_ms, attempt,
       client_version, protocol_version, connectivity
FROM startup_telemetry_event
ORDER BY id DESC
LIMIT 100;
```

## Schema rollout

Regenerate TypeScript bindings after changing the module so
`recordStartupTelemetry` remains available to the browser client. During a live
rollout, publish the compatible SpacetimeDB module before deploying the browser
bundle. Keep event tables private; generated browser bindings need only the
reducer.
