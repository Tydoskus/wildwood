# WildStat

Browser MMO. Web client on GitHub Pages + Cloudflare Pages, game server on SpacetimeDB
Maincloud (`wildwood-coop`, one database — sharding was removed in 0.766).

## Shipping a version

**Ryan runs the command that ships. Every time.** Claude works on a branch, gets it
green, hands over the exact command and stops. That covers committing to `main`
(the post-commit hook pushes and deploys straight to players), the server publish,
and any production `spacetime sql` write. Ryan can waive it for one change by
saying so; the waiver does not carry to the next one.

The client and the server deploy by completely separate routes. A commit ships the
client by itself; it never touches the server.

**Client (Ryan commits).** Committing to `main` auto-pushes — `.githooks/post-commit`,
main only, not branches. That is why Claude does not commit there: the commit *is*
the deploy. The push triggers `.github/workflows/pages.yml`, which runs
`check:release`, `typecheck:coop`, `test:unit`, `build:client` and deploys to GitHub
Pages. That is the only deploy this repository performs, and the live site it is
checked against is `https://tydoskus.github.io/wildwood/version.json`.

Nothing here deploys to Cloudflare. There is no workflow, no `wrangler.toml` and no
worker in the repository, and there never has been. The only Cloudflare artifact is
the `_headers` file `scripts/fingerprint-client.mjs` writes into `dist` — a
Cloudflare Pages convention that is carried in the bundle whether or not anything
consumes it. If a Cloudflare Pages project is serving this game it is wired up in
the Cloudflare dashboard against the GitHub repository, which is invisible from
here; do not claim it deployed without checking that dashboard.

After a push to main, confirm `gh run list --limit 2` is green.

**Server (Ryan runs it).** Changes under `spacetimedb/` do nothing until:

    npm run spacetime:publish:live

Ryan runs that himself in his terminal — never run it from an agent session, and
never publish to `wildwood-coop`, `wildwood-balance-local`, or maincloud from a
worktree. End any report that touched `spacetimedb/` by handing him that command.

**Version bump.** For a client-only release the one-shot helper is:

    npm run release:live

It suggests the next version, takes one note per line, runs every check, commits,
pushes main, and then waits until the live site reports the new version. It refuses
to run when the diff touches `shared/`, `spacetimedb/` or `src/module_bindings/`,
because those need the server publish above.

The pieces underneath it: `npm run release -- <version>` rewrites GAME_VERSION,
`public/index.html`, `public/version.json`, the changelog release day, and the
artwork stamp in `config/shipped-assets.json`. Write the release notes in
`src/app/changelog.ts` before committing. `npm run check:release` (also run in CI)
fails when those fall out of sync, or when files under `public/assets` were added,
removed or renamed without a bump — a cached client still requests the old names.

A stylesheet-only change that should ship without a bump: restamp
`config/shipped-assets.json` at the current version in the same commit.

`release:prepare` / `release:rollout` / `release:cancel` are the staged mobile
release flow, not the web version bump. `spacetime:publish:cloud` is the raw CLI
publish with no preflight — prefer `spacetime:publish:live`.

## Verification

Before handing anything over, run all of these, and say plainly what they do not
cover — none of them sees layout, feel or a running game. `npm run dev:local`
serves the client against the local `wildwood-balance-local` database for that.

There is no `npm run typecheck`. Use:

    npx vitest run
    npm run typecheck:coop
    npm run typecheck:balance
    npm run spacetime:build
    npm run check:release
    npm run build:client

## Conventions

- Reducers are the only mutation path; kills are client claims bounded server-side.
- Large or risky server refactors go on a branch so the hook does not deploy them.
- `local-data/**` is gitignored — moderation records and player data live there and
  must never be committed.
- Developer-gated reducers need a logged-in game session; the CLI cannot invoke them.
