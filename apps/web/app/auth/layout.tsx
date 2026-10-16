import { AppShell } from "@/components/app-shell";

export default function AuthCallbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
