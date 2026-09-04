# Testing boundaries

- `npm run test:unit` is the normal local/CI suite. It excludes
  `src/balance/simulator.test.ts`; `test:unit:watch` does the same.
- `npm run test:balance` explicitly opts into campaign simulations. Do not run
  it without a user request. Direct combat-formula/unit checks are not campaigns.
- UI structure tests install the actual HTML shell in a lightweight DOM and
  exercise settings navigation, ownership, exit controls, and accessibility IDs.
  A small set of parsed CSS checks covers hidden panels, scrolling, and overlay
  ordering; it is not a computed-style engine or proof of rendered layout.
- Asset checks retain real file, dimension, install-manifest, and cache-path
  validation. Do not replace these with exact artwork counts or palette checks.
- The user owns visual QA. Automated tests do not prove spacing, animation,
  contrast, clipping, touch behavior, or the appearance on real devices.

## Server callback tests

Crystal Hollows tests import the production module and execute its actual
reducers. The test-local mock replaces `spacetimedb/server` registration only;
the SDK's table/type builders and the gameplay callbacks are unchanged.
`tests/helpers/spacetime-memory-db.ts` builds isolated storage from the declared
schema with point/prefix indexes, unique constraints, defaults, auto-increment,
copy-on-read/write, and rollback. Its own tests cover those operations.

These tests cover unlock ownership, portal guards, protocol/controller checks,
boss range/cadence/projectile limits, contribution/reward/respawn behavior,
migration, guest transfer, names, and identity cleanup. They never contact a
live database. They are **not native-host integration tests**: transport and
serialization, f32 rounding, real scheduler execution, row-level visibility,
host transaction behavior, and load/concurrency still require separate checks.
Keep unsupported storage behavior explicit; do not grow a second game server
inside the fixture or duplicate reducer logic in test expectations.

## Manageability and repository checks

Keep the 1,000-line `src/wildstat-coop.ts` facade guard. Its purpose is bounded
agent context/token usage and a manageable composition layer, not performance.
Extract focused modules rather than minifying or stripping useful comments.
Launcher checks validate the launchers that exist, not an arbitrary exact count.
The map-editor catalog is checked against the actual shared map IDs.

## Incoming damage regression checks

The late-map damage suite tests post-armor hit fractions against fixed authored
reference builds, including extrapolated future tiers. Those builds are design
anchors, not measured player medians or adaptive difficulty. Boss HP and reward
budgets remain separate. Updating a tier's power/defense assumptions should
update the reference curve and document the reason, not introduce a one-off
map damage multiplier or silently weaken the tests.
