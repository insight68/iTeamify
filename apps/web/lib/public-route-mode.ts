/**
 * Capability-backed pages must not initialize the authenticated member
 * session. Keep this list narrow: login/onboarding and the marketing root use
 * member state for their existing redirect behavior.
 */
export function isPublicCapabilityPath(pathname: string): boolean {
  return (
    pathname === "/experts" ||
    pathname.startsWith("/experts/") ||
    pathname === "/purchase" ||
    pathname.startsWith("/purchase/")
  );
}
