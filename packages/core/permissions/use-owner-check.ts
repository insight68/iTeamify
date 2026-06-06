import { useCurrentMember } from "./use-current-member";

/**
 * Returns whether the current user is the owner of the given workspace.
 * Thin convenience wrapper over `useCurrentMember` — used by sidebar filtering
 * and route guards to gate owner-only features (digital employees, etc.).
 */
export function useIsOwner(wsId: string): { isOwner: boolean; isLoading: boolean } {
  const { role, isLoading } = useCurrentMember(wsId);
  return { isOwner: role === "owner", isLoading };
}
