# Campaign HP smoothing

Introduced in release 0.819. Every Forest and map 15 enemy keeps its exact authored HP. Boss HP, enemy damage, drops, respawn timing and Endless combat values are unchanged.

## Shape

Each of six enemy roles is fitted separately: regular damage/health/armor and elite damage/health/regen. This avoids using one common factor per map or repeating the same multiplier from map to map. The Forest regen enemy anchors the later regen elite track; Forest itself is unchanged.

`log(HP(t)) = log(start) + (log(end) − log(start)) × t + curvature × t × (1 − t)`

Here `t` runs from 0 at Forest to 1 at map 15. Curvature minimizes squared log error against the existing HP, bounded so growth remains positive and gradually tapers. The endpoints are returned directly, avoiding rounding changes at map 15. Every map/type has its own fitted factor. Unrecognized new enemy roles/maps retain their authored HP until explicitly fitted.

## Before → after

| Map | Regular damage HP | Health elite HP |
|---|---:|---:|
| 1 | 360 → 360 | 500 → 500 |
| 2 | 3.120k → 2.218k | 8.736k → 4.554k |
| 3 | 24.336k → 12.694k | 68.141k → 35.551k |
| 4 | 280.800k → 67.482k | 786.240k → 237.854k |
| 5 | 842.400k → 333.239k | 2.359m → 1.364m |
| 6 | 2.527m → 1.529m | 7.076m → 6.703m |
| 7 | 3.791m → 6.513m | 10.614m → 28.230m |
| 8 | 22.745m → 25.779m | 63.685m → 101.904m |
| 9 | 68.234m → 94.780m | 191.056m → 315.268m |
| 10 | 204.703m → 323.690m | 573.169m → 835.937m |
| 11 | 614.110m → 1.027b | 1.720b → 1.900b |
| 12 | 1.842b → 3.026b | 5.159b → 3.700b |
| 13 | 3.869b → 8.283b | 10.833b → 6.176b |
| 14 | 16.581b → 21.061b | 10.833b → 8.835b |
| 15 | 49.743b → 49.743b | 10.833b → 10.833b |

The health elite plateau at maps 13–15 becomes a gradual increase ending at the same 10,832,893,344 HP. Every other map 15 enemy is unchanged too.

## Saved balance compatibility

- The neutral baked values remain in `enemy-base-values.ts`. The new factors live in `campaign-health-curve.ts`.
- `campaignHealthVersion: 1` enables the curve in balance settings. Defaults enable it; archived settings without the field keep their old HP. No database table or protocol change is needed.
- The resolver applies the health factor once before the existing developer HP multiplier. Saved snapshots remain pinned until the next map visit.
- Migration 43 activates the fitted HP/reward curves as a new balance revision, retaining revision 73 and existing visits. It preserves unrelated tuning and offsets the final-map reward change in Endless.
- `campaign-health-curve.test.ts` checks all roles, both endpoints, exact non-HP equality, and old/new settings round-trips. The existing bake and Endless tests continue to protect all 2,034 original snapshots.
- Regenerate the HP factors with `npm run balance:smooth-health`. Recheck pacing with `npm run balance:pacing -- local-data/campaign-health/pacing --smooth-health`.

## Pacing verification

The reward factors were refitted with the HP curve enabled. All five tested
scenarios have zero shorter maps: reference and alternate 20-run seeds, nearby
farming, efficient farming, and research/slot upgrades disabled. Alternate seeds
participate in fitting, so this is sensitivity testing rather than an unseen holdout.

Reference sum of map medians: **46.78 → 46.71 hours**. Alternate seed: **50.30 → 48.75 hours**.

The complete tested settings are in `local-data/campaign-health/pacing/proposed-balance-settings.json`. Runtime defaults match this file exactly. These are modeled active-play durations, with the simulator limitations listed in the adjacent report.
