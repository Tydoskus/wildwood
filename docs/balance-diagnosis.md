# Balance diagnosis — September 4, 2026

This records the investigation before the overhaul. The subsequent implementation and current contract are in `progression-scaling.md`. The working tree already contains an unfinished progression rewrite; its results below must not be attributed to the released game.

## What the GitHub history shows

Verified the repository and enemy commit history through GitHub's API, then inspected the matching local commit diffs.

- [August 6: simplify enemy configuration](https://github.com/Tydoskus/wildwood/commit/12604beef82b7a861f4f0106a4aad91bc4de895c): each enemy gets one readable definition containing HP, damage, movement, and a specific permanent stat reward.
- [August 6: manual balance](https://github.com/Tydoskus/wildwood/commit/c2fde372c95f89982526b4f9faa25c98996925d1): independent changes to danger, movement, and payout. Spitter's hit rose from 8 to 48 while HP stayed 18 and its damage reward stayed 1. This preserves a fragile but dangerous encounter instead of tying all values to one multiplier.
- [August 13: Forest rewards](https://github.com/Tydoskus/wildwood/commit/f54c4b145d265bdff677bc01f351f667c0deee53): Bramble health reward 14 → 28, Mossback armor 1 → 5, King Slime health 176 → 352, without increasing their HP. These are direct improvements to the payoff for an existing effort.
- [August 13: Snowlands](https://github.com/Tydoskus/wildwood/commit/4947e0544cfe671dcf6d1bcc9083edab5e4071c1): explicitly repeats Forest-to-Desert archetype multipliers. This carries the enormous tutorial-to-campaign jump into subsequent maps.
- [August 14: Frost Raider tuning](https://github.com/Tydoskus/wildwood/commit/f8a3abbe26ee617cf9bdbc3deb44534a48a3a370): halves incoming damage, keeping HP and payout unchanged. Despite the commit title mentioning rewards, this is a survivability adjustment.
- [August 14: Desert boss reward](https://github.com/Tydoskus/wildwood/commit/550b22519768ef0f2e8b29e49baf9de65ed28780): doubles Spider health payout to 200,000 and adds 75,000 damage. It strengthens the breakthrough into the next map; boss HP remains 150,000,000.
- August 27, `408d364`: Balance Lab introduced. Immediately before it, `065a25d` has Raider HP of 1.2 million in Desert, 2.7 billion in Snow, and 6.075 trillion in Lava: 2,250× each step. Damage rewards grow 1,200 → 240,000 → 48 million: only 200× each step. HP per damage reward worsens 11.25× per map. Absolute numbers and effort/reward drift were separate problems.

The evidence supports a hypothesis: the enjoyable part was a visible sequence of earning a useful stat, overcoming a previously dangerous enemy, and receiving a larger breakthrough. It cannot identify the user's favorite build or prove subjective fun without playtesting that era.

## Why the present tools are confusing

1. **The lab measures a proxy.** `shared/player-power.ts` adds damage adjusted for attack speed, health, armor × 3, and regeneration × 10. That score cannot establish equivalent combat usefulness. Damage accelerates future earnings; health does not. Armor has a logarithmic mitigation curve. Regeneration depends on incoming DPS and recovery time.
2. **Survival does not constrain simulated progress.** The lab documents that it excludes dodging, deaths, and recovery routes. Defensive routing is partly prescribed by policy. A good-looking simulated curve therefore cannot prove a viable or enjoyable route.
3. **Old targets remain attached to a new economy.** The lab still expects two hours in Desert, 1.35× longer maps, and 8.5× power growth. These are design choices, not values recovered from the original fun. Trying to satisfy them can add grind even when the local encounters already feel wrong.
4. **Multiple apparent sources remain.** Enemy definitions show old HP/reward expressions followed by spreads that replace them. `shared/progression.ts` defines independent Desert roots, but `postForestLaneBalance` and `healthEliteBalance` still use Forest roots. Boss health also uses the Forest root and index. The intended tutorial isolation is unfinished.
5. **Boss reward indexing is inconsistent with the new roots.** The new file declares a separate Dragon reward of 350, but `shared/rules.ts` exports Dragon damage reward through `bossRewardValue("damage", 0)`, producing 1,050. Desert reward roots are being passed a Forest-inclusive index. Resolve the indexing before tuning the displayed constants.
6. **The replacement curves still drift apart.** Combat approaches 2.7× per map while rewards approach 1.618×. By Forest-relative map index 9, combat has multiplied 17,638× and rewards 299×: HP per same-lane reward is about 59× the Forest ratio. This is not a measured 59× increase in campaign time, but it guarantees that the underlying ratio is not preserved.

## Small diagnostic run of the current working tree

Command: `npm run balance:simulate -- --trials 3 --duration 24h --strategy mixed --json`

Default seed 1337, balanced research, default equipment/pathing. Three trials are a smoke diagnostic, not population estimates. Boss reward shares include modeled reward/drop effects. The simulator ignores lethal incoming damage.

| Map | Median map minutes | Boss fight minutes | Boss share of map power gain |
| --- | ---: | ---: | ---: |
| Forest | 21.22 | 4.46 | 54% |
| Desert | 6.00 | 2.77 | 73% |
| Snow | 5.83 | 2.66 | 76% |
| Lava | 5.29 | 2.29 | 68% |
| Water | 7.13 | 3.82 | 70% |
| Cloudspire | 13.60 | 8.55 | 70% |
| Moonfen | 19.84 | 13.54 | 71% |
| Crystal | 32.53 | 14.82 | 41% |

This version front-loads progression into bosses, then stretches their fights. Desert's measured time is approximately 49% travel and 46% boss combat, leaving little room for regular combat and its reward loop. This is stronger evidence than simply saying that a multiplier looks too large.

## A simpler automatic system

Preserve a small **encounter experience profile**, with a primary progress metric: **active seconds to the next meaningful improvement**. Measure damage improvement as faster kills, defense as more survivable hits, and regeneration as shorter recovery. Keep these separate rather than collapsing them into a single power score.

Calibrate one approved reference map, including early/middle/late builds. Recover its actual fight times and reward effects; do not copy its raw multipliers into later tiers. The first useful target is one map that feels right, not ten maps that satisfy an arbitrary chart.

Generate fixed authored values from that reference:

```text
enemy HP ≈ reference effective DPS × target fight seconds
raw enemy hit ≈ reference HP × desired HP fraction per hit / armor remaining-damage fraction
stat reward ≈ required raw stat gain / expected reward events on that track
boss HP ≈ intended pre-boss effective DPS × target boss seconds
```

These are authoring starting points. Use the actual discrete hit calculation, windup, crits, travel, and respawns to validate them. Equipment bonuses require conversion between effective and raw stat rewards. Armor rewards should be solved against the mitigation formula, not assigned a constant power weight. Regeneration should be checked against recovery and sustained incoming damage. Handle attack speed separately at its cap.

The reference build is fixed when content is authored. Do not scale enemies against the live player: earned strength must still make earlier enemies easier.

Future content should select a tier/reference build, combat role, reward track, and encounter placement. Roles retain deliberate differences: fragile dangerous attackers, durable defenders, and rewarding elites. One shared growth budget governs the next reference build; HP, threat, and rewards are derived from experience targets rather than three unrelated exponential ladders.

Show four primary readouts in the existing lab: ordinary fight duration, hits survived, time to meaningful improvement, and boss duration/payout share. Keep detailed macro curves available for diagnosis. Compare mixed, damage-focused, and boss-repeat routes so a prescribed balanced route cannot hide a dominant farm strategy.

Recommended order: finish source/index consistency; calibrate one reference map from the historical loop; validate its combat and recovery; generate two adjacent tiers and compare their entry/middle/exit experience; extend only once those preserve the feel. No particular fight duration or map-length target is established by this investigation.
