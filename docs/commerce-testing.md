# Phone commerce testing

The native preview includes Google AdMob demo rewarded ads and a separate
RevenueCat Test Store purchases in the fullscreen Shop. Nothing in this implementation accepts
real-money payments or credits the live Gem wallet. StoreKit / Google Play
sandbox verification and live checkout are still pending account configuration,
and a trusted server fulfillment integration. Native account sign-in is configured.

## Try rewarded ads

Rebuild with the existing iPhone or Android launcher. The game's **Watch Ad**
respawn boost uses the native SDK. The wrapper uses Google's public demo app IDs
and rewarded-ad units; no AdMob account is needed for this test inventory.

Completing the reward and closing the ad activates the existing 30-minute
respawn boost. Dismissal before earning the reward or playback failure grants
nothing. The bridge waits for dismissal before resuming gameplay. An offline
load can retry when the device reconnects or the app returns to the foreground.

The iOS preview, Android, and web all use the full **30-minute** boost.
The ad's own playback duration is unchanged. A failed native load now leaves a
usable **Retry Ad** action instead of permanently disabling the video icon.

## Try purchase dialogs

1. Create a RevenueCat project at https://app.revenuecat.com/ and open its
   **Test Store**. This test store does not need an Apple/Google store connection.
2. Use the four consumable Gem packs already configured in the WildStat project
   (see the setup update below).
3. Copy `mobile/commerce.example.json` to `mobile/commerce.local.json` and replace
   the placeholder with the **public Test Store SDK key**, starting `test_`.
   This key is bundled in the app. Never put a secret API key here.
4. Rebuild with the phone launcher, then tap **Shop**.
   Select a product and simulate success, failure, or cancellation.

The screen reports test success or cancellation. SDK results are not a server
receipt-validation result or proof of payment. No Gem balance is changed. Only Test Store keys are accepted; Apple and Google SDK keys are rejected
by this preview so it cannot accidentally charge a normal Play tester.

RevenueCat Test Store simulates transactions; it does **not** test Apple's or
Google's native billing sheet. Connecting their actual sandboxes is the next stage.

## Account status and next stage

- Seller choice: individual / sole proprietor; no separate company assumed.
- Google Play: the previous account was closed for inactivity on March 20, 2024.
  Its notice explicitly permits a new account. New enrollment is required before
  Play Console product setup and license testing.
- Apple Developer membership: not yet confirmed.
- AdMob: created under `xilem11@gmail.com`; iOS and Android rewarded ad units
  are configured. The W-9 is approved and payment profile complete; account verification remains pending.
  See [AdMob setup](admob-setup.md) for the app and ad unit IDs.
- RevenueCat: WildStat Test Store is configured (details below). Stripe is not configured.
- Separate payout account: can be configured later; not required for these demo
  ads and Test Store dialogs.

For actual Gem sales, finish native account sign-in, choose stable production
bundle IDs and Gem packs, configure stores under the correct legal seller, and
implement trusted receipt/webhook fulfillment with durable deduplication and
refund handling. Sandbox credits must live in a separate test database/wallet.
The preview currently connects to the live game as a guest, so this lab deliberately
does not call a Gem-grant reducer.

## Verification

`npm --prefix mobile run typecheck`, `npm --prefix mobile test`, and
`npm --prefix mobile run build` check the TypeScript, cancellation/concurrency and
reward callback handling, and packaged web bundle. `cap sync` registers both native
SDKs with the iOS and Android projects. Device playback and dialogs remain user QA.

Verified on September 8, 2026: all five commerce tests, mobile TypeScript, packaged
web build, Capacitor sync, and an unsigned physical-device iOS build passed
with Xcode 26.5. Android compilation is pending installation of the Android SDK
on this Mac.

Sources: [AdMob test ads](https://developers.google.com/admob/android/test-ads),
[RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store),
[Play license testing](https://developer.android.com/google/play/billing/test),
[Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).

## September 8 setup update

RevenueCat project **WildStat** (`a2ee1d7b`) and Test Store (`appa9ffd8149d`) are
created. Four consumable products match `shared/gem-packs.ts`: `gems_60`,
`gems_220`, `gems_800`, and `gems_3300`, at $1.99, $6.99, $24.99, and $99.99 USD.
The public Test Store SDK key is in ignored `mobile/commerce.local.json`.

The fullscreen **Shop** now opens Test Store purchase dialogs in configured
native previews. It clearly labels test transactions; they do not credit the
live wallet and do not consume a production purchase allowance. The separate
floating purchase-lab button has been removed. Web purchases stay disabled.

The root database purchase reservation/fulfillment code is implemented locally
and disabled by default. It has not been published or configured. A dedicated
verifier must validate production receipts, account/product ownership and final
payment status before calling fulfillment. Test Store transaction IDs must never
be relabeled as production store proofs. Apple/Google apps, actual store products,
server verifier hosting and webhook integration remain to be connected. The verifier
implementation is now in `services/gem-verifier`; it is not deployed.
