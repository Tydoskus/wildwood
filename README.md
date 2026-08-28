# Wildwood

Browser action RPG with persistent multiplayer state, deployed as a static GitHub Pages site and backed by SpacetimeDB.

## Product target

Wildwood is mobile-first. Touch interaction, narrow portrait layouts, safe areas, small-screen readability, mobile browser memory, and low-end-phone frame stability are release requirements. Desktop is a secondary compatibility target and must not drive wider spacing, denser UI, hover-only behavior, or heavier rendering paths. See `docs/mobile-first.md`.

## Architecture

| Area | Location | Purpose |
| --- | --- | --- |
| Composition root | `src/main.ts` | Wires typed runtime and UI controllers. Keep new game behavior out of this file. |
| Gameplay runtime | `src/game/runtime/{player,player-combat,enemy-simulation,boss,map,game-session}-controller.ts` | Player movement, combat, enemy LOD, bosses, portals, and frame/session lifecycle. |
| Runtime rendering | `src/game/runtime/{world-renderer,canvas-runtime,render-controller,static-tile-painter,static-tile-worker}.ts` | One Canvas2D renderer, worker-built static tile caching, viewport/DPR handling, and world draw ordering. GPU rendering returns only after measured low-end-device benchmarks or a deliberate full-renderer migration. |
| UI views | `src/ui/*-controller.ts` | HUD, inventory, profile, leaderboard, developer, overlays, startup, and window behavior. |
| Game modules | `src/game/` | Constants, enemy/catalog data, world generation, duel replay math, canvas primitives, and inventory logic. |
| Runtime systems | `src/game/runtime/` | Strictly typed audio, assets, bootstrap, camera, combat effects, persistence, rendering, input, session, and browser contracts. |
| UI modules | `src/ui/` | UI controller/view modules, DOM element contracts, chat runtime, and interaction bindings. |
| Multiplayer client | `src/wildwood-coop.ts` | Browser-facing composition, connection/reconnect policy, and stable `window.wildwoodCoop` API. |
| Multiplayer services | `src/coop/services/` | Account, subscription hydration, presence, profiles, progression, chat, duels, bosses, and developer tooling. See `docs/wildwood-coop-modularization.md`. |
| Server module | `spacetimedb/src/index.ts` | Authoritative player/boss state, persistence, reducer validation, contribution accounting, account linking, chat, and duels. |
| Shared game values | `src/game/constants.ts` | World dimensions, player and boss tuning, and movement constants. |
| Static site files | `public/index.html`, `public/assets/wildwood/game.css` | Static shell, overlays, controls, and visual styling. |
| Art source files | `art-source/` | Original and unused vendor art. Never deployed. |
| Browser build output | `dist/assets/wildwood/game.js`, `dist/assets/wildwood/coop-client.js` | Generated during builds and deployments. Do not edit or commit. |
| Generated server bindings | `src/module_bindings/` | TypeScript bindings from the deployed SpacetimeDB schema. Do not edit by hand. |

GitHub Pages builds the client and deploys only `dist/` after every push to `main`. Source files and repository documentation never ship as site files.

See `ENGINEERING.md` for module boundaries and backlog. See `docs/mobile-first.md` for product and QA constraints, `docs/mobile-performance.md` for measured rendering risks and optimization follow-ups, `docs/equipment.md` for item extension boundaries, `docs/realtime-data-flow.md` for movement, minimap, save, reconnect, and research flow diagrams, `docs/bandwidth-isolation.md` for the nearest-five budget and load profiles, and `docs/native-rewarded-ads.md` for browser and native rewarded-ad flow.

## Local development

Install dependencies once:

```sh
npm ci
```

On macOS, double-click `Run Wildwood Local.command` for the complete local stack. It opens the database in a second Terminal window, publishes and builds current code, starts the web server, then opens the game. Press Control-C in both Terminal windows when finished.

For a complete local stack, run these in separate terminals:

```sh
spacetime start
npm run spacetime:publish:local
npm run build:client
npm run serve:dist
```

Open `http://127.0.0.1:8000`.

`localhost` connects to `ws://localhost:3000`. A private Wi-Fi hostname/IP connects to port 3000 on that same host (for example `ws://192.168.0.137:3000`), so LAN test clients join the local database too. GitHub Pages connects to the production database at `wss://maincloud.spacetimedb.com`.

### Balance Lab

Run the high-speed, non-graphical progression simulator with:

```sh
npm run balance:lab
```

