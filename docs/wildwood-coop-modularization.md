# Multiplayer client module map

`src/wildwood-coop.ts` is the browser-facing composition root. It preserves the existing `window.wildwoodCoop`, named export, default export, and Vite entry contract, but it must remain below 1,000 lines. `src/coop/wildwood-coop-boundary.test.ts` enforces that limit.

The original extraction was behavior-preserving. Later realtime protocol work changed generated bindings and subscription queries without moving those responsibilities back into the composition root; public method names and ownership boundaries remain stable.

## Ownership

| Module | Owns |
| --- | --- |
| `src/wildwood-coop.ts` | Runtime composition, reducer error policy, connection/reconnect orchestration, one world-entry gate, browser lifecycle wiring, and the public façade. |
| `src/coop/contracts.ts` | Public multiplayer data contracts re-exported by the façade. |
| `src/coop/ports.ts` | Narrow reducer and change-notification ports shared by services. |
| `src/coop/services/account-service.ts` | Guest/account credentials, PKCE callback, account migration, session takeover intent, remembered character metadata, and account-facing API methods. |
| `src/coop/services/base-subscription.ts` | Base query list, SDK table callback registration, one cache hydration boundary, and initial callback suppression. |
| `src/coop/services/presence-service.ts` | Local state, stable map-wide presentation cache, nearest-five interpolation, movement and speed reducers, packed minimap/death/boss-attack frames, map handoff, and online count. |
| `src/coop/services/player-profile-service.ts` | Temporary profile loads, leaderboard snapshots, profile-map presentation, timeout/cancellation, and cached profile assembly. |
| `src/coop/services/profile-directory.ts` | Identity-to-name/appearance/account presentation and profile mutation reducers. |
| `src/coop/services/progression-service.ts` | Identity-scoped pending saves, progress/research/upgrades/Gems/lifetime state, save cadence, drops, and progression reducers. |
| `src/coop/services/chat-service.ts` | Chat cache, presentation revision, send/reply/report reducers, and chat API methods. |
| `src/coop/services/duel-service.ts` | Duel state, cooldown, snapshot drain, replay loads/cancellation, pulse, and duel API methods. |
| `src/coop/services/boss-service.ts` | Shared boss/result state and boss damage reducers. |
| `src/coop/services/developer-service.ts` | Access audit, bug reports, visibility, save/Gem administration, and developer API methods. |

## Boundaries that must remain intact

1. Connection order is `connect -> register protocol -> claim guest account -> optional takeover -> enter world -> install listeners/subscription -> hydrate`.
2. Base hydration reads SDK caches once inside one batched boundary. Initial insert callbacks remain suppressed until the microtask after `onApplied`.
3. Movement, minimap, boss-attack, and death frame handlers update render-facing buffers without calling the application-wide change listener.
4. Remote presentation uses one stable subscription per map. Map changes use an ordered unsubscribe/subscribe handoff with a pending-transition guard; camera movement must never replace that subscription.
5. Profile, leaderboard, and replay loads cancel on timeout, switch/close, disconnect, or stale connection.
6. Pending progress is keyed by identity. It drains before guest-account migration and before duel snapshots, and remains stored when a protocol update blocks the old client.
7. A websocket is not playable world presence. `enter_world` remains the single explicit gate.
8. Short visibility resumes retain a healthy socket; long resumes perform one reducer probe before reconnecting.

## Adding a multiplayer feature

- Put durable/public shapes in `contracts.ts` and keep the façade re-export stable.
- Give mutable state to one domain service. Pass capabilities through a narrow dependency object instead of importing the façade.
- Add table callbacks and initial-cache iteration together in `base-subscription.ts`.
- Decide whether the data is a hot render lane or a control/UI lane before calling `notify`.
- Add session cleanup and temporary-subscription cancellation with the feature.
- Run `npm run typecheck:coop`, `npm run test:unit`, `npm run build:client`, `npm run check:release`, and `git diff --check`.

## Later optimization opportunities

These are notes for a future pass, not changes included in the modularization:

- Replace the deliberately generic row-handler registry in `base-subscription.ts` with row types derived from generated bindings. This removes the remaining `any` boundary without hand-maintaining dozens of duplicate row interfaces.
- Split `account-service.ts` into pure credential storage, PKCE/OAuth, and connected-session policy once those pieces have dedicated tests. Its current single ownership boundary was safer for preserving migration order.
- If presence grows again, separate interpolation/render buffers from SpacetimeDB query ownership. Keep them together until tests can assert map transitions, sparse movement, and hot-lane notification counts across the seam.
- Introduce a reusable bounded temporary-subscription helper for leaderboard, player-profile, and duel-replay loads. It should encode success, error, timeout, cancellation, stale connection, and unsubscribe-before-handle-assignment.
- Add a shared disposable scheduler for intervals, timeouts, and page lifecycle listeners. Services currently expose or internally manage cleanup, but the singleton browser runtime has no unified teardown owner.
- Inject clock, storage, location, and window adapters into account/progression/presence services to make reconnect, token expiry, save cadence, and visibility behavior deterministic in unit tests.
- Evolve `ReducerPort` into a generated, typed command gateway so reducer error/latency policy stays centralized without repeating reducer signatures.
- Replace profile presentation retention checks with explicit source leases (active-map presentation, chat, leaderboard, open profile). This would make eviction ownership easier to inspect than cross-domain lookups.
- Narrow game/UI consumers away from the full `wildwoodCoop` object toward typed per-feature ports. Preserve the public object until all callers and browser integrations have migrated.
- Add development-only counters for active handles and queries per handle, plus assertions after disconnect. The current `subscriptionCount` is intentionally a lightweight UI diagnostic.
- If map-entry presentation snapshots become expensive at much larger populations, prototype a revisioned request-once catalog or packed string dictionary. Keep it independent from analytical motion anchors and the two bounded packed publications.
- Benchmark bundle output and reconnect/movement load after the structural change before attempting memoization, allocation pooling, or cadence changes. Those are performance changes and should not be bundled with ownership refactors.
