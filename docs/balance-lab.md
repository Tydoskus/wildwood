# Balance Lab

Balance Lab is a deterministic, non-graphical campaign simulator for evaluating Wildstat's power curve against real time. It imports the game's current enemy, spawn, boss, reward, equipment, research, armor, attack-speed, and player-power rules rather than maintaining a second hand-copied balance sheet.

## Run it

Start the interactive lab:

```sh
npm run balance:lab
```

Vite prints a local URL; open `/balance-lab.html` if it does not open automatically. The default model fast-forwards 100 seeded 29.25-hour campaigns in a background worker, so the controls remain responsive and the median stays stable across randomized loot. That window covers the current 22.5-minute Forest onboarding estimate plus the full 2h → 2.7h → 3.65h → 4.92h → 6.64h → 8.97h pacing ladder through Samurai Garden. Tidewyrm is modeled as the Water Reach boss and Samurai Garden is the final open-map observation window.

Run a terminal report for quick comparisons or automation:

```sh
npm run balance:simulate
npm run balance:simulate -- --duration 29.25h --trials 100 --strategy boss-rush
npm run balance:simulate -- --target-desert 2h --target-step 1.35 --target-power 8.5
npm run balance:simulate -- --target-arc .35 --equipment-strength .75
npm run balance:simulate -- --future-speedup 1.25
npm run balance:simulate -- --map water_reach:hp=1,bossHp=1.3,damage=.9,reward=.5,bossReward=1
npm run --silent balance:simulate -- --json > balance-result.json
```

Use `npm run balance:simulate -- --help` for every CLI option.

## Reading the model

- The chart uses a logarithmic power axis because Wildstat spans many numeric tiers. The shaded band is the P10–P90 equipment-drop range and the solid line is the median. The dashed amber reference is a configurable stacked-log arc: `0` is the old straight line on a log chart, `1` is a full linear-in-power arc, and Wildstat defaults between them at `0.35`.
- “Log growth at 25 / 50 / 75%” measures how much of a map's total logarithmic power growth has arrived by each checkpoint. It catches a flat opening or late boss spike even when entry and exit totals both pass.
- “Where map time goes” divides median observed time into regular combat, boss combat, travel, respawn waiting, and loot/retarget overhead. These categories use the same event clock as the campaign instead of estimates derived after the run.
- “Time spent earning each stat” assigns active travel, combat, and retarget time to the damage, health, armor, regeneration, or attack-speed reward being pursued. Each cell reports active investment time, its share of pursued-stat time, its share of direct map power growth, time per +1% entry power, and the effective stat doubling time. Direct efficiency excludes random equipment and passive research; effective doubling includes them, so the two views reveal when gear is masking a weak reward track.
- “What can speed up before pacing breaks” reserves room for future systems. The default asks every completed measured map to survive a uniform 25% progression-rate increase without dropping below 75% of its duration target. Open maps show no estimate because an observation window is not a completion time. Uniform, combat-only, farm-rate, and movement ceilings are sensitivity estimates derived from the measured event clock; they do not pretend every future mechanic acts the same way.
- Momentum signals measure the longest wait for a cumulative +10% power gain and the largest single power jump. These catch a map that hits its endpoint only because one boss, item, or future system erases a long stall.
- “Time in map” includes world travel, fight time, loot/retarget overhead, respawns, required clears, farming until boss readiness, and the boss fight. A trailing `+` means the simulation window ended before at least part of the sample completed that map. Samurai Garden is the current open-map evaluation window, so its result is labeled observed rather than completed.
- “Boss readiness” is the solo boss TTK at which the simulated player decides to attempt the boss. The control is a 5-minute floor through Snowlands; from Lava Lake onward the policy grows toward 5% of the authored map duration and stops at 15 minutes. It is a progression policy, not a boss-health change.
- Completed post-Forest maps also get an encounter-rhythm signal. A boss below 2.5% of measured map time or travel below 3% means ordinary health walls have swallowed the capstone or the world route, even when total duration still passes.
- Forest is treated as onboarding rather than as the baseline for every later map. “Desert target,” “Desired map step,” and “Power budget” define the pacing and geometric-growth reference curve; they drive warnings and table comparisons but do not alter combat.
- A duration is considered on target within ±25%. Per-map power is considered near budget from 65% to 150% of its target so loot randomness does not trigger false precision.
- The enemy economy table freezes the representative campaign's build at map entry. It reports each archetype's share of full-clear combat, TTK versus the map median, one-kill power gain as a share of entry power, seconds per 1% power, efficiency versus the map median, and incoming damage. This makes low-value health walls and regular-to-elite gaps visible without guessing from HP alone.
- Regular HP/reward and boss HP/reward controls are separate temporary what-if layers. Equipment strength is also a lab-only multiplier that scales the bonus portion of effective equipment stats while preserving research and raw progression. None of these controls write into game source values.
- Boss-rush behavior cycles the five complementary reward tracks from Lava Lake onward. This represents building enough offense and survivability for a boss rather than camping one instant-respawn damage site forever; the enemy table still warns when the raw reward economy makes such camping dominant.
- A previous-run line remains on the chart after each rerun, making one-variable comparisons visible without exporting data.

## Explicit assumptions

The simulator models:

- actual spawn-site positions and enemy composition through Samurai Garden;
- regular enemy and boss HP, permanent rewards, additive equipment, upgrade levels, attack cap, armor, and canonical power;
- real attack windup/interval and estimated projectile flight to a normal in-range target;
- direct-distance travel with a configurable pathing multiplier;
- independent seeded equipment drop rolls, automatic power-positive equipping, optional equipment-bonus scaling, and regular respawns;
- optional research timers and their current prerequisites/effects;
- one automatic Trailblazer Boots pickup after the first complete Forest clear.

It intentionally does not model player dodging, death downtime, health recovery routes, active idle time, boss attack patterns, encounter resets, ad timing beyond the chosen respawn value, or multiplayer boss contributions. Incoming regular-enemy damage is therefore reported as a survivability diagnostic but does not stop the progression clock. These unknowns should remain explicit instead of being hidden inside an arbitrary “skill” multiplier.

Future-system ceilings are planning estimates, not extra simulation buffs. Uniform headroom divides the observed map clock by the requested reserve. Category ceilings compress only their matching measured time while holding other categories fixed. When a concrete prestige, quest, companion, party, consumable, or offline system exists, add its actual rules as a named scenario rather than permanently treating the generic estimate as truth.

## Validation

Run the simulator tests, type checks, and standalone build with:

```sh
npm run test:unit -- src/balance/simulator.test.ts
npm run typecheck:balance
npm run build:balance
```
