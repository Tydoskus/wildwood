# Home travel cost review — September 15, 2026

> Note (2026-09-21): written while each map ran as its own shard database. Map sharding has since been removed and every player runs on the root, so mentions of shards, admissions and shard routing below are historical. See "Why sharding was removed" in [SPACETIME.md](SPACETIME.md).

## Current path

The client drains pending enemy rewards before change_map. Home saves the departure point and takes the normal transitionPlayerMap path: player snapshot update, motion reset, identity/marker updates, and schedule checks. Entering Home releases the combat shard, adjusts its occupant count, invalidates admission/snapshot state and installs a transfer barrier. Returning allocates/adopts a shard admission again, and the client waits for its connection, protocol registration, admission and hydration. Home movement is handled by the root even though no other player sees it.

This code explains work that can be avoided; no claim is made about what fraction of live change_map CPU is Home without destination-tagged measurements.

## Recommendation

Treat Home as a private local scene backed by a small authoritative Home-visit state, not an off-screen location inside the shared combat world.

1. Enter: drain rewards, validate controller/alive/duel/cooldown once, record return position, suspend the player's combat/reward authority and visibility. Keep a bounded return reservation when the shard is healthy; reclaim it after a timeout rather than reserving capacity indefinitely.
2. Home movement, rendering, benches' proximity UI and assets stay local. Stop publishing Home motion. Keep the root account/chat connection. Retain or suspend the combat transport only when doing so actually avoids extra traffic and cannot leave active presence/reward access.
3. Bench/research actions remain server-validated for Home state, ownership, currency, jobs and allowed location/action. Upgrade completion must not depend on a live Home scene.
4. Leave: clear the visit state and resume at the stored position with fresh state/authority validation. Reuse the healthy admission when possible; perform normal admission when expired, full, replaced, disconnected or updated. Preserve rewards before leaving, death handling, duels from Home, account changes and reconnect recovery.

A small entry/exit server transaction is still required for authoritative state. Zero *change_map* calls for Home is feasible with dedicated visit actions; zero server compute is not the right target. Procedures that write state still incur compute. An off-screen coordinate alone does not avoid the current transfer path and would mix incompatible world/presence behavior.

## Rollout order

Measure Home vs other transitions and movement volume, then implement the isolated Home-visit path with lifecycle tests. Validate rapid double taps, pending rewards, completed upgrades, logout/reconnect in Home, expired shard reservations, release updates, guest registration and duels. Keep normal map portals on the existing validated path. This is a proposed follow-up, not implemented in the paused release.
