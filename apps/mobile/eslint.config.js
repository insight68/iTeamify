// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          regex: "^@iteamify/core(?:$|/(?!types(?:/|$)|api/schemas$|permissions/rules$|agents/derive-presence$|attachments/image-sequence$|chat/unread$|issues/date$|markdown$|notification-preferences/patch$))",
          allowTypeImports: true,
          message: "Mobile owns its runtime. Import a reviewed pure core entry point or use import type.",
        }],
        paths: [{ name: "@expo/vector-icons", message: "Import the icon family directly to avoid bundling every font." }],
      }],
    },
  }
]);
