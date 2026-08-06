# Wildwood

Browser action RPG with persistent multiplayer state, deployed as a static GitHub Pages site and backed by SpacetimeDB.

## Architecture

| Area | Location | Purpose |
| --- | --- | --- |
| Game runtime | `src/main.ts` | Runtime orchestration, mutable combat state, rendering order, input wiring, and screen transitions. |
| Game modules | `src/game/` | Constants, enemy/catalog data, world generation, duel replay math, canvas primitives, and inventory logic. |
| UI modules | `src/ui/` | HUD, inventory, and chat rendering/interaction. |
| Multiplayer client | `src/wildwood-coop.ts` | SpacetimeDB connection, guest/account authentication, subscriptions, durable progress, chat, duels, and shared dragon state. |
| Server module | `spacetimedb/src/index.ts` | Authoritative player/boss state, persistence, reducer validation, contribution accounting, account linking, chat, and duels. |
| Shared game values | `src/game/constants.ts` | World dimensions, player and boss tuning, and movement constants. |
| UI markup and styles | `index.html`, `src/styles/game.css` | Static shell, overlays, controls, and visual styling. |
| Generated browser files | `assets/wildwood/game.js`, `assets/wildwood/coop-client.js` | Bundles served by GitHub Pages. Do not edit by hand. |
| Generated server bindings | `src/module_bindings/` | TypeScript bindings from the deployed SpacetimeDB schema. Do not edit by hand. |

GitHub Pages deploys the repository contents directly after every push to `main`. The workflow does **not** build the client. Build and commit generated browser bundles before pushing.

See `ENGINEERING.md` for module boundaries, required change rules, and the prioritized technical backlog.

## Local development

Install dependencies once:

```sh
npm ci
```

For a complete local stack, run these in separate terminals:

```sh
spacetime start
npm run spacetime:publish:local
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/index.html`.

`localhost` connects to `ws://localhost:3000`. GitHub Pages connects to the production database at `wss://maincloud.spacetimedb.com`.

## Client change workflow

1. Edit source files in `src/`, `index.html`, or `src/styles/game.css`.
2. Build both browser bundles:

   ```sh
   npm run build:client
   ```

3. Verify:

   ```sh
   npm run typecheck:coop
   git diff --check
   ```

4. If the game must refresh existing sessions, follow the release checklist below.
5. Commit source files **and** changed files under `assets/wildwood/`, then push `main`.

## Release checklist: version and cache updates

Wildwood uses a release version to invalidate browser caches and direct stale tabs to reload. Every player-facing release must update all of these to the **same** value:

- `src/main.ts` → `GAME_VERSION`
- `version.json` → `version`
- `index.html` → displayed version and cache parameters for stylesheet, `coop-client.js`, and `game.js`

Then run `npm run build:client` and commit the generated bundles. Missing an `index.html` cache parameter can leave a browser running an old `coop-client.js` against a newer server protocol.

## Enemy balance

Regular enemy balance lives in `src/game/enemies.ts`. Each displayed enemy name is the configuration key. `reward.type` selects the upgraded stat, `reward.amount` is the exact final increase with no hidden multiplier, and `score` only affects the run score. Editing regular enemies is client-only; build the browser bundles, bump the release version, and deploy. Dragon multiplayer balance remains server-side.

## Server and protocol changes

The browser client and server both define `PROTOCOL_VERSION`:

- `src/wildwood-coop.ts`
- `spacetimedb/src/index.ts`

When a server reducer, schema, or protocol behavior requires old clients to stop, increment both values in the same change. Then:

```sh
npm run spacetime:build
npm run spacetime:publish:cloud
npm run spacetime:generate # Required after schema or reducer-binding changes
npm run build:client
```

Publishing the server is a separate production operation; pushing `main` only deploys the static site. Never use destructive database publish options in production.

## Authentication and player saves

- Guests receive a locally stored SpacetimeDB token and save progress to that guest identity.
- Signed-in players use SpacetimeAuth and can migrate a guest save once through the short-lived account-link flow.
- OAuth state, PKCE verifier, and guest-link transaction live in `sessionStorage`; never move them to shared `localStorage`.
- Before leaving for SpacetimeAuth, await the guest save reducer and account-link reducer. Page lifecycle events are not a durable save acknowledgement.
- On authenticated reconnect, claim the guest save before installing subscriptions. Subscribing first can hydrate default account rows and make them appear authoritative.
- Do not overwrite an existing authenticated save during migration. The server rejects that case intentionally.
- Successful migration removes the retired guest progress/profile, transient presence, cooldown, balance, dragon-combat, and account-link rows. Chat/replay history remains historical.
- A rejected guest token may be cleared and retried as a fresh guest session. `src/wildwood-coop.ts` handles this for 401/invalid-token errors.
- A known signed-in account must pause at sign-in when its token expires. Never silently reconnect it with a guest token; that displays a random guest name and default/incorrect progress.
- Display-name cooldown data remains stored; enforcement is temporarily disabled for beta support.

## Presence and reconnect invariants

- A websocket connection is not world presence. `on_connect` creates only private session/controller state; `enter_world` creates durable character defaults and the public player row after explicit guest/sign-in choice or completed automatic sign-in.
- Presence is connection-scoped. `player_session` tracks every websocket; `player_controller` selects one connection that may move, duel, or damage the dragon.
- Disconnecting a secondary tab must not delete the shared public player row or cancel a duel. Controller ownership transfers to another live session.
- Every connection registers its own protocol version before reducers or subscriptions run.
- Returning from a short tab hide keeps a healthy socket. Longer resumes use one reducer probe and reconnect only when stale or unreachable; never restore a per-user heartbeat.
- Scheduled maintenance removes orphan public presence and duel state. Durable player progress and profiles are permanent.
- Player profile details load by identity only when opened. Never add `player_progress` or `player_lifetime` back to a global client subscription.

## Shared dragon performance invariants

- Batch projectile hits through `damage_dragon_batch`; never restore one reducer call per projectile. Server validation caps accepted hits to the saved projectile count and attack interval.
- `dragon_boss` subscription updates only shared combat state. Do not trigger the global UI/auth/chat refresh callback for every HP update; the game loop consumes boss state directly.
- Duel membership checks use the `duel.byChallenger` and `duel.byOpponent` indexes. Do not replace them with a full duel-table scan in the dragon damage path.
- Contribution-table scans and combat-row cleanup belong only at encounter death or respawn, never on ordinary hits.

## Common diagnostics

| Symptom | First checks |
| --- | --- |
| Stuck on loading connection | Browser console for 401/token errors; ensure the latest cache version and `coop-client.js` are deployed. |
| “Wildwood updated. Refresh to continue.” | Client/server protocol mismatch or a cached bundle. Check both `PROTOCOL_VERSION` values and all cache-version locations. |
| Site changed locally but not online | Run `npm run build:client`, commit `assets/wildwood/*.js`, push `main`, then confirm the Pages workflow passed. |
| Schema/binding errors | Publish the server module, then run `npm run spacetime:generate`. |
| Account migration rejected | Authenticated account already has progress; preserve it and continue with that account or use the guest session. |

## Deployment targets

- Site: `https://tydoskus.github.io/wildwood/`
- GitHub Pages workflow: `.github/workflows/pages.yml`
- Production SpacetimeDB database: `wildwood-coop` on `maincloud`
- SpacetimeAuth redirect URI: `https://tydoskus.github.io/wildwood/`
