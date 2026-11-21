# Standalone E-book Android app

This is a separate Android application package for the standalone E-book entry point. It does not load the Grapes home screen, Grapes navigation, Grapes login flow, or the existing Grapes Android application.

## Build

From the repository root:

```sh
npm ci
npm run build:ebook-android-web
gradle --project-dir android-ebook :app:assembleDebug
```

The Vite build writes only the standalone E-book library and standalone reader pages into `app/src/main/assets/`. That generated directory is intentionally ignored by Git.

The debug APK is written to:

`android-ebook/app/build/outputs/apk/debug/app-debug.apk`

## Android identity

- Application ID: `hu.grapes.ebook`
- Display name: `E-book Könyvtár`
- Minimum Android: API 26
- Target Android: API 35
- WebView content origin: `https://appassets.androidplatform.net`

The app has its own Android package and WebView data directory. It does not share the Grapes APK's application ID or Android app-private storage.

## Google Drive authorization

Android WebView must not run the browser GIS popup flow as an embedded OAuth user-agent. The standalone adapter detects the `EbookAndroid` bridge and requests Drive authorization through Google's native Android Authorization API instead.

Register an Android OAuth client in the Google Cloud project used for the standalone E-book:

1. Package name: `hu.grapes.ebook`
2. Add the SHA-1 signing certificate fingerprint for the APK being tested or released.
3. Enable the Google Drive API and request only the Drive scopes required by the app.

The app requests `drive.file` for normal library operations and adds `drive.readonly` only when the user explicitly requests full Drive discovery. The native bridge returns a short-lived access token to the standalone adapter; it is kept in the app's isolated WebView session storage and is never written into the source tree.

A debug APK signed by the CI runner's debug key will not match a local developer's debug certificate. For local testing, register the local debug SHA-1 or build and sign with a dedicated test key. Production signing and Play Store publication are intentionally not configured in this first Android slice.

## Native capabilities and current limits

- Native Google Drive authorization and revocation.
- Android document picker for EPUB/PDF and other supported uploads.
- Local WebView storage for the standalone app's own cache and settings.
- External HTTPS links open in the system browser.
- Reader directory sync through the browser File System Access API is not available in Android WebView; use a supported desktop Chrome/Edge browser for USB directory sync.
- Real OAuth, Drive Picker, transfer broker, QR pairing, and cross-device reader acceptance still require live-device testing and the separately configured standalone broker.

The original Grapes Android project remains untouched.
