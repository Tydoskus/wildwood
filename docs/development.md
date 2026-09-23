# Development and releases

Technical notes for WildStat. Paths below are relative to the repository root. For the game overview, see [README](../README.md).

See [branding.md](branding.md) for the rename's compatibility boundaries and the later domain setup.

## Product target

WildStat is mobile-first. Touch interaction, narrow portrait layouts, safe areas, small-screen readability, mobile browser memory, and low-end-phone frame stability are release requirements. Desktop is a secondary compatibility target and must not drive wider spacing, denser UI, hover-only behavior, or heavier rendering paths. See `docs/mobile-first.md`.

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
| Multiplayer client | `src/wildstat-coop.ts` | Browser-facing composition, connection/reconnect policy, and stable `window.wildstatCoop` API. |
| Multiplayer services | `src/coop/services/` | Account, subscription hydration, presence, profiles, progression, chat, duels, bosses, and developer tooling. See `docs/wildstat-coop-modularization.md`. |
| Server module | `spacetimedb/src/index.ts` | Authoritative player/boss state, persistence, reducer validation, contribution accounting, account linking, chat, and duels. |
| Shared game values | `src/game/constants.ts` | World dimensions, player and boss tuning, and movement constants. |
| Static site files | `public/index.html`, `public/assets/wildstat/game.css` | Static shell, overlays, controls, and visual styling. |
| Art source files | `art-source/` | Original and unused vendor art. Never deployed. |
| Local test data | `local-data/` | Optional profiling exports and machine-specific captures; the entire folder is ignored. |
| Browser build output | `dist/asset-manifest.json`, `dist/assets/wildstat/game.<hash>.js`, `dist/assets/wildstat/coop-client.<hash>.js` | Generated during builds and deployments. Do not edit or commit. |
| Generated server bindings | `src/module_bindings/` | TypeScript bindings from the deployed SpacetimeDB schema. Do not edit by hand. |

GitHub Pages builds the client and deploys only `dist/` after every push to `main`. Source files and repository documentation never ship as site files.

### Asset caching and updates

`npm run build:client` fingerprints the shell's scripts, stylesheet, images, fonts, and web manifest after bundling. Filenames use a SHA-256 content digest, not the release number. CSS and manifest dependencies are fingerprinted first, so changing an icon or font also updates its parent's hash. Unchanged sign-in artwork and logos keep their URLs across releases. `asset-manifest.json` maps source names to deployed names; `check-client-build.mjs` validates the digests and executable entries.

The generated Cloudflare `_headers` revalidates HTML, disables storage of `version.json`, and caches only fingerprinted assets as immutable for one year. GitHub Pages still uses its platform cache headers, but receives the same hashed URLs. Runtime-created media paths retain their original names and normal host caching; do not apply immutable caching to those paths. Original shell filenames remain as compatibility aliases for older pages. JavaScript source maps are fingerprinted too, without changing executable code or source positions.

Update detection remains a server-side `version.json` check at startup and every two minutes. A newer release triggers the existing update handoff. A temporary `?v=` navigation is retained to bypass stale HTML on GitHub Pages; it is removed from the address bar after the matching build loads, without touching OAuth callback parameters. This is separate from asset caching. No service worker or SpacetimeDB schema change is required.

### Character cutscene history

Portal scenes render locally, but completion lives in the private `player_cutscene_history` table, exposed only through the caller-scoped `my_cutscene_history` view. The completion reducer accepts only known scenes for unlocked portals and always writes to `ctx.sender`. On first world entry without a history row, already-unlocked destinations are migrated to seen. New characters start empty; later unlocks do not automatically mark their new scenes as watched. Developer previews never record completion.

Guest linking transfers the history with the character. Progress reset clears it and advances a generation so queued saves from before the reset cannot restore old flags. Failed completion writes are retried from an identity-scoped browser queue; the old unscoped browser-only flags are ignored. Signing into the same character on another device loads its server history.

Deployment order: build and publish the additive server table/view/reducer without deleting data, then regenerate bindings and release the matching client. Existing table layouts and reducer signatures are unchanged, so older clients can remain connected during the server-first rollout. The new client requires the new view and must not be deployed first. The client-only `release:live` command intentionally rejects this server/shared change; use the server release checklist.

