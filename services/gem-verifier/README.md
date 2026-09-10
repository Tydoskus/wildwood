# WildStat Gem receipt verifier

This service consumes RevenueCat's store-verified payment webhooks. It verifies
both the configured Authorization header and the HMAC-SHA256 signature over the
exact request bytes, with a five-minute delivery timestamp tolerance. It then
forwards a minimal payment event to the dedicated SpacetimeDB reducer. The phone
cannot submit purchase success as proof, choose a Gem amount, or call fulfillment.

Only production `APP_STORE` and `PLAY_STORE` consumable purchases for the four
catalog product IDs are accepted. Test Store, sandbox, temporary grants,
subscriptions, family sharing, quantities greater than one, and unfamiliar app
IDs never award Gems. Receipt verification against Apple/Google is performed by
RevenueCat; this service authenticates its result. It does not independently
validate Apple's JWS or call Google Play's receipt API.

## Run and deploy

- `npm run commerce:typecheck`
- `npm run commerce:test`
- Set the environment variables documented in `.env.example`, then run
  `npm run commerce:serve`. The process does not implicitly load `.env` files.
- For container hosting, build from the repository root using the Dockerfile's
  command. Configure secrets at runtime; no secret files are copied into the image.
- Route public HTTPS to port 8787. The production webhook path is
  `/webhooks/revenuecat`; `GET /health` is a process liveness check.

Runtime Node 22 is recommended. The service binds to loopback by default;
container deployment sets HOST=0.0.0.0. Do not expose HTTP without TLS termination.
Logs do not include tokens, webhook bodies, player identity, or payment details.

## Connect after Apple/Google activation

1. Create Apple/Google apps and the catalog consumables in RevenueCat. Put their
   RevenueCat app configuration IDs in `REVENUECAT_STORE_APPS`. Never use the
   existing Test Store app ID for production.
2. Publish the root SpacetimeDB module with commerce still disabled. Use a
   dedicated service identity/token, and have the database owner call
   `configure_gem_commerce(verifier, false)` with that identity. The token must
   not be the database owner's token or a player's session token.
3. Deploy the service behind HTTPS with the dedicated token and runtime secrets.
4. Create a RevenueCat webhook integration for the production apps, configure
   the Authorization header and enable HMAC signing. Copy its signing secret
   directly to the hosting provider's secret manager. Subscribe to non-renewing
   purchases and cancellations. Test the endpoint using RevenueCat's test event.
5. The production native adapter must configure RevenueCat initially with
   `appUserID = wildstat:<64-character lowercase Spacetime identity>`, after
   signed-in account authentication. Do not start anonymously and alias accounts.
   Configure RevenueCat to keep purchases with the original App User ID; aliases
   and transfers need deliberate reconciliation instead of automatic credit.
6. Before opening the store sheet, await `reserve_gem_purchase(packId,
   reservationId)` on the authenticated game connection. Reuse that reservation
   for retries. A client cancellation alone cannot release the allowance; the
   verifier/operator must confirm no payment is pending first. Unresolved orders
   can remain locked for the rest of the day.
7. Enable checkout only after a separate sandbox wallet integration has passed
   store tests and the production native adapter is connected. The current phone
   preview still uses Test Store and never calls this production service.

Steps requiring production app IDs, runtime secrets, hosting, or Apple/Google
store access have not been performed by building this service.

## Delivery and daily limits

The service returns 200 only after SpacetimeDB commits the receipt result, or for
an explicitly ignored non-payment/test event. Database outages and timeouts return
503 so RevenueCat retries. The database stores event IDs/hashes and globally unique
store transaction references; retries cannot mint additional currency, including
when the first HTTP response was lost after commit.

The server matches the canonical account, exact product, and **UTC payment day**
to an existing pending allowance created before payment. It credits the catalog
quantity, marks the reservation fulfilled, and records the receipt and wallet
ledger entry in the same transaction. A second paid receipt, an unmatched order,
or a purchase crossing midnight without that day's reservation is stored as
`review` without credit. Operators must reconcile/refund it; never silently drop
it or automatically create an allowance after payment. The original pending
reservation is retained. Review rows appear in `dev_gem_purchase_review`.

Pending reservations do not expire automatically: Apple Ask to Buy and other
store approvals may finish later. Paid events arriving after midnight require
review if they cannot match that payment day's allowance. The UI/production
adapter should explain a pending order and avoid opening duplicate checkout.

## Refunds and operations

A `CUSTOMER_SUPPORT` cancellation is treated as a full consumable refund. If it
arrives before purchase, a durable tombstone prevents the delayed purchase from
crediting Gems. For an already fulfilled purchase with enough Gems, the original
quantity is debited once with a separate refund ledger reference; its daily
allowance stays used. If the Gems were spent, the receipt enters `refund_review`
and server-side Gem spending is held. After support reconciles/funds the wallet,
retry the authenticated refund webhook to debit the quantity and release that
receipt's hold. Other holds remain active. This is a manual reconciliation path,
not automatic debt recovery or a negative balance.

Unknown cancellation reasons return 422 for operator review. Refund reversals
are not automatically recredited; support must reconcile them. RevenueCat's
webhook retry count is finite, so monitor failed deliveries and replay failures
after recovery. Alerts/hosting monitoring still need to be configured at deploy.
Never acknowledge database failures early or expose a public grant/cancel API.

Sources: [RevenueCat webhook authentication and delivery](https://www.revenuecat.com/docs/integrations/webhooks),
[event fields and refund reasons](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
