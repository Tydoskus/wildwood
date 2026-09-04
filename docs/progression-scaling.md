# Progression Scaling Contract

This document is the durable balance contract for WildStat's campaign. New maps, enemies, bosses, equipment, and migrations should preserve these rules unless the design direction is deliberately changed. Canonical rules live in `shared/rules.ts`, `shared/items.ts`, and `shared/incoming-damage.ts`. Direct formula tests cover incoming hits; Balance Lab checks campaign pacing only when simulation is explicitly requested.

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
- **Regular enemies use one readable visual family per map, not slimes on every map.** Use the existing slime, goblin, and skeleton families/variants first, then assign suitable new families to maps that still need their own identity. Original-family ranged variants retain bows; the new animated families use their authored attack poses without bow overlays. Elites remain recognizable by size; armor/crowns may vary within a family. Art changes must not change gameplay identities, collision, damage, cadence, or rewards. The current assignments and animation contract are in `docs/enemy-art-families.md`.
- **Every camp has one progression purpose and its own space.** A camp may contain multiple combat archetypes only when they grant the same reward stat. Authored camp regions must not overlap, and regrouping enemies must preserve the map's aggregate archetype, health, threat, and reward budgets unless a balance change explicitly says otherwise.
- **Intermediate Snowlands is the final regular-enemy movement and aggro tier.** Later maps may scale health, damage, cadence, and rewards, but each matching archetype must stay at or below Snowlands movement speed (Raider 230, Archer 215, Guardian 205, Reaper 235, Oracle 220) and elite aggro reach (340). Keep these as explicit authored values, backed by tests; do not add a hidden runtime clamp.
- **Ranged regular enemies never outrange their target player.** Their firing edge follows the target's current attack range with a 15-unit inward gap, and their preferred movement distance sits another 10 units inside that edge. Apply the same rule to local fights and remote combat ghosts without changing authored aggro or leash distances.
- **The boss is a capstone and the unlock gate for the next map.** It should test the build earned in that map, not replace the regular-enemy progression runway.
- **Boss incoming damage stays attached to its map tier.** Derive each encounter from that map's strongest regular-enemy hit. Earlier maps retain their 8%–20% heavy-hit checks. From Samurai Garden onward, the health-and-armor curve below targets substantially stronger telegraphed attacks (about 32%–56% of reference HP). Contact stays below 35%, and overlapping area hazards are weaker than the single heavy strike. Never reuse incoming-damage scaling for boss HP or rewards.
- **Longer maps come from more compact reward cycles, not longer ordinary fights.** From Lava Lake onward, split the source health and reward budgets into explicit encounter slices so regular enemies stay readable, camp respawns create movement, and the boss remains visible. Do not stretch a map with one multi-hour 30-enemy clear.
- **Equipment bonuses stack additively.** Add weapon, head, chest, and research bonuses to the base `1×` multiplier; never multiply equipment pieces into one another.
- **An item upgrade adds 8% of that item's level-zero bonus per level.** Upgrades are linear and capped at level 10. For example, a `+40%` item bonus becomes about `+43%` at level 1 and `+72%` at level 10; it does not compound.
- **Equipment never grants attack speed.** Persisted/base attack speed is capped at 2.625 attacks per second (`MIN_ATTACK_INTERVAL = 1 / 2.625`). Keep attack-speed progression out of item definitions and item upgrades.

The authored duration ladder through Crystal Hollows is:

| Map | Progression index | Exact target | Decimal hours |
| --- | ---: | ---: | ---: |
| Tutorial Forest | onboarding | current estimate: 0:22:30 | 0.375 |
| Beginner Desert | 0 | 2:00:00 | 2.0000000 |
| Intermediate Snowlands | 1 | 2:42:00 | 2.7000000 |
| Advanced Lava Lake | 2 | 3:38:42 | 3.6450000 |
| Night Forest | 3 | 4:55:14.700 | 4.9207500 |
| Water Reach | 4 | 6:38:34.845 | 6.6430125 |
| Samurai Garden | 5 | 8:58:05.041 | 8.968066875 |
| Cloudspire | 6 | 12:06:24.805 | 12.10689028125 |
| Moonfen | 7 | 16:20:39.487 | 16.3443018796875 |
| Crystal Hollows | 8 | 22:03:53.307 | 22.064807537578125 |

Do not round the constants used by code. Rounded labels are fine in the UI.

## Reward-pacing rationale

The game should use motivational research as a quality check, not as a recipe for compulsion:

