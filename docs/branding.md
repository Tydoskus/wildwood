# WildStat branding

The game name is **WildStat**. Runtime art lives in `public/assets/wildstat/`; the browser entry is `src/wildstat-coop.ts`, exposed as `window.wildstatCoop`. Retired branding is kept outside the deployed files in `art-source/retired/branding/`.

The public README is for players. Setup, architecture, release steps, and account invariants are in [development.md](development.md).

## Compatibility kept during the rename

- Website, repository, issue-tracker, and OAuth redirect addresses are unchanged. The owner has acquired **wildstatmmo.com**; DNS and redirect setup are a separate follow-up.
- The deployed `wildwood-coop` database, SpacetimeAuth client/issuer, connection overrides, and all account storage keys are unchanged. This release does not create a new database or migrate accounts.
- Existing `wildwood-` and `wildwood.` preference, cooldown, legacy-progress, and Balance Lab storage keys are retained. Changing a display name does not require discarding player settings.
- The `wildwood-spawns-v2:` seed stays fixed so camp positions and enemy assignments do not change.
- The client recognizes server errors under either name and displays the current name. Three wire messages that cached clients parse (protocol refresh, missing world presence, and an existing account save) retain their original wording in `LEGACY_CLIENT_ERRORS` so old tabs can still recover. Chat scam detection covers both names.
- `window.wildwoodCoop`, `window.wildwoodNative`, and the previous native ad event remain accepted for older integrations. New code uses the WildStat names. Load-test tooling also accepts the previous environment variable names and strips both token variables before launching workers.
- The sprite aligner accepts previously exported alignment files and updates their old asset-path prefix when loading them.

The name-only Terms edit does not change the agreement contents, age rules, or stored acceptance version.

## Releasing this change

Release `0.577` updates the client cache references. Deploy the client before publishing the matching server module so clients can recognize both generations of server messages. Existing protocol, table, reducer, and identity contracts are unchanged. Follow the normal non-destructive server publication steps in [development.md](development.md); the client-only release helper intentionally rejects server/shared changes.

When the domain is configured later, update the play/support links, sharing image URL, release version-check URL, and SpacetimeAuth redirect allowlist together. Handle existing guest identities before moving to a different origin; this rename does not move browser storage.