See [engineering notes](ENGINEERING.md) for module boundaries and backlog. See `docs/mobile-first.md` for product and QA constraints, `docs/mobile-performance.md` for measured rendering risks and optimization follow-ups, `docs/equipment.md` for item extension boundaries, `docs/realtime-data-flow.md` for movement, minimap, save, reconnect, and research flow diagrams, `docs/bandwidth-isolation.md` for the nearest-five budget and load profiles, and `docs/native-rewarded-ads.md` for browser and native rewarded-ad flow.

## Local development

Install dependencies once:

```sh
npm ci
```

On macOS, double-click `Run Wildstat Local.command` in the `launchers/` folder. It starts the local database if needed and opens the live game at `http://127.0.0.1:8000`. Leave both terminals and the browser tab open while editing:

- CSS changes update the current screen in place, without restarting the game.
- Client code, UI markup, and asset changes rebuild as needed and refresh the same tab.
- Server and shared-rule changes publish to `http://127.0.0.1:3000`, regenerate bindings, rebuild the client, and refresh. Local saves are preserved; incompatible schema changes stop with an error instead of deleting data.
- Failed builds leave the last successful browser bundles available. Fix the error and save again to retry.

The watcher always uses `wildwood-balance-local`, preserving the existing local guest storage keys and the local-only movement/respawn boosts. Its bundles live in memory, so production and mobile builds in `dist/` cannot overwrite the running local game. Server compilation and generated bindings use an isolated workspace under ignored `local-data/`, removed on shutdown. Older local chat prototype columns are retained only in that workspace when present in the database; production source and bindings stay unchanged. Other incompatible schema changes still stop without deleting saves. It does not publish to Maincloud.

Alternatively, start `spacetime start` in one terminal, then run `npm run dev:local -- --open` in another. `WILDSTAT_LOCAL_PORT` can select a different browser port for an isolated test. Stop with Control-C when finished. Opening the launcher again reuses the existing live server.

When switching from the old launcher for the first time, stop its Python web-server terminal once to free port 8000. The database can remain running.

### Stat tracker

Contributed by Kiira and shipped in 0.750. Enable **Settings → Game → Stat
Tracker** to show current Power, Max HP, Damage, Armor, Regen and Kills with
session gains and hourly rates. Values come from the loaded local character and
canonical equipment/research calculations; opening a profile is unnecessary. The
tracker is off by default to preserve mobile HUD space.

Drag its header to move it, double-click the header (or press Home while
focused) to restore its position, or use arrow keys to move it. Reset changes
only the tracker baselines. Sessions persist per character on this browser;
elapsed time includes time away. A decrease in lifetime kills starts a new
session after a character progress reset. A prestige also starts a new session.

- Gains are floored at zero. Base stats only climb, so a figure below the
  session baseline is a gear swap rather than progress; reporting the loss would
  persist for the session and drag the hourly rate negative.
- The footer slider sets panel opacity, from the profile HUD's translucency to
  solid. It is per-browser, and it hides with the rest of the panel when the
  tracker is collapsed.
- The panel sits below every fullscreen window, so inventory and the profile
  cover it rather than fighting it for the foreground.
- Figures use `formatCompactNumber` at three significant digits, except values
  below one, which keep their decimals so regeneration does not read as zero.

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

`test:unit` and `test:unit:watch` exclude campaign simulations. Only run
`npm run test:balance` when the user explicitly requests balance simulation.
See [Testing boundaries](testing.md) for DOM checks, reducer fixtures, and the
intentional 1,000-line facade guard.

4. If the game must refresh existing sessions, follow the release checklist below.
5. Commit source and static files, then push `main`. CI rebuilds and deploys `dist/`.

## Release checklist: version and cache updates

WildStat uses a release version to invalidate browser caches and direct stale tabs to reload. Every player-facing release must update all of these to the **same** value:

For a client-only release, run the interactive helper:

```sh
npm run release:live
```

On macOS, double-click `Release Wildstat.command` in the `launchers/` folder instead of typing the command yourself. Its Terminal window stays open, asks for the version and notes, and shows every check plus live deployment progress.

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

## Startup assets

- Startup waits for common render assets plus only the map reported by the hydrated local player state. Do not restore an all-map artwork gate.
- `MAP_ASSET_GROUPS` is the source of truth for lazy boss and decor sheets. Portal transitions begin the destination load beside the server move and await it before revealing the map.
- Static world tiles warm at background priority after the game session starts; tile-cache warmup must not hold the entry screen open.

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

