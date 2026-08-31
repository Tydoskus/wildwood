# Legacy and schema cleanup audit — 2026-08-30

Baseline: Wildstat v0.571 (`7167fd8`). The production SpacetimeDB snapshot had 90 tables, 75 reducers, 8 views, and module migration version 19.

## Compatibility surfaces retained

| Surface | Current evidence | Decision |
| --- | --- | --- |
| `playerMapMarker` | Current clients use `playerMapFrame`; production still has 2 marker rows. | Keep the physical table and lifecycle-only writes. Removing it requires an intentionally destructive schema replacement. |
| `playerMotionFrame` | No current publisher or client; production has 0 rows. | Keep the inert table until a planned destructive schema reset. |
| `bossAttackFrame` | Boss presentation is reconstructed without it; production has 0 rows. | Keep the inert table until a planned destructive schema reset. |
| `player.hp` / `player.maxHp` | Current HP is local-only. Both production player rows contain non-default compatibility values. | Keep the columns and continue ignoring them. Do not reuse them. |
| `playerResearch.frontierMastery` | Tier II is retired; all 29 production research rows have zero in this column. | Keep the zeroed physical column until a planned destructive schema reset. |
| `playerMotion.inputIntervalMicros`, old zone fields, and old active-upgrade fields | Present only for additive-schema compatibility. | Keep; do not build new behavior on them. |

## Protocol surfaces retained pending an explicit cutoff

- `syncPosition` is the pre-v0.424 movement bridge and has no current caller.
- `damageDragon`, `damageDragonBatch`, and `damageSpiderBatch` have no current client caller; current boss attacks use the position-bearing reducers.
- `localMovementDemand` has no current client subscription.
- The first-release update-resume bridge (v0.420), pre-server local progress import, and old developer access-audit API still protect cached tabs, returning saves, or the browser API contract.

These can be removed together only after choosing a minimum supported client version, bumping the protocol boundary, regenerating bindings, and testing forced-update behavior. They were not removed opportunistically in this pass.

## Cleanup completed

- Removed the superseded all-in-one UI factory while retaining the current split factories.
- Removed dead exports, imports, type aliases, duplicate renderer code, and unused static-tile drawing paths.
- Removed stale CSS selectors with no DOM/runtime producer.
- Enabled unused-local and unused-parameter checks for both client and server TypeScript.
- Moved 21 unique retired assets (about 11 MB) from `public` to `art-source/retired/runtime-assets` and removed 10 redundant public icon copies whose vendor originals remain in `art-source`.
- Removed ignored `.DS_Store` files from `public` so they are not copied into release builds.

Generated `src/module_bindings` files remain untouched because the server schema did not change.

## Future destructive cleanup window

If a database reset is ever approved, first export durable player/account/progress data, rehearse restoration locally, remove the inert tables and physical compatibility columns in one schema boundary, regenerate bindings, run the complete client/server suite, and only then schedule the production replacement. No destructive database action was taken during this audit.
