# Wildwood Engineering Notes

This file records module boundaries, change rules, and known technical work. Read it before changing gameplay, networking, persistence, or deployment behavior.

## Client structure

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | Runtime orchestration: mutable session state, game loop, combat updates, rendering order, input wiring, and screen transitions. |
| `src/game/constants.ts` | Shared gameplay and world constants. |
| `src/game/enemies.ts` | Enemy definitions, camp definitions, reward labels, and enemy sprite loading. |
| `src/game/world.ts` | World decoration, road layout, and enemy spawn-site generation. |
| `src/game/duel.ts` | Duel constants and pure replay simulation helpers. |
| `src/game/canvas.ts` | Reusable canvas path and pixel-shape primitives. |
| `src/game/inventory.ts` | Inventory normalization, item definitions, and serialization. |
| `src/game/runtime/` | Typed runtime systems: audio, camera, combat effects, enemy lifecycle, world/boss/actor rendering, DOM contracts, and shared runtime state models. |
| `src/ui/hud.ts` | HUD and inventory DOM rendering. |
| `src/ui/chat.ts` | Chat UI behavior. |
| `src/wildwood-coop.ts` | SpacetimeDB connection, authentication, subscriptions, persistence, chat transport, and duel transport. |

Keep static definitions and pure calculations outside `main.ts`. Keep mutable combat state together until a subsystem has an explicit input/output boundary; splitting individual functions that share hidden state creates harder coupling, not useful modularity.

## Required change rules

- Change source files under `src/`; never edit generated browser bundles or SpacetimeDB bindings by hand.
- Keep only runtime-loaded media under `public/assets/`; place original or unused vendor art under `art-source/`.
- Run `npm run build:client` before every player-facing commit. Generated `dist/` files are never committed; GitHub Pages builds the same artifact in CI.
- Run `npm run typecheck:coop`, `npm run test:unit`, `npm run build:client`, `npm run check:release`, and `git diff --check` before release.
- Run `npm run test:unit` when changing combat, inventory, duel replay, or progress persistence rules.
- Use `npm run release -- <version>` for release/cache versions, then add the matching entry in `src/app/changelog.ts`.
- For incompatible server changes, update both protocol constants, publish Maincloud, regenerate bindings when reducer/schema signatures change, then deploy the matching client.
- Never publish production with destructive database flags.
- Keep pending saves scoped to player identity. Never share browser-pending progress across guest and account identities.

## Prioritized improvement backlog

### Must address before a large public beta

1. **Make progression server-authoritative.** `savePlayerProgress` currently accepts client-supplied upgraded stats up to broad limits. A modified client can grant itself health, damage, armor, regeneration, or boots. Replace arbitrary stat saves with server reducers for verified rewards, inventory grants, and boss/enemy completion.
2. **Add area-of-interest subscriptions.** Every client still subscribes to every active player and receives movement updates globally. Sector or cell subscriptions remain the main bandwidth/cost requirement before high concurrency.
3. **Enforce progress privacy on the server.** `player_progress` is public and the official client requests only its own row. A client-side filter is not a security boundary. Verify SpacetimeDB row-access support for the deployed version and expose only owner progress.
4. **Load-test movement and reconnect storms.** Test 25, 50, and 100 clients with movement, reconnects, chat, and duel requests. Record reducer rate, egress, CPU, errors, and recovery time before raising the player cap.

### Next architectural work

1. Continue splitting `src/wildwood-coop.ts` into connection/auth, player presence, chat, and duel services. Progress rules, storage migration, and duel cooldown storage now live in `src/coop/services/`; connection lifecycle remains in the façade.
2. Split `spacetimedb/src/index.ts` by table/reducer domain where the SpacetimeDB module toolchain permits it: identity/profile, presence, progression, chat, and duels.
3. Replace duel lookup scans with indexed lookup tables or explicit participant indexes. Several reducers iterate the duel table to locate a participant.
4. Add automated tests for reset/account migration, identity-scoped pending saves, projectile collision, and dragon hitbox range.

### Quality improvements

1. Seed world generation so layouts can be reproduced in bug reports and tests.
2. Add a disposable lifecycle for intervals and global event listeners. Current singleton startup is safe, but hot reload, embedded navigation, and automated tests can register duplicates.
3. Replace remaining HTML-string UI construction with DOM nodes or escaped templates as player-controlled content expands.
4. Add performance counters for frame time, active projectiles, particles, enemies, remote players, and subscription errors behind a developer toggle.

## Current extraction result

`src/main.ts` is strict TypeScript: no file-level suppression. Typed runtime systems now own audio, camera, combat effects, enemy lifecycle, and world/boss/actor rendering. This reduced `main.ts` from 4,892 to 4,070 lines. Further extraction should follow explicit subsystem boundaries above rather than targeting line count alone.
