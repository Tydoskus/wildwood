# Wildwood SpacetimeDB

## Local development

Run SpacetimeDB and the static site in separate terminals:

```sh
spacetime start
spacetime publish wildwood-coop --module-path spacetimedb --server local
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/index.html`.

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

Movement uploads use an adaptive rate. A client sends at 10 Hz while another visible player is within the camera interest area; a two-second hold prevents boundary flapping. Isolated movement sends at 3 Hz. An identity-scoped private demand signal keeps movement smooth when an invisible developer observes the same map. That demand expires after 20 seconds without visible-tab activity, preventing a backgrounded developer session from holding other clients at the expensive rate. Movement start, movement stop, and forced combat/session synchronization bypass the timer.

`sync_position` writes private `player_motion`, so input transactions no longer update a public row for every subscriber. Two-player maps publish the compact sample directly, avoiding scheduler overhead for ordinary co-op. At three or more players, a dynamic 10 Hz scheduler packs changed movers into one `player_motion_frame` event per occupied zone. Low-rate movement restarts that scheduler per input instead of leaving an empty 10 Hz timer alive. Samples use compact network IDs and 11-byte payload entries; identity, name, account kind, and appearance travel separately in cold, camera-zone-filtered `player_motion_identity` presence. Public `player` rows update only at start/stop, idle correction, zone boundaries, teleports, lifecycle events, and presentation changes.

Detailed remote state uses one subscription containing a rectangular `player` query plus matching zone-frame query. A separate 1 Hz compact `player_map_frame` supplies distant minimap dots. Both schedules stop when no map has multiple active players. Base hydration loads only the local durable profile/account row; active-map presentation comes from presence, and opened profiles use temporary identity-filtered subscriptions. Remote labels show name and power only; current player HP is local-only and has no server sync lane. `player_map_marker` remains an inert compatibility table because deleting populated schema requires destructive replacement; new clients never subscribe to it.

`player.hp` and `player.max_hp` remain only as inert physical migration columns because deleting them requires a destructive database replacement. They are initialized when presence is created, never synchronized afterward, and ignored by client state/rendering. Do not reuse them.

Optional latency display measures and smooths acknowledgement time from normal reducer calls. It does not create a ping reducer, timer, heartbeat, or additional server traffic.

Developer Tools → Controls accepts 1–3,000 virtual players. Each bot is a real anonymous websocket client in the developer's browser: it registers the live protocol, claims a private run-scoped developer ticket through its own confirmed socket, enters the current map, installs the normal core/nearby-frame/map-frame subscriptions, sends 10 Hz clustered movement, and submits a jittered save about every 2.5 seconds. Startup waits for each bot's full acknowledgement, retries transient failures three times, and slows automatically as acknowledgement latency or failures rise. A private per-owner counter enforces the limit without repeated full-table scans. The private `virtual_player` tag excludes bots from access history and leaderboard refreshes. Stop, socket disconnect, and maintenance all converge on the same cleanup function, which deletes every simulated profile, save, lifetime, research, static presence, motion mapping, session, and ranking row.

Opening a websocket does not create a character or public presence. Protocol registration may hydrate the login UI, but only `enter_world` creates missing profile/progress rows and the public player row after guest/sign-in choice or successful automatic sign-in.

Player lifetime metadata records join date, accumulated play time, enemy kills, and deaths. Own progress/lifetime rows hydrate with the main subscription. Other-player progress/lifetime rows use a single temporary identity-filtered subscription while that profile window is open; closing, switching, disconnecting, or timing out settles and unsubscribes the request.

Long tab resumes use a single `resume_session` reducer probe. Healthy short resumes keep the websocket. Scheduled maintenance removes transient orphan presence without deleting durable profiles or progress.

Research completion is schedule-driven and idempotently repaired by minute maintenance. Timer reductions shorten legacy active deadlines but never lengthen them. Removed/invalid nodes are deleted cleanly; players never need a claim reducer.

`player_research.frontier_mastery` remains only as a zeroed physical migration column because deleting it would require destructive database replacement. Tier II is absent from shared research IDs, client bindings consumption, UI, prerequisites, and completion logic; never reuse that column.

See `docs/realtime-data-flow.md` for full data-lane and reconnect diagrams.