- Reward-prediction-error research shows that learned cues can carry anticipation before the reward arrives. In WildStat, the ethical application is a clearly visible next upgrade or map breakthrough backed by dependable progress—not an opaque chance to win. See [Schultz, Dayan, and Montague (1997)](https://pubmed.ncbi.nlm.nih.gov/9054347/) and [Fiorillo, Tobler, and Schultz (2003)](https://research.pdn.cam.ac.uk/staff/schultz/pdfs%20website/2003%20Fiorillo%20Science.pdf).
- Self-determination research connects game engagement with competence, autonomy, and relatedness. Reward tracks should therefore produce understandable mastery and meaningful build choices, not merely more frequent stimuli. See [Przybylski, Rigby, and Ryan (2010)](https://journals.sagepub.com/doi/pdf/10.1037/a0019440?download=true).
- Near misses can increase gambling motivation even though they are losses. WildStat must not use near-miss presentation, essential random gating, or paid random rewards to manufacture that response. See [Clark et al. (2009)](https://motivation.site.wesleyan.edu/files/2016/06/Clark-2009-Neuron1.pdf). The observed association between loot-box spending and problem gambling is an additional reason to keep core progression dependable; see [Zendle and Cairns (2019)](https://pubmed.ncbi.nlm.nih.gov/30845155/).

The resulting rule is: **guaranteed core growth + a visible next breakthrough + bounded novelty**. Seeded randomness may vary camps, formations, and ordering. It must not randomly change enemy stats, permanent reward amounts, whether a build remains viable, or the macro duration/power budget. Equipment can create a pleasant breakthrough, but the base reward economy must remain playable when a drop is late.

## Water Reach to Samurai Garden

Samurai Garden applies the shared progression contract to Water Reach's unsliced source budget instead of copying every archetype at an obvious fixed ratio. This prevents later changes to Water's completed-map encounter cadence from silently changing the open map:

- total regular-enemy health across one authored clear is `0.2295×` unsliced Water (`11.475 × 0.02`), or `9.18×` one currently sliced Water clear;
- incoming hits use the separate health-and-armor curve below, not the old `8.5×` raw-threat step;
- canonical reward power across one regular clear is `0.425×` unsliced Water (`8.5 × 0.02 × 2.5`), or about `13.08×` one currently sliced Water clear; Koi Shogun and every other boss pay the full guaranteed combat-stat capstone on every clear, including repeats;
- individual health, hit damage, attack cadence, and reward ratios vary modestly around those targets so each family has its own combat texture;
- Tidewyrm health is about `6.26×` current Gloomroot health (`11.475 × 34.5 / 55`); and
- Tidewyrm's rewards start from `8.5×` Gloomroot, with the Water damage and health track corrections applied where appropriate.
- Koi Shogun health and rewards take one further `8.5×` Samurai Garden step from Tidewyrm.

Health/reward relationships live in `SAMURAI_GARDEN_*`, `SAMURAI_GARDEN_ARCHETYPE_PROFILE`, and `TIDEWYRM_*` constants in `shared/rules.ts`. Those profiles are normalized against the authored 6/6/7/7/4 family mix; tests verify aggregate health and reward budgets. Incoming damage instead follows `shared/incoming-damage.ts`, preserving relative archetype hit sizes. Future tuning should change the shared target or profile and document the reason, not hide a second multiplier in map or enemy code.

## Late-map incoming damage

Samurai Garden, Cloudspire, Moonfen, and Crystal Hollows use a fixed map-tier
reference build. Crystal Hollows is the calibration point: **1t max HP and 10b
armor (about 90% reduction)**, based on the reported playtest build. Reference
health and armor both follow the existing 8.5× progression step, backward to
Samurai and forward to future tiers. This is an authored assumption, not a
measurement of median player stats and not adaptive difficulty.

```text
raw minimum hit = reference HP × 0.08 / (1 − armorReduction(reference armor))
```

Each map's weakest regular hit targets 8% reference HP; the authored archetype
ratios put the others around 8%–14%. Crystal Hollows deals about 80b–128b after
armor at that reference. Hits are fixed when the enemy definitions are built:
extra player armor still reduces damage, and extra health still buys survival.

The old raw-damage multiplier was 8.5× per map. Even if health and armor both
grew exactly 8.5×, it made a hit about 19% weaker as a fraction of health each
map. The new rule accounts for effective health, producing about **10.536× raw
damage per tier** for that reference growth. Calibration also fixes the too-low
starting damage; the missing armor term alone did not explain the whole
reported 800m-to-80b gap.

Late bosses derive heavy, area, and contact hits at 4×, 2.8×, and 2× their map's
strongest regular hit. At the Crystal reference this is about 513b, 359b, and
257b. The smaller ability ratios keep the much stronger regular-enemy baseline
from becoming an accidental boss one-shot. Early-map hits, armor's formula,
enemy/boss HP, rewards, and saved player stats are unchanged. Direct unit tests
cover the curve and future tiers; no campaign simulation was run for this change.

## Late-map encounter cadence

The values below slice each map's readable source health and regular-reward budgets before archetype centering. They are per-clear cadence factors, not map-duration percentages:

| Map | Health slice | Reward slice | Solo boss-readiness target |
| --- | ---: | ---: | ---: |
| Advanced Lava Lake | 1.5% | 3.125% | 10:56 (5% of target) |
| Night Forest | 2.4375% | 5% | 14:46 (5% of target) |
| Water Reach | 2.5% | 3.25% | 15:00 cap |
| Samurai Garden | 2% of its derived source | 2% of its derived source | 15:00 cap |
| Crystal Hollows | 48% of its Moonfen-derived source | 60% of its Moonfen-derived source | 15:00 cap |

Health and reward slices may differ because map layout, respawn timing, and inherited source values determine how many enemies are needed to earn the target power. Tune them together in Balance Lab. The release guardrail is the outcome: roughly 3%–15% boss time, 5%–20% travel when topology supports it, ordinary fights measured in seconds rather than minutes, map duration inside its band, and power growth near 8.5×. Preserve late-map equipment odds per macro progression when kill cadence changes; otherwise shorter fights silently become an equipment buff.

Crystal Hollows preserves Moonfen's 6/6/7/7/4 clear counts while introducing five
crystal-rabbit archetypes and a new connected cavern route. Its normalized clear
budgets are `11.475 × .48 = 5.508×` Moonfen health and
`8.5 × .6 = 5.1×` canonical reward power. The lighter health slice and
health-forward reward profile remain unchanged by the incoming-damage revision
above. Prismshell has `9.35×`
Miremaw HP and `8.5×` its four rewards. Like Moonfen, the map adds no item drops.

The additive protocol-85 schema appends `crystalHollowsUnlocked`, default false.
Miremaw's authoritative contribution reward grants it. Module migration 21
backfills only contributors in the latest stored Miremaw result; it cannot prove
older victories whose results were replaced. Those players can clear Miremaw
again. No saved stats or equipment are rewritten.

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
- **Stat mix:** post-Forest regression tests target median effective damage/max-health between 0.55 and 1.35. The simulator's broader warning envelope of 0.25–1.50 is only triage. Regular reward power is allocated in proportion to encounter HP/time, and the mixed route keeps health, armor, and regeneration in an equal-time band while capping readiness-driven damage at two equal-share tracks. Late-map authored rewards should end close to parity so damage does not accelerate farming faster than survivability can grow.
- **Boss readiness:** the default policy attempts a solo boss after one complete spawn-site clear and once estimated solo TTK reaches the map-aware target. The target is 5 minutes through Snowlands; from Lava Lake onward it is the greater of that floor and 5% of authored map duration, capped at 15 minutes. From Lava Lake onward boss-rush cycles the five complementary reward tracks, repeats each cleared boss once before advancing, and repeats the final boss through the remaining window. Every clear supplies the full authored combat-stat capstone; repeats spend the authoritative 30-second respawn window, so the reward and the real time cost remain visible as separate measurements. This is an attempt policy, not a hidden boss-HP multiplier. Crystal Hollows uses a named 5% capstone-health correction calibrated to the equal-time route's observed readiness miss. Investigate a completed boss below 2.5% of median map time because it no longer reads as a capstone, above 25% because it has become the whole wall, or supplying more than 25% of map power growth.
- **Regular-enemy survivability:** use `damageAfterArmor`, `hitPercentOfHealth`, and `hitsToDefeatPlayer` at the representative map-entry build. Night Forest and Water retain their earlier readability targets. Samurai onward uses the authored reference curve above: roughly 8%–14% HP per regular hit, or about 8–13 unhealed hits to defeat the reference build. A real entrant can differ from that design reference. Never assume a canonical-power score proves survivability; telegraphed boss mechanics require separate encounter testing because the simulator does not model dodging.
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

1. Only when the user explicitly requests balance simulation, run the canonical baseline with `npm run balance:simulate`. Otherwise skip simulation, including `src/balance/simulator.test.ts`, per `AGENTS.md`. Whenever a map is added, include its boss, spawn sites, rewards, drops, and exact duration target in the default campaign window.
2. Change one variable at a time with map what-if controls, for example `npm run balance:simulate -- --map infernal_depths:hp=1.2,damage=.9,reward=1.1`. Use the same seed and trial count for comparisons.
3. Read the power-over-time curve before the final totals. A map can hit its exit target while still having a bad flat opening or a single reward spike.
4. Check first-clear map duration, repeat-loop time, power growth, effective damage/health, boss TTK, enemy hit size, combat power per minute, and P10–P90 spread together. The simulator intentionally does not model dodging, deaths, recovery routes, boss patterns, encounter resets, or multiplayer contributions. Report those areas for the user's visual pass; do not make agent-run visual QA a delivery requirement unless the user explicitly requests it.
5. For an explicitly requested balance-simulation pass, after accepting source changes, run:

   ```sh
   npm run test:balance
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

Balance versions 5–6 are a deliberately cohort-specific exception for the five legacy accounts that remained above 100 million raw power after the 0.552 curve change; the next account measured below 150 thousand. They apply one common factor to damage, max health, armor, and regeneration within each account, preserving build ratios. A logarithmic mapping preserves rank, anchors Skittle at the representative Water Reach entry build (about 46.5 million effective power), and places the fifth account near the representative Lava Lake entry build (about 554 thousand). Version 6 corrects the brief v5 intermediate cohort whose initial reference came from a leaderboard row cached before the equipment rebalance; saves migrating directly from v4 use the corrected target immediately. The shared raw-power transforms also migrate offline pending saves. Do not reuse these cohort thresholds as an ongoing cap or a general progression rule.

Equipment formula changes normally apply dynamically because effective stats are derived from raw progress. Add a migration only when the design also calls for changing stored stats, ownership, upgrade rows, or compensating affected legacy accounts.
