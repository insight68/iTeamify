// The (home) route group owns the public landing page. Wrapping in
// `.landing-deep-space` activates the deep-space dark token lock in
// apps/web/app/globals.css so token-driven components inside render
// with deep-space blacks, electric cyan brand, and amber gold CTAs,
// regardless of the user's system dark-mode preference. `h-svh` creates
// a fixed-viewport-height scroll container within body's `overflow-hidden`
// boundary — same pattern as the dashboard layout.
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-deep-space h-svh overflow-y-auto bg-background text-foreground">
      {children}
    </div>
  );
}
