import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config — replaces app.json so we can read APP_ENV at runtime
 * and switch bundleIdentifier / display name for dev / staging / production.
 *
 * APP_ENV is set by package.json scripts:
 *   - dev          → APP_ENV unset (treated as "development")
 *   - dev:staging  → APP_ENV=staging
 *   - dev:prod / native release → APP_ENV=production
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env.APP_ENV ?? "development";
  const isProd = env === "production";
  const isStaging = env === "staging";

  const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? "1");
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
    throw new Error("ANDROID_VERSION_CODE must be a positive Android version code");
  }

  return {
    ...config,
    name: isProd
      ? "iteamify"
      : isStaging
        ? "iteamify (Staging)"
        : "iteamify (Dev)",
    slug: "iteamify-mobile",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "iteamify",
    // 1024x1024 source shared with the desktop client
    // (apps/desktop/build/icon.png). Expo prebuild generates every required
    // iOS icon size from this single PNG.
    icon: "./assets/icon.png",
    android: {
      package: isProd ? "com.aurocreator.mobile" : isStaging ? "com.aurocreator.mobile.staging" : "com.aurocreator.mobile.dev",
      versionCode,
      permissions: ["android.permission.INTERNET"],
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
    },
    ios: {
      supportsTablet: false,
      // Per-variant bundle id overrides exist for one reason: an Apple ID
      // can only sign bundle prefixes it owns, so contributors not on the
      // iTeamify Apple Developer team (and external users self-building a
      // personal copy against production) need to swap to a reverse-domain
      // they control. Each variant has its own `_<VARIANT>` suffix and is
      // only read inside that variant's branch — a generic
      // `EXPO_BUNDLE_IDENTIFIER` would leak across variants (Expo CLI
      // auto-loads `.env.<mode>.local` regardless of APP_ENV) and collapse
      // dev / staging / prod onto a single id.
      bundleIdentifier: isProd
        ? (process.env.EXPO_BUNDLE_IDENTIFIER_PROD ?? "ai.iteamify.mobile")
        : isStaging
          ? "ai.iteamify.mobile.staging"
          : (process.env.EXPO_BUNDLE_IDENTIFIER_DEV ?? "ai.iteamify.mobile.dev"),
    },
    plugins: [
      "expo-image",
      "expo-router",
      "./plugins/with-android-release.cjs",
      "expo-secure-store",
      "@react-native-community/datetimepicker",
      "react-native-enriched-markdown",
      [
        "expo-image-picker",
        {
          // iOS NSPhotoLibraryUsageDescription. Without this string in
          // Info.plist, calling launchImageLibraryAsync hard-crashes on
          // iOS 14+. Profile photos also support the camera; audio is unused.
          photosPermission:
            "Allow iteamify to access your photos to attach images to issues and comments.",
          cameraPermission: "Allow iteamify to use your camera to update your profile photo.",
          microphonePermission: false,
        },
      ],
      [
        "expo-build-properties",
        {
          android: { usesCleartextTraffic: !isProd },
          ios: {
            buildReactNativeFromSource: true,
          },
        },
      ],
    ],
    extra: { APP_ENV: env },
  };
};
