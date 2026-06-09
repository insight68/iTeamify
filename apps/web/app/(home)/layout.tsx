// The (home) route group owns the public landing page. Wrapping in
// `.landing-light-tech` activates the light-tech token lock in
// apps/web/app/globals.css so token-driven components inside render
// with near-white backgrounds, cool blue undertones, and vibrant
// blue-purple brand color, regardless of the user's system dark-mode
// preference. `h-svh` creates a fixed-viewport-height scroll container
// within body's `overflow-hidden` boundary — same pattern as the
// dashboard layout.
export default function LandingLayout({
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