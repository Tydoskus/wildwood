# Balance Lab

Balance Lab is a deterministic, non-graphical campaign simulator for evaluating WildStat's power curve against real time. It imports the game's current enemy, spawn, boss, reward, equipment, research, armor, attack-speed, and player-power rules rather than maintaining a second hand-copied balance sheet.

## Run it

Start the interactive lab:

```sh
npm run balance:lab
```

Vite prints a local URL; open `/balance-lab.html` if it does not open automatically. The default model fast-forwards 100 seeded campaigns in a background worker, so the controls remain responsive and the median stays stable across randomized loot. The default `mixed` behavior gives each campaign all four normal priorities—nearby, power efficiency, DPS-first, and boss readiness—with a small seeded bias toward one. That keeps a run representative of human variation without turning the population into four rigid robot scripts. The chart also overlays capped comparison traces for nearby, power-efficient, DPS-first, and boss-rush players. Boss-rush repeats each cleared boss once while progressing and repeats the final capstone for the remaining window; every clear pays the full authored combat-stat reward, including repeats. Repeat time and authored repeat outcomes are reported separately so the lab shows the reward and its real time cost independently. `boss-farm` is the separate unlimited first-boss stress case and is not included in the normal mix. The published curve baseline uses the balanced tech-tree queue. The default window covers the current 22.5-minute Forest onboarding estimate plus the full authored map-duration ladder. Tidewyrm is modeled as the Water Reach boss.

Run a terminal report for quick comparisons or automation:

```sh
npm run balance:simulate
npm run balance:simulate -- --duration 29.25h --trials 100 --strategy mixed
npm run balance:simulate -- --duration 29.25h --trials 1 --strategy boss-farm
npm run balance:simulate -- --duration 29.25h --trials 1 --strategy dps-first
npm run balance:simulate -- --target-desert 2h --target-step 1.35 --target-power 8.5
npm run balance:simulate -- --target-arc .35 --equipment-strength .75
npm run balance:simulate -- --future-speedup 1.25
npm run balance:simulate -- --map water_reach:hp=1,bossHp=1.3,damage=.9,reward=.5,bossReward=1
npm run --silent balance:simulate -- --json > balance-result.json
```

Use `npm run balance:simulate -- --help` for every CLI option.

## Reading the model

- The chart uses a logarithmic power axis because WildStat spans many numeric tiers. The shaded band is the P10–P90 equipment-drop range and the solid green line is the mixed-player median. Thin colored lines compare nearby, power-efficient, DPS-first, and boss-rush behavior. Repeat-boss power continues the line after a clear at the same full authored reward rate, while the event clock keeps its respawn and combat cost visible. The mixed route equalizes active health, armor, and regeneration farming and caps readiness-driven damage farming at two equal-share tracks. The dashed amber reference is a configurable stacked-log arc: `0` is the old straight line on a log chart, `1` is a full linear-in-power arc, and WildStat defaults between them at `0.35`. The Lab uses a light palette so chart lines, controls, and tables remain readable in bright environments.
- “Log growth at 25 / 50 / 75%” measures how much of a map's total logarithmic power growth has arrived by each checkpoint. It catches a flat opening or late boss spike even when entry and exit totals both pass.
- “Where map time goes” divides first-clear progression time into regular combat, boss combat, travel, respawn waiting, and loot/retarget overhead. When a strategy repeats a defeated boss, a second `REPEAT LOOP` bar reports that respawn/combat/loot budget separately, using the same event clock instead of estimates derived after the run.
- “Time spent earning each stat” assigns active travel, combat, and retarget time to the damage, health, armor, regeneration, or attack-speed reward being pursued. Each cell reports active investment time, its share of pursued-stat time, its share of direct map power growth, time per +1% entry power, and the effective stat doubling time. Direct efficiency excludes random equipment and passive research; effective doubling includes them, so the two views reveal when gear is masking a weak reward track.
- “What can speed up before pacing breaks” reserves room for future systems. The default asks every completed measured map to survive a uniform 25% progression-rate increase without dropping below 75% of its duration target. Open maps show no estimate because an observation window is not a completion time. Uniform, combat-only, farm-rate, and movement ceilings are sensitivity estimates derived from the measured event clock; they do not pretend every future mechanic acts the same way.
- Momentum signals measure the longest wait for a cumulative +10% power gain and the largest single power jump. These catch a map that hits its endpoint only because one boss, item, or future system erases a long stall.
- “Time in map” is the first-clear progression record and includes world travel, fight time, loot/retarget overhead, respawns, required clears, farming until boss readiness, and the boss fight. A trailing `+` means the simulation window ended before at least part of the sample completed that map. A post-clear repeat tail is shown separately so it cannot inflate the map target comparison. Samurai Garden is the current open-map evaluation window, so its result is labeled observed rather than completed.
- “Boss readiness” is the solo boss TTK at which the simulated player decides to attempt the boss. The control is a 5-minute floor through Snowlands; from Lava Lake onward the policy grows toward 5% of the authored map duration and stops at 15 minutes. It is a progression policy, not a boss-health change.
- The published curve baseline is calibrated with the balanced tech-tree/research queue active. Research-off and damage-first modes remain available as explicit what-if runs and are not part of the default curve match.
- “Mixed players” is the normal population model. Every campaign samples a seeded primary preference, then blends all four normal priorities with bounded weights. While a boss is out of reach, readiness gets a hard safety priority and DPS reward value breaks discrete TTK ties; this prevents a max-DPS or nearby-player run from stalling forever on an otherwise harmless map. The chart's comparison lines are separate seeded runs of the four named guided behaviors, so their differences are visible without changing the mixed summary cards and tables. “Max DPS” and “Max power” remain available as explicit what-if runs, but use the same readiness guard.
- “Boss reward audit” reports first-clear and repeat power per minute against the best regular reward cycle. Repeat clears use the full authored combat-stat payout, and the explicit `boss-farm` strategy still repeats a defeated boss until the simulation window ends, with repeat kills and repeat time shown separately. Rare authored item outcomes are included in the repeat-power diagnostic so they cannot hide behind the clear-history ledger.
- Completed post-Forest maps also get an encounter-rhythm signal. A boss below 2.5% of measured map time or travel below 3% means ordinary health walls have swallowed the capstone or the world route, even when total duration still passes.
- Forest is treated as onboarding rather than as the baseline for every later map. “Desert target,” “Desired map step,” and “Power budget” define the pacing and geometric-growth reference curve; they drive warnings and table comparisons but do not alter combat.
- A duration is considered on target within ±25%. Per-map power is considered near budget from 65% to 150% of its target so loot randomness does not trigger false precision.
- The enemy economy table freezes the representative campaign's build at map entry. It reports each archetype's share of full-clear combat, TTK versus the map median, one-kill power gain as a share of entry power, seconds per 1% power, efficiency versus the map median, incoming hit and DPS after armor, survival time after regeneration, and (for late maps) hit size against the calibrated campaign-curve reference build. This makes low-value health walls, regular-to-elite gaps, and “large raw number but harmless after armor” failures visible without guessing from HP alone.
- Regular HP/reward and boss HP/reward controls are separate temporary what-if layers. Equipment strength is also a lab-only multiplier that scales the bonus portion of effective equipment stats while preserving research and raw progression. None of these controls write into game source values.
- Boss-rush behavior cycles the five complementary reward tracks from Lava Lake onward once its boss is reachable, repeats each cleared boss once before advancing, and repeats the final boss for the rest of the window. This represents a reward-focused route with meaningful boss loops rather than an all-damage exploit. Every clear is the full authored progression payout; the repeat choice competes on respawn and combat time, and the enemy table plus reward audit expose any repeat item power that changes the resulting strategy.
- A previous-run line remains on the chart after each rerun, making one-variable comparisons visible without exporting data.

## Explicit assumptions

The simulator models:

- actual spawn-site positions and enemy composition through Samurai Garden;
- regular enemy and boss HP, permanent rewards, additive equipment, upgrade levels, attack cap, armor, canonical power, and boss damage-profile kinds;
- the current health retune: Tutorial Forest is unchanged, while regular enemies from Beginner Desert onward use half HP and bosses use double HP;
- real attack windup/interval and estimated projectile flight to a normal in-range target;
- direct-distance travel with a configurable pathing multiplier;
- independent seeded equipment drop rolls, automatic power-positive equipping, optional equipment-bonus scaling, and regular respawns;
- optional research timers and their current prerequisites/effects;
- one automatic Trailblazer Boots pickup after the first complete Forest clear.

It intentionally does not model player dodging, death downtime, health recovery routes, active idle time, boss attack patterns, encounter resets, ad timing beyond the chosen respawn value, or multiplayer boss contributions. Incoming regular-enemy damage is therefore reported as a survivability diagnostic but does not stop the progression clock. These unknowns should remain explicit instead of being hidden inside an arbitrary “skill” multiplier.

Future-system ceilings are planning estimates, not extra simulation buffs. Uniform headroom divides the observed map clock by the requested reserve. Category ceilings compress only their matching measured time while holding other categories fixed. When a concrete prestige, quest, companion, party, consumable, or offline system exists, add its actual rules as a named scenario rather than permanently treating the generic estimate as truth.

## Validation

Balance simulation tests are an optional diagnostic tool for investigating the
curve, not a release requirement. For source and bundle validation, run:

```sh
npm run test:unit
npm run typecheck:balance
npm run build:balance
```

When a balance readout is needed, run `npm run test:balance` separately.
