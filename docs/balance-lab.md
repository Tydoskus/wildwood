# Balance Lab

Run `npm run balance:lab`. The primary cards describe ordinary fight length, hits survived, longest wait for +10% power, and boss duration/payout. Start there, then inspect the enemy table for the offending role. The power chart and advanced controls are supporting diagnostics.

`shared/progression.ts` generates real game stats. Lab sliders are temporary what-if adjustments; they do not write source values. The stat graph (`npm run balance:stat-graph`) reads the same runtime definitions and actual spawn composition.

```sh
npm run balance:simulate -- --trials 20 --duration 8h --strategy mixed
npm run balance:simulate -- --trials 3 --duration 8h --research off --equipment-strength 0
npm run balance:audit
```

The audit compares mixed, no-gear/no-research, nearby, and boss-rush campaigns and tests mirror duels using each exit build. It emits JSON with fight time, survival, boss share, and stalled stationary encounters. Runs use fixed seed 7331. Mirror duels intentionally draw; their purpose is to reveal duration and regeneration problems, not matchmaking quality.

Defaults: 25-minute map hypothesis, 3× reference stat step, 90-second boss readiness, balanced research, and one initial spawn-site clear. Readiness additionally requires surviving a strongest boss hit with at least 70% health left. The runtime does not enforce those simulator policies. Config storage version 7 avoids silently reusing the old 2-hour/8.5× assumptions.

Deaths, dodging, crowd combat, recovery routes, multiplayer boss contributions, and active idle time remain unmodeled. Incoming damage is diagnostic. A stationary danger flag is not proof that a player cannot kite an enemy. A completed forecast is not proof that every player survives.

Equipment rolls are seeded, upgrades and additive bonuses use shared rules, research advances on its timers, and regular/boss respawns consume time. Boss repeats are separated from first-clear map duration. Core progress must remain possible without a lucky equipment roll.

See [progression-scaling.md](progression-scaling.md) for the current authoring contract and [balance-diagnosis.md](balance-diagnosis.md) for the historical investigation.
