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

Movement uploads use an adaptive rate. A client sends at 30 Hz when another player is inside its viewport plus a 25% margin on every edge, allowing the rate to increase before either player becomes visible. Isolated movement sends at 5 Hz. Movement start, movement stop, and forced combat/session synchronization bypass the timer.

Opening a websocket does not create a character or public presence. Protocol registration may hydrate the login UI, but only `enter_world` creates missing profile/progress rows and the public player row after guest/sign-in choice or successful automatic sign-in.

Player lifetime metadata records join date, accumulated play time, and enemy kills. Own progress/lifetime rows hydrate with the main subscription. Other-player progress/lifetime rows use a single temporary identity-filtered subscription while that profile window is open; closing or switching profiles unsubscribes it.

Long tab resumes use a single `resume_session` reducer probe. Healthy short resumes keep the websocket. Scheduled maintenance removes transient orphan presence without deleting durable profiles or progress.
