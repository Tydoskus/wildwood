# WildStat phone preview

Native iOS and Android shells using Capacitor 8.5.1. The game code and assets
are bundled into the app; multiplayer still needs internet and uses the live
`wildwood-coop` database. The app appears as **WildStat Preview**.

The preview supports **Sign In / Register** through Apple's `ASWebAuthenticationSession`
on iOS and the system browser on Android, plus
**Guest Login**. Existing accounts use the same SpacetimeAuth client as the web
game. The HTTPS relay at `https://wildstatmmo.com/app-auth/` opens
`com.wildstatmmo.preview://auth/callback` on both platforms. This HTTPS URL must
remain registered in the client's Redirect URIs and deployed with the website.
On iOS the native session captures the app callback and dismisses automatically.
The relay stays blank during the handoff and reveals a manual return link only
after two seconds if it has not completed. SpacetimeAuth's console currently
rejects custom-scheme redirect URIs, so the HTTPS relay is still required.
PKCE, nonce, issuer and signed ID-token checks remain enabled. Pending login
state survives an app restart for ten minutes and is consumed once. Guest
credentials remain separate from Safari/Chrome and survive an app update.

## Test on iPhone

1. Double-click `launchers/Test WildStat on iPhone.command`. It builds the current
   checkout, syncs the bundled files and opens Xcode.
2. Connect and unlock your iPhone, and trust the Mac if prompted. Enable
   **Settings → Privacy & Security → Developer Mode** if Xcode requests it.
3. In Xcode, select the **App** target → **Signing & Capabilities**, enable
   automatic signing and choose your personal team/Apple ID.
4. Select your iPhone as the run destination and press **Run**. Open
   **WildStat Preview** and choose **Guest Login**.

Xcode 26+ and an Apple ID for device signing are required. No App Store upload
is needed for this local test. A personal team's provisioning may require you
to rebuild/reinstall periodically. The generated project is
`mobile/ios/App/App.xcodeproj` and uses Swift Package Manager.

## Test on Android

1. Install/update Android Studio to 2025.2.1 or newer. In SDK Manager, install
   Android SDK Platform 36, its build tools and Android SDK Platform-Tools.
   Use the IDE's compatible bundled JDK (21+).
2. Double-click `launchers/Test WildStat on Android.command`.
3. Connect your phone with USB debugging enabled, accept the device's debugging
   prompt, select it in Android Studio and press **Run**.

The project is `mobile/android`. Android 7/API 24 or newer is supported by this
shell. To produce a debug APK after configuring the SDK:

```sh
cd mobile/android
./gradlew assembleDebug
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`.

## Command line

Use Node 22+ for mobile tooling; the root web project's dependencies and Node
requirements are unchanged. The launchers can also use Codex's bundled Node if
the default Node is older. Override that choice with `WILDSTAT_NODE_PATH`.

```sh
npm ci                       # root web dependencies, on a fresh checkout
npm --prefix mobile ci       # isolated wrapper dependencies
npm --prefix mobile run ios  # build, sync both shells, open Xcode
npm --prefix mobile run android
```

Run the launcher again whenever game files change; already installed apps keep
their bundled build until reinstalled. If the server reports UPDATE REQUIRED,
build and install the latest checkout. The wrapper does not download newer
game code from the website.

## Scope and verification

`mobile/scripts/build.mjs` runs the existing checked web build, copies `dist/`
to ignored `mobile/www/`, and adds a native-only bootstrap. That bootstrap
explicitly selects maincloud so the app's `localhost` origin does not select
the local development server. It also activates the preview sign-in notice and
hides browser installation prompts. Browser builds never include that bootstrap.

Native dependencies have their own lockfile. Generated assets, native build
outputs, IDE user settings and local signing configuration remain local. There
are no server/schema changes or release/deploy steps in these commands. The
native wrapper now includes AdMob demo rewarded ads and a RevenueCat Test Store
purchase lab. See [commerce testing](../docs/commerce-testing.md). Web builds
retain their existing ad placeholder.

The user owns visual/device QA: movement, notch/home indicator spacing, keyboard
and chat, audio, rotation, background/resume and guest persistence after relaunch.
Device account signing and an actual phone run are separate from an unsigned
compile check. Android needs its SDK installed before compilation.

References: [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
and [native workflow](https://capacitorjs.com/docs/basics/workflow).

## Research completion notifications

On iPhone/Android, the app asks for notification permission the first time it
receives active research, including returning players who have never been prompted.
Allowing it enables research alerts. **Settings → Research notifications** can
change the choice later. The app schedules one device notification from the
server-confirmed research deadline. Completion, Gem speed-up, resetting progress,
signing out or switching identity clears it. Ordinary disconnection retains it.
The choice and prompt history persist on this phone across restarts and sign-out
for both guest and registered accounts. Denial or an explicit OFF choice prevents
repeated automatic prompts. Each phone grants its own permission; the setting
only appears in the native app.

These are scheduled local notifications, not remote APNs/FCM pushes. They work
after the app closes, but research started/changed on another device cannot update
this phone's schedule until it reconnects. Android uses inexact scheduling to
avoid requesting special alarm access; battery settings may delay delivery.
Tapping the notification opens WildStat. iOS suppresses banners while foreground.

Device check: enable the switch, start research, background/lock the phone, and
wait for its finish time. Also verify turning the switch off or speeding up the
research cancels the scheduled reminder. Android SDK installation remains needed
for an Android build on this Mac.
