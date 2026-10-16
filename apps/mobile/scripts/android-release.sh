#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_ENV="${APP_ENV:-production}"
case "$APP_ENV" in production|staging) ;; *) echo 'Use production or staging' >&2; exit 1;; esac
export NODE_ENV=production EXPO_NO_DOTENV=1
if [[ -f .signing/release.env && -z "${ANDROID_KEYSTORE_PATH:-}" ]]; then
  set -a
  source .signing/release.env
  set +a
fi
for name in ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  [[ -n "${!name:-}" ]] || { echo "Missing $name; see NATIVE_BUILDS.md" >&2; exit 1; }
done
[[ -f "$ANDROID_KEYSTORE_PATH" ]] || { echo 'Release keystore not found' >&2; exit 1; }
export ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-1}"
[[ "$ANDROID_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid version code' >&2; exit 1; }
pnpm exec dotenv -o -e ".env.$APP_ENV" -- expo prebuild --platform android --no-install
# Expo prebuild owns these generated files; clear cached package identities.
rm -rf android/build/generated/autolinking android/app/build/generated/autolinking
pnpm exec dotenv -o -e ".env.$APP_ENV" -- bash -c 'cd android && ./gradlew --no-daemon --max-workers=4 assembleRelease -PreactNativeArchitectures="${ANDROID_ARCHITECTURES:-arm64-v8a}"'
mkdir -p artifacts
apk="artifacts/iteamify-${APP_ENV}-${ANDROID_VERSION_CODE}.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$apk"
pnpm exec dotenv -o -e ".env.$APP_ENV" -- node scripts/verify-android-bundle.mjs "$apk"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
"$sdk/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$apk"
"$sdk/build-tools/36.0.0/zipalign" -c -P 16 4 "$apk"
(cd artifacts && shasum -a 256 "$(basename "$apk")") > "$apk.sha256"
echo "APK: $PWD/$apk"
