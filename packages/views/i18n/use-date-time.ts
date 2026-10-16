import { useT } from "./use-t";

/** Localized compact date and time formatter for user-visible timestamps. */
export function useDateTime() {
  const { i18n } = useT();
  return (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat(i18n.language, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };
}