For a terminal report or machine-readable JSON, use `npm run balance:simulate`. The lab charts median power against a configurable geometric target curve, grades each map against explicit duration and power-growth budgets, compares boss readiness, ranks enemy reward efficiency, reports survivability, and provides sandbox HP/damage/reward multipliers. See `docs/balance-lab.md` for model assumptions and CLI examples.

## Client change workflow

1. Edit source files in `src/` or static files in `public/`.
2. Build both browser bundles:

   ```sh
   npm run build:client
   ```

3. Verify:

   ```sh
   npm run test:unit
   npm run typecheck:coop
   npm run check:release
   git diff --check
   ```

4. If the game must refresh existing sessions, follow the release checklist below.
5. Commit source and static files, then push `main`. CI rebuilds and deploys `dist/`.

## Release checklist: version and cache updates

Wildwood uses a release version to invalidate browser caches and direct stale tabs to reload. Every player-facing release must update all of these to the **same** value:

For a client-only release, run the interactive helper:

```sh
npm run release:live
```

On macOS, double-click `Release Wildwood.command` in the project folder instead of typing the command yourself. Its Terminal window stays open, asks for the version and notes, and shows every check plus live deployment progress.

It suggests the next version, accepts one release note per line, shows included changes, runs every required check, commits and pushes `main`, then waits until the live site reports the new version. Tracked changes and already-staged new files are included by default. Untracked paths are shown but excluded; stage intended new files first, or deliberately run `npm run release:live -- --include-untracked` after reviewing them.

Automation-friendly use accepts explicit values:

```sh
npm run release:live -- --version 0.457 --note "Fixed enemy aim." --yes
```

The helper blocks changes under `shared/`, `spacetimedb/`, and generated module bindings because those require the separate Maincloud checklist below.

Manual release steps remain available:

- Run `npm run release -- <version>` to update `src/game/runtime/game-settings.ts`, `public/version.json`, and every cache/display reference in `public/index.html` together.
- Add release notes for that version in `src/app/changelog.ts`.

Then run `npm run build:client` to verify the artifact. CI runs `npm run check:release` and rejects mismatched release references. Missing a `public/index.html` cache parameter can leave a browser running an old `coop-client.js` against a newer server protocol.

## Enemy balance

Regular enemy balance lives in `src/game/enemies.ts`. Each displayed enemy name is the configuration key. `reward.type` selects the upgraded stat, `reward.amount` is the exact final increase with no hidden multiplier, and `score` only affects the run score. Editing regular enemies is client-only; build the browser bundles, bump the release version, and deploy. Dragon multiplayer balance remains server-side.

## Server and protocol changes

Browser and server import one `PROTOCOL_VERSION` from `shared/rules.ts`.

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
- Forced updates write a one-use, version-bound `sessionStorage` handoff only for an actively running game. It restores the same account or guest session after reload without changing normal sign-in behavior.
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

## Shared boss performance invariants

- Batch each attack's projectile hits through one boss-damage reducer; never restore one reducer call per projectile. Server validation caps accepted hits to the saved projectile count and attack interval.
- Boss hazard layouts use the versioned encounter seed in `shared/boss-simulation.ts`. Nearby remote-player boss throws are reconstructed from that encounter, server time, analytical motion, and saved combat stats. Keep `boss_attack_frame` inert: do not restore per-attack event inserts or subscriptions.
- Boss-state subscriptions update only shared combat state. Do not trigger the global UI/auth/chat refresh callback for every HP update; the game loop consumes boss state directly.
- Duel membership checks use the `duel.byChallenger` and `duel.byOpponent` indexes. Do not replace them with a full duel-table scan in the dragon damage path.
- Contribution-table scans and combat-row cleanup belong only at encounter death or respawn, never on ordinary hits.

## Common diagnostics

| Symptom | First checks |
| --- | --- |
| Stuck on loading connection | Browser console for 401/token errors; ensure the latest cache version and `coop-client.js` are deployed. |
| “Wildwood updated. Refresh to continue.” | Client/server protocol mismatch or a cached bundle. Check both `PROTOCOL_VERSION` values and all cache-version locations. |
| Site changed locally but not online | Run `npm run build:client`, push `main`, then confirm the Pages workflow passed. |
| Schema/binding errors | Publish the server module, then run `npm run spacetime:generate`. |
| Account migration rejected | Authenticated account already has progress; preserve it and continue with that account or use the guest session. |

## Deployment targets

- Site: `https://tydoskus.github.io/wildwood/`
- GitHub Pages workflow: `.github/workflows/pages.yml`
- Production SpacetimeDB database: `wildwood-coop` on `maincloud`
- SpacetimeAuth redirect URI: `https://tydoskus.github.io/wildwood/`
