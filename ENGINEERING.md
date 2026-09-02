# WildStat Engineering Notes

This file records module boundaries, change rules, and known technical work. Read it before changing gameplay, networking, persistence, or deployment behavior.

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
- Use `npm run release:live` for a complete client-only release. Use `npm run release -- <version>` only when preparing release/cache versions manually, then add the matching entry in `src/app/changelog.ts`.
- For incompatible server changes, update both protocol constants, publish Maincloud, regenerate bindings when reducer/schema signatures change, then deploy the matching client.
- Never publish production with destructive database flags.
- Keep pending saves scoped to player identity. Never share browser-pending progress across guest and account identities.
- Never reuse `player_research.frontier_mastery`. It is a zeroed, migration-only column retained because Maincloud cannot remove it non-destructively; no client or gameplay rule may read it.
- Keep one Canvas2D renderer with worker-built static tile caching. Reconsider GPU rendering only after measured low-end-device benchmarks or a deliberate full-renderer migration.

## Prioritized improvement backlog

### Must address before a large public beta

1. **Make progression server-authoritative.** `savePlayerProgress` currently accepts client-supplied upgraded stats up to broad limits. A modified client can grant itself health, damage, armor, regeneration, or boots. Replace arbitrary stat saves with server reducers for verified rewards, inventory grants, and boss/enemy completion.
2. **Validate movement distance server-side.** Sequence and world bounds are enforced, but a modified client can still jump between arbitrary in-bounds coordinates. Add a server-clocked movement budget that accommodates network bursts and boss knockback.
3. **Enforce progress privacy on the server.** `player_progress`, `player_research`, and `player_lifetime` are public tables even though the official client requests identity-scoped rows. Client filters are not access control. Replace direct table exposure with owner/profile views.
4. **Load-test movement and reconnect storms.** Test 25, 50, and 100 clients with movement, reconnects, chat, research completion, and duel requests. Record reducer rate, egress, CPU, errors, and recovery time before raising the player cap.

### Next architectural work

1. Keep `src/wildstat-coop.ts` as the sub-1,000-line composition root. New multiplayer state belongs in the service map documented by `docs/wildstat-coop-modularization.md`; connection lifecycle and cross-service policy remain in the façade.
2. Split `spacetimedb/src/index.ts` by table/reducer domain where the SpacetimeDB module toolchain permits it: identity/profile, presence, progression, chat, and duels.
3. Consider splitting the base-subscription registry into gameplay and account/UI ownership modules only if both still share one hydration boundary and preserve the SDK initial-callback suppression rule.
4. Add automated tests for reset/account migration, identity-scoped pending saves, scheduled research repair, subscription cancellation, projectile collision, and boss hitbox range.

### Quality improvements

1. Seed world generation so layouts can be reproduced in bug reports and tests.
2. Add a disposable lifecycle for intervals and global event listeners. Current singleton startup is safe, but hot reload, embedded navigation, and automated tests can register duplicates.
3. Replace remaining HTML-string UI construction with DOM nodes or escaped templates as player-controlled content expands.
4. Add performance counters for frame time, active projectiles, particles, enemies, remote players, and subscription errors behind a developer toggle.

## Current extraction result

`src/main.ts` is strict TypeScript with no file-level suppression. Typed controllers now own assets, bootstrap, canvas, player/combat/enemy simulation, bosses/maps, persistence, rendering, duels, sessions, and UI windows. `main.ts` was reduced from 5,080 to 973 lines. Preserve the under-1,000-line composition-root boundary; do not add new game systems there.
