import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ITEAMIFY_LOCALE_HEADER } from "./lib/locale-routing";
import { proxy } from "./proxy";

function makeRequest(
  path: string,
  cookies: Record<string, string> = {},
  host = "app.iteamify.test",
) {
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  return new NextRequest(`https://${host}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function redirectLocation(
  path: string,
  cookies: Record<string, string> = {},
  host?: string,
) {
  return proxy(makeRequest(path, cookies, host)).headers.get("location");
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function withoutRuntimeUpstreams(run: () => void) {
  const previousRemoteApiUrl = process.env.REMOTE_API_URL;
  const previousPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const previousPort = process.env.PORT;
  delete process.env.REMOTE_API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
  process.env.PORT = "3000";

  try {
    run();
  } finally {
    restoreEnv("REMOTE_API_URL", previousRemoteApiUrl);
    restoreEnv("NEXT_PUBLIC_API_URL", previousPublicApiUrl);
    restoreEnv("PORT", previousPort);
  }
}

describe("proxy legacy workspace route redirects", () => {
  const sessionCookies = {
    iteamify_logged_in: "1",
    last_workspace_slug: "acme",
  };

  it.each([
    ["issues", "/acme/issues"],
    ["projects", "/acme/projects"],
    ["agents", "/acme/agents"],
    ["squads", "/acme/squads"],
    ["inbox", "/acme/inbox"],
    ["my-issues", "/acme/my-issues"],
    ["autopilots", "/acme/autopilots"],
    ["knowledge", "/acme/knowledge"],
    ["business", "/acme/business"],
    ["runtimes", "/acme/runtimes"],
    ["skills", "/acme/skills"],
    ["settings", "/acme/settings"],
    ["connections", "/acme/connections"],
    ["usage", "/acme/usage"],
  ])(
    "redirects legacy /%s URLs through the last workspace slug",
    (segment, expectedPath) => {
      expect(redirectLocation(`/${segment}?tab=all`, sessionCookies)).toBe(
        `https://app.iteamify.test${expectedPath}?tab=all`,
      );
    },
  );

  it("preserves nested legacy paths and query strings", () => {
    expect(
      redirectLocation("/squads/squad-123?view=members", sessionCookies),
    ).toBe("https://app.iteamify.test/acme/squads/squad-123?view=members");
  });

  it("sends logged-out legacy URLs to login", () => {
    expect(redirectLocation("/usage?tab=billing")).toBe(
      "https://app.iteamify.test/login?tab=billing",
    );
  });

  it("sends logged-in legacy URLs without a last workspace cookie to root", () => {
    expect(
      redirectLocation("/squads", { iteamify_logged_in: "1" }),
    ).toBe("https://app.iteamify.test/");
  });

  it("does not redirect workspace-scoped URLs whose first segment is already a slug", () => {
    expect(redirectLocation("/acme/squads", sessionCookies)).toBeNull();
  });

  it("redirects app-host root URLs to the last workspace", () => {
    expect(redirectLocation("/", sessionCookies)).toBe(
      "https://app.iteamify.test/acme/issues",
    );
  });

  it("redirects an app-host session without a workspace cookie to onboarding", () => {
    expect(
      redirectLocation("/", { iteamify_logged_in: "1" }),
    ).toBe("https://app.iteamify.test/onboarding");
  });

  it("keeps an official marketing root public without a workspace cookie", () => {
    expect(
      redirectLocation("/", { iteamify_logged_in: "1" }, "aurocreator.com"),
    ).toBeNull();
  });

  it.each(["aurocreator.com", "www.aurocreator.com"])(
    "does not redirect public marketing root on %s",
    (host) => {
      expect(redirectLocation("/", sessionCookies, host)).toBeNull();
    },
  );

  it("still redirects explicit legacy app routes on the public marketing host", () => {
    expect(
      redirectLocation("/issues/ABC-123", sessionCookies, "aurocreator.com"),
    ).toBe(
      "https://aurocreator.com/acme/issues/ABC-123",
    );
  });
});

describe("proxy lead route migration", () => {
  it.each([
  ])("permanently redirects %s before login", (oldPath, newPath) => {
    const response = proxy(makeRequest(oldPath));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://app.iteamify.test${newPath}`);
  });

  it("resolves unscoped old deep links in one redirect", () => {
  });
});

describe("proxy runtime upstream rewrites", () => {
  it("does not rewrite API requests when no runtime API origin is configured", () => {
    withoutRuntimeUpstreams(() => {
      const res = proxy(makeRequest("/api/config?x=1"));

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(
        res.headers.get(`x-middleware-request-${ITEAMIFY_LOCALE_HEADER}`),
      ).toBe("en");
    });
  });

  it("rewrites API requests to the runtime API origin", () => {
    const previous = process.env.REMOTE_API_URL;
    process.env.REMOTE_API_URL = "http://backend:8080";
    try {
      const res = proxy(makeRequest("/api/config?x=1"));

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBe(
        "http://backend:8080/api/config?x=1",
      );
    } finally {
      restoreEnv("REMOTE_API_URL", previous);
    }
  });

  it("rewrites websocket requests to the runtime API origin", () => {
    const previous = process.env.REMOTE_API_URL;
    process.env.REMOTE_API_URL = "http://backend:8080";
    try {
      const res = proxy(makeRequest("/ws"));

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBe(
        "http://backend:8080/ws",
      );
    } finally {
      restoreEnv("REMOTE_API_URL", previous);
    }
  });

  it("does not rewrite frontend auth callback pages", () => {
    const previous = process.env.REMOTE_API_URL;
    process.env.REMOTE_API_URL = "http://backend:8080";
    try {
      const res = proxy(makeRequest("/auth/callback"));

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(
        res.headers.get(`x-middleware-request-${ITEAMIFY_LOCALE_HEADER}`),
      ).toBe("en");
    } finally {
      restoreEnv("REMOTE_API_URL", previous);
    }
  });
});

describe("proxy root and locale handling", () => {
  it("redirects logged-in root visits to the last workspace", () => {
    const res = proxy(
      makeRequest("/", {
        iteamify_logged_in: "1",
        last_workspace_slug: "acme",
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.iteamify.test/acme/issues",
    );
  });

  it("forwards locale on login requests", () => {
    const res = proxy(makeRequest("/login", { "iteamify-locale": "zh-Hans" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(
      res.headers.get(`x-middleware-request-${ITEAMIFY_LOCALE_HEADER}`),
    ).toBe("zh-Hans");
  });

  it("makes the English marketing URL authoritative over a locale cookie", () => {
    const res = proxy(
      makeRequest("/about", { "iteamify-locale": "zh-Hans" }),
    );

    expect(
      res.headers.get(`x-middleware-request-${ITEAMIFY_LOCALE_HEADER}`),
    ).toBe("en");
  });

  it("makes the Chinese marketing URL authoritative over a locale cookie", () => {
    const res = proxy(makeRequest("/zh-cn/about", { "iteamify-locale": "en" }));

    expect(
      res.headers.get(`x-middleware-request-${ITEAMIFY_LOCALE_HEADER}`),
    ).toBe("zh-Hans");
  });

  it.each([
    ["/homepage?from=legacy", "/?from=legacy"],
    ["/en", "/"],
    ["/en/about?from=en", "/about?from=en"],
  ])("permanently redirects %s to %s", (path, expectedPath) => {
    const res = proxy(makeRequest(path));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      `https://app.iteamify.test${expectedPath}`,
    );
  });
});
