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
