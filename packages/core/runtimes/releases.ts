export const TEAMIFY_RELEASE_REPOSITORY = "Insight86/Teamify";

export const TEAMIFY_RELEASES_API_BASE = `https://api.github.com/repos/${TEAMIFY_RELEASE_REPOSITORY}/releases`;

export const TEAMIFY_LATEST_RELEASE_API_URL = `${TEAMIFY_RELEASES_API_BASE}/latest`;

const UNOBSERVED_FETCH_KEY = "__TEAMIFY_UNOBSERVED_FETCH__";

type FetchLike = typeof fetch;

function getUnobservedFetch(): FetchLike {
  const globalWithUnobservedFetch = globalThis as typeof globalThis & {
    [UNOBSERVED_FETCH_KEY]?: FetchLike;
  };
  return globalWithUnobservedFetch[UNOBSERVED_FETCH_KEY] ?? fetch.bind(globalThis);
}

export async function fetchLatestCliVersion(): Promise<string | null> {
  try {
    const resp = await getUnobservedFetch()(TEAMIFY_LATEST_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tag_name?: unknown };
    return typeof data.tag_name === "string" ? data.tag_name : null;
  } catch {
    return null;
  }
}
