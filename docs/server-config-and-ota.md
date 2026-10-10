# Server configuration and controlled app updates

## What can change without an app release

Developer controls → Map balancing now includes enemy and boss stats/rewards, enemy speed, item drop multipliers, enemy/boss respawn times, boss regeneration, and Endless scaling. The preview shows the resulting timings, regeneration and drop chances. Zero disables drops or regeneration.

One server-owned configuration snapshot is pinned to each player's map visit. It is fetched with map entry, not polled during combat. Reconnecting keeps that snapshot; leaving and returning gets the latest revision. Rewards, drop rolls and defeat-rate validation use that player's snapshot. Restoring an earlier balance creates a new revision; it does not rewrite player saves.

The old `get_map_balance` procedure stays available. It leaves respawn/regen/drop behavior unchanged for older apps. The new `get_map_configuration` procedure opts updated apps into those fields. Publish the server module before shipping the new client. Existing settings automatically gain 1× defaults; this update does not change the live balance by itself.

## OTA scope

OTA replaces the packaged HTML, JavaScript, CSS and art. It does not replace native code or migrate server tables. Native code, dependencies and configuration, and save-format changes require the normal native release. Packaging checks a native-source fingerprint as well as the explicit `OTA_RUNTIME` and `OTA_SAVE_FORMAT` versions in `shared/ota-update.ts`.

Protocol bumps (`PROTOCOL_VERSION` in `shared/rules.ts`) do **not** need a native release. The protocol is the contract between the web code and the server, and an update carries its own matching web code. Apps built before this rule still compare the protocol exactly, so they refuse any update with a different one and keep their installed game; they need one store update to get the new rule.

A first iOS/Android release containing this updater is required. Already installed 0.742 apps do not contain it. The new native build number must be unique; do not reuse 742 for the bootstrap release.

No channels are published by installing this code. Web deployments and store releases continue to work normally. OTA bundles are full compressed web bundles for now (about 47 MB at 0.901), not binary deltas.

## Signing and storage

The signing private key is `local-data/ota/signing-private.pem` (ignored, mode 0600). Back it up securely. Never commit it, put it in `public/`, or include it in an upload. CI gets the same key from the GitHub secret `OTA_SIGNING_PRIVATE_KEY`; only the job that signs reads it. The public key is in `mobile/ota/public-key.json` and the native Capacitor configuration. Key rotation requires a new native release.

Both the channel announcement and ZIP are RSA/SHA-256 signed. The native plugin also verifies the ZIP checksum/signature before staging it. Failed downloads leave the current app in place. Successful downloads apply at the next cold launch, never by restarting an active game.

Announcements live at `/ota/developer-ios.json`, `/ota/developer-android.json`, `/ota/production-ios.json`, and `/ota/production-android.json`. They have no-store caching and CORS headers. ZIP files need an HTTPS artifact host that accepts large files, such as a public GitHub release or object storage; they must not go in the Cloudflare static-assets directory (25 MB per-file limit).

Native startup has a 30-second rollback watchdog. A rendered sign-in shell acknowledges startup without requiring a working network or account login. Failure to load/initialize the deferred game bundle before its first rendered frame also restores the installed app. The installed bundle is the final fallback; it will not be automatically reloaded in a loop. Later gameplay bugs need a signed rollback announcement or developer rollback. This is not a guarantee that every gameplay bug can be detected automatically.

Unused downloaded bundles are removed by the native plugin after successful startup. Rollback to a previous OTA may therefore redownload it. Keep published artifacts available. Neither automatic nor manual rollback changes account tokens, save data, rewards or database state.

## Baselines

A baseline describes one store build: platform, build number (Android `versionCode`), native fingerprint, `runtime` and `saveFormat`. No secrets. They are committed in `mobile/ota/baselines/<platform>-<build>.json` so CI can read them, and copied to the ignored `local-data/ota/baselines/` as before. The CLI reads the committed copy first and falls back to the local one; CI reads only committed ones.

A feed covers a **range** of builds: every recorded build next to the target that has the same native fingerprint, runtime and save format. The range stops at the first recorded build that differs, in both directions. `maxBuild` is never left open: a later store build may have different native code, and it gets covered once its own baseline is committed.

