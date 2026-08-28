# Deterministic Regular-Enemy Simulation

Regular enemies remain client-owned. This system makes their ambient movement,
aggro choice, and observed remote-player fights look shared without adding a
regular-enemy table, reducer, event, or server tick.

## Durable invariants

1. \`REGULAR_ENEMY_WORLD_SEED\` and \`REGULAR_ENEMY_SIMULATION_VERSION\` in
   \`shared/regular-enemy-simulation.ts\` define the timeline. Changing either is
   an intentional world-behavior change and requires two-client visual testing.
2. Random values are addressable hashes of map, spawn-site, timeline segment,
   action index, and purpose. Never replace them with a stateful PRNG or
   \`Math.random()\`: late joins, skipped frames, and background tabs must not
   advance enemy randomness differently.
3. Ambient position is a pure function of map ID, spawn-site ID, home position,
   and estimated server time. Viewport LOD, crowd separation, and collision
   pushes may not mutate this canonical idle position.
4. The existing \`emittedAt\` timestamps on player motion/map frames anchor the
   client clock. No new server state is required. Aggro samples player poses
   350 ms behind estimated server time and quantizes coordinates to four world
   units to absorb normal delivery/interpolation differences.
5. Merely receiving or rendering a remote player never creates a combat
   shadow. \`observeEnemySite\` is the only creation path, and it is called only
   after deterministic distance, target tie-breaking, and leash checks select
   that remote identity. Acquisition uses the larger of enemy proximity and the
   remote player's exact saved attack range, plus only the worst-case tolerance
   implied by the four-unit coordinate grid, so the observed fight starts at the same edge as
   the real player's auto-attack.
6. A remote combat enemy is a separate, semi-transparent presentation copy.
   It must never set the real local enemy's aggro, position, HP, death state, or
   respawn. It may animate attacks, seeded critical hits, damage numbers, and a
   display-only death/respawn lifecycle, but it never grants rewards or mutates
   saved progress.
7. Local regular-enemy kills, rewards, respawns, and player HP remain local.
   Shared enemy death/HP would require server arbitration and is deliberately
   outside this client-only model.

## Runtime flow

\`\`\`text
existing frame emittedAt -> estimated server clock -> deterministic idle pose
existing detailed player samples -> consensus poses -> deterministic aggro
aggro selects remote identity -> create/update observer combat shadow
no aggro / leash / missing detail / map reset -> remove shadow
\`\`\`

Only detailed nearest-player samples participate in remote aggro today. This
keeps the feature honest about position precision. The one-hertz map snapshot
continues to serve minimap and interest selection; it does not fabricate a
distant fight. Ambient enemy movement is still cheap and deterministic at any
distance.

## Combat inputs and authority

Power is never inverted into combat stats. On first deterministic aggro, the
observer briefly subscribes to that player's existing progress, research, and
item-upgrade rows, copies the snapshot, and immediately releases the
subscription. Damage, max HP, armor, regeneration, attack interval, range,
projectile speed/count, critical chance, and critical multiplier then use the
same shared formulas as local combat. Snapshots are cached for 30 seconds and
bounded to eight identities.

Current remote HP and actual target/shot decisions are not server data. A new
observer therefore starts the display player at full HP and simulates the
fight locally. Critical rolls are keyed by map, enemy site, target identity,
engagement tick, attack index, and projectile index. This is stat-accurate,
deterministic presentation—not authoritative shared combat.

## Verification

- Open two clients on the same map with different frame rates.
- Compare one idle enemy after a late join and after background throttling.
- Walk two players across the same aggro boundary and verify the same target is
  selected without rapid switching.
- Confirm a visible remote player outside aggro range has no attack animation,
  health bar, projectile, or shadow state.
- Confirm entering aggro creates the fight and leaving leash range removes it.
- Confirm the solid local enemy can still aggro and fight locally while the
  translucent remote copy moves, takes damage, dies, and disappears separately.
- Confirm remote shadow hits never award an item, increment kills, schedule a
  respawn, or change the local enemy's actual \`hp\`.
- Reconnect and change maps; old combat visuals must disappear.

The pure contract tests live in \`shared/regular-enemy-simulation.test.ts\`.
Runtime gating is covered in \`src/game/runtime/enemy-simulation.test.ts\`, and
server-time motion sampling is covered in
\`src/coop/services/remote-interpolation.test.ts\`.
