import React from "react";
import { useWorkspaceId } from "@teamify/core";
import { useIsOwner } from "@teamify/core/permissions";
import { useNavigation } from "../navigation";
import { useWorkspacePaths } from "@teamify/core/paths";

interface OwnerGuardProps {
  children: React.ReactNode;
  /** Custom fallback for non-owners (default: redirect to issues). */
  fallback?: React.ReactNode;
}

/**
 * Route guard that restricts access to workspace owners.
 * Non-owners are redirected to the issues page. Loading state renders nothing
 * to avoid flash-of-wrong-content.
 */
export function OwnerGuard({ children, fallback }: OwnerGuardProps) {
  const wsId = useWorkspaceId();
  const { isOwner, isLoading } = useIsOwner(wsId);
  const { replace } = useNavigation();
  const p = useWorkspacePaths();

  // Hooks must be declared unconditionally (Rules of Hooks).
  // The guard condition lives inside the effect body.
  React.useEffect(() => {
    if (!isLoading && !isOwner && !fallback) {
      replace(p.issues());
    }
  }, [isLoading, isOwner, fallback, replace, p]);

  if (isLoading) return null;
  if (!isOwner) return fallback ? <>{fallback}</> : null;

  return <>{children}</>;
}
