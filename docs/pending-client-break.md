# Changes waiting for a client-breaking release

SpacetimeDB marks any change to row-level visibility rules (`clientVisibilityFilter`) as
breaking every client: publishing them disconnects every player once. `npm run
spacetime:publish:live` refuses such a plan unless it is run with `--allow-client-break`, so
these are batched and shipped together, with Ryan's go-ahead, in a release that breaks clients anyway.

- **social_duel_message visibility** (found 2026-10-05). The table is public and unfiltered,
  so any client can read who shared duel replays with whom (not the text). Add to the rules
  at the end of `spacetimedb/src/index.ts`:

  ```ts
  // A shared duel message is between its two players: no one else may read who sent what to whom.
  export const sentDuelMessages = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM social_duel_message WHERE sender = :sender");
  export const receivedDuelMessages = spacetimedb.clientVisibilityFilter.sql("SELECT * FROM social_duel_message WHERE recipient = :sender");
  ```

  Raise `MAX_LINES` in `spacetimedb/src/index-boundary.test.ts` by 3, with a note.

- **Soul stats on other players' profiles** (queued 2026-10-07). `player_soul_stats` is private
  (`spacetimedb/src/soul-dimension.ts`), and a client reads only its own row through the
  `my_soul_stats` view, so another player's profile shows their stats and power without soul
  (0.901.2 added soul to your own profile only). Make the rows readable for profiles, then have
  `src/coop/services/player-profile-service.ts` load the inspected player's row with their
  progress and pass it to `renderProfileStats` / `profilePower` (the `soulStats` / `soul`
  parameters already exist; `main.ts` passes `soulDimension.inPlay()` for the local player only).
  Respect challenges as combat does: no soul stats while that player's challenge is active.
  Before batching this with the breaking release, check whether a new public view (additive, like
  a new table: `node scripts/subscribed-schema.mjs --stamp`, no break) passes the preflight; only
  flipping the table to `public: true` or a visibility rule needs the break.
