import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TEAMIFY_LATEST_RELEASE_API_URL,
  TEAMIFY_RELEASE_REPOSITORY,
  fetchLatestCliVersion,
} from "./releases";

const UNOBSERVED_FETCH_KEY = "__TEAMIFY_UNOBSERVED_FETCH__";

describe("runtime release checks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & Record<string, unknown>)[
      UNOBSERVED_FETCH_KEY
    ];
  });

  it("uses the Insight86/Teamify release repository", () => {
    expect(TEAMIFY_RELEASE_REPOSITORY).toBe("Insight86/Teamify");
    expect(TEAMIFY_LATEST_RELEASE_API_URL).toBe(
      "https://api.github.com/repos/Insight86/Teamify/releases/latest",
    );
  });

  it("prefers the unobserved fetch hook when present", async () => {
    const observedFetch = vi.fn();
    const unobservedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v1.26.1-rc1" }),
    });
    vi.stubGlobal("fetch", observedFetch);
    (globalThis as typeof globalThis & Record<string, unknown>)[
      UNOBSERVED_FETCH_KEY
    ] = unobservedFetch;

    await expect(fetchLatestCliVersion()).resolves.toBe("v1.26.1-rc1");
    expect(unobservedFetch).toHaveBeenCalledWith(TEAMIFY_LATEST_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    expect(observedFetch).not.toHaveBeenCalled();
  });
});
