import type { LocaleAdapter, SupportedLocale } from "@teamify/core/i18n";

const STORAGE_KEY = "teamify-locale";

/**
 * Mobile locale adapter:
 *   - User choice: localStorage (set by Settings switcher).
 *   - System preference: falls back to navigator.language passed at creation.
 *   - Persist: localStorage. Settings also PATCHes /api/me when logged in.
 */
export function createMobileLocaleAdapter(systemLocale: string): LocaleAdapter {
  return {
    getUserChoice() {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    getSystemPreferences() {
      return systemLocale ? [systemLocale] : [];
    },
    persist(locale: SupportedLocale) {
      try {
        window.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Best-effort
      }
    },
  };
}
