# Forest reward authority prototype

This is an opt-in developer-only **fixed-target accounting test** for the forest
Spitter (24 HP, +1 damage per kill). It is not live regular-enemy authority and
does not modify real stats, inventory, kills, leaderboards, or research.

## Try it

After deploying the matching server and client (protocol 84), sign in as the
existing developer account, enter the Forest, then open **Settings → Account →
Developer → Controls → Forest Reward Prototype**.

- **Start / Respawn** creates the private test row, or resumes the existing living
  target without resetting its health or cooldown. Initial test damage is 10.
- **Attack** submits one numbered attack. First release requires a 120 ms windup;
  subsequent attacks use the starter 1.56-second interval.
- **Batch 3** submits three numbered attacks together. Wait until three attack
  slots are earned first. It is deliberately rejected if called too soon.
- **Replay request** resends exactly the last attack payload. Accepted duplicates
  make no writes and award nothing, even after a killing hit. Older encounter
  requests are rejected after respawn.
- **Invalid batch** sends four attacks; the maximum is three, so the server
  rejects it without consuming attacks or granting rewards.
- A defeat awards one test damage and one test kill atomically in the ledger.
  Respawning requires five seconds. Respawn keeps test damage and the attack
  sequence, advances the server-owned encounter ID, and resets enemy HP.

The display shows confirmed server state, request round-trip time, and client
request count. It does not report reducer CPU time or Maincloud cost. Disconnect
does not erase the server ledger, so reconnecting cannot replay its rewards.
The UI does not poll; it uses one developer-only owner-filtered view in the
existing subscription. A never-started test creates no rows. Each participating
developer stores at most one row, overwritten in place rather than an unbounded
attack log. No scheduled callbacks or all-player scans are added.

## Security boundary

The reducer accepts only `encounter`, `firstAttack`, and `count`. Identity comes
from the authenticated sender, time from the server, and damage from the private
ledger. Developer authentication, controlling-session ownership, Forest map, and
not-in-duel checks precede every mutation. Raw ledger data is private; its view
returns only the developer caller's own row. The database commit makes HP,
sequence consumption, reward, and respawn eligibility indivisible.

This intentionally omits equipment bonuses, research multipliers, random loot,
enemy movement/AI, incoming damage, and projectile flight/collision. Attacks are
against a fixed test target, not a real spawn in the map. It cannot demonstrate
legitimate player positioning or resistance to botting. The existing live
`savePlayerProgress` and `record*EnemyDefeat` paths remain unchanged and are still
not suitable for adversarial public-beta progression.

## Validation and next step

Run `npx vitest run spacetimedb/src/forest-reward-prototype.test.ts` for deterministic
reward, timing, batch, replay, respawn, and integration-contract checks. Run full
typechecks, server build/code generation, unit tests, and client build before any
deployment. These tests are not a live server benchmark.

Next: measure real request/resource deltas on a separate test database, then
connect the validated ledger to one real spawn with an explicitly defined
position/hit-validation policy. Do not turn off live stat saves until all normal
reward sources have a compatible replacement and returning-player/guest/update
migrations have been tested. Extending this to players also requires removing
the developer-only gate, not merely exposing the test buttons.