There is one server database. Every player runs on `wildwood-coop`, and the client scopes what it receives by subscribing per map (`WHERE map_id = <current map>`) rather than by connecting to a per-map database. `npm run spacetime:publish:live` is the checked path to it: preflight, then one upload that takes seconds. Map sharding was removed on 2026-09-21; the model, the measurements behind it and the reasons are in [SPACETIME.md](SPACETIME.md#one-database).

`DUEL_COMBAT_VERSION` in `shared/duel-combat.ts` is the duel wire format. A duel
row is only delivered to a client whose identity holds a `duel_wire_access` row
for that exact version, so `syncDuelWireAccess` must grant every version through
the current one. It derives the range from the constant rather than listing it:
0.759 bumped the version to 3 against a hardcoded `[0, 1, 2]`, and every duel
fought after that publish was invisible to both duellists. The protocol check in
that function, not the version list, is what keeps an old decoder out.

## Authentication and player saves

- Guests receive a locally stored SpacetimeDB token and save progress to that guest identity.
- Signed-in players use SpacetimeAuth and can migrate a guest save once through the short-lived account-link flow.
- OAuth state, PKCE verifier, and guest-link transaction live in `sessionStorage`; never move them to shared `localStorage`.
- Forced updates write a one-use, version-bound `sessionStorage` handoff only for an actively running game. It restores the same account or guest session after reload without changing normal sign-in behavior.
- Before leaving for SpacetimeAuth, await the guest save reducer and account-link reducer. Page lifecycle events are not a durable save acknowledgement.
- On authenticated reconnect, claim the guest save before installing subscriptions. Subscribing first can hydrate default account rows and make them appear authoritative.
- Do not overwrite an existing authenticated save during migration. The server rejects that case intentionally.
- Successful migration removes the retired guest progress/profile, transient presence, cooldown, balance, dragon-combat, and account-link rows. Blocks transfer to the registered identity, and retained chat follows that sender so existing messages stay blocked. Replay history remains historical.
- A rejected guest token may be cleared and retried as a fresh guest session. `src/wildstat-coop.ts` handles this for 401/invalid-token errors.
- A known signed-in account must pause at sign-in when its token expires. Never silently reconnect it with a guest token; that displays a random guest name and default/incorrect progress.
- Display-name cooldown data remains stored; enforcement is temporarily disabled for beta support.

## Presence and reconnect invariants

- A websocket connection is not world presence. `on_connect` creates only private session/controller state; `enter_world` creates durable character defaults and the public player row after explicit guest/sign-in choice or completed automatic sign-in.
- Presence is connection-scoped. `player_session` tracks every websocket; `player_controller` selects one connection that may move, duel, or damage the dragon.
- Disconnecting a secondary tab must not delete the shared public player row or cancel a duel. Controller ownership transfers to another live session.
- Every connection registers its own protocol version before reducers or subscriptions run.
- Returning from a short tab hide keeps a healthy socket. Longer resumes use one reducer probe and reconnect only when stale or unreachable; never restore a per-user heartbeat.
- Socket open, session setup, and base hydration each have a bounded timeout. Retry transport failures with capped exponential backoff and jitter, and reset that backoff only after base hydration succeeds.
- A base-subscription error must rebuild the connection; logging it without leaving the pending state is not a valid failure path.
- Scheduled maintenance removes orphan public presence and duel state. Durable player progress and profiles are permanent.
- Player profile details load by identity only when opened. Never add `player_progress` or `player_lifetime` back to a global client subscription.

## Chat and subscription invariants

- `chat_message` is private. Clients read the public page through the
  `latest_chat_messages_with_reactions` view and the history procedure, never
  the table. Do not make it public again to "fix" a chat display problem.
- Reading a page walks identifiers down from the newest, which is one row read
  per message returned only while identifiers are dense. Account erasure punches
  holes, so the walk has a probe ceiling and falls back to a retention-bounded
  scan. Keep the ceiling; without it one erased account degrades every page read.
- Chat retention walks up from `public_chat_cursor` and stops at the first
  message still inside the window, leaving the cursor correct as it goes. Do not
  reintroduce the full rescan that used to follow it.
- Sender and guild-replay-key lookups use the `bySender` and `byGuildReplay`
  indexes. Never iterate the chat table to find one sender's messages.
- Private messages age out after a year (`SOCIAL_MESSAGE_RETENTION_DAYS`). The
  per-recipient view rebuilds from every message an account has exchanged, so
  unbounded retention makes it slower for as long as the account exists.
- Subscriptions must not filter with `ne`. An index cannot answer it, so the
  server falls back to a sequential scan. The map presence query subscribes to
  every visible player on the map and lets the handler recognise the local row,
  which the base subscription delivers anyway.

## Balance snapshot invariants

- A saved balance revision is never rewritten, so `spacetimedb/src/map-balance.ts`
  parses one once and shares the resolved snapshot between every player who
  arrives on the same map at the same revision. Saving a revision clears both
  caches; any new cache key must keep that guarantee.
- The caches are keyed by revision alone. One module instance serves one
  database in production, but a test process builds many fixtures behind the
  same module, so tests call `forgetBalanceCaches()` when they build a fixture.

## Release invariants

- The shipped-artwork digest must not depend on the machine computing it. It
  skips dot files, because `.DS_Store` is present locally and absent in CI, and
  sorts by code unit rather than `localeCompare`, whose order varies with the
  ICU build. A digest that disagrees between a laptop and the runner fails every
  deploy while passing locally.

## Kill gem invariants

- Gems from kills are deterministic, not rolled. Every accepted manual defeat
  adds six credits, whether the player is visible or hidden. An Auto Farm kill
  adds four credits. Each 6,000 credits pays one gem: 1 per 1,000 manual kills
  or 1 per 1,500 Auto Farm kills (`shared/gem-drops.ts`).
- The client records Auto Farm status with each persisted defeat batch. The
  server validates accepted kills and uses the matching reducer to apply the
  lower Auto Farm credit rate. Older clients use the manual reducer.
- The grant runs inside the root defeat reducer, from the same
  `accepted.count` that advances lifetime kills, so the two can never drift.
  Its ledger reference carries the lifetime kill count after the batch, which
  only rises, so a replayed report cannot pay twice.
- `dev_grant_retroactive_kill_gems` pays kills earned before this existed at
  the historical 1-per-2,000 rate. A player is marked
  done by their `gem_kill_progress` row, so running it twice pays nobody twice.
- `player_gem_drop` is the client's pop-up signal, one row per player bumped
  per grant, mirroring `player_item_drop`; the client ignores a sequence it has
  already shown so hydration cannot replay it.

## Kill claim invariants

- The client reports kills; the server decides what they are worth. Two
  bounds apply to a regular-enemy claim, and **neither restricts the session**:
  1. **Spawn wall** — a token bucket per player, map and species that refills at
     the map's spawn rate and banks `DEFEAT_BUDGET_WINDOW_SECONDS` of it.
     Claims above it are paid only up to it and written to
     `enemy_defeat_review`.
  2. **Plausibility** — a second bucket that refills at the most kills per
     second this player's own combat can produce (one projectile kills at most
     one enemy; each enemy needs a whole number of hits; every hit a maximum
     critical; `PLAUSIBLE_KILL_TOLERANCE` on top). Claims above it are paid
     only up to it and written to `enemy_defeat_review`. It never restricts,
     because a report can outrun a progress save after an equipment change.
     The estimate uses the stats the report itself grants (bounded by the spawn
     wall): kill rewards raise damage as they land, and the client fought the
     whole report with those gains while the saved row still shows the stats
     from before it.
