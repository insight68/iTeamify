// Public marketing routes own their scroll container because the root app
// layout keeps body overflow hidden for dashboard-style shells.
export default function DuizhangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-light-tech h-svh overflow-y-auto bg-background text-foreground">
      {children}
    </div>
  );
}
