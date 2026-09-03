# Chat Moderation Plan

Status: lightweight content filtering, private message/profile reports, and character-synced blocking implemented in v0.610 (protocol 83); additional guardrails and moderator review UI remain planned. Last reviewed: 2026-09-03.

## Profile safety controls (September 3)

- Settings and Terms publish `support@wildstatmmo.com` for support and safety concerns.
- Other players' profiles offer Report Player and Block/Unblock Player. Reporting asks for a reason and an optional note (500 characters maximum), with explicit submission and error feedback.
- `player_report` is private and stores server-derived reporter/target names and identities, reason, note, status, and timestamp. Pending duplicates are rejected. Profile and message reports share the five-per-hour server guard. No automatic punishment is triggered.
- `player_block` is private; `my_player_blocks` exposes only the caller's rows. Both guests and registered characters store blocks on the server. Owned blocks and incoming blocks are transferred when a guest registers; full player deletion removes associated safety rows.
- Blocking hides the target's existing/future chat and speech bubbles, suppresses known blocked reply previews, and prevents new duels in either direction. It does not hide their avatar or remove them from the shared world. Existing duels finish normally. Settings lists saved blocks with an Unblock action, including offline targets.
- Moderation review is still manual through owner-authorized database access. Query `SELECT * FROM player_report WHERE status = 'pending'` for profile reports; message evidence remains in `chat_message_report`. These controls do not constitute an automated review service or complete store-compliance review.
- Protocol 83 adds the required private block-list subscription. Existing legacy protocol surfaces have not been removed.

## Decision

Use deterministic, server-authoritative moderation with client-side personal blocking. Do not add AI moderation, per-message HTTP calls, or background content scans.

This is the lightest design that provides useful abuse controls, keeps the common message path cheap, and supplies the reporting and blocking features expected for a future iOS and Android release.

## Current foundation

WildStat already routes public chat through one `sendChatMessage` reducer and bounds both message size and retained history in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts):

- 250-character maximum.
- Three-second server cooldown per sender.
- 24-hour retention.
- Maximum of 200 public chat rows.
- Private `/bug` reports that never enter public chat.

Global login and leave messages are currently disabled. If friend-only presence messages return later, they should use a separate targeted path rather than public World Chat.

Public messages now pass through a small server-side, high-confidence set for severe hate, explicit sexual content and solicitation, credible real-world threats, personal-information or credential requests, scams, and invite links. Comparison-only normalization handles Unicode, obvious leetspeak, separator evasions, and repeated letters. Flagged original text is never stored publicly: the row carries a server-owned moderation marker and displays *Message moderated.* instead. The same check protects new display names, while older names are repaired lazily when their owner next enters the world. Full sender/global rate buckets and moderator review tools remain planned; profile reports and synced blocking are implemented as described above.

## Message path and cost

```text
Controlling-player check
  -> account, rules, and mute lookup
  -> sender rate and duplicate limits
  -> deterministic normalization and content filter
  -> global traffic bucket
  -> public message insert
```

An accepted normal message should require only:

- One or two primary-key lookups.
- A scan of no more than 250 characters.
- One public message insert.
- The existing bounded history trim.

The dominant scaling cost is broadcasting each accepted global message to every subscribed player, not scanning 250 characters for blocked terms. Never query every recipient's block list while inserting a message.

## Minimal server state

| State | Storage | Purpose |
| --- | --- | --- |
| Chat guard | Extend the existing private `chatCooldown` row | Rules version, mute state, rolling sender limit, and duplicate fingerprint |
| Global bucket | One private singleton row | Caps total accepted World Chat traffic during spam or reconnect storms |
| Blocks | Private owner/target rows | Synchronizes registered-account blocks across devices |
| Reports | Private indexed rows | Preserves selected-message evidence for developer review |

Raw block and report tables must not be public. Expose only the controlling player's own block list through an owner-authorized read path. Reports remain developer-only.

## Implementation phases

### 1. Server guardrails

- Keep the existing three-second cooldown.
- Start with a rolling limit of 10 messages per minute for registered accounts and 5 per minute for guests.
- Require guests to finish the introduction before posting.
- Reject an identical normalized message repeated within 60 seconds.
- Add a global ceiling of roughly 10 accepted messages per second. When full, reject with `Chat is busy—try again.`
- Check mute or chat-disabled state before doing normalization work.
- Derive the player identity from `ctx.sender`; never accept a sender identity from the client.

These are initial tuning values, not permanent balance constants. Adjust them from observed abuse and traffic rather than adding more machinery preemptively.

### 2. Lightweight content filtering (implemented)

