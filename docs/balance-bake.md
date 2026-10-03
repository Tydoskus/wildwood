# Revision 73 balance bake

The neutral bake preserves the effective live balance captured on September 25,
2026. The separate intentional pacing defaults are documented in
[balance-pacing.md](balance-pacing.md). A later [HP smoothing pass](campaign-health-smoothing.md) addresses the health-elite plateau separately.

## Who owns which number

Every balance number has exactly one owning file. Everything under `shared/` is
compiled into both the client and the server module, so a change there reaches
players only after **both** a client release and `npm run spacetime:publish:live`
(`release:live` refuses a diff that touches `shared/`). The server resolves a
map's numbers with `resolveMapBalance` (`shared/map-balance.ts`) and pins the
resulting snapshot to each map visit; the client installs that snapshot over its
compiled copy (`src/game/runtime/map-balance-loader.ts`) before combat starts.

Effective value = authored base × generated curve factor × live DB multiplier,
then the reward floor and the regen boost, resolved on the server.

| Numbers | Owner (edit here) | Kind | How it reaches play | How to change it |
|---|---|---|---|---|
| Campaign enemy HP, damage, speed, attack speed, radius, aggro, reward | `shared/enemy-base-values.ts` (Endless-only art rows: `shared/endless-enemies.ts`) | authored | compiled into client + server; resolved per visit | edit the row; client release + server publish |
| Campaign boss max HP (and the zeroed boss reward rules) | `shared/rules.ts` (`*_MAX_HP`, `*_REWARD_*`) | authored | same; client gets them via `installBossRuleValues` | edit the constant; release + publish |
| Boss attack damage | `shared/boss-damage.ts` `BOSS_DAMAGE_PROFILES` | authored | same; client gets live values via the snapshot's `boss.attacks` | edit the profile. `BOSS_DAMAGE_REFERENCE` (heaviest attack) is derived from it — never edit it separately |
| Boss regeneration | `shared/boss-regeneration.ts` | authored | resolved into the snapshot | edit; release + publish |
| Respawn timers, player base stats, chase-speed cap | `shared/rules.ts` | authored | compiled | edit; release + publish |
| Melee chase-speed ramp | `shared/enemy-definitions.ts` `campaignMeleeChaseSpeed` | authored | compiled | edit; release + publish |
| Regen reward boost, Endless growth steps | `shared/map-balance.ts` (`REGEN_REWARD_BOOST`, `ENDLESS_STEPS`) | authored | applied by the resolver | edit; release + publish |
| Endless default factors, baseline version, old reward factors for reading versionless saves | `shared/balance-baseline.ts` | authored | resolver defaults | edit; release + publish |
| Endless reward anchors / legacy reference rewards | `shared/legacy-enemy-rewards.ts` | authored, frozen | resolver (Endless only) | do not edit unless retuning Endless on purpose |
| Reference progression formulas (Endless growth, fallbacks) | `shared/progression.ts` | authored | resolver | edit; release + publish |
| Campaign enemy HP smoothing factors | `shared/campaign-health-curve.ts` | **generated** by `npm run balance:smooth-health` (`scripts/smooth-campaign-health.ts`) from revision 73 (`tests/fixtures/balance-revision-73.json`) | resolver, when settings carry `campaignHealthVersion: 1` | never hand-edit; change the generator or its source fixture and rerun |
| Campaign damage/reward curves and boss HP factors | `shared/campaign-progression.ts` | **generated** by `npx tsx scripts/build-campaign-progression.ts` from revision 75 (`tests/fixtures/balance-revision-75.json`) | resolver, when settings carry `campaignProgressionVersion: 1`; boss HP factors seed the default `bossHealth` multipliers | never hand-edit; rerun the generator |
| Reward floor rule (no later reward below an earlier one) | `shared/campaign-reward-floor.ts` | authored rule | resolver, with `campaignRewardVersion: 1` | edit; release + publish |
| Spawn camps per map: positions, counts, enemy types (→ population and kill budgets) | `shared/map-designs.json`; maps without a live design fall back to `shared/enemy-camps.ts` | authored by the map editor | compiled into client + server (`shared/enemy-defeats.ts`, `shared/campaign-combat-baseline.ts`, `src/game/map-design.ts`) | `npm run map:editor`; release + publish |
| Arrival, boss, portal and bench positions | `shared/map-editor-overrides.ts` | **generated** by the map editor from `shared/map-designs.json` | compiled into client + server | never hand-edit; save from the map editor |
| Map duration targets | `shared/campaign-pacing.ts` | authored | Balance Lab simulator and pacing scripts (not read by the running game) | edit |
| Armor curve and the curve-map formula | `shared/balance-curve.ts` | authored | `curveArmorReduction` in combat when a snapshot sets `ARMOR_CURVE`; `curveEnemy`/`curveBoss` are not used by the game today | edit; release + publish |
| **Live multipliers** per map and Endless (enemy HP/damage/reward/speed, boss HP/damage/reward, respawn, regen, drops) | live database: `map_balance_version` rows, `map_balance_head` points at the current one | runtime data | `setMapBalance` / `restoreMapBalance` reducers (developer-gated); the next map visit pins the new snapshot — **no deploy** | Settings → Developer tools → Balance ([live-map-balancing.md](live-map-balancing.md)) |
| Snapshot of the live multipliers | `src/balance/live-balance.ts` | **generated** by `npm run balance:sync` (read-only `spacetime sql` on maincloud); stamped with its revision and capture time | Balance Lab and audit scripts only — never the game | rerun `balance:sync`; never hand-edit |

