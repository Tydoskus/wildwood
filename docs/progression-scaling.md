# Progression Scaling Contract

This document is the durable balance contract for Wildwood's campaign. New maps, enemies, bosses, equipment, and migrations should preserve these rules unless the design direction is deliberately changed. The canonical runtime constants live in `shared/rules.ts` and `shared/items.ts`; the Balance Lab is the executable check on this contract.

## Hard progression contract

- **Tutorial Forest is onboarding.** Teach movement, targeting, rewards, equipment, a full-map clear, and a boss without forcing Forest onto the late-game geometric curve. The simulator's current 22.5-minute Forest value is an estimate, not a pacing target.
- **Beginner Desert is the pacing baseline:** 7,200 seconds (2 hours) for the median simulated boss-rush campaign.
- **Each later map targets 1.35 times the previous map's duration.** For progression-map index `n`, where Desert is `n = 0`, use `7,200 × 1.35^n` seconds.
- **Each post-Forest map targets about 200 times player-power growth from map entry to exit.** Measure effective power after equipment and research with the shared `playerPowerForStats` calculation. Do not substitute raw damage for power.
- **Growth inside a map must be visible and smooth.** Distribute meaningful gains throughout the map, including its opening section. Avoid long flat stretches, one dominant farm camp, and a boss reward that supplies most of the map's total growth.
- **The boss is a capstone and the unlock gate for the next map.** It should test the build earned in that map, not replace the regular-enemy progression runway.
- **Equipment bonuses stack additively.** Add weapon, head, chest, and research bonuses to the base `1×` multiplier; never multiply equipment pieces into one another.
- **An item upgrade adds 8% of that item's level-zero bonus per level.** Upgrades are linear and capped at level 10. For example, a `+100%` item bonus becomes `+108%` at level 1 and `+180%` at level 10; it does not compound.
- **Equipment never grants attack speed.** Persisted/base attack speed is capped at 2.625 attacks per second (`MIN_ATTACK_INTERVAL = 1 / 2.625`). Keep attack-speed progression out of item definitions and item upgrades.

The authored duration ladder through the Water map is:

| Map | Progression index | Exact target | Decimal hours |
| --- | ---: | ---: | ---: |
| Tutorial Forest | onboarding | current estimate: 0:22:30 | 0.375 |
| Beginner Desert | 0 | 2:00:00 | 2.0000000 |
| Intermediate Snowlands | 1 | 2:42:00 | 2.7000000 |
| Advanced Lava Lake | 2 | 3:38:42 | 3.6450000 |
| Night Forest | 3 | 4:55:14.700 | 4.9207500 |
| Water Reach | 4 | 6:38:34.845 | 6.6430125 |

Do not round the constants used by code. Rounded labels are fine in the UI.

## What “power” means

Balance Lab uses the shared effective-stat calculation, including additive equipment, upgrades, and research. Canonical player power is:

```text
damage × (default attack interval / effective attack interval)
  + max health
  + armor × 3
  + regeneration × 10
```

This score is a progression budget, not a claim that every point is equally useful in every encounter. Check damage, health, armor, regeneration, time to kill, and incoming hit size alongside it.

## Diagnostic bands

These bands make randomized simulations actionable without pretending they are exact design laws. Treat them as release guardrails and investigate misses before changing the contract.

- **Map duration:** median duration should be 75%–125% of its exact target. A censored map that fewer than half of trials complete is not evidence of a pass.
- **Power growth:** median entry-to-exit growth should be 65%–150% of the 200× budget (130×–300×). The center remains 200×; the wide band absorbs loot timing rather than redefining the target.
- **Stat mix:** post-Forest regression tests target median effective damage/max-health between 0.60 and 1.25. The simulator's broader warning envelope of 0.25–1.50 is only triage. Late-map authored rewards should end close to parity so damage does not accelerate farming faster than survivability can grow.
- **Boss readiness:** the default policy attempts a solo boss after one complete spawn-site clear and once estimated solo TTK is at most 5 minutes. This is an attempt policy, not a hidden boss-HP multiplier. A completed boss fight should not consume more than 25% of median map time.
- **Regular-enemy survivability:** use `damageAfterArmor`, `hitPercentOfHealth`, and `hitsToDefeatPlayer` at the representative map-entry build. Night Forest's enforced late-map reference is 3%–8% effective max health per hit, or 13–28 hits to defeat the player. Begin Water tuning in the same readability band. Never ship a map where most regular enemy types one-hit the representative entry build; telegraphed boss mechanics require separate encounter testing because the simulator does not model dodging.
- **Reward-track health:** compare `combatPowerPerMinute` at frozen map-entry stats. The most productive regular enemy must remain below 4× the middle productive enemy, or rational play collapses into one camp. Prefer smaller, more frequent gains when the early power line is flat.
- **Loot variance:** investigate when final P90 power exceeds P10 by more than 1.75×. Fix drop timing or deterministic progression before compensating with blanket enemy-stat changes.

Percentile bands describe outcomes across deterministic seeded loot trials: P10 is an unlucky run, P50 is the median, and P90 is a lucky run. Balance primarily around P50, then make sure P10 remains playable and P90 does not skip the map.

## Balance Lab workflow

1. Run the canonical baseline with `npm run balance:simulate`. Whenever a map is added, include its boss, spawn sites, rewards, drops, and exact duration target in the default campaign window.
2. Change one variable at a time with map what-if controls, for example `npm run balance:simulate -- --map infernal_depths:hp=1.2,damage=.9,reward=1.1`. Use the same seed and trial count for comparisons.
3. Read the power-over-time curve before the final totals. A map can hit its exit target while still having a bad flat opening or a single reward spike.
4. Check map duration, power growth, effective damage/health, boss TTK, enemy hit size, combat power per minute, and P10–P90 spread together. The simulator intentionally does not model dodging, deaths, recovery routes, boss patterns, encounter resets, or multiplayer contributions, so visually test those separately.
5. After accepting source changes, run:

   ```sh
   npm run test:unit -- src/balance/simulator.test.ts
   npm run typecheck:balance
   npm run build:balance
   ```

6. Keep the simulator and this document in the same change as a new map or a deliberate scaling-policy change. Temporary Balance Lab map multipliers are experiments; they never update game data by themselves.

## When tuning requires migration

Most forward-looking tuning does **not** require rewriting player saves. Enemy HP/damage, future reward amounts, boss HP, drop odds, spawn layout, and simulator thresholds apply to future encounters when their shared/server constants change.

A versioned migration is required when a release must change already-persisted meaning or data, including:

- rewriting existing raw damage, max health, armor, regeneration, or base attack interval;
- compensating only legacy accounts that sit outside the new curve;
- replacing item IDs or changing durable inventory ownership;
- backfilling a new unlock, reward, or schema field for existing players; or
- repairing authoritative boss results, contributions, or other persisted state.

Use the per-player `ATTACK_BALANCE_VERSION` path for account stat transformations and the server's `MODULE_MIGRATION_VERSION` path for one-time global backfills. Make transforms thresholded, monotonic, and rank-preserving when possible; do not normalize ordinary accounts merely because a curve changed. Non-idempotent transforms must run exactly once. A schema/protocol change also requires regenerated SpacetimeDB bindings and the normal protocol-version compatibility review.

Equipment formula changes normally apply dynamically because effective stats are derived from raw progress. Add a migration only when the design also calls for changing stored stats, ownership, upgrade rows, or compensating affected legacy accounts.
