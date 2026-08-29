# Progression Scaling Contract

This document is the durable balance contract for Wildwood's campaign. New maps, enemies, bosses, equipment, and migrations should preserve these rules unless the design direction is deliberately changed. The canonical runtime constants live in `shared/rules.ts` and `shared/items.ts`; the Balance Lab is the executable check on this contract.

## Hard progression contract

- **Tutorial Forest is onboarding.** Teach movement, targeting, rewards, equipment, a full-map clear, and a boss without forcing Forest onto the late-game geometric curve. The simulator's current 22.5-minute Forest value is an estimate, not a pacing target.
- **Beginner Desert is the pacing baseline:** 7,200 seconds (2 hours) for the median simulated boss-rush campaign.
- **Each later map targets 1.35 times the previous map's duration.** For progression-map index `n`, where Desert is `n = 0`, use `7,200 × 1.35^n` seconds.
- **Each post-Forest map targets about 8.5 times player-power growth from map entry to exit.** Measure effective power after equipment and research with the shared `playerPowerForStats` calculation. Do not substitute raw damage for power.
- **The first campaign-wide slowdown belongs near 500,000 power at the Snowlands → Lava Lake handoff.** Before that knee, rewards teach the loop quickly. After it, every map restarts a smaller visible surge instead of continuing one flat exponential line.
- **Growth inside a map must be visible and smooth.** Distribute meaningful gains throughout the map, including its opening section. Avoid long flat stretches, one dominant farm camp, and a boss reward that supplies most of the map's total growth.
- **Reserve progression headroom for future systems.** The default planning budget is a 25% uniform progression-rate increase. A measured map should remain above the 75% duration floor under that stress estimate. Treat it as reserved design capacity for future research, quests, companions, parties, consumables, prestige, events, or other accelerators—not as permission to make the current game slower without a visible payoff.
- **The reference shape sits between a straight log ramp and a Cookie Clicker-style logarithmic arc.** Balance Lab's default blend is `0.35`, where `0` is geometric growth (a straight line on the log-power chart) and `1` is linear growth in raw power (the full concave arc on that chart). For an 8.5× map this puts about 34%, 58%, and 80% of total log growth before the 25%, 50%, and 75% time checkpoints. Treat those checkpoints as a pacing compass, not a reason to force identical reward timestamps into every map.
- **Macro scaling should be consistent; individual encounters should not look formulaic.** Preserve each map's full-clear health, threat, and reward budgets while varying archetype ratios, camp coordinates, enemy mixes, and formations in a controlled range. Never clone the previous map's placement and simply rename its camps.
- **Intermediate Snowlands is the final regular-enemy movement and aggro tier.** Later maps may scale health, damage, cadence, and rewards, but each matching archetype must stay at or below Snowlands movement speed (Raider 230, Archer 215, Guardian 205, Reaper 235, Oracle 220) and elite aggro reach (340). Keep these as explicit authored values, backed by tests; do not add a hidden runtime clamp.
- **The boss is a capstone and the unlock gate for the next map.** It should test the build earned in that map, not replace the regular-enemy progression runway.
- **Longer maps come from more compact reward cycles, not longer ordinary fights.** From Lava Lake onward, split the source health and reward budgets into explicit encounter slices so regular enemies stay readable, camp respawns create movement, and the boss remains visible. Do not stretch a map with one multi-hour 30-enemy clear.
- **Equipment bonuses stack additively.** Add weapon, head, chest, and research bonuses to the base `1×` multiplier; never multiply equipment pieces into one another.
- **An item upgrade adds 8% of that item's level-zero bonus per level.** Upgrades are linear and capped at level 10. For example, a `+40%` item bonus becomes about `+43%` at level 1 and `+72%` at level 10; it does not compound.
- **Equipment never grants attack speed.** Persisted/base attack speed is capped at 2.625 attacks per second (`MIN_ATTACK_INTERVAL = 1 / 2.625`). Keep attack-speed progression out of item definitions and item upgrades.

The authored duration ladder through Samurai Garden is:

| Map | Progression index | Exact target | Decimal hours |
| --- | ---: | ---: | ---: |
| Tutorial Forest | onboarding | current estimate: 0:22:30 | 0.375 |
| Beginner Desert | 0 | 2:00:00 | 2.0000000 |
| Intermediate Snowlands | 1 | 2:42:00 | 2.7000000 |
| Advanced Lava Lake | 2 | 3:38:42 | 3.6450000 |
| Night Forest | 3 | 4:55:14.700 | 4.9207500 |
| Water Reach | 4 | 6:38:34.845 | 6.6430125 |
| Samurai Garden | 5 | 8:58:05.041 | 8.968066875 |

