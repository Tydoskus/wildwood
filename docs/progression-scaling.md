# Progression contract

The September 4 overhaul replaces the chained map multipliers. `shared/progression.ts` is the authoring source; `shared/rules.ts` exposes the generated boss constants to browser and server. `shared/legacy-balance.ts` retains old exports only for compatibility. Do not tune that historical file.

## What is held constant

- Forest is an independent onboarding map with fragile attackers and larger elite rewards. Editing Forest never changes Desert or later tiers.
- Desert is campaign tier zero. Reference damage, health, armor, and regeneration grow 3× per tier. This is a controlled numerical scale, not a promise that every player's leaderboard power triples.
- Each role specifies a reference fight duration, incoming hit as a fraction of reference health after armor, and reward as a fraction of a reference stat. Ordinary fights target 6–10 seconds at that reference; elite fights target 13–14 seconds.
- Enemy HP comes from reference DPS × encounter seconds. Incoming damage accounts for reference health AND armor. More earned stats still improve performance against fixed enemies.
- Health has its own meaningful budget: the Desert reference has 400 damage and 4,000 health. Equal damage and health are not a balance target; that produces near-one-shot raw-stat duels.
- Six raiders plus one reaper in Desert/Snow and six plus seven later have the same damage-reward budget per clear. Adding damage enemies must not accidentally double progression speed. Other roles retain their authored rewards and camp layouts.
- Boss HP uses the intended end-of-map reference DPS and a 90-second fight. Heavy hits target 25% of that reference's health after armor. Smaller overlapping abilities remain below the heavy strike.
- Repeat bosses pay the same small guaranteed capstone as first clears. They must compete with regular farming including the 30-second respawn. The bulk of map growth comes from ordinary encounters.
- Equipment bonuses remain additive, upgrades remain linear, and equipment never grants attack speed. Attack speed retains its existing cap.
- Regular movement stays at or below Snowlands' matching role. Existing enemy art and map geometry retain their identity. Health elites must exist in both authored and saved map rosters and in asset-loading groups.

## Pacing hypothesis and validation

25 active minutes per campaign map and 90 seconds per boss are initial playtest targets, not research-established constants. Maps need not take equal time for every strategy. The default simulation window includes 50% extra time to avoid censoring the last map solely because the window equals the sum of the targets.

The lab's four primary readouts are ordinary fight length, regular hits survived, longest wait for a cumulative +10% power improvement, and boss fight/payout. Power is only a momentum proxy. Use the detailed stat, reward, and threat tables to diagnose the cause.

Boss readiness checks both TTK and whether the strongest hit consumes at most 30% of current effective health. Guided routes seek health when needed. This models a decision to prepare, not automatic runtime scaling or a gameplay restriction. Explicit DPS-first behavior retains its own priorities.

The campaign simulator still excludes dodging, crowd combat, deaths, and recovery routes. The experience audit marks encounters that would be lethal standing still at map entry. Forest's later enemies are intentionally not beginner targets. Visual and subjective playtesting belongs to the user.

Useful checks:

```sh
npm run test:unit
npm run test:balance
npm run typecheck:coop
npm run typecheck:balance
npm run balance:audit
npm run build:client
npm run build:balance
npm run build:stat-graph
```

## Duels

Earned stats and equipment determine the advantage; there is no opponent-based normalization, hidden comeback bonus, or forced close result. Duels remain automatic build battles.

Version 1 fights open at normal damage. After 10 seconds, both sides' hits gain 20 percentage points of their base damage per second, capped at 5×. This produces an escalating finish instead of letting armor and regeneration turn late fights into passive timeouts. Regeneration and attack speed retain their earned values. At 30 seconds, health remaining as a percentage breaks a non-knockout result; exact ties draw.

One shared microsecond event simulation resolves the server, live prediction, and replay. Simultaneous lethal hits draw; damage blocked is credited to the defender; overkill and overheal are excluded from useful damage/healing totals. Additive `combatVersion` fields default to zero for historical rows so old replays and active legacy duels keep their original rules. Protocol 86 carries the new fields.

No account-stat migration or reset is part of this change. Existing unusually strong characters remain strong. The campaign measurements are fresh-account forecasts, not a promise that existing endgame characters will need to replay early progression.

## Adding content

Choose a campaign index and existing role/reward lane; add its presentation, placement, and map roster. The shared functions generate HP, danger, and reward. A new role needs an explicit encounter profile instead of copying another map's raw numbers. If its damage roster differs from the standard campaign mix, pass its raider/reaper counts to `desertLaneRewardValue` and test the per-clear budget. The pacing target also adjusts real regular payouts through `REGULAR_REWARD_CYCLE_SCALE`; rerun the audit because travel and research make duration approximate. Run the experience audit across the handoff and the new tier, including no-gear/no-research and boss-rush routes.
