# Native builds

The app targets Android and iOS. JavaScript verification, native compilation,
device installation, authenticated feature testing, and store distribution are
separate checks. The current workflow does not publish an app-store release.

## Android APK

From the repository root, install dependencies with `pnpm install --frozen-lockfile`.
Use Node 22, JDK 17, Android SDK platform/build-tools 36, NDK 27.1.12297006,
and CMake 3.22.1. Set `JAVA_HOME` and `ANDROID_HOME` for your machine.

Provide these environment variables using the existing release signing key:

- `ANDROID_KEYSTORE_PATH`: absolute path to the JKS file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Local builds may load `apps/mobile/.signing/release.env`, which is ignored by Git.
Keep that file private. Back up both the keystore and its passwords in your
secure credential vault; future updates must use the same signing key.
Never commit signing files or put them in downloadable artifacts.

```bash
APP_ENV=production ANDROID_VERSION_CODE=2 pnpm --filter @iteamify/mobile android:release
```

Increase `ANDROID_VERSION_CODE` for every distributed update (the initial APK
uses 1). Production package: `com.aurocreator.mobile`; staging uses the separate
`.staging` suffix. The script builds ARM64 by default, suitable for 64-bit Android
phones, with minimum Android API 24 and target API 36 in Expo SDK 55. Set
`ANDROID_ARCHITECTURES=arm64-v8a,armeabi-v7a,x86_64` if additional ABIs are needed;
this increases build time and package size and requires separate installation checks.

The output is `apps/mobile/artifacts/iteamify-production-<versionCode>.apk` plus a
SHA-256 file. The script verifies the release signature, APK 16 KB ZIP alignment,
Hermes bytecode, and embedded production API origin. These checks do not replace
native startup or production account testing.

Release scripts explicitly load `.env.production` or `.env.staging`, disable
Expo's implicit dotenv loading, and make the environment part of both Metro and
Gradle bundle cache inputs. Production API requests use `https://aurocreator.com`;
the old `api.aurocreator.com` hostname is not a working production entry point.

## iOS simulator

Use macOS, Xcode, and CocoaPods:

```bash
APP_ENV=production pnpm --filter @iteamify/mobile ios:simulator:release
```

The script produces `apps/mobile/artifacts/iteamify-ios-simulator-production.zip`.
It builds a Release simulator app with signing disabled. It cannot be installed
on an iPhone. Device IPA/TestFlight distribution still requires an Apple Developer
team, an owned bundle identifier, distribution certificates, provisioning profiles,
and a device archive/export step. Existing iOS bundle identifiers are preserved;
use `EXPO_BUNDLE_IDENTIFIER_PROD` when configuring the owning Apple team.

## GitHub Actions

Run **Mobile Native Build** manually, selecting `all`, `android`, or `ios` and
the backend environment. It first runs mobile typecheck, lint, and tests. Android
uses Ubuntu and JDK 17; iOS uses macOS 15 with Xcode 26.2. Build outputs are uploaded
as Actions artifacts with 30-day retention. These are authenticated CI downloads,
not public release assets. The workflow must be pushed to the repository's default
branch before it appears as a dispatchable workflow.

Configure these repository secrets before running the Android job:

- `ANDROID_KEYSTORE_BASE64`: Base64 encoding of the same release JKS
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The runner restores the keystore with private permissions and removes it after
the build. Credentials belong in Actions secrets, not workflow inputs or logs.
The iOS simulator job does not need Apple signing secrets.

## Public APK delivery

The production Nginx template adds `/downloads/mobile/` served from
`/opt/aurocreator/downloads/mobile/` without directory listing. Publish only APKs
and checksums there, using immutable filenames and atomic file moves. Download
the public URL independently and compare its SHA-256 to the locally verified APK.
Activate the route only when public publication is authorized. This static asset
path is independent of web/backend releases and does not upload
signing material. Mobile build and delivery do not imply PC feature parity.