Not sources: `tests/fixtures/balance-revision-73.json` and `-75.json` are frozen
settings revisions — the inputs of the two curve generators and of migration
tests. Edit them only to re-fit a curve on purpose. The untracked root
`enemy-stats.md` is a personal scratch file, not read by anything.

Change base values directly when authoring an enemy or boss. Do not multiply
them by the old progression reward scales again. New campaign maps continue to
use the registry; Endless still derives its anchor from the last map.

### Checks that keep it that way

- `scripts/generated-balance-files.test.ts` regenerates `campaign-health-curve.ts`,
  `campaign-progression.ts` and `map-editor-overrides.ts` from their committed
  inputs and fails on any byte difference (a hand edit or a stale generation).
  `live-balance.ts` needs maincloud to regenerate, so the test only checks the
  file is exactly what `balance:sync` writes for its own snapshot.
- `shared/campaign-balance-invariants.test.ts` holds the design rules rather than
  table values: each enemy track grows map over map, elites out-pay their camp,
  each boss out-lasts the last and everything on its map, map time grows, and
  `ENEMY_TYPES` is the authored table. A retune that keeps the rules passes
  without rewriting tests. The deliberate map 1 Spitter baseline (8 health,
  1.5 damage reward) stays pinned in `shared/map-balance.test.ts`.

## Saved settings

`BalanceSettings.baselineVersion = 2` means multipliers are relative to the baked
values. Versionless saved settings are converted by dividing their map reward
multipliers by the factors already baked into that map. Saving the converted
settings preserves the version, making conversion idempotent. Unknown versions
are rejected. Archived database rows and existing pinned map snapshots are not
rewritten. No table/schema migration or balance-reset reducer is required.

The current live revision converts to 1× for every campaign map factor. Endless
keeps reward multiplier 2, stat step 0.6, endurance step 0.06 and exponent 1.

## Endless compatibility

The older mathematical reference in `endless-balance.ts` is intentionally
retained: damage contains nonlinear armor compensation. Replacing those
reference constants with the live settings would change damage.

`legacy-enemy-rewards.ts` preserves the exact input values for that reference and
for cosmetic sprite rows in generated snapshots. The converted final campaign
reward factor is applied once by the resolver. Boss rewards keep their existing
independent factor. Adding a new enemy without a legacy entry uses its new base
reward normally.

## Verification

The bake was verified by `shared/balance-bake.test.ts`, which compared canonical
SHA-256 hashes of all 2,034 resolved snapshots (15 campaign maps and Endless
1–1002, both configuration versions) against `tests/fixtures/balance-revision-73.json`.
That suite was removed in commit 15963661; the
fixture remains the input of the campaign HP curve and of migration tests.

Server tests load a versionless revision, save it as version 2, change maps, and
verify rewards remain identical while the archived row remains unchanged.

A 20-run current-balance pacing simulation was compared with its pre-bake output;
all serialized map summaries and enemy metrics match exactly. The separate pacing defaults intentionally change campaign enemy rewards;
the revision 73 fixture continues to verify the neutral conversion unchanged.

## Intentional pacing pass

See [balance-pacing.md](balance-pacing.md) for the fitted defaults and verification.
Saved revision 73 still converts to its original 1× factors. Defaults apply where there is no saved configuration. Migration 43 creates
a new balance revision for existing databases in release 0.819; archived rows
and current map visits remain unchanged. The final-map reward adjustment is offset in the Endless
reward factor so the pacing pass does not retune Endless.
