# WildStat

Browser MMO. Web client on GitHub Pages + Cloudflare Pages, game server on SpacetimeDB
Maincloud (`wildwood-coop`, one database — sharding was removed in 0.766).

## Shipping a version

The client and the server deploy by completely separate routes. A commit ships the
client by itself; it never touches the server.

**Client (automatic).** Committing to `main` auto-pushes — `.githooks/post-commit`,
main only, not branches. The push triggers `.github/workflows/pages.yml`, which runs
`check:release`, `typecheck:coop`, `test:unit`, `build:client` and deploys to GitHub
Pages. Cloudflare Pages builds from the same push through its own git integration
(no workflow file, no wrangler, no token here); `build:client` generates its
`_headers`. Nothing else is needed, and there is no manual deploy step.

After a push to main, confirm `gh run list --limit 2` is green. A failed Pages run
is silent on Cloudflare — nine consecutive deploys failed unnoticed on 2026-09-20.

**Server (Ryan runs it).** Changes under `spacetimedb/` do nothing until:

    npm run spacetime:publish:live

Ryan runs that himself in his terminal — never run it from an agent session, and
never publish to `wildwood-coop`, `wildwood-balance-local`, or maincloud from a
worktree. End any report that touched `spacetimedb/` by handing him that command.

**Version bump.** `npm run release -- <version>` rewrites GAME_VERSION,
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
