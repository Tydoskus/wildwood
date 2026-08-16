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

Movement uploads use an adaptive rate. A client sends at 15 Hz while another visible player is within the two-viewport interest area; a two-second hold prevents boundary flapping. Isolated movement sends at 3 Hz. An identity-scoped private demand signal keeps movement and HP smooth when an invisible developer observes the same map. That demand expires after 20 seconds without visible-tab activity, preventing a backgrounded developer session from holding other clients at the expensive rate. Movement start, movement stop, and forced combat/session synchronization bypass the timer.

Detailed remote state uses one rectangular camera-zone query backed by the `player.by_map_zone` index. A separate lightweight map-wide marker feed supplies distant minimap dots at no more than 1 Hz. Current HP uploads run only when a visible nearby player or private developer observer exists and are capped at 8 Hz.

Optional latency display measures and smooths acknowledgement time from normal reducer calls. It does not create a ping reducer, timer, heartbeat, or additional server traffic.

Developer Tools → Controls starts 5, 10, 25, or 50 virtual players. Each bot is a real anonymous websocket client in the developer's browser: it registers the live protocol, enters the current map, installs the normal core/nearby/minimap subscriptions, sends 15 Hz movement, and submits a jittered save about every 2.5 seconds. This intentionally creates clustered-player fanout and can be expensive at 25-50 bots. The private `virtual_player` tag excludes bots from access history and leaderboard refreshes. Stop, socket disconnect, and maintenance all converge on the same cleanup function, which deletes every simulated profile, save, lifetime, research, presence, marker, session, and ranking row.

Opening a websocket does not create a character or public presence. Protocol registration may hydrate the login UI, but only `enter_world` creates missing profile/progress rows and the public player row after guest/sign-in choice or successful automatic sign-in.

Player lifetime metadata records join date, accumulated play time, enemy kills, and deaths. Own progress/lifetime rows hydrate with the main subscription. Other-player progress/lifetime rows use a single temporary identity-filtered subscription while that profile window is open; closing, switching, disconnecting, or timing out settles and unsubscribes the request.

Long tab resumes use a single `resume_session` reducer probe. Healthy short resumes keep the websocket. Scheduled maintenance removes transient orphan presence without deleting durable profiles or progress.

Research completion is schedule-driven and idempotently repaired by minute maintenance. Timer reductions shorten legacy active deadlines but never lengthen them. Removed/invalid nodes are deleted cleanly; players never need a claim reducer.

`player_research.frontier_mastery` remains only as a zeroed physical migration column because deleting it would require destructive database replacement. Tier II is absent from shared research IDs, client bindings consumption, UI, prerequisites, and completion logic; never reuse that column.

See `docs/realtime-data-flow.md` for full data-lane and reconnect diagrams.
