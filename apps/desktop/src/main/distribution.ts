declare const __DESKTOP_DOWNLOAD_URL__: string;

// Unconfigured/internal builds cannot silently download upstream software.
export const DESKTOP_DOWNLOAD_URL =
  typeof __DESKTOP_DOWNLOAD_URL__ === "string" ? __DESKTOP_DOWNLOAD_URL__ : "";
