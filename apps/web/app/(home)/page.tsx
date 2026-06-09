import type { Metadata } from "next";
import { LandingPage } from "@teamify/views/marketing";

// Page-specific metadata. The root layout (apps/web/app/layout.tsx:75-104)
// already sets title template, OG defaults, and canonical "/" so this
// block just refines the page's own title/description and leaves the rest
// inherited. Logged-in users with a last-workspace cookie are redirected
// to /{slug}/issues by proxy.ts:79-83 before this page is ever rendered.
export const metadata: Metadata = {
  title: "Teamify — AI-native task management. Agents as teammates.",
  description:
    "Teamify turns coding agents into real teammates — with identities, memories, and initiative. Assign tasks, watch them work, and ship together. Open source, self-hostable, $20/mo per agent.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Teamify — AI-native task management. Agents as teammates.",
    description:
      "Teamify turns coding agents into real teammates — with identities, memories, and initiative. Open source, self-hostable.",
    url: "/",
  },
  twitter: {
    title: "Teamify — AI-native task management. Agents as teammates.",
    description:
      "Teamify turns coding agents into real teammates — with identities, memories, and initiative. Open source, self-hostable.",
  },
};

export default function RootPage() {
  return <LandingPage />;
}
