# Google Play privacy and Data safety — September 12, 2026

App: WildStat (`com.wildstatmmo.preview`). Both forms are saved in Play Console
and appear under Changes not yet submitted for review. The app-information
checklist is cleared. Review remains disabled pending the dashboard's test-track
setup (countries, testers, and release confirmation); no closed/public rollout
was performed as part of this task.

## Published resources

- https://wildstatmmo.com/privacy.html
- https://wildstatmmo.com/delete-account.html

Both URLs were verified to redirect to their extensionless equivalent and return
HTTP 200 with the correct page content. Site commit: `5dcdcda`.
The user confirmed support@wildstatmmo.com is a monitored request inbox.
Requests are handled manually; see `account-deletion-operations.md`.

## Saved declarations

Data collection: Yes. Encrypted in transit: Yes. Account creation: OAuth.
Account deletion and deletion of selected data: the public request URL above.
No independent-security-review or UPI badge claimed.

All selected types are declared non-ephemeral:

| Data | Collection | Sharing | Collection purposes |
| --- | --- | --- | --- |
| Name | Optional | No | Functionality, account management |
| Email address | Optional | No | Functionality, security/compliance, account management |
| User IDs | Required | No | Functionality, analytics, security/compliance, account management |
| Other personal info (age band, profile selection) | Required | No | Functionality, security/compliance, account management |
| Approximate location | Required | Yes | Analytics, advertising, fraud prevention/security |
| Other in-app messages | Optional | No | Functionality, security/compliance |
| Diagnostics | Required | Yes | Analytics, advertising, fraud prevention/security |
| App interactions | Required | Yes | Functionality, analytics, advertising, fraud prevention/security |
| Other user-generated content (reports/submissions) | Optional | No | Functionality, analytics, security/compliance |
| Device or other IDs | Required | Yes | Analytics, advertising, fraud prevention/security |

Sharing purposes for the four SDK-related types: analytics, advertising,
fraud prevention/security. Service-provider processing and user-initiated social
sharing are treated under Google's stated sharing exemptions. The ads SDK can
initialize/preload without the player choosing to watch an ad, so its collection
is not declared optional simply because watching is optional. Advertising-ID
controls do not opt the user out of every SDK identifier.

Purchase information is not selected for the current Android build with paid
purchases disabled. Reassess before enabling RevenueCat or live billing. Do not
infer absence of SDK collection from the fact that ads are test ads.

## Android follow-up

Built signed versionCode 3 (`0.657`) with privacy/deletion links in Settings →
Account. Artifact: `mobile/android/app/build/outputs/bundle/release/app-release.aab`.
This new bundle has not been uploaded or released in Play Console.
It includes the existing local shop-crash and connection-activity fixes as well
as the privacy links. The separate working-tree changes remain uncommitted.

Checks: settings-tab tests (2), TypeScript check, release check, client and mobile
builds, local/public page links, Android release build, archive integrity,
embedded privacy assets/settings links, disabled test-purchases marker, and JAR
signature verification passed.

## Sources

- https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- https://developers.google.com/admob/android/privacy/play-data-disclosure
