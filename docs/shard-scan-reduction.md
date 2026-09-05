# Shard scan reduction

The one-second root/map exchange retains its admission, reward, and lease latency.
Unchanged exchanges now read a 64-byte revision record per member instead of
reconstructing the account snapshot and reading its previous JSON copy.

Snapshot source mutations use typed insert/update/delete helpers. These cover
player state, progress, profile, research, account status, equipment upgrades,
and duel participants. They increment a durable revision only for identities
already being replicated. A snapshot acknowledges the revision captured before
HTTP, so concurrent edits remain pending. Missing admissions cause a full resend;
map transfers discard the previous revision state. A regression guard rejects
new direct source-table writes in the root reducer module.

Checkpoint replies carry a cursor. The root acknowledges it in the transaction
that persists the positions, and the map avoids scanning checkpoints while that
cursor is current. Failed commits leave the previous cursor for retry. Old roots
without a cursor continue receiving full replies, and new roots accept old map
replies without a cursor. Reward reads stop at 100 rows instead of materializing
the whole outbox before slicing; acknowledgments remain durable and idempotent.

Map maintenance runs presence cleanup and regeneration for its own boss. Global
leaderboards, duels, history, telemetry, research, and account cleanup remain on
the root. Root boss regeneration is skipped while regional authority is enabled.
Map boss regeneration remains scheduled even when empty, preserving recovery.

## Validation

- Sixty unchanged coordinator exchanges perform zero source-account/equipment or
  legacy snapshot-cache reads in the regression fixture.
- Mutations and rollback are exercised for all seven snapshot source tables.
- A profile edit during HTTP is transmitted on the following exchange.
- Missing admissions force a full snapshot resend.
- Checkpoints retry until acknowledged and are not scanned between captures.
- Regional maintenance avoids account scans and unrelated boss rows.
- Existing portal, reward retry, movement, and account tests remain applicable.

These are code-level checks, not a measured production billing reduction.

## Deployment

This is a server-only change. Publish the root and existing map databases without
clearing data, and stage the new regional module for future maps. The changes add
one private table and append a defaulted cursor field to a private table. The
legacy snapshot table is retained for safe schema migration; active entries are
deleted without reading them when the new revision state is initialized. Public
client schemas and protocol version are unchanged.
