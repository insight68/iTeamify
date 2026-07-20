export function buildAgentTableExportXlsxFileName(
  title: string | undefined,
  date = new Date(),
): string {
  const base = sanitizeFileName(title?.trim() || "agent-table");
  return `${base}-${formatDate(date)}.xlsx`;
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    || "agent-table";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
