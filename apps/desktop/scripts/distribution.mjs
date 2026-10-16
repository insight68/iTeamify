// This public URL is compiled into the app. Never put credentials in it.
export function resolveDownloadUrl(env = process.env) {
  const value = env.DESKTOP_DOWNLOAD_URL?.trim();
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("DESKTOP_DOWNLOAD_URL must be a public HTTPS URL without credentials, query or fragment");
  }
  return url.href.replace(/\/+$/, "");
}
