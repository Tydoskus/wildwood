# Balance Lab

Balance Lab is a deterministic, non-graphical campaign simulator for evaluating Wildwood's power curve against real time. It imports the game's current enemy, spawn, boss, reward, equipment, research, armor, attack-speed, and player-power rules rather than maintaining a second hand-copied balance sheet.

## Run it

Start the interactive lab:

```sh
npm run balance:lab
```

Vite prints a local URL; open `/balance-lab.html` if it does not open automatically. The default model fast-forwards 20 seeded seven-day campaigns in a background worker, so the controls remain responsive.

Run a terminal report for quick comparisons or automation:

```sh
npm run balance:simulate
npm run balance:simulate -- --duration 3d --trials 50 --strategy boss-rush
npm run balance:simulate -- --map infernal_depths:hp=1.2,damage=.9,reward=1.1
npm run --silent balance:simulate -- --json > balance-result.json
```

Use `npm run balance:simulate -- --help` for every CLI option.

## Reading the model

- The chart uses a logarithmic power axis because Wildwood spans many numeric tiers. The shaded band is the P10–P90 equipment-drop range; the solid line is the median.
- “Time in map” includes world travel, fight time, loot/retarget overhead, respawns, required clears, farming until boss readiness, and the boss fight. A trailing `+` means the simulation window ended before at least part of the sample completed that map.
- “Boss readiness” is the solo boss TTK at which the simulated player decides to attempt the boss. It is a progression policy, not a boss-health change.
- “Desired map step” is the target duration ratio between adjacent maps. It drives warnings and table comparisons but does not alter combat.
- The enemy economy table freezes the representative campaign's build at map entry. Power per combat minute excludes travel and respawn time so reward-track efficiency is easy to compare.
- Map HP, damage, and reward controls are a temporary what-if layer. They never write into game source values.
- A previous-run line remains on the chart after each rerun, making one-variable comparisons visible without exporting data.

## Explicit assumptions

The simulator models:

- actual spawn-site positions and enemy composition;
- regular enemy and boss HP, permanent rewards, additive equipment, upgrade levels, attack cap, armor, and canonical power;
- real attack windup/interval and estimated projectile flight to a normal in-range target;
- direct-distance travel with a configurable pathing multiplier;
- independent seeded equipment drop rolls, automatic power-positive equipping, and regular respawns;
- optional research timers and their current prerequisites/effects;
- one automatic Trailblazer Boots pickup after the first complete Forest clear.

It intentionally does not model player dodging, death downtime, health recovery routes, active idle time, boss attack patterns, encounter resets, ad timing beyond the chosen respawn value, or multiplayer boss contributions. Incoming regular-enemy damage is therefore reported as a survivability diagnostic but does not stop the progression clock. These unknowns should remain explicit instead of being hidden inside an arbitrary “skill” multiplier.

## Validation

Run the simulator tests, type checks, and standalone build with:

```sh
npm run test:unit -- src/balance/simulator.test.ts
npm run typecheck:balance
npm run build:balance
```