- The bank is one client report. The client sends regular kills every
  `REGULAR_KILL_REPORT_SECONDS` (300, `shared/rules.ts`), and both the client
  delay and the server bank derive from that one constant. A smaller bank clips
  honest players: at sixty seconds a five-minute report was paid at a fifth in
  local testing. A longer one only lets a script claim more in one go than the
  client could have gathered.
- Position is not checked. A report lands up to five minutes after its first
  kill, so where the player stands when it arrives says nothing about where
  the kills happened. The map check (`Enemy defeats belong to another map`) is
  the location bound, and it runs before any of this.
- **Only a report no real client could have sent restricts a session**: more
  than `ENEMY_DEFEAT_BATCH_MAX` kills in one batch, which the client's own
  `REGULAR_ENEMY_LOOT_BATCH_MAX` seal makes impossible. Everything else is
  bounded and written down. Restricting on any violation kicked honest players:
  every automatic revocation on live was `boss requested 1, accepted 0`, mostly
  at sequence 1 or 2 — the first report of a fresh stream, which is exactly what
  a portal round-trip produces. Bosses are personal (`PERSONAL_BOSS_COMBAT`), so
  travelling back to a map re-presents one the earned-time clock has not paid
  for yet; the claim earning nothing is the enforcement, and taking the session
  on top of it was the bug. The same applies to a map round-trip starting a
  fresh stream against a bucket the last visit drained.
