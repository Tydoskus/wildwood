# Legacy player power rescale (0.623)

Balance version 7 / module migration 24 is a one-time conversion, not an ongoing reward cap. It scales damage, max health, armor, and regeneration together; attack interval, equipment, research, inventory, and unlocks remain unchanged.

The September 4 snapshot contains 52 saved characters. Seven inflated builds are compressed; 45 remain unchanged. Map exit references give the initial targets. Incompatible targets are pooled in log space to preserve global effective-power order and existing ties. Five percent of the old log gap remains to distinguish veterans. Mapping these targets back to raw power produces the fixed interpolation knots in `shared/map-power-rescale.ts`.

Exact ranking takes priority over fitting every individual map: the overpowered Forest account remains above the Snowlands account, and the strongest Crystal Hollows veterans remain above the map exit reference. This migration preserves build proportions and power order, not the old gaps between players or every previous duel outcome.

Before any writes, the server computes the effective power of every saved character using current gear, upgrades, research, and Float32-rounded converted stats. A reversal or changed tie rejects the transaction. It archives the original five combat fields plus before/after effective power in the private `player_power_rebase_backup` table, updates balance versions and the leaderboard, and completes migration 24 atomically. Later connections do not repeat the conversion. Protocol 87 blocks stale clients; queued version-6 saves use the identical conversion on their next load and are then stored as version 7. New earnings remain uncompressed.

Read-only audit: export `player_progress`, `player_research`, and `player_item_upgrade` as owner SQL JSON, then run:

```
npx tsx scripts/balance/preview-player-rescale.ts progress.json research.json upgrades.json
```

The script prints anonymous map summaries and throws if the actual conversion changes ranking or ties. Original stat backups support an owner-directed recovery; never restore them blindly over subsequent earned progress.
