# WildStat Engineering Notes

This file records module boundaries, change rules, and known technical work. Read it before changing gameplay, networking, persistence, or deployment behavior. Code paths below are relative to the repository root.

Realtime ownership and sequencing are diagrammed in `docs/realtime-data-flow.md`. Mobile-first release constraints live in `docs/mobile-first.md`; measured rendering risks and follow-ups live in `docs/mobile-performance.md`; equipment extension boundaries live in `docs/equipment.md`.

## Client structure

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | Composition root only. It wires controllers and must stay under 1,000 lines; new behavior belongs in a typed runtime or UI module. |
| `src/game/constants.ts` | Shared gameplay and world constants. |
| `src/game/enemies.ts` | Enemy definitions, camp definitions, reward labels, and enemy sprite loading. |
| `src/game/world.ts` | World decoration, road layout, and enemy spawn-site generation. |
| `src/game/duel.ts` | Duel constants and pure replay simulation helpers. |
| `src/game/canvas.ts` | Reusable canvas path and pixel-shape primitives. |
| `shared/items.ts` | Browser/server-safe item definitions, equipment slots, weapon behavior, acquisition classes, and legacy ID migration. |
| `src/game/inventory.ts` | Owned-item normalization, equip operations, save migration, and serialization. |
| `src/game/item-presentation.ts` | Client-only inventory art, equipped sprites, draw anchors, and projectile presentation. |
| `src/game/runtime/` | Typed runtime controllers for assets, bootstrap, canvas, combat, enemy simulation/LOD, map progression, persistence, player input, rendering, and game/duel/coop sessions. |
| `src/ui/` | UI controllers and views for HUD, inventory, profiles, leaderboard, developer tools, overlays, startup, chat, and interaction bindings. |
| `src/ui/hud.ts` | HUD and inventory DOM rendering. |
| `src/ui/chat.ts` | Chat UI behavior. |
| `src/wildstat-coop.ts` | Browser-facing multiplayer composition root and connection/reconnect policy; kept below 1,000 lines by a test guard. |
| `src/coop/services/` | Account, base-subscription, presence, profile, progression, chat, duel, boss, and developer service ownership. See `docs/wildstat-coop-modularization.md`. |

Keep static definitions and pure calculations outside `main.ts`. `main.ts` is a composition root, not a feature destination. Add a runtime/UI controller with an explicit input/output boundary, then wire it from `main.ts`. Keep mutable combat state together until it has that boundary; splitting individual functions that share hidden state creates harder coupling, not useful modularity.

## Required change rules

- Mobile is the primary product target. Validate narrow portrait touch layout, readability, safe areas, lifecycle behavior, and low-end-device performance before desktop compatibility. Desktop must preserve mobile-sized content spacing.
- Project owner owns all visual and play-feel acceptance testing. Agents should run automated structural, logic, build, protocol, migration, and asset-path checks, then identify visual changes for owner review instead of performing extended visual QA unless explicitly requested.
- Change source files under `src/`; never edit generated browser bundles or SpacetimeDB bindings by hand.
- Keep only runtime-loaded media under `public/assets/`; place original or unused vendor art under `art-source/`.
- Run `npm run build:client` before every player-facing commit. Generated `dist/` files are never committed; GitHub Pages builds the same artifact in CI.
- Run `npm run typecheck:coop`, `npm run test:unit`, `npm run build:client`, `npm run check:release`, and `git diff --check` before release.
- Run `npm run test:unit` when changing combat, inventory, duel replay, or progress persistence rules.
- Use the prepared countdown flow in [scheduled-releases.md](scheduled-releases.md) for planned releases after its one-time activation. `npm run release:live` remains the immediate client-only hotfix path. Use `npm run release -- <version>` only when preparing release/cache versions manually, then add the matching entry in `src/app/changelog.ts`.
- For incompatible server changes, update the shared protocol constant, publish Maincloud and matching map shards, regenerate bindings when reducer/schema signatures change, then deploy the matching client.
- Never publish production with destructive database flags.
- Keep pending saves scoped to player identity. Never share browser-pending progress across guest and account identities.
- Never reuse `player_research.frontier_mastery`. It is a zeroed, migration-only column retained because Maincloud cannot remove it non-destructively; no client or gameplay rule may read it.
- Keep the shared rendering pipeline: worker-built static tiles, the WebGL world layer, and Canvas2D actors/fallback. Use measured low-end-device results before adding another renderer. See `docs/mobile-performance.md`.

