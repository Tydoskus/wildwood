# Changes waiting for a client-breaking release

SpacetimeDB marks any change to row-level visibility rules (`clientVisibilityFilter`) as
breaking every client: publishing them disconnects every player once. `npm run
spacetime:publish:live` refuses such a plan unless it is run with `--allow-client-break`, so
these are batched and shipped together in a release that breaks clients anyway.

## Waiting (from 0.907.0)

These tables are declared but nothing reads or writes them since 0.907.0. Empty them on live, then
remove their declarations, in the next release that breaks clients:

- `player_balance_version`: every save was at version 9 (2026-10-15); world entry stopped reading it.
  Old migrations in `module-migrations.ts` and `markPlayerBalanceCurrent` (`player-power.ts`) still
  name it; make them skip a missing table, as the 0.907.0 drops did.
- `prestige_expansion`: the countdown ended on 2026-09-30.
- `player_wide_stats`, `player_combat_rating`: copied onto `player_progress` by migration 57.
  `deleteProgressExtras` (`wide-stats.ts`) still clears them on account removal.
- `leaderboard_position`, `leaderboard_prestige_position`, `leaderboard_prestige_rank_page` (0.908.0):
  the per-prestige-level boards. The first full snapshot empties them. (`getPrestigeLeaderboardPage`
  and `getLeaderboardPage` are already gone; `getLeaderboardWindow` stays, the profile still calls it.)

    spacetime sql -s maincloud wildwood-coop "DELETE FROM player_balance_version"

(and the same for each table), run by Rymel just before that publish.

## Waiting (tutorial portrait lesson removed after 0.916.14)

- `advanceOnboarding` (`spacetimedb/src/onboarding.ts`) still accepts the retired portrait lesson
  (step 2) after Move, for 0.916.14 tabs. Delete `oldClientPortrait` in the next release that
  reloads every client. Rows already saved on step 2 keep working without it.

## Waiting (friends removed from the client, 0.916.28)

The client no longer shows friends or friend requests and never calls `friendAction`. Private
messages never needed a friendship. The server keeps them so tabs still on 0.916.27 work. In the
next release that breaks clients:

- Drop the private tables `social_friend` and `social_request`.
- Drop the reducer `friendAction` (`spacetimedb/src/index.ts`, `social-service.ts`) and the friend
  parts of `socialSnapshot`: `friends`, `incomingRequests`, `outgoingRequests`.
- Remove them from account erasure (`account-erasure.ts`), the guest-to-account merge
  (`social-service.ts`), and `shared/social.ts` (`SOCIAL_FRIEND_LIMIT`, the friend fields).

Guild invitations stay: `social_guild_invite`, `guildInviteAction` and the snapshot's
`guildInvitations`, `outgoingGuildInvitations` and `canInviteToGuild` are in use again (invites
arrive as a private chat from their sender, 0.916.28). Do not drop them.

## Waiting (offline gathering picks unused, 0.917.36)

Time away now mines and chops every vein and stand the skills open, evenly. 0.917.34-35 tabs still
send their Auto Mine and Auto Chop picks, so the server keeps taking them. In the next release that
breaks clients:

- Drop the private table `player_gather_picks` and the reducer `setGatherPicks`
  (`spacetimedb/src/offline-gathering.ts`, `index.ts`).
- Remove it from account erasure (`account-erasure.ts`) and `PLAYER_STATE_TABLES` (`account-lifecycle.ts`).
