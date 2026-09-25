# Revision 73 balance bake

The neutral bake preserves the effective live balance captured on September 25,
2026. The separate intentional pacing defaults are documented in
[balance-pacing.md](balance-pacing.md). A later [HP smoothing pass](campaign-health-smoothing.md) addresses the health-elite plateau separately.

## Sources of truth

- `shared/enemy-base-values.ts`: explicit campaign enemy stats and rewards,
  including the existing health/armor/regen boosts and live map reward factors.
- `shared/rules.ts`: explicit campaign boss health and rewards.
- `shared/boss-damage.ts`: explicit boss damage references and attack values.
- `shared/balance-baseline.ts`: baseline version, old reward factors for reading
  saved revisions, and the currently live Endless settings as editor defaults.

Change these base values directly when authoring an enemy or boss. Do not
multiply them by the old progression reward scales again. New campaign maps
continue to use the registry; Endless still derives its anchor from the last map.

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

`shared/balance-bake.test.ts` compares canonical SHA-256 hashes captured before
editing the runtime against all 2,034 resolved snapshots: 15 campaign maps and
Endless 1–1002, each in both configuration versions. Every field and numeric value
must match exactly; sorting object keys only removes module-loader ordering.
The fixture is `tests/fixtures/balance-revision-73.json`.

The suite also checks conversion idempotence and a subsequent 1.5× reward edit.
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
