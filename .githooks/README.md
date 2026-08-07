# Repository Git hooks

This repository uses a versioned `post-commit` hook. A commit made directly on
`main` automatically pushes `main` to its configured remote (normally
`origin`). Commits on other branches and detached-head operations do not push.

Git does not activate repository hooks after a fresh clone. Enable them once:

```sh
git config --local core.hooksPath .githooks
```

If an automatic push fails, the commit remains safely stored locally. Resolve
the network or remote-branch issue, then run `git push origin main`.