- `enemy_defeat_review` keeps the last `DEFEAT_REVIEW_FLAGS_PER_PLAYER` rows
  per player for a person to read. Nothing acts on it automatically. Both
  bounds write there; `kind` says which one clipped (`spawn`, `damage`,
  `boss-time`).
- The boss combat-time window (`BOSS_REWARD_WINDOW_SECONDS`, 60) is a separate
  mechanism with its own spec in `boss-defeat-limits.test.ts`. Boss kills are
  reported the moment they happen, so a one-minute bank is honest there.

## Schema change invariants

- **Adding a column to a live table costs every player a reload, so we do not
  do it in an ordinary release.** SpacetimeDB itself allows one, but only at the
  end of the table and only with a default value; it automigrates and reports
  `break_clients: true`, meaning clients that have not reloaded do not know the
  column. A column added mid-definition or without a default is genuinely
  refused (`Reordering table ... requires a manual migration`). See the
  [automatic migrations docs](https://spacetimedb.com/docs/databases/automatic-migrations/)
  for the full supported/forbidden list.
- The wall is ours, not the engine's: `preflight` in `scripts/releases/rollout.mjs`
  throws on `break_clients !== false`, so an appended column stops the whole
  publish, including whatever else is in it, private tables included. Pass
  `--allow-client-break` to `npm run spacetime:publish:live` to waive it. A
  manual migration is never waivable.
- **`break_clients` is a cost per release, not per change.** Every player is
  disconnected and reconnects, once, however many schema changes ride along. So
  batch schema debt — removals, new columns — into one flagged publish rather
  than paying the reconnect twice.
- Removing anything from the schema breaks clients, including **a view nobody
  subscribes to**: removing `local_movement_demand` and `my_mailbox` alone
  reported `break_clients: true`. Removing a table auto-migrates cleanly
  (`Removed table: motion_frame_schedule`), despite the docs listing that as
  forbidden — their list is behind this server version. Read the real plan, do
  not infer it.
- The cheap way round is a new table keyed the same way, read alongside the old
  one. `player_prestige_perk`, `duel_riposte` and `player_session_analytics` all
  exist for this reason.
- New tables, new reducers and new procedures are additive and pass cleanly.
- `npm run spacetime:publish:live -- --preflight` checks without publishing. It
  reports only that something failed; for the reason, POST the built bundle to
  `/v1/database/<name>/pre_publish?host_type=Js` with the operator token and read
  `ManualMigrate.reason` or `AutoMigrate.migrate_plan`.

## Prestige invariants

- Prestige opens when the campaign's last boss is down, the same clearance
  Endless needs. The reducer checks `prestigeUnlocked` in `shared/prestige.ts`;
  the client greys the profile button from `proceduralMapUnlocked` for the first
  Endless map, which resolves to the same condition. Keep them in step.
- Prestige performs the ordinary progress reset, unlock flags and Endless
  progress included, so the next prestige is earned from the forest up. Both the
  reset button and prestige call `resetProgressToDefaults` in the server entry;
  changes to what a reset clears belong there. Prestige passes `keep`, the only
  difference: research ranks and any running timer survive because they cost
  real days and the rerun is meant to be faster, and lifetime enemy kills
  survive because they count everything the account ever killed. Kill gems key
  their ledger reference off that count rising, so resetting it would let a
  replayed batch pay twice.
- `player_prestige` survives that reset. Nothing else may be added to the reset
  that would clear it.
- The level multiplies every stat reward a kill grants, through
  `statRewardMultiplier` in `spacetimedb/src/prestige.ts`. That helper is the
  only caller of `researchStatRewardMultiplier` on the server: use it for any
  new reward path, or prestige silently stops applying there.
- The server's projection of a claim's rewards uses the same helper, so a
  prestiged player's kill claims are bounded with the bonus included. A reward
  multiplier that skips it would clip the most invested players and write review
  flags against them. See **Kill claim invariants** above.
- Perk points are banked one per level and spent through `spend_prestige_perk_point`,
  which writes `player_prestige_perk`. That table is separate from `player_prestige`
  because adding a column to a live public table breaks every connected client;
  see **Schema change invariants** above.
- A perk that changes combat has to be paid in three places: the client's own
  rolls, the server's bound on what a kill claim could contain
  (`prestigeReachMultiplier` and `prestigeSwingMultiplier`), and the profile's
  stat list. Skipping the bound clips the players who bought the perk; skipping
  the stat list makes a bought perk look inert.

## Supporter frame invariants

- Tiers are a ladder (`AVATAR_FRAME_RANK` in `shared/avatar-frames.ts`): a
  supporter may wear their own frame or any below it. Adding a tier means adding
  it to the rank, the order, the asset map, a `patreon_config` tier id, and a
  `--avatar-frame-overhang` plus glow colour and mask in `game.css`.
- **Diamond is offered but locked until configured.** The picker shows every
  tier, a frame the player does not hold disabled with the membership it needs.
  `patreon_config.diamond_tier_id` defaults to empty, which no real Patreon
  entitlement can match, so diamond stays locked until `configure_patreon` is
  called with the tier's real id (`scripts/configure-patreon.mjs` accepts an
  optional `diamondTierId`). Developers can still preview it, because the
  developer preview reports the top tier.
