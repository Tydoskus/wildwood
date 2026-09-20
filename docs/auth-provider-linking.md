# Google and email sign-in account linking

Investigated September 16, 2026. Not implemented or enabled.

## Confirmed behavior

WildStat requests `openid profile email offline_access` from one SpacetimeAuth
client for web, iOS, and Android. Both email magic links and Google sign-in are
enabled in that client's project. The game keys characters by the authenticated
SpacetimeDB identity, which derives from the token issuer and subject.

The live SpacetimeAuth Users dashboard contains multiple pairs of distinct user
IDs sharing an identical email address. Email equality therefore does not
currently guarantee the same character. No linking control was exposed in the
project Settings, Identity Providers, or Users pages. The published API schema
offers user lookup and session revocation, but no account-link/merge operation.
This does not establish whether provider support can enable the behavior privately.

Existing guest registration uses a separate, one-use ownership proof. It does not
link two registered identities and must not be repurposed to overwrite a save.

## Preferred provider behavior

For new accounts, either verified login method should resolve to the first
registered subject for the same verified email. The same subject preserves all
existing save ownership, guild membership, messages, purchases, and map admission.
Do not automatically merge two already-played characters. Do not infer ownership
from a client-entered email or modify the signed token's subject locally.

## Support request draft — not sent

We're using SpacetimeAuth with Google and email magic-link sign-in enabled in the
same project. We can see distinct user IDs with the same email in the dashboard,
so changing sign-in methods can open a different character in our game.

Can you enable or document verified-email account linking for new registrations,
in both directions (email first, then Google; Google first, then email), preserving
the original user's subject? We couldn't find a linking option in project settings
or a linking endpoint in the public API. How do you handle email verification,
address changes, and collisions between two existing users?

## Application-side alternative

If provider linking is unavailable, introduce a server-authorized mapping from
authenticated identities to a stable character ID. This is an identity-system
change, not a client save-copy operation:

- Accept email ownership only from validated issuer/audience claims with
  `email_verified === true`. Keep the mapping private and indexed.
- Bind a new verified email to its first character atomically. Repeated login is
  idempotent. Existing populated-account collisions require explicit recovery.
- Resolve canonical character ownership consistently in reducers, procedures,
  private views, duel visibility, session takeover, and shard admission.
- Keep transport identity distinct from character identity on the client. Resolve
  the character before subscribing to account data or claiming guest progress.
- Transfer the authorized mapping through the root-to-shard admission path; never
  accept a client-supplied canonical identity as proof of access.
- Preserve token refresh and sign-out semantics. Do not introduce permanent
  shared bearer credentials or weaken existing subject checks.

Required tests: both registration orders, unverified/missing/forged claims,
different emails, simultaneous registration, existing save collisions, guest
migration, private chat and guild ownership, session takeover, reconnect/refresh,
and portal/Home travel using either login method.

## References

- https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/configuring-a-project/
- https://auth.spacetimedb.com/docs
- `src/coop/services/account-service.ts`
- `src/coop/security/oidc-id-token.ts`
- `spacetimedb/src/index.ts` (`hasSpacetimeAuthAccount`, `claimGuestAccount`)
- `src/coop/services/map-shard-client.ts`
