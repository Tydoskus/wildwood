# Chat Moderation Plan

Status: first content-filtering slice implemented; remaining phases planned. Last reviewed: 2026-08-25.

## Decision

Use deterministic, server-authoritative moderation with client-side personal blocking. Do not add AI moderation, per-message HTTP calls, or background content scans.

This is the lightest design that provides useful abuse controls, keeps the common message path cheap, and supplies the reporting and blocking features expected for a future iOS and Android release.

## Current foundation

Wildwood already routes public chat through one `sendChatMessage` reducer and bounds both message size and retained history in [`spacetimedb/src/index.ts`](../spacetimedb/src/index.ts):

- 250-character maximum.
- Three-second server cooldown per sender.
- 24-hour retention.
- Maximum of 200 public chat rows.
- Private `/bug` reports that never enter public chat.

Global login and leave messages are currently disabled. If friend-only presence messages return later, they should use a separate targeted path rather than public World Chat.

The first implementation slice now checks public messages against a small server-side, high-confidence set for severe hate, explicit sexual content, credible real-world threats, credential scams, and invite links. Flagged text is never stored publicly: the row carries a server-owned moderation marker and displays *Message moderated.* instead. Rate buckets, reports, blocks, and moderator tools remain planned.

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

### 2. Lightweight content filtering

- Keep the filter as pure, deterministic server code with unit tests.
- Build a comparison-only form by trimming, Unicode-normalizing, lowercasing, collapsing separators, folding a small set of obvious leetspeak substitutions, and bounding repeated letters.
- Match a deliberately small, high-confidence list covering severe slurs, sexual content, credible threats, personal-information solicitation, and common scam or invite links.
- Reject instead of silently rewriting, using the neutral response `Please revise your message.`
- Apply the same filter to new display names. Recheck existing names lazily on their next login or rename instead of scanning the entire account table.
- Do not store every rejected message. Store only small aggregate counters if later diagnostics show they are needed.

Favor low false-positive rates. The block list is a safety backstop, not a general dictionary of rude words.

### 3. Player controls without menu clutter

- Tapping a fullscreen message opens a compact action sheet with **Report Message**, **Block Player**, and **Cancel**.
- Another player's profile exposes clearly labeled **Report Player** and **Block Player** actions.
- Blocking immediately removes that player's visible World Chat messages and overhead speech bubbles.
- Hold blocked identities in an in-memory client `Set`, so rendering checks are constant-time and require no server query per message.
- Registered accounts sync blocks through the private server state. Guests keep blocks locally until they register or clear browser data.
- Show a brief Undo notification after blocking.
- Add a small settings entry for reviewing and unblocking players only after the first block exists.

Blocking is personal presentation filtering. The server continues broadcasting the bounded public chat stream; it does not build a custom stream for every recipient.

### 4. Private report queue

Support both message reports and player-profile reports through one server-authorized reducer. A message report stores:

- Reporter and accused identities.
- Selected message ID.
- A snapshot of the sender name, message text, and send time.
- Reason: Harassment, Hate/Sexual Content, Spam/Scam, Personal Information, or Other.
- Review status and report time.

Profile reports use the same shape with no selected message and a short optional note. The server must verify that a selected public message exists and matches the accused identity before copying its evidence.

Limit each reporter to about five reports per hour and reject duplicate reports of the same message. Preserve the private snapshot after the public 24-hour row expires or is deleted.

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

This plan assumes Wildwood is not submitted in a children-specific category. For a children-focused release, preset phrase chat is considerably safer than unrestricted text chat.

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
- Confirm rejected messages never enter the public table.
- Confirm block and report rows cannot be subscribed to by other players.
- Load-test a global message burst and verify the singleton bucket bounds accepted inserts and fanout.
- Before release, build and publish the server, regenerate bindings for schema or reducer changes, deploy the matching client, and recheck the current Apple and Google policies.
