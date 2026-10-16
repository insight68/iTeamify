#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_ENV="${APP_ENV:-production}" NODE_ENV=production EXPO_NO_DOTENV=1
case "$APP_ENV" in production|staging) ;; *) echo 'Use production or staging' >&2; exit 1;; esac
pnpm exec dotenv -o -e ".env.$APP_ENV" -- expo prebuild --platform ios --no-install
(cd ios && pod install)
workspace="$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)"
[[ -n "$workspace" ]] || { echo 'Xcode workspace missing' >&2; exit 1; }
scheme="$(basename "$workspace" .xcworkspace)"
pnpm exec dotenv -o -e ".env.$APP_ENV" -- xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO
app="$(find ios/build/Build/Products/Release-iphonesimulator -maxdepth 1 -name '*.app' -print -quit)"
[[ -n "$app" ]] || { echo 'Simulator app missing' >&2; exit 1; }
mkdir -p artifacts
ditto -c -k --keepParent "$app" "artifacts/iteamify-ios-simulator-${APP_ENV}.zip"
