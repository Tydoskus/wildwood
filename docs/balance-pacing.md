# Campaign pacing adjustments — initial reward-only pass

Initial pacing defaults, separate from the exact revision 73 runtime bake. Superseded by the combined HP/reward curves shipped in 0.819.

The initial pass changed only regular and elite stat rewards. The subsequent [HP smoothing pass](campaign-health-smoothing.md) adds separate enemy HP curves and refits these rewards; it supersedes the figures below. Damage, bosses, loot, research costs and respawn timers remain unchanged. The existing final-map reward inheritance is offset in the Endless reward factor, preserving Endless values (apart from floating-point multiplication round-off).

## Measured forecast

Sum of map medians: **46.78 → 47.09 hours**. Independent seed: **50.30 → 50.60 hours**.

| Map | Before | After | Reward factor |
|---|---:|---:|---:|
| Tutorial Forest - 1 | 0.75h | 0.75h | 1.0000× |
| Beginner Desert - 2 | 0.42h | 0.95h | 0.2923× |
| Intermediate Snowlands - 3 | 1.73h | 1.50h | 1.1207× |
| Advanced Lava Lake - 4 | 1.66h | 1.94h | 0.7995× |
| Night Forest - 5 | 2.40h | 2.14h | 1.0916× |
| Water Reach - 6 | 3.19h | 2.45h | 1.3300× |
| Samurai Garden - 7 | 2.64h | 2.75h | 0.9437× |
| Cloudspire - 8 | 2.72h | 3.12h | 0.8610× |
| Moonfen - 9 | 4.36h | 3.42h | 1.3042× |
| Crystal Hollows - 10 | 4.58h | 3.69h | 1.2394× |
| Clockwork Ruins - 11 | 4.70h | 4.08h | 1.1977× |
| Duskfall Orchard - 12 | 4.74h | 4.44h | 1.1190× |
| Neon Bastion - 13 | 4.33h | 5.00h | 0.8746× |
| Verdant Catacombs - 14 | 4.95h | 5.36h | 0.9500× |
| Ion Citadel - 15 | 3.62h | 5.49h | 0.6480× |

All five checked scenarios have zero maps shorter than the preceding map: 20 reference seeds, 20 alternate seeds, nearby farming, efficient farming, and research/slot upgrades disabled (five trials each for the last three). The alternate seeds participate in constraint fitting; they are a sensitivity check, not an unseen statistical holdout.

These are modeled active-play durations, not a promise for every player. Prestige, Utility research, bow procs, offline play, deaths, and multiple upgrade queues are not modeled.

## Application and verification

- `shared/campaign-pacing-rewards.ts` stores complete factors relative to the baked baseline. `defaultBalanceSettings()` applies them once.
- The local database has no saved balance head, so the local server uses these defaults. Existing visits keep their pinned snapshot; go home and re-enter the map to load the new values.
- Migration 43 activates the combined HP/reward curves in release 0.819 as a new balance revision, preserving archived settings and existing map visits.
- `shared/balance-bake.test.ts` still verifies the unchanged revision 73 golden hashes. `shared/campaign-pacing-rewards.test.ts` checks the intentional reward-only differences and all Endless depths through the cap.
- Reproduce fitting and verification with `npm run balance:pacing`. The report, complete `proposed-balance-settings.json`, simulator configuration and raw runs are written to `local-data/balance-pacing`.
- Current reviewed run: `local-data/balance-pacing-reviewed/report.md` and `proposed-balance-settings.json`. Do not apply the factors on top of already paced defaults.
