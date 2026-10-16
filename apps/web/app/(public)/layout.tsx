import { AppShell } from "@/components/app-shell";

export default function PublicCapabilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
