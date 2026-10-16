export const SITE_CONFIG = {
  organizationName: "iteamify",
  siteName: "iteamify",
  productName: "iteamify",
  origin: "https://iteamify.com",
  description:
    "iteamify is an AI-native collaboration platform for small teams: tasks, projects and shared knowledge in one workspace, with agents as first-class teammates.",
} as const;

export const SITE_URL = new URL(SITE_CONFIG.origin);
