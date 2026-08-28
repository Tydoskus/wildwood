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

Deployed Wildwood pages automatically use `wss://maincloud.spacetimedb.com`; localhost pages use `ws://localhost:3000`. Pages opened through a private LAN hostname/IP use port 3000 on that same host so Wi-Fi test clients stay on the local database.

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

Movement remains client-authoritative. Keyboard input sends only start, stop, and velocity changes plus a 500 ms moving heartbeat. Touch keeps fully analog local movement but uses a 24-direction-equivalent hysteresis gate for network changes, with material steering limited to 10 Hz. Stationary players send no movement traffic. Each packet carries current `x/y`, world-space `vx/vy`, sender simulation tick, motion epoch, and sequence; the server performs finite-value and world-bound checks but never runs authoritative player physics or validates speed/distance.

`update_movement_state` writes a private analytical `player_motion` anchor, so input transactions do not update a public row for every subscriber. At publication time the server advances each anchor by its stored velocity; this removes heartbeat-age drift without running a server simulation tick. Anchors stop extrapolating after a bounded 1.5-second heartbeat grace period. Each client derives a stable nearest-five network-ID set from the all-map snapshot and submits it only when membership changes. One 3 Hz publisher performs at most five primary-key lookups per interested viewer, then inserts one recipient-filtered `player_motion_detail_frame`; unselected actors are never serialized to that viewer. Samples keep compact network IDs and 16-byte payload entries containing quantized position, velocity, tick, and epoch. Rendering deliberately stays about 220–240 ms behind this nearby stream so starts interpolate and stops arrive before presentation reaches them.

Identity, name, account kind, appearance, speed, power, and equipped-item presentation live in a stable map-wide `player_motion_identity` cache. A client subscribes once per map and reuses those rows for rendering and network-ID resolution; movement never rewrites them and camera motion never replaces the subscription. Physical zone columns remain only for schema compatibility. Public `player` rows are exact-own lifecycle/compatibility state and update at start/stop, idle correction, teleports, lifecycle events, and presentation changes; current clients never subscribe to remote player rows. `player_motion_frame` remains only as an inert schema-compatibility event table, and `sync_position` remains only as a temporary pre-0.424 rollout bridge.

Detailed remote state is now exactly two bounded packed publications: the recipient-filtered 3 Hz nearest-five frame and the map-filtered 1 Hz position snapshot. At most five avatars render in detail; a newly selected avatar may seed its first pose from the fresh map frame while awaiting addressed detail, and a missing detail lane automatically resubmits interest and replaces its recipient subscription. It never uses stale presentation coordinates. The map frame keeps every other player visible as an 8-byte position-only dot. Maps with at most 256 visible players remain exact; larger maps collapse markers into at most 256 spatial centroids matching the minimap's useful pixel resolution. Base hydration loads only the local durable profile/account row; active-map presentation comes from the stable map cache, and opened profiles use temporary identity-filtered subscriptions. Remote labels show name and power only; current player HP is local-only and has no server sync lane. `player_map_marker` remains an inert compatibility table because deleting populated schema requires destructive replacement; new clients never subscribe to it.

`player.hp` and `player.max_hp` remain only as inert physical migration columns because deleting them requires a destructive database replacement. They are initialized when presence is created, never synchronized afterward, and ignored by client state/rendering. Do not reuse them.

Optional latency display measures and smooths acknowledgement time from normal reducer calls. It does not create a ping reducer, timer, heartbeat, or additional server traffic.

Developer Tools → Controls accepts 1–200 browser virtual players for smoke testing. Chromium limits same-group WebSockets to roughly 255, so the browser no longer pretends it can generate a valid 3,000-client test.

Use the multi-process Node runner for larger tests. It automatically keeps each process at or below 200 sockets and uses 15 processes for 3,000 bots. Keep the signed-in developer game open, copy its SpacetimeAuth ID token from browser storage, then enter it into a shell without placing it in command history:

```bash
read -s WILDWOOD_LOAD_TEST_TOKEN
export WILDWOOD_LOAD_TEST_TOKEN
npm run loadtest:virtual -- --count 3000 --mode movement --host wss://maincloud.spacetimedb.com --duration 60
```

The Node modes isolate `movement`, `core`, `map`, `capped`, `persistence`, `realistic`, and `dense` traffic. Only `persistence` retains the deliberately harsh 2.5-second fabricated save; `realistic` uses the capped lane and a 30-second dirty save. The authenticated token stays in the coordinator; anonymous worker processes receive only a short-lived run capability. All modes use normal reducers and real WebSockets. Stop, Ctrl-C, socket disconnect, and maintenance converge on the same cleanup path, which deletes simulated profile, save, lifetime, research, presence, motion, interest, session, and ranking rows. After Ctrl-C, wait for the final `Stopped ... test data erased` line before closing the terminal. See `docs/bandwidth-isolation.md` for the comparison sequence and payload budget.

Opening a websocket does not create a character or public presence. Protocol registration may hydrate the login UI, but only `enter_world` creates missing profile/progress rows and the public player row after guest/sign-in choice or successful automatic sign-in.

Player lifetime metadata records join date, accumulated play time, enemy kills, and deaths. Own progress/lifetime rows hydrate with the main subscription. Other-player progress/lifetime rows use a single temporary identity-filtered subscription while that profile window is open; closing, switching, disconnecting, or timing out settles and unsubscribes the request.

Long tab resumes use a single `resume_session` reducer probe. Healthy short resumes keep the websocket. Scheduled maintenance removes transient orphan presence without deleting durable profiles or progress.

Research completion is schedule-driven and idempotently repaired by minute maintenance. Timer reductions shorten legacy active deadlines but never lengthen them. Removed/invalid nodes are deleted cleanly; players never need a claim reducer.

`player_research.frontier_mastery` remains only as a zeroed physical migration column because deleting it would require destructive database replacement. Tier II is absent from shared research IDs, client bindings consumption, UI, prerequisites, and completion logic; never reuse that column.

See `docs/realtime-data-flow.md` for full data-lane and reconnect diagrams.