- Keep the filter as pure, deterministic server code with unit tests.
- Build a comparison-only form by trimming, Unicode-normalizing, lowercasing, collapsing separators, folding a small set of obvious leetspeak substitutions, and bounding repeated letters.
- Match a deliberately small, high-confidence list covering severe slurs, sexual content, credible threats, personal-information solicitation, and common scam or invite links.
- Replace moderated public content with *Message moderated.* and a server-owned marker; never retain the submitted original in public history.
- Apply the same filter to new display names. Recheck existing names lazily on their next world entry or rename instead of scanning the entire account table; forced safety renames receive a generated name and may immediately choose a valid replacement.
- Do not store every moderated original. Store only small aggregate counters if later diagnostics show they are needed.

Favor low false-positive rates. The block list is a safety backstop, not a general dictionary of rude words.

### 3. Player controls without menu clutter (profile controls implemented; drawer follow-ups planned)

- Tapping a fullscreen message now opens a compact, swipe-dismissable action sheet with **Copy**, **Reply**, and **Report**. Replies carry a server-owned snapshot of the selected safe message for their dimmed inline preview. Usernames remain plain text; portraits alone open profiles.
- Add **Block Player** to the same sheet when blocking is implemented.
- Another player's profile exposes clearly labeled **Report Player** and **Block Player** actions.
- Blocking immediately removes that player's visible World Chat messages and overhead speech bubbles.
- Hold blocked identities in an in-memory client `Set`, so rendering checks are constant-time and require no server query per message.
- Registered and guest characters sync blocks through private server state; registration transfers the guest's blocks.
- Show a brief Undo notification after blocking.
- Settings now shows a small entry for reviewing and unblocking players only after the first block exists.

Blocking is personal presentation filtering. The server continues broadcasting the bounded public chat stream; it does not build a custom stream for every recipient.

### 4. Private report queue (message and profile reports implemented)

Support both message reports and player-profile reports through one server-authorized reducer. A message report stores:

- Reporter and accused identities.
- Selected message ID.
- A snapshot of the sender name, message text, and send time.
- Reason: Harassment, Hate/Sexual Content, Spam/Scam, Personal Information, or Other.
- Review status and report time.

Profile reports use a separate private `player_report` table with no selected message and a short optional note. Selected-message reports verify the public message before copying its evidence.

Message reports use a private server table, verify the selected message and accused sender from server state, reject self/duplicate reports, and preserve the evidence snapshot after public history expires. Message and profile reports share a one-row-per-reporter guard enforcing five reports per hour. Profile reports validate the target against server profiles and reject duplicate pending reports for that target.

### 5. Developer moderation tools

Add a developer-only report queue with these actions:

- Dismiss.
- Delete Message.
- Force Rename.
- Mute 1 Hour.
- Mute 24 Hours.
- Permanently Disable Chat.

Every mutation must authorize the existing developer identity from `ctx.sender`. Never automatically punish a player solely because several reports were submitted; coordinated false reporting is cheap.

### 6. Rules and policy surfaces

- Require every player to accept short, versioned Community Rules before their first public message.
- Define prohibited content and behavior in the rules.
- Publish Terms of Use, a moderation policy, and an easy-to-find support contact.
- Provide an actual review routine so reports receive timely action.

Apple's current User-Generated Content guideline requires objectionable-content filtering, in-app reporting, user blocking, and published contact information. Google Play's current UGC policy requires rules or Terms acceptance, in-app reporting and blocking of content and users, and ongoing moderation. Recheck the live policies before store submission:

- [Apple App Review Guidelines, section 1.2](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play User-Generated Content policy](https://support.google.com/googleplay/android-developer/answer/9876937)

This plan assumes WildStat is not submitted in a children-specific category. For a children-focused release, preset phrase chat is considerably safer than unrestricted text chat.

## Explicitly avoid for now

- AI or toxicity APIs on every message.
- IP or device fingerprinting.
- Per-recipient server-side chat filtering.
- Storing every rejected message.
- Automatic bans from report counts.
- A generalized moderator-role system beyond the existing developer identity.
- Scheduled scans of chat history or account names.

## Escalation order

If abuse becomes significant, make guest chat read-only first. If global chat bandwidth becomes measurable, split subscriptions by map or channel next. Consider external classification only for the private report-review workflow, never as a synchronous dependency of ordinary chat.

## Validation checklist

- Unit-test normalization, evasions, allowed near-matches, duplicate detection, sender limits, and mute expiry.
- Test report authorization, evidence snapshots, duplicate-report limits, and developer-only actions.
- Test block hydration, immediate hiding, speech-bubble suppression, Undo, and account migration.
- Confirm moderated original text never enters the public table and only the marked replacement is broadcast.
- Confirm block and report rows cannot be subscribed to by other players.
- Load-test a global message burst and verify the singleton bucket bounds accepted inserts and fanout.
- Before release, build and publish the server, regenerate bindings for schema or reducer changes, deploy the matching client, and recheck the current Apple and Google policies.
