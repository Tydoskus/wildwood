# Gems commerce architecture

Status: wallet, ledger, daily rewards, research/upgrade skips, bag capacity,
and the second upgrade bench are implemented. Store checkout and receipt
verification for buying Gems with real money are not implemented.

## Non-negotiable economy rules

- SpacetimeDB owns every Gem balance. A browser, iOS app, or Android app never
  supplies its resulting balance.
- Every credit or debit writes an immutable ledger row in the same transaction
  as the wallet update.
- Each store purchase, webhook, refund, grant, and spend uses a unique external
  reference. Replaying the same reference must never award Gems twice.
- Purchased Gems do not expire. Resetting game progress does not reset Gems.
- Only the wallet owner receives the balance view. Other profiles never expose
  their paid-currency balance.
- Guest Gems transfer atomically when the guest save becomes a signed-in
  account. Real-money checkout should require a signed-in account so purchases
  can be recovered and shared across the player's devices.
- Gem packs are consumable products. Gems can be spent only inside WildStat and
  are never cashable, transferable between players, or usable for wagering.

## Purchase pipeline

1. The signed-in client requests WildStat's product catalog. The server maps
   immutable platform product IDs to an exact Gem quantity; client metadata is
   display-only.
2. iOS launches StoreKit, Android launches Google Play Billing, and web launches
   a hosted checkout session such as Stripe Checkout.
3. The client sends only the store proof or checkout identifier to a trusted
   verification service. Web checkout is fulfilled from a signed webhook, not
   from the success-page redirect.
4. The service verifies the transaction directly with Apple, Google, or Stripe,
   confirms the paid product and WildStat account, and rejects pending,
   canceled, mismatched, or previously credited purchases.
5. One database transaction credits the wallet and inserts the ledger row using
   `apple:<transaction-id>`, `google:<purchase-token>`, or
   `stripe:<checkout-session-id>` as its external reference.
6. Only after durable credit does the backend acknowledge/consume the mobile
   purchase. Store notifications and refund/void events reconcile later state.

Official implementation references:

- Apple In-App Purchase setup and server notifications:
  https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases
- Apple App Review payment rules:
  https://developer.apple.com/app-store/review/guidelines/
- Google Play Billing backend integration:
  https://developer.android.com/google/play/billing/backend
- Google one-time purchase lifecycle:
  https://developer.android.com/google/play/billing/lifecycle/one-time
- Stripe idempotent webhook fulfillment:
  https://docs.stripe.com/checkout/fulfillment

## Spending pipeline

Each Gem feature gets a purpose-built server reducer. The reducer must validate
the current cost and eligibility, debit Gems, apply the benefit, and write its
ledger row atomically. A generic client-controlled `spendGems(amount)` reducer
must never be added.

Suggested order:

1. Permanent bonus research or upgrade slots, stored as server entitlements.
2. Finish or shorten the active research timer, priced from verified remaining
   server time.
3. Double offline-progress time for a clearly stated duration and cap.
4. Cosmetics and convenience items that do not distort competitive PvP.

Before pricing competitive progression, decide whether duel snapshots ignore
paid acceleration, matchmaking accounts for it, or the shop remains limited to
convenience and cosmetics.

## Product and launch preparation

- Choose the legal seller: individual/sole proprietor or a registered company.
  Keep the same legal name and address across tax records, bank accounts, Apple,
  Google, and the web processor.
- Reserve the public game/company name, domain, support email, privacy-policy
  URL, terms, refund policy, and recognizable card-statement descriptor.
- Decide 3-5 Gem pack quantities and target prices. Create stable product IDs
  only after the pack design is final; maintain an explicit server-side mapping
  for Apple, Google, and web price IDs.
- Prepare a payout bank account that matches the enrolled seller, taxpayer ID
  and tax forms for the seller's jurisdiction, proof of identity, business
  registration documents, and a D-U-N-S number if enrolling an organization.
- Configure Apple Developer/App Store Connect, Google Play Console and its
  merchant payments profile, and a verified web payments account. Enable 2FA
  and keep production API keys only in a server-side secret manager.
- Establish bookkeeping for gross sales, store fees, sales tax/VAT/GST,
  refunds, chargebacks, payouts, and outstanding Gem liability. Confirm tax and
  consumer-law obligations with a qualified accountant or attorney.
- Test interrupted, duplicate, pending, refunded, chargeback, account-switch,
  reinstall, offline, and cross-platform purchases before enabling live packs.
