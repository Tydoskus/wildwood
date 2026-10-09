# Changes waiting for a client-breaking release

SpacetimeDB marks any change to row-level visibility rules (`clientVisibilityFilter`) as
breaking every client: publishing them disconnects every player once. `npm run
spacetime:publish:live` refuses such a plan unless it is run with `--allow-client-break`, so
these are batched and shipped together, with Ryan's go-ahead, in a release that breaks clients anyway.

Nothing is waiting. The duel-message rules shipped with the movement-frame rule drop (2026-10-09).
