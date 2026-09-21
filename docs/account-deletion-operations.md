# Handling WildStat privacy and deletion requests

The owner confirmed on September 12, 2026 that support@wildstatmmo.com is a working
inbox they monitor and can use for privacy/account-deletion requests. The public
request path supports email and authenticated in-game requests. Settings → Account → Delete Account gives a 10-second cancellation period before recording a private `account_deletion_request` row. This starts the full deletion workflow; it does not falsely mark a reset as complete deletion.

## In-game request queue (0.735)

Check pending requests at least daily with the owner CLI:

```sh
spacetime sql --server maincloud wildwood-coop "SELECT * FROM account_deletion_request WHERE status = 'pending'"
```

The sender is verified by the controlling game session, including guests. Do not ask them to prove ownership again. Fulfil the workflow below within 30 days of `requested_at`. A repeated click preserves the first request date. Remove the queue row only after confirming full erasure; any necessary retained support record must not restore the account. Server-side submission does not yet automate provider/shard deletion. Do not claim instant deletion or mark this queue complete without completing that work.

## Receive and verify

1. Acknowledge the request and record the receipt date in the support conversation.
   The public target is completion within 30 days of verification. Explain any
   extension or exception to the requester.
2. Verify ownership using the existing authentication account email or an
   authenticated in-game support request. Never accept a display name alone as
   proof; names are public. Never request a password, bearer token, or sign-in code.
   Help guests verify ownership through their existing session where available;
   do not require reinstallation to submit a request.
3. Confirm the request covers the complete account or specified data only. Explain
   loss of character progress and virtual items before irreversible removal.

## Fulfil a verified request

This is an operator workflow requiring authorized database and authentication
administration. Do not label a request complete just because the email arrived.

- Identify the registered identity and any linked guest identities. Prevent a live
  session or pending save from restoring deleted account state.
- Remove the authentication account through SpacetimeAuth administration and
  revoke its active access. Do not delete the player's separate Google account.
- Remove associated player data from the root database (and from any retired
  map-shard database that still exists on Maincloud): profile, progress, inventory, research, currency, saved locations,
  rankings, social/guild associations, messages/reply evidence, reports, sessions,
  diagnostics, purchase-service records, and identity-linked migration backups.
- Request corresponding deletion from providers where the developer cannot
  directly remove the data. Record and communicate any legitimate retention
  exception and its period. Do not invent a provider backup-expiration deadline.
- Verify absence through owner-authorized queries and check that reconnecting or
  replaying a pending save does not restore the account. Preserve other
  players' independent records and shared guilds.
- Notify the requester when complete and state any remaining retention exception.
  A minimal support record may be retained while needed for the request or a
  legitimate unresolved dispute; it must not be used to restore gameplay data.

## Existing code limitation

The `removePlayerIdentityData` server helper is not a complete standalone account
deletion API. Its exposed `devDeleteLegacyPlayer` caller intentionally refuses
normal registered accounts. Do not remove those legacy safety checks or use
Reset Progress as account deletion. A verified request for a normal account needs
an owner-authorized targeted maintenance operation, including the provider
steps above. Test that operation on fixtures before touching live data.

No real player data was deleted as part of creating the policy/request pages.