Do not round the constants used by code. Rounded labels are fine in the UI.

## Reward-pacing rationale

The game should use motivational research as a quality check, not as a recipe for compulsion:

- Reward-prediction-error research shows that learned cues can carry anticipation before the reward arrives. In Wildwood, the ethical application is a clearly visible next upgrade or map breakthrough backed by dependable progress—not an opaque chance to win. See [Schultz, Dayan, and Montague (1997)](https://pubmed.ncbi.nlm.nih.gov/9054347/) and [Fiorillo, Tobler, and Schultz (2003)](https://research.pdn.cam.ac.uk/staff/schultz/pdfs%20website/2003%20Fiorillo%20Science.pdf).
- Self-determination research connects game engagement with competence, autonomy, and relatedness. Reward tracks should therefore produce understandable mastery and meaningful build choices, not merely more frequent stimuli. See [Przybylski, Rigby, and Ryan (2010)](https://journals.sagepub.com/doi/pdf/10.1037/a0019440?download=true).
- Near misses can increase gambling motivation even though they are losses. Wildwood must not use near-miss presentation, essential random gating, or paid random rewards to manufacture that response. See [Clark et al. (2009)](https://motivation.site.wesleyan.edu/files/2016/06/Clark-2009-Neuron1.pdf). The observed association between loot-box spending and problem gambling is an additional reason to keep core progression dependable; see [Zendle and Cairns (2019)](https://pubmed.ncbi.nlm.nih.gov/30845155/).

The resulting rule is: **guaranteed core growth + a visible next breakthrough + bounded novelty**. Seeded randomness may vary camps, formations, and ordering. It must not randomly change enemy stats, permanent reward amounts, whether a build remains viable, or the macro duration/power budget. Equipment can create a pleasant breakthrough, but the base reward economy must remain playable when a drop is late.

## Water Reach to Samurai Garden

Samurai Garden applies the shared progression contract to Water Reach's unsliced source budget instead of copying every archetype at an obvious fixed ratio. This prevents later changes to Water's completed-map encounter cadence from silently changing the open map:

- total regular-enemy health across one authored clear is `0.2295×` unsliced Water (`11.475 × 0.02`), or `9.18×` one currently sliced Water clear;
- aggregate regular-enemy threat (`damage × attacks per second`) across a clear is exactly `8.5×` Water;
- canonical reward power across a clear is `0.425×` unsliced Water (`8.5 × 0.02 × 2.5`), or about `13.08×` one currently sliced Water clear, while Samurai Garden has no boss or equipment tier; revisit the explicit `2.5×` open-map reserve when a guaranteed capstone is added;
- individual health, hit damage, attack cadence, and reward ratios vary modestly around those targets so each family has its own combat texture;
- Tidewyrm health is about `6.26×` current Gloomroot health (`11.475 × 34.5 / 55`); and
- Tidewyrm's rewards start from `8.5×` Gloomroot, with the Water damage and health track corrections applied where appropriate.

These relationships live in `SAMURAI_GARDEN_*`, `SAMURAI_GARDEN_ARCHETYPE_PROFILE`, and `TIDEWYRM_*` constants in `shared/rules.ts`. The readable archetype profile is normalized against the authored 6/6/7/7/4 family mix; tests must verify the aggregate budgets whenever that mix changes. Future tuning should change the shared target or profile and clearly document an intentional exception, not hide a second multiplier in map or enemy code. Boss attack damage remains encounter-tuned because telegraph timing and dodge space affect survivability; validate it against the representative Water-exit build and avoid unavoidable one-shots.

## Late-map encounter cadence

The values below slice each map's readable source health and regular-reward budgets before archetype centering. They are per-clear cadence factors, not map-duration percentages:

| Map | Health slice | Reward slice | Solo boss-readiness target |
| --- | ---: | ---: | ---: |
| Advanced Lava Lake | 1.5% | 3.125% | 10:56 (5% of target) |
| Night Forest | 2.4375% | 5% | 14:46 (5% of target) |
| Water Reach | 2.5% | 3.25% | 15:00 cap |
| Samurai Garden (open) | 2% of its derived source | 2% of its derived source | no boss yet |

Health and reward slices may differ because map layout, respawn timing, and inherited source values determine how many enemies are needed to earn the target power. Tune them together in Balance Lab. The release guardrail is the outcome: roughly 3%–15% boss time, 5%–20% travel when topology supports it, ordinary fights measured in seconds rather than minutes, map duration inside its band, and power growth near 8.5×. Preserve late-map equipment odds per macro progression when kill cadence changes; otherwise shorter fights silently become an equipment buff.

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
- **Power growth:** median entry-to-exit growth should be 65%–150% of the 8.5× budget (5.525×–12.75×). The center remains 8.5×; the wide band absorbs loot timing rather than redefining the target.
- **Stat mix:** post-Forest regression tests target median effective damage/max-health between 0.55 and 1.35. The simulator's broader warning envelope of 0.25–1.50 is only triage. Late-map authored rewards should end close to parity so damage does not accelerate farming faster than survivability can grow.
- **Boss readiness:** the default policy attempts a solo boss after one complete spawn-site clear and once estimated solo TTK reaches the map-aware target. The target is 5 minutes through Snowlands; from Lava Lake onward it is the greater of that floor and 5% of authored map duration, capped at 15 minutes. From Lava Lake onward boss-rush cycles the five complementary reward tracks so the forecast includes a survivable build rather than an all-damage exploit. This is an attempt policy, not a hidden boss-HP multiplier. Investigate a completed boss below 2.5% of median map time because it no longer reads as a capstone, above 25% because it has become the whole wall, or supplying more than 25% of map power growth.
- **Regular-enemy survivability:** use `damageAfterArmor`, `hitPercentOfHealth`, and `hitsToDefeatPlayer` at the representative map-entry build. Night Forest's enforced late-map reference is roughly 3%–8.5% effective max health per hit, or 12–34 hits to defeat the player. Begin Water tuning in the same readability band. Never ship a map where most regular enemy types one-hit the representative entry build; telegraphed boss mechanics require separate encounter testing because the simulator does not model dodging.
- **Reward-track health:** compare `combatPowerPerMinute` at frozen map-entry stats. The most productive regular enemy must remain below 4× the middle productive enemy, or rational play collapses into one camp. Prefer smaller, more frequent gains when the early power line is flat.
- **Enemy time walls:** compare per-archetype TTK and full-clear combat share at the same frozen map-entry build. Investigate an archetype above 2.5× the map's median TTK and an elite median above 3× the regular median. A high spawn count can legitimately own a large share of a clear; one ordinary enemy should not feel like several elites glued together.
- **Time allocation:** on completed post-Forest boss maps, investigate travel below 3% because the world route has disappeared, respawn waiting above 15%, or travel above 35% before adding more HP. The practical target is usually 5%–20% travel: enough to feel the map without replacing combat with empty walking.
- **Momentum cadence:** investigate when the longest wait for a cumulative +10% power gain exceeds 20% of map duration, or one progression event supplies more than 25% of the map's logarithmic growth. Future accelerators tend to skip isolated milestones, so preserve several smaller nearby gains rather than relying on one irreplaceable spike.
- **Future-system headroom:** for completed maps, the lab reports the maximum uniform, combat-only, farm-rate, and movement-only speed multipliers that still retain the 75% duration floor. The default reserve is `1.25×`. Open maps have no completion time and must display this as unavailable rather than treating the remaining simulation window as evidence. Category ceilings hold all other measured time fixed and are sensitivity estimates; once a real accelerator is designed, model its actual acquisition timing and affected stats as a named scenario.
- **Stat investment:** compare active pursuit time and direct reward power for damage, health, armor, regeneration, and attack speed. Investigate a productive track that takes at least 4× as long per +1% entry power as the fastest track, or a track whose pursued-time share exceeds its direct-growth share by 20 percentage points. Effective doubling time includes equipment and research; direct reward efficiency does not. This distinction catches equipment that hides an underpowered armor or health economy.
- **Equipment share:** investigate when equipment supplies more than 50% of canonical exit power or jumps by more than 20 percentage points inside one map. Equipment should create anticipated breakthroughs, but the raw reward curve must remain legible if one drop is late. Use the lab-only equipment-strength control before changing live item values; a gear nerf that fixes headline power can also lengthen maps and reduce survivability.
- **Loot variance:** treat `1.75×` P90/P10 as the long-term ideal and `3×` as the current hard warning while drops remain purely random. Fix drop timing, add a pity/guaranteed acquisition path, or strengthen deterministic progression before compensating with blanket enemy-stat changes.

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
