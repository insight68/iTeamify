import { AppShell } from "@/components/app-shell";

export default function SlackLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
