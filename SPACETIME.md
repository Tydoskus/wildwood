# Wildwood SpacetimeDB

## Local development

On macOS, double-click `Run Wildwood Local.command` in the repository root. It starts the database and web server in separate Terminal windows, publishes the local module, regenerates client bindings, builds the browser client, and opens the game.

Or run SpacetimeDB and the built static site manually in separate terminals:

```sh
spacetime start
npm run spacetime:publish:local
npm run spacetime:generate
npm run build:client
npm run serve:dist
```

Open `http://127.0.0.1:8000/`.

Local databases do not appear in the SpacetimeDB account dashboard.

## Maincloud

Authenticate once, then publish:

```sh
spacetime login
npm run spacetime:publish:cloud
npm run build:coop
```

Deployed Wildwood pages automatically use `wss://maincloud.spacetimedb.com`; localhost pages use `ws://localhost:3000`.

Do not use `--delete-data=always` outside local development. It destroys the selected database contents.

## SpacetimeAuth

Wildwood uses SpacetimeAuth Magic Link with public client ID `client_03426HMgkAEmdC23XTZRKZ`.

Configure this exact redirect URI in the SpacetimeAuth project:

```text
https://tydoskus.github.io/wildwood/
```

The browser uses Authorization Code + PKCE. No client secret belongs in this repository. A player may play as a guest, then sign in once to migrate their existing name and progress to their authenticated account. Account migration links are private, random, and expire after 10 minutes.

Migration order is strict: acknowledge pending guest progress, create the private link, complete OAuth in the same tab, register the authenticated connection protocol, claim the guest identity, then subscribe and hydrate the game. Do not subscribe before claim.

## Connection presence

`player_session` is private and keyed by SpacetimeDB connection ID. `player_controller` assigns one live connection per identity to authoritative movement, duels, and dragon attacks. Extra tabs may subscribe without owning the player. Controller disconnect transfers ownership when another session exists; final disconnect removes public presence and resolves duel cleanup.

Movement remains client-authoritative. Keyboard input sends only start, stop, and direction changes plus a one-second moving heartbeat. Touch sends start/stop, vector changes of at least `0.12`, and the heartbeat, with material steering limited to 10 Hz. Stationary players send no movement traffic. Each packet carries current `x/y`, normalized `dx/dy`, and sequence; the server performs finite-value and world-bound checks but never simulates movement or validates speed/distance.

`update_movement_state` writes private `player_motion`, so input transactions do not update a public row for every subscriber. Two-player maps publish compact samples directly. At three or more players, an on-demand scheduler range-scans the indexed `last_input_at` field and packs only changed movers into one `player_motion_frame` event per occupied zone at no more than 10 Hz, then stops after one empty trailing tick. A private one-row-per-map population table prevents the publisher from recounting every motion row. Samples keep compact network IDs and 11-byte payload entries; signed `dx/dy` use the two bytes formerly occupied by facing. Identity, name, account kind, and appearance travel separately in cold, camera-zone-filtered `player_motion_identity` presence. Public `player` rows update only at start/stop, idle correction, zone boundaries, teleports, lifecycle events, and presentation changes. `sync_position` remains only as a temporary pre-0.424 rollout bridge.

Detailed remote state uses one subscription containing a rectangular `player` query plus matching zone-frame query. A separate 1 Hz compact `player_map_frame` supplies distant minimap dots. Maps with at most 256 visible players remain exact; larger maps collapse markers into at most 256 spatial centroids matching the minimap's useful pixel resolution. This bounds the shared payload instead of letting it grow with every player. Both schedules stop when no map has multiple active players. Base hydration loads only the local durable profile/account row; active-map presentation comes from presence, and opened profiles use temporary identity-filtered subscriptions. Remote labels show name and power only; current player HP is local-only and has no server sync lane. `player_map_marker` remains an inert compatibility table because deleting populated schema requires destructive replacement; new clients never subscribe to it.

`player.hp` and `player.max_hp` remain only as inert physical migration columns because deleting them requires a destructive database replacement. They are initialized when presence is created, never synchronized afterward, and ignored by client state/rendering. Do not reuse them.

Optional latency display measures and smooths acknowledgement time from normal reducer calls. It does not create a ping reducer, timer, heartbeat, or additional server traffic.

Developer Tools → Controls accepts 1–200 browser virtual players for smoke testing. Chromium limits same-group WebSockets to roughly 255, so the browser no longer pretends it can generate a valid 3,000-client test.

Use the multi-process Node runner for larger tests. It automatically keeps each process at or below 200 sockets and uses 15 processes for 3,000 bots. Keep the signed-in developer game open, copy its SpacetimeAuth ID token from browser storage, then enter it into a shell without placing it in command history:

```bash
read -s WILDWOOD_LOAD_TEST_TOKEN
export WILDWOOD_LOAD_TEST_TOKEN
npm run loadtest:virtual -- --count 3000 --mode movement --host wss://maincloud.spacetimedb.com --duration 60
```

`movement` measures sparse reducer ingress without subscriptions or saves. `realistic` installs normal core/nearby/minimap subscriptions, steers, and saves every 2.5 seconds. `dense` places every bot in one zone with full subscriptions and rapid steering for worst-case fanout. The authenticated token stays in the coordinator; anonymous worker processes receive only a short-lived run capability. All modes use normal reducers and real WebSockets. Stop, Ctrl-C, socket disconnect, and maintenance converge on the same cleanup path, which deletes simulated profile, save, lifetime, research, presence, motion, session, and ranking rows. After Ctrl-C, wait for the final `Stopped ... test data erased` line before closing the terminal.

Opening a websocket does not create a character or public presence. Protocol registration may hydrate the login UI, but only `enter_world` creates missing profile/progress rows and the public player row after guest/sign-in choice or successful automatic sign-in.

Player lifetime metadata records join date, accumulated play time, enemy kills, and deaths. Own progress/lifetime rows hydrate with the main subscription. Other-player progress/lifetime rows use a single temporary identity-filtered subscription while that profile window is open; closing, switching, disconnecting, or timing out settles and unsubscribes the request.

Long tab resumes use a single `resume_session` reducer probe. Healthy short resumes keep the websocket. Scheduled maintenance removes transient orphan presence without deleting durable profiles or progress.

Research completion is schedule-driven and idempotently repaired by minute maintenance. Timer reductions shorten legacy active deadlines but never lengthen them. Removed/invalid nodes are deleted cleanly; players never need a claim reducer.

`player_research.frontier_mastery` remains only as a zeroed physical migration column because deleting it would require destructive database replacement. Tier II is absent from shared research IDs, client bindings consumption, UI, prerequisites, and completion logic; never reuse that column.

See `docs/realtime-data-flow.md` for full data-lane and reconnect diagrams.