## Prioritized improvement backlog

### Must address before a large public beta

1. **Enforce progress privacy on the server.** `player_progress`, `player_research`, and `player_lifetime` are public tables even though the official client requests identity-scoped rows. Client filters are not access control. Replace direct table exposure with owner/profile views.
2. **Load-test movement and reconnect storms.** Test 25, 50, and 100 clients with movement, reconnects, chat, research completion, and duel requests. Record reducer rate, egress, CPU, errors, and recovery time before raising the player cap.
3. **Re-enable movement distance bans.** Speed violations already restrict the session immediately. Distance violations only reject the offending packet, because automatic banning is paused while the signal is validated against legitimate boss knockback (`applyMovementState`, `spacetimedb/src/index.ts`). Finish that validation and either enable the ban or document the rejection-only behavior as final.

### Progression authority (implemented)

Recorded here because the backlog above previously described the opposite, and the code is the source of truth.

- `savePlayerProgress` declares client stat fields (`maxHp`, `damage`, `armor`, `regen`, `speed`, …) but **ignores every one of them**. The saved row is built from `base.*` — the server's existing stored progress — plus server constants. Only equipment and cosmetic slot selections cross the wire, and those are validated against owned inventory.
- `recordEnemyDefeats` is the reward path: only enemy identities and counts are sent; all reward values are server-owned, bounded by `maximumBossCombatForProgress` and `acceptEnemyDefeats`, with violations routed to `restrictDefeatSession`.
- `recordCombatCheckpoint` is retired and throws unconditionally. Never accept its supplied totals.
- The unused stat fields in the `savePlayerProgress` signature are vestigial. Removing them is a reducer-signature change: it requires regenerated bindings and a matching client, so it belongs in a planned release, not a hotfix.

### Boss combat ownership (client-sided)

`PERSONAL_BOSS_COMBAT` in `shared/personal-bosses.ts` is `true`. Boss combat runs locally in `src/game/runtime/personal-bosses.ts`, which owns HP, alive/dead state, respawn timing, and the defeat result. The client reports only the completed defeat through `recordRegularEnemyDefeat`.

Consequences to keep in mind before changing boss code:

- The server's shared-boss surface is installed but unreached: the per-species `damage*FromPosition` reducers, the `respawn*` reducers and their scheduled tables, and the `*_boss` / `*_contribution` / `*_attack_window` / `*_result` table sets. The `boss:` subscription scope is never requested (`subscribeBosses` is hardcoded `false`), so those tables never deliver rows.
- `reward*Contributor` and `applyBossRepeatableReward` are **not** dead. They still carry live reward logic reached through `shardRewardHandlers` from `recordEnemyDefeats` and `deliverShardReward`. Preserve them through any cleanup.
- Schema tables are retained deliberately, not by oversight. `boss_attack_frame`, `boss_defeat_window`, `boss_map_defeat_window`, and the legacy procedural boss tables are inert because removing a populated table needs a destructive publish. See `docs/legacy-cleanup-audit-2026-08-30.md`.
- Removing the dead reducers is a schema change that must go through the prepared rollout path with a `Compatible` preflight — never `release:live`.

### Next architectural work

