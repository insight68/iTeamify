import nextConfig from "@iteamify/eslint-config/next";

export default [
  ...nextConfig,
  { ignores: [".next/", ".next-*/", ".iteamify/", ".source/"] },
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      "react/display-name": "off",
    },
  },
];
