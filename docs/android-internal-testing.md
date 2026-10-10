# Android internal testing

WildStat uses the existing Android application ID `com.wildstatmmo.preview`.
The native shell bundles the game and connects to the live game server. This
internal build retains demo ads. Purchases are disabled until platform billing
is configured; a RevenueCat Test Store key must never enter a Play release.

## Build a Play upload

Use Java 21 in `mobile/.build/jdk21/Contents/Home` and the SDK in `mobile/.build/android-sdk`. Local
`mobile/android/local.properties` points Gradle at that SDK. The SDK and Gradle
cache are ignored build tools, not app assets.

1. Run `npm --prefix mobile run build` after the game version is final (the release stamp moved
   `public/version.json`).
2. From `mobile/`, run Capacitor `sync android` with Node 22 or newer.
3. From `mobile/android/`, run `./gradlew bundleRelease` with `JAVA_HOME` pointing at the Java 21
   directory above. The version code is the game version's own number (`0.901.45` → `9010450`;
   `node mobile/scripts/version-code.mjs` prints it), and the display version is `public/version.json`,
   so the bundle always matches its game. The build refuses when the game copied into the app is a
   different version: run steps 1 and 2 again. `-PwildstatVersionCode=N` still overrides the code.
4. Upload `mobile/android/app/build/outputs/bundle/release/app-release.aab` to
   **Testing → Closed testing** in Play Console (internal testing is no longer used).

The local upload key is `mobile/android/.signing/wildstat-upload.jks`; its
passwords are in ignored `mobile/android/keystore.properties`. Preserve both in
secure backup for future uploads. Do not commit either file. The checked-in
`keystore.properties.example` documents the fields without containing secrets.
Google Play App Signing manages the distributed app's signing key separately.

The app entry, signing agreements, uploaded bundle, selected tester email list,
and published internal release must all be completed before the opt-in link is
usable. Tester addresses are managed in Play Console, not checked into this repo.

Test Store purchases require an explicit `npm --prefix mobile run build -- --test-purchases`
for local development only. Android release builds reject these staged assets.
