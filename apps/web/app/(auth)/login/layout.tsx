import type { Metadata } from "next";
// The login route renders the marketing shell (LandingHeader/LandingFooter) but
// lives in the (auth) group, which only loads globals.css. Without this import
// every `.service-*` / `.landing-brand` rule is missing and the header/footer
// collapse into unstyled markup. Mirrors app/(public)/experts/layout.tsx.
import "@/features/landing/service-marketing.css";

export const metadata: Metadata = {
  title: "Sign in to iteamify",
  description:
    "Securely sign in to iteamify, your AI-native collaboration workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
