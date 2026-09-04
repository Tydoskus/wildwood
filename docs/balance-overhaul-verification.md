# Overhaul verification — September 4, 2026

Fresh-account forecasts, seed 7331, eight active hours per run. These timings exclude death, dodging, crowd combat, and recovery; they are not measured human completion times.

| Scenario | Trials | All maps completed | Post-Forest map minutes | Mirror duel seconds |
| --- | ---: | --- | --- | --- |
| mixed | 20 | Yes, every trial | 23.3–29.8 | 18.9–26.7 |
| no-gear-no-research | 3 | Yes, every trial | 39.3–45.5 | 19.2–26.9 |
| nearby | 3 | Yes, every trial | 13.3–21.4 | 14.7–24.2 |
| boss-rush | 3 | Yes, every trial | 11.4–12.6 | 14.7–22.4 |

Mixed-route map detail:

| Map | Minutes | Regular entry fight seconds | Entry hits survived | Boss growth share |
| --- | ---: | ---: | ---: | ---: |
| Beginner Desert | 28.2 | 6.9 | 8 | 4.2% |
| Intermediate Snowlands | 27.1 | 6.9 | 18 | 5.9% |
| Advanced Lava Lake | 29.8 | 6.9 | 17 | 7.8% |
| Night Forest | 27.0 | 6.9 | 16 | 8.5% |
| Water Reach | 25.3 | 6.9 | 15 | 8.5% |
| Samurai Garden | 25.2 | 6.9 | 16 | 8.2% |
| Cloudspire | 24.3 | 6.9 | 16 | 8.3% |
| Moonfen | 24.1 | 6.9 | 15 | 8.5% |
| Crystal Hollows | 23.3 | 6.9 | 16 | 8.4% |

All mirror duels draw through simultaneous knockouts, as expected for identical builds. Separate regression tests cover earned-stat mismatches, defender mitigation, healing, pulse partitioning, historical rules, and timeout judging.

Checks passed: 1,075 unit tests; 17 balance tests; client, lab, and server TypeScript checks; SpacetimeDB module build and generated bindings; game client, Balance Lab, and stat graph production builds. Targeted duel/presentation tests also pass after the live escalation indicator was added.

Reproduce with `npm run balance:audit`. The source contract is [progression-scaling.md](progression-scaling.md). Research and its limits are in [balance-research.md](balance-research.md).

This overhaul is implemented in the working tree. No live publish, saved-stat reset, or account migration was performed. Existing high-stat accounts retain their earned advantage. Visual and subjective playtesting remains with the user.
