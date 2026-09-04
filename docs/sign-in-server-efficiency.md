# Sign-in subscriptions and server maintenance

September 4, 2026. Local changes; not deployed.

## Subscription lifetime

Fresh visitors remain disconnected until choosing an account action. Returning
saved guests retain three identity-scoped queries: profile, progress, and account
status. This preserves save linking and remembered-character UI without subscribing
the sign-in screen to chat, bosses, research, upgrades, or the leaderboard.

World entry replaces the account query set with gameplay queries, ending the old
subscription first. Gameplay readiness waits for both personal data and the active
map boss. A new hydration deadline also covers promotions from an already-ready
account session. Map changes replace only the boss-health subscription, and pending
changes coalesce rather than unsubscribing an SDK handle before it is active.

Boss health subscriptions drop from ten to one per playing client. Rare completion
results remain subscribed during play so leaving a map cannot silently lose an earned
reward. Private cutscene history hydrates before existing boss results. Leaderboard
snapshots and presence subscriptions start only after world entry.

## Server work

Migration 23 initializes/reconciles bosses and creates the five-minute sweep once.
Connection handling keeps the migration-version check, avoiding ten recurring boss
lookups per connection. Existing maintenance starts the migration on an upgrade,
including when no new client connects.

Every-minute maintenance retains expired duel handling, motion-schedule recovery,
leaderboard refresh checks, and boss regeneration. The new five-minute sweep owns
historical cleanup, telemetry cleanup, orphan reconciliation, online-count repair,
and research/upgrade fallback reconciliation. Those full sweeps run 80% less often.
Exact research and upgrade completion schedules remain unchanged and run offline;
only fallback recovery of missed schedules is less frequent. Normal disconnect
cleanup remains immediate.

These are reductions in work and subscription scope, not a measurement of hosted
CPU usage. Both client and module changes must be deployed to obtain all benefits.

## Installed iOS sign-in

The reported sequence included a brief browser sheet that closes automatically,
plus separate page-controlled changes: different logo alignment and an explicitly
black OAuth-return background. Keep the normal account screen while preparing the
redirect, with duplicate actions disabled. Verification uses the same logo size,
placement, and stable large-viewport geometry. Artwork starts during verification
instead of being suppressed until it ends. Auth-return CSS does not add the initial
black reveal overlay while the artwork decodes.

The system browser sheet still appears and dismisses on iOS's schedule. These changes
do not force, hide, or prolong native browser controls. Final installed-iPhone visual
verification belongs to the user; no physical iOS run was performed here.

## Verification

Tests exercise lightweight account scopes, world-entry promotion, rapid map changes,
late callbacks after disconnect, private history ordering, sign-in cancellation,
registration, stable outbound preparation, and artwork decode/disposal. The full
unit suite, client/server typechecks, bindings generation, and production builds
were run. Tutorial test expectations were aligned with the already-current authored
27/50 health rewards; production balance values were not changed in this pass.
