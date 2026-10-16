export type MarketingSession = {
  isAuthenticated: boolean;
  ctaHref: string;
};

const WORKSPACE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export function resolveMarketingSession({
  hasSession,
  lastWorkspaceSlug,
}: {
  hasSession: boolean;
  lastWorkspaceSlug?: string;
}): MarketingSession {
  if (!hasSession) return { isAuthenticated: false, ctaHref: "/login" };

  let slug = "";
  try {
    slug = lastWorkspaceSlug ? decodeURIComponent(lastWorkspaceSlug) : "";
  } catch {
    // A malformed client-controlled cookie must never be interpolated into a URL.
  }

  return {
    isAuthenticated: true,
    ctaHref: WORKSPACE_SLUG.test(slug)
      ? `/${encodeURIComponent(slug)}/issues`
      : "/onboarding",
  };
}
