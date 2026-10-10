# Native baselines

One JSON file per store build, `android-<versionCode>.json` or `ios-<build>.json`.
Each one records what that installed app can run: its native fingerprint (a hash
of the committed native code), `runtime` and `saveFormat`. No secrets.

CI reads these to decide which installed builds an automatic update can reach
(`npm --prefix mobile run ota -- publish`). A bundle goes only to builds whose
baseline matches the native code being pushed.

This folder is empty until the next native release. Builds from before it are
not listed here on purpose: their app code still requires an exact protocol
match, so they could never take an automatic update.

## At every store release

After building the APK/AAB you upload, from a clean checkout of the commit you
built:

```sh
npm --prefix mobile run build
npm --prefix mobile run ota -- baseline --platform android   # Android: --build defaults to the game version's code
```

Then commit `mobile/ota/baselines/android-VERSION_CODE.json`. The `baseline`
command refuses when native files have uncommitted changes, because CI could
never match the result.

Never hand-write or edit a baseline. It must describe the binary players
actually installed.