- **Supporters see no ads.** The rewarded-respawn button grants a supporter the
  boost on tap; the client asks `supporterTier()` (the tier of the last
  verified status), so an unlinked or lapsed member is shown the ad like anyone.
- A supporter's lease runs to the end of the period they paid for, not to the
  next check. See **Kill claim invariants** for the shape of the mistake that
  came from the other choice: a six-hour lease meant a supporter who had not
  logged in that day lost their frame and dropped off the ticker.

## Guild name invariants

- A guild's name is its four-letter tag, so `create` runs the display-name
  rules and then a short profanity denylist (`guildNameModerationReason`).
  The chat filter alone targets hate, solicitation, threats and scams, not
  profanity, which is why the list exists.

## Boss combat invariants

Boss combat is client-sided. `PERSONAL_BOSS_COMBAT` in `shared/personal-bosses.ts` is `true`, and `src/game/runtime/personal-bosses.ts` owns boss HP, alive/dead state, respawn timing, and the defeat result. Only the completed defeat is reported to the server, through `recordRegularEnemyDefeat`. See [engineering notes](ENGINEERING.md) for the retained server surface and what must not be deleted with it.

- Boss abilities, target selection, and hazard layouts use the versioned encounter simulation in `shared/boss-simulation.ts`, which remains live and is now driven entirely client-side. A hidden global server-time metronome controls ability phase; the seed varies targets and geometry without shifting the rhythm. Targets come from consensus-time player positions already available to the client, and both the real local throw and nearby observers use the same per-player boss attack slot. Keep `boss_attack_frame` inert: do not restore per-attack event inserts or subscriptions.
- Rewards stay server-owned even though damage is local. A defeat sends identities and counts only; `acceptEnemyDefeats` and `maximumBossCombatForProgress` bound what the server will grant. Never widen that wire format to carry client-computed reward values.
- Do not reconnect the client to the shared-boss reducers. The `damage*FromPosition` call chain in `src/coop/services/boss-service.ts` and the `target.isBoss` branch in `player-combat-controller.ts` are unreachable because `hitPersonalBoss` intercepts first. Treat them as pending deletion, not as a fallback path.
- The `boss:` subscription scope is never requested (`subscribeBosses` is hardcoded `false` at the sole call site in `src/wildstat-coop.ts`). Do not re-enable it to fix a boss display problem; the game loop reads local state.
- Duel membership checks use the `duel.byChallenger` and `duel.byOpponent` indexes. Do not replace them with a full duel-table scan in any damage or presence path.
- Contribution-table scans and combat-row cleanup belong only at encounter death or respawn, never on ordinary hits.

## Common diagnostics

| Symptom | First checks |
| --- | --- |
| Stuck on loading connection | Browser console for 401/token errors; ensure the latest cache version and `coop-client.js` are deployed. |
| “WildStat updated. Refresh to continue.” | Client/server protocol mismatch or a cached bundle. Check both `PROTOCOL_VERSION` values and all cache-version locations. |
| Site changed locally but not online | Run `npm run build:client`, push `main`, then confirm the Pages workflow passed. |
| Schema/binding errors | Publish the server module, then run `npm run spacetime:generate`. |
| Account migration rejected | Authenticated account already has progress; preserve it and continue with that account or use the guest session. |

## Deployment targets

- Site: `https://tydoskus.github.io/wildwood/`
- GitHub Pages workflow: `.github/workflows/pages.yml`
- Production SpacetimeDB database: `wildwood-coop` on `maincloud`
- SpacetimeAuth redirect URI: `https://tydoskus.github.io/wildwood/`

## Planned updates

Use [scheduled releases](scheduled-releases.md) to prepare artifacts before a five-minute in-game countdown, wait for progress acknowledgements, and publish the server only when `shared/` or `spacetimedb/` changed. The immediate release helper above remains available for urgent hotfixes.