## Automatic Android updates (every push to main)

`.github/workflows/pages.yml` does this when the repo variable `OTA_AUTO_PUBLISH` is `on`:

1. **build** (read-only token, no secrets): the usual checks and `build:client`, then `node mobile/scripts/build.mjs --skip-client-build` stages the same `dist` as the app bundle in `mobile/www`.
2. **android-ota** (the only job with the signing key and a write token; it runs no npm installs): `node mobile/scripts/ota/cli.mjs publish --platform android`. It
   - skips if `public/ota/production-android.json` is committed (production is pinned by hand, see Rollback);
   - skips if the `OTA_SIGNING_PRIVATE_KEY` secret is missing;
   - skips if no committed Android baseline matches the pushed native code;
   - otherwise names the bundle `android-<version>-<hash of the app files>`. If a GitHub prerelease `ota-<that name>` already exists with intact files, it reuses it, so a push that does not change the app (docs, server, tooling) makes no phone download anything. If not, it zips, signs, creates the prerelease on this repository, downloads it back to check the bytes, and writes the signed production feed for the matching build range.
3. **deploy**: puts the feed at `dist/ota/production-android.json` in the same `dist` it deploys, so GitHub Pages and wildstatmmo.com get the website and its feed together. It runs whenever **build** passed, whether the app step published, skipped or failed.

Each skip shows as a notice on the run page. A real failure in **android-ota** turns the run red, but the website still deploys.

Phones check the feed on launch and on resume (at most every 15 minutes), download in the background, and switch at the next full app restart. The 30-second watchdog restores the installed app if the update cannot start; that bundle is then blocked on that phone until a newer one is published.

### Why the feed goes into the deployed `dist`

The workflow never commits to main. The feed is written during the run and added to that push's `dist`, so it always describes exactly the web build being deployed, and nothing loops back into git. The Cloudflare dashboard's Git build cannot do this (it has no signing key and skips the workflow), so **wildstatmmo.com must be deployed by the workflow's own Cloudflare step** for phones to see the feed. Phones read `https://wildstatmmo.com/ota/production-android.json`.

A manual `npx wrangler deploy` from the Mac ships a `dist` without the feed. Phones then see "no update" until the next push; they keep what they have, nothing breaks.

### One-time setup

Do these in order, from the main checkout (`/Users/ryanguild/Documents/GitHub/wildwood`).

1. **Merge this change first.** The store build in step 4 must contain the new compatibility rule.
2. **Signing key secret.** This sends the key encrypted to GitHub; it never prints it:

   ```sh
   gh secret set OTA_SIGNING_PRIVATE_KEY < local-data/ota/signing-private.pem
   ```

