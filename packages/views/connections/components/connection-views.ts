export const CONNECTION_VIEWS = ["apps", "channels", "code"] as const;
export type ConnectionView = (typeof CONNECTION_VIEWS)[number];

export function resolveConnectionView(
  requested: string | null,
  available: readonly ConnectionView[],
): ConnectionView {
  if (requested && available.includes(requested as ConnectionView)) {
    return requested as ConnectionView;
  }
  return available[0] ?? "apps";
}
