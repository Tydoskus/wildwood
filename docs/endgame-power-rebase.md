# Duskfall Orchard player power rebase

The September 6 balance simulation places the median player at 947 million power entering Duskfall Orchard and 2.831 billion after clearing it. This uses 20 efficient-farming trials, seed 1337, balanced research, sequential equipment upgrades with their actual timers, and the current map rewards. These are progression estimates, not measurements of human play or the new regional group-aggro behavior.

| Effective stat at final-map completion | Median |
| --- | ---: |
| Damage | 640,757,151 |
| Maximum health | 1,044,456,704 |
| Armor | 2,126,523 |
| Regeneration | 3,063,309 |
| Attack interval | 0.579 seconds |

Individual stat medians need not describe the same simulated player as median power.

The version 0.637 balance-v8 migration protects the first 100,000 raw power and retains 12.132864932953798% of the excess. Each player's damage, health, armor, and regeneration receive the same multiplier, preserving build proportions within f32 storage precision. Attack speed, movement, equipment, upgrades, research, unlocks, and future rewards are unchanged.

The production conversion on September 6 changed five of 52 accounts. A post-conversion comparison confirmed every existing position and tie in power, damage, health, armor, and regeneration was preserved. Playtime was unchanged.

| Player | Previous power | Released power |
| --- | ---: | ---: |
| Skittle | 23,329,787,407 | 2,830,802,331 |
| rymel | 7,377,959,167 | 895,353,409 |
| TacoMel | 352,842,629 | 43,033,584 |
| Uncletaco | 244,213 | 123,958 |
| Lucky Hare 942 | 206,342 | 117,293 |

The first player's small difference from the simulation target comes from f32 stat storage. These are the verified conversion totals; subsequent play can increase them.

The server checks all five rankings, including the currently displayed leaderboard and f32 rounding, before writing any stats. A changed cohort that would lose a tie or reorder a player rejects the transaction. Original values are saved to a separate private `player_endgame_rebase_backup` table, preserving the previous v7 archive. Module migration 26 applies the conversion once; balance version 8 applies the same conversion to older queued browser saves. Protocol 92 prevents older clients from submitting unconverted saves.

Reproduce the forecast with:

```sh
npm run balance:simulate -- --duration 32h --trials 20 --strategy efficient --research balanced --upgrades steady --json
```

Before release, export `player_progress`, `player_research`, `player_item_upgrade`, and `leaderboard_entry` using owner SQL JSON output, then run:

```sh
npx tsx scripts/balance/preview-endgame-rescale.ts progress.json research.json upgrades.json leaderboard.json
```

The preview is read-only and prints display names rather than account identities. Production conversion was applied with the version 0.637 account-server release, and all 52 pre-conversion records were archived.
