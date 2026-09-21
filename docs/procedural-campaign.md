# Procedural campaign maps

> Note (2026-09-21): written while each map ran as its own shard database. Map sharding has since been removed and every player runs on the root, so mentions of shards, admissions and shard routing below are historical. See "Why sharding was removed" in [SPACETIME.md](SPACETIME.md).

The authored campaign connects from Ion Citadel to **Endless - 1**, then continues through numbered generated maps. A player must defeat Aegis Prime first. Each generated boss clear permanently unlocks the next map. Ordinary deaths retain map access and stats, just like the authored campaign.

## Definition and extension points

- `shared/procedural-maps.ts` owns canonical IDs, deterministic seed/version, connected paths, four stat camps (damage, health, armor, regeneration), palette, arrivals, portals, and balance. The client and server use this same definition.
- `src/game/procedural-maps.ts` turns the definition into spawn sites, one existing enemy species per map, shared by all camps and its larger boss, and sparse rocks/grass. An enemy's combat definition is independent of its sprite. Damage camps retain the six ordinary/seven stronger enemy distribution.
- The existing map registry resolves generated IDs lazily. There is no enormous prebuilt map list. Asset loading resolves only the selected sprites and retains reusable image assets.
- `src/game/runtime/procedural-boss-controller.ts` adapts a generated shared boss to targeting/rendering, with aimed shots, a visible area warning, and collision. Warning and impact use the same simulation clock; suspension restarts the windup, and missing state clears the old target and pending hits. It does not award local boss kills or predict authoritative boss health.
- `spacetimedb/src/procedural-maps.ts` owns shared boss health, attack-window validation, contribution records, respawn, permanent unlocks, and stat rewards. Combat and unlock data use generic tables, not a new table/reducer for every map. Generated boss authority stays on the root account database, keyed by map plus admitted shard database. Separate instances have separate health/contributors; movement and other map traffic retain existing shard routing. The private boss table is exposed through `myProceduralBoss`, which follows the caller’s ready admission.
- `src/coop/services/procedural-map-service.ts` owns one account-scoped root subscription and map/instance/encounter-bound actions. It retries failed subscriptions with backoff and safely disposes abandoned pending subscriptions once applied.

## Adding authored maps before the sequence

Change `PROCEDURAL_ENTRY_MAP`, `PROCEDURAL_ENTRY_BOSS`, and `PROCEDURAL_FIRST_TIER` in the shared definition to the new final campaign map, its completion bit, and its following Desert-relative balance tier. Add that authored map through the normal campaign authoring path. Numbered generated map IDs remain stable.

Keep `PROCEDURAL_MAP_VERSION` stable for released layouts; changing it deliberately changes generated layouts. Decorations stay outside paths, arrival space, camp clearings, and the boss arena.

## Progression and presentation

The first generated map uses the tier immediately after Ion and keeps Ion's relative farming reward pace. Following maps use the existing 3x stat scaling. At balance tier 60, numeric strength stops growing to preserve the existing finite Float32/stat limits; layout generation and saved map progression continue. This is a numerical boundary, not a final map or a reset.

The first ground palette is neutral white/light gray. Each map advances hue by seven degrees and gradually introduces saturation. Palette values are hex so both Canvas and WebGL render the same colors. Decorations are only rocks and grass tufts; enemy sprites and player art retain their original colors.

Generated progress merges when a guest account is linked, and clears on an explicit character reset/deletion. Death does not erase progress. The protocol version is 103; publish root and map modules with the matching client for release.

## Developer travel

In Settings, **ENDLESS · DEV** accepts a positive whole map number and a Go action. The root reducer uses the normal map transition and persists the arrival without awarding stats or boss clears. Developers have access automatically. The database owner can grant/revoke only this capability for a local guest with `dev_set_endless_travel_access(identity, enabled)`. Grants are private; the caller-scoped view exposes only the current player's permission. Do not seed local guest grants into production. Authorized saves can restore an unearned Endless destination after reconnect.

## Verification

Unit and production-reducer fixtures cover canonical IDs, deterministic generation, connected paths, portal links/gates, stat scaling, decoration clearance, lazy asset definitions, connection failures/recovery, stale attacks, instance isolation, shared boss clears, pause-safe windups, reset/guest progress, and runtime respawn/travel. User-owned visual review remains the final check for the palette and layout feel.

## Upgrading the first local prototype

The original `proceduralBoss` and `proceduralContribution` table layouts remain intact for additive upgrades. Instance combat uses `proceduralInstanceBoss` and `proceduralInstanceContribution`; `proceduralProgress` and player saves are unchanged. A legacy unsharded fight and its contributions are copied once when that local boss is prepared. Formerly global sharded fights start fresh per instance because their damage cannot be assigned to one shard. Publish with `--delete-data=never`; no database reset is needed.

Generator version 2 removes attack-speed camps and uses one species per map. Autofarm selects camps independently of their shared sprite, including the damage camp’s reward range.