1. Keep `src/wildstat-coop.ts` as the sub-1,000-line composition root. New multiplayer state belongs in the service map documented by `docs/wildstat-coop-modularization.md`; connection lifecycle and cross-service policy remain in the façade.
2. Keep splitting `spacetimedb/src/index.ts` by domain. The pattern, established 2026-09-20 across `boss-combat.ts`, `account-lifecycle.ts`, `module-migrations.ts`, `presence-runtime.ts` and `duel-runtime.ts`: reducer, procedure, view and table declarations stay in `index.ts` (they are the published schema; fixtures call `server.<name>`); bodies and helpers move; a side module imports from `./index` only as `import type`, and anything it still needs from `index.ts` arrives through a `createX(deps)` factory that destructures `deps` at the top, so the moved code stays byte-identical. Verify an extraction with typecheck, the full suite, `npm run spacetime:generate` producing an empty bindings diff (the schema did not move), and `npm run spacetime:build`; `spacetimedb/src/index-boundary.test.ts` ratchets the line count. Two things are pinned in place: `enterWorldPresence`, because `scripts/cutscene-history-contract.test.ts` reads its source from `index.ts` (move the test's read target first), and the cutscene/tutorial helpers for the same reason. Remaining candidates by size: the `savePlayerProgress`, `changeMap` and `devUpdatePlayerSave` bodies, `refreshLeaderboard`, chat send, and the virtual-player load-test reducers.
3. Consider splitting the base-subscription registry into gameplay and account/UI ownership modules only if both still share one hydration boundary and preserve the SDK initial-callback suppression rule.
4. Add automated tests for reset/account migration, identity-scoped pending saves, scheduled research repair, subscription cancellation, projectile collision, and boss hitbox range.

### Known server costs (measured 2026-09-20)

Measured against live Maincloud while the world held 268 players. Recorded so
the next person starts from numbers rather than guesses.

1. **Invisible players hold shard slots.** `assignMapShard` runs before any
   visibility check, so a player with multiplayer off still occupies a slot and
   a shard connection. Sampled occupancy: cloudspire 20 occupants / 1 visible,
   advanced_lava_wastes 19 / 1, moonfen 19 / 1, beginner_desert 18 / 4 — roughly
   90% of capacity held by players who can neither see nor be seen. This is why
   the fleet needs so many shards for so few interacting players, and it is the
   largest remaining cost. It is also the riskiest change: shard assignment
   caused an outage on 2026-09-19, so treat it as its own piece of work.
2. **`player_name_tag` is subscribed whole and unfiltered** in the base
   subscription. It grows with every player who has ever set a guild or dev tag
   and is scoped to neither the current map nor visible players.
3. **`publishMapFrames` reads every `playerMotion` row** when any map has two or
   more visible players. Measured as negligible — at most 20 rows at 1 Hz per
   shard, and the shard only publishes while two players can see each other. The
   comment in place already rejects an index here; adding one would cost writes
   on a hot table to save nothing. Do not "fix" it without new measurements.
4. **Reducer compute is paid per database call, not per line of code.** From
   the dashboard exports on 2026-09-20 (368 online): `change_map` ran 37 times a
   minute at ~24 ms each and was 30% of all reducer compute; `update_movement_state`
   ran 600 times a minute at 0.5 ms. A CPU profile of the module code for a map
   change is under 10 µs, and its rows are under 1 KB, so the difference is the
   45–50 host calls a change made versus a handful. About a third of those were
   the same row read again (`shard_runtime` five times, the shard membership
   four, the motion row four). `transitionPlayerMap` now reads each once and
   hands them to the presence and sharding helpers through their optional
   `known` argument, Home no longer rewrites the 1.7 KB balance pin on either
   leg, and schedule existence checks use `count()` instead of a scan.
   `change-map-host-calls.test.ts` holds the count at 37 (Home toggle) and 42
   (portal). Connect (`enter_world_with_tutorial`, ~100 ms) and disconnect
   (~75 ms) are the next targets by the same measure; count their calls first.

What the eye already sheds, for reference: live steering collapses to one packet
per 30 seconds, the motion-interest row is deleted, detail-frame publishing stops
re-arming, the remote subscriptions are released, and `set_speed` is held until
presence returns.

### Quality improvements

1. Add a disposable lifecycle for intervals and global event listeners. Current singleton startup is safe, but hot reload, embedded navigation, and automated tests can register duplicates.
2. Replace remaining HTML-string UI construction with DOM nodes or escaped templates as player-controlled content expands.
