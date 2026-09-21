# WildStat privacy information — draft for review

Prepared September 12, 2026. **Not published and not submitted to Google.**
The retention and deletion sections require an operational decision before this
can become a public policy. Do not paste a nonexistent URL into Play Console.

## Proposed privacy-policy text

WildStat processes information to run its multiplayer fantasy game, save your
progress, connect players, protect the community, and diagnose problems. For
privacy questions, contact support@wildstatmmo.com.

### Information processed

- Account and profile information: guest or registered account identifiers,
  sign-in information handled by our authentication provider, your chosen player
  name, avatar, optional gender selection, age band, and acceptance of the game
  terms. The game sends an age band to its server, not your birth date or exact age.
- Gameplay: character stats, equipment, inventory, research, rewards, game-world
  activity, guild membership, duels, rankings, and virtual-currency records.
- Communications: messages you send, player reports, block lists, bug reports,
  and information you choose to send to support.
- Technical information: connection and session identifiers, network information
  processed by hosting providers, app version, connection outcomes, timing, and
  structured diagnostics used to investigate performance and reliability.
- Advertising information: the Android build includes Google AdMob test ads.
  Google's ads SDK can process IP addresses (including approximate location),
  device identifiers, app interactions, and diagnostics for advertising,
  analytics, and fraud prevention. Test ads do not mean no data is processed.

The current Android internal release disables in-app purchases. If purchases are
enabled in a later release, this policy and the store disclosures must first be
updated to describe the payment and purchase-service integrations actually used.

### How information is used and disclosed

Information is used to authenticate players, save and synchronize game state,
provide multiplayer and social features, deliver rewards, moderate abuse,
respond to support requests, and maintain the game. Game servers and sign-in
services are provided through SpacetimeDB and SpacetimeAuth. Hosting and
advertising providers process information needed to provide their services.

Player profiles, stats, equipment, rankings, and other shared game state are
available to other players. Messages are visible to the audience of the channel
you use. Avoid including sensitive personal information in messages or reports.

The game uses HTTPS and secure WebSocket connections for its online services.
No transmission or storage system can guarantee absolute security.

### Retention and deletion — owner decision required

Before publication, specify the actual retention periods or criteria for active
and inactive accounts, support and moderation records, logs, and backups. Identify
any records that must be retained after an account-deletion request and for how
long. Do not promise automatic deletion after 90 days: that behavior does not
currently exist.

Provide a working, identity-verified account-deletion request process, available
both in the app and on a public web page. Requests must cover the authentication
account and associated game data; clearing local storage or resetting character
progress does not delete the account.

### Age requirement and policy updates

WildStat is intended for people aged 13 and older. Players below the age of legal
majority must have a parent or guardian review and accept the game terms. Contact
support@wildstatmmo.com with concerns about a child's information.

Publish the effective date with this policy and update it when the game's data
practices change.

## Proposed account-deletion request page

Title: **Delete your WildStat account and game data**

Proposed request route: email support@wildstatmmo.com with the subject
“WildStat account deletion,” your player name, and the email associated with your
account, if any. Do not send passwords or payment details. For a guest account,
keep the game installed while ownership is verified.

This route must be confirmed as monitored and backed by a working deletion
procedure before publication. The public page also needs the exact data deleted,
any retained records and retention periods, and the expected processing time.

## Implementation gap identified

`removePlayerIdentityData` is an internal server helper. Its only current caller,
`devDeleteLegacyPlayer`, is restricted to qualifying legacy players and refuses
normal registered accounts. It is not a general account-deletion service.
Implement and verify a workflow covering the authentication identity, root game
database, any retired map-shard databases, and applicable retained records before claiming deletion
support in Play Console. Do not loosen the legacy maintenance reducer as a shortcut.

## Console status

- Nine of eleven app-information items complete: listing, category/contact,
  sign-in details, ads, audience, content rating, government, finance, and health (category and
  contact count as one item).
- Listing contains an icon, feature graphic, three phone screenshots, and both
  descriptions. Its status is “Ready to send for review.”
- Content rating completed September 12, 2026, 3:46 PM. Console shows IARC status
  “Completed”: ESRB Everyone 10+ (Fantasy Violence, Users Interact), PEGI 7,
  USK 12+, and regional equivalents. The user advanced past the IARC agreement
  before the questionnaire was completed. Paid digital purchases were declared
  absent for the current Android build; update this answer before enabling them.
- Data safety is saved as a partial draft: data collection Yes, encryption in
  transit Yes, OAuth account creation. Required deletion URL is intentionally blank.
- Privacy policy is not submitted because a dedicated published policy is missing.

## Official references

- [Google Play user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [AdMob Android data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
