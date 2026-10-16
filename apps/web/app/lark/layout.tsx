import { AppShell } from "@/components/app-shell";

export default function LarkLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