3. **Let the workflow deploy wildstatmmo.com.** Skip any secret that is already set (`gh secret list`):

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   gh variable set CLOUDFLARE_DEPLOY --body on
   ```

   Then turn off the dashboard build: Cloudflare dashboard → Workers & Pages → `wildstat` → Settings → Builds → disconnect the Git repository. Otherwise it can deploy right after the workflow and drop the feed. Stop the manual wrangler deploy after pushes too.
4. **Ship one more Android store build** (see [Android internal testing](android-internal-testing.md)), then record its baseline from the same, clean commit:

   ```sh
   npm --prefix mobile run build
   npm --prefix mobile run ota -- baseline --platform android   # Android: --build defaults to the game version's code
   ```

   Commit `mobile/ota/baselines/android-VERSION_CODE.json`. The command refuses if native files have uncommitted changes, because CI could never match them.
5. **Turn it on:**

   ```sh
   gh variable set OTA_AUTO_PUBLISH --body on
   ```

6. **Check the next push:** `gh run list --limit 2` is green, the run page shows which bundle went to which builds (or why it skipped), and

   ```sh
   curl -s https://wildstatmmo.com/ota/production-android.json | head -c 200
   ```

   returns a signed `{"payload": ...}`.

### At every later store release

Record the new build's baseline the same way (step 4) and commit it. Until it is committed, phones on that build get no automatic updates (the run says so). Builds whose native code is unchanged join the existing range; a native change starts a new one, and older builds stop getting updates.

### Turning it off

```sh
gh variable set OTA_AUTO_PUBLISH --body off
```

The next deploy has no feed. Phones keep the bundle they have and stop downloading. To actively send them back, use Rollback below.

## Manual developer channel (any platform)

Build current web assets, then create an immutable artifact for one platform/native build:

```sh
npm --prefix mobile run build
npm --prefix mobile run ota -- package --platform android --build BUILD_NUMBER --id UNIQUE_BUNDLE_ID
```

This writes `mobile/.build/ota/UNIQUE_BUNDLE_ID/bundle.zip` and `artifact.json`, targeting that build and every recorded build sharing its native code. Upload that ZIP unchanged to an HTTPS artifact host. A helper can upload it as a GitHub prerelease to the existing public repository:

```sh
npm --prefix mobile run ota -- upload --artifact mobile/.build/ota/UNIQUE_BUNDLE_ID --repo Tydoskus/wildwood
```

This command publishes an artifact, not a production channel. It prints the URL for the next step. Stage it:

```sh
npm --prefix mobile run ota -- stage --artifact mobile/.build/ota/UNIQUE_BUNDLE_ID --url HTTPS_ARTIFACT_URL
```

The stage command downloads the hosted ZIP to verify its checksum before writing a signed developer announcement. Deploy the resulting `public/ota/developer-android.json` through the web deployment workflow. Repeat with a distinct artifact ID for iOS. The automatic path never touches the developer channel.

On a developer account, open Developer controls → App updates → Use developer channel. Check for updates, fully close and reopen the app, and test startup, login, combat, map changes, saves, and Restore installed app. The installed version remains available as the fallback. Test-channel checks wait for developer access; signing out of developer access cancels staged test updates.

Promote only the exact bundle that passed device testing:

```sh
npm --prefix mobile run ota -- promote --platform android --id UNIQUE_BUNDLE_ID --tested-on-device
```

This writes `public/ota/production-android.json`; it does not push or deploy it. Committing it **pins** production to that bundle: automatic publishing skips production while the file exists. Delete the file and push to hand production back to the automatic path. Promotion preserves the tested URL, digest and signature. The command's device-test flag is an explicit operator confirmation, not a fabricated test result.

Checks occur on startup/resume, throttled to 15 minutes, plus the developer's manual Check button. There is no combat polling. Players on builds outside a feed's range ignore it and keep their installed app.

## Rollback

**A bad web change:** revert the commit and push. With automatic updates on, CI publishes the reverted web build as a new bundle.

**Back to the store app** for every build in the range of `BUILD_NUMBER`:

```sh
npm --prefix mobile run ota -- rollback --platform android --channel production --installed --build BUILD_NUMBER
```

Commit the written `public/ota/production-android.json` and push. That pins production (automatic publishing skips it) until you delete the file and push again.

Or restore a previous signed announcement from `local-data/ota/history/` (manual announcements only; automatic ones are not saved there):

```sh
npm --prefix mobile run ota -- rollback --platform android --channel production --announcement PATH_TO_PREVIOUS_SIGNED_JSON
```

Rollbacks use an increasing sequence, so clients can reject stale CDN announcements without rejecting an intentional rollback. Clients need to reach the feed and cold-launch to apply it. An offline client cannot receive a remote rollback.

Developer controls also has Restore installed app for immediate local testing on the next launch. Startup failures block the offending bundle ID; publish a fixed update with a new ID instead of changing an existing artifact.

If an automatic upload was cut off half way, the next run with the same files notices the broken release and publishes under a new name (`…-<run id>`). Delete the broken `ota-…` release on GitHub so later runs reuse one name again.

## iOS

Unchanged: iOS feeds stay manual (developer channel, promote, rollback above). The `publish` command accepts `--platform ios`, but the workflow only runs Android, and there are no committed iOS baselines yet.

## Verification

Automated tests cover compatibility (including that a protocol change alone no longer blocks an update), build ranges, real RSA signature tampering, download failures, channel changes/revocation, stale manifests, saved developer-channel authorization, rollback, and preservation of account storage. Native compile checks verify plugin integration. The automatic path has no device-test step; the startup watchdog and rollback are its safety net.
