export { LocaleProvider, useLocale } from "./context";
export {
  isZhLocale,
  locales,
  localeLabels,
  toLandingDictionaryLocale,
} from "./types";
export type { LandingDict, LandingDictionaryLocale, Locale } from "./types";

import { createEnDict } from "./en";
import { createZhDict } from "./zh";
import type { LandingDict, LandingDictionaryLocale } from "./types";

/**
 * Server-side dictionary lookup for route components that render copy before
 * hydration (for example the homepage, which is a server component and cannot
 * call `useLocale`). Client components should keep using `useLocale().t` so a
 * locale switch updates them without a full navigation.
 */
export function getLandingDict(
  locale: LandingDictionaryLocale,
  allowSignup = true,
): LandingDict {
  return locale === "zh" ? createZhDict(allowSignup) : createEnDict(allowSignup);
}
