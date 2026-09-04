# Balance stat graph

This is a standalone source-value plot. It is intentionally separate from Balance Lab and does not run campaign simulations.

```sh
npm run balance:stat-graph
```

The chart shows the multiplier from each map to the previous map. Its raw values come from the current enemy definitions, actual spawn-site composition, boss damage profiles, and shared boss reward constants. Combat lines use a spawn-weighted mean across the map's individual spawn sites. Regular reward lines keep each authored reward source separate in camp order and show the source enemy name in every table cell; they are never pooled or averaged. Boss reward lines are per-clear payouts and therefore show the full repeatable reward.

Build it with:

```sh
npm run build:stat-graph
```
