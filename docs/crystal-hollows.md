# Crystal Hollows

The tenth map follows Moonfen. It is a slate-and-lavender cavern with cyan,
amethyst, and amber crystal clusters, a connected mining loop, five camps, and
a clear southeast boss chamber. Its procedural decorations, colors, paths,
arrivals, camps, and boss placement remain editable in the existing map tool.

## Encounters

| Camp | Enemy | Reward | Count |
| --- | --- | --- | ---: |
| Quartz Landing | Shard Hopper | Damage | 6 |
| Amethyst Gallery | Crystal Spitter | Max health | 6 |
| Geode Bastion | Geode Guardian | Armor | 7 |
| Prismatic Cut | Prism Reaver | Damage | 7 |
| Resonant Vault | Hollow Oracle | Regeneration | 4 |

All regular enemies use the new pack's `HornRabbit_Crystal` idle, walk, and attack
captures. They have no added bow or second ground shadow. Existing hit/death
effects remain unchanged. Art is shared across the five variants and loaded
through map preparation, not the initial Forest loading screen.

Prismshell uses a separate `Carapace_Castle` capture. Its attacks are a narrow
shatter wave with a visible windup and eight staggered crystal eruptions around
the selected target. The wave uses the established two-hit range knockback.
The encounter shares the deterministic server-clock ability schedule and the
server-owned HP, contribution, reward, and 30-second respawn systems. It uses
the standard compact defeat notice rather than a new rewards modal.

The map adds no new item drops or music download; it reuses Night Forest music.
Existing map balance, saved stats, and inventory ownership are not rewritten.

## Travel and release

Miremaw's positive-damage contributors unlock Crystal Hollows. The forward portal
is Moonfen's second arch; Crystal Hollows' arrival and return arch keep the same
late-map entrance convention. Reconnects restore the saved location.

This change includes an additive server schema and regenerated client bindings:
protocol 85, module migration 21, and a default-false `crystalHollowsUnlocked`
field. Migration 21 recognizes contributors in the latest stored Miremaw result;
older victories not retained in that result need another Miremaw clear.

Release the matching client and non-destructive server update together. A
client-only release is insufficient. No production database publish is part of
the local implementation or build checks.

The user owns visual review: inspect the cavern route, crystal silhouettes,
rabbit facing/labels, and Prismshell size, facing, and attack warnings. Automated
checks cover topology, safe spawn distances, frame bounds, asset budgets,
portal round trips, gate/reward wiring, and combat cleanup. Balance simulations
are opt-in only, as specified in `AGENTS.md`.
