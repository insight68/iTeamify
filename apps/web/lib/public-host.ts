/**
 * Frontend hosts that serve the public marketing site.
 *
 * `iteamify.com` is the canonical origin (`SITE_CONFIG.origin`). The
 * `aurosignal.com` and `aurocreator.com` entries stay listed for as long as
 * those earlier domains keep resolving, so a signed-in visitor landing on an
 * old domain still gets the marketing page rather than a bounce into the
 * workspace.
 */
const OFFICIAL_MARKETING_HOSTS = new Set([
  "iteamify.com",
  "www.iteamify.com",
  "aurosignal.com",
  "www.aurosignal.com",
  "aurocreator.com",
  "www.aurocreator.com",
]);

export function isOfficialMarketingHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return OFFICIAL_MARKETING_HOSTS.has(normalized);
}
