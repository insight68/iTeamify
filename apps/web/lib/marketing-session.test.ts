import { describe, expect, it } from "vitest";
import { resolveMarketingSession } from "./marketing-session";

describe("resolveMarketingSession", () => {
  it("sends anonymous visitors to login", () => {
    expect(resolveMarketingSession({ hasSession: false })).toEqual({
      isAuthenticated: false,
      ctaHref: "/login",
    });
  });

  it("links a session with a valid workspace cookie directly to the app", () => {
    expect(
      resolveMarketingSession({
        hasSession: true,
        lastWorkspaceSlug: "creator-studio",
      }),
    ).toEqual({
      isAuthenticated: true,
      ctaHref: "/creator-studio/issues",
    });
  });

  it.each([undefined, "", "%", "../admin", "UPPER_CASE"])(
    "routes a session with an unsafe or missing slug (%s) through onboarding",
    (lastWorkspaceSlug) => {
      expect(
        resolveMarketingSession({ hasSession: true, lastWorkspaceSlug }),
      ).toEqual({ isAuthenticated: true, ctaHref: "/onboarding" });
    },
  );
});
