"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, parseWithFallback } from "@teamify/core/api";
import { InvitationPreviewSchema, EMPTY_INVITATION_PREVIEW } from "@teamify/core/api/schema";
import { useAuthStore } from "@teamify/core/auth";
import type { InvitationPreview } from "@teamify/core/types";
import { paths } from "@teamify/core/paths";
import {
  workspaceKeys,
  workspaceListOptions,
} from "@teamify/core/workspace/queries";
import { InvitePage, InviteSignupPage } from "@teamify/views/invite";

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { data: wsList = [] } = useQuery({
    ...workspaceListOptions(),
    enabled: !!user,
  });

  if (isLoading) return null;

  // Authenticated: use the existing InvitePage flow.
  if (user) {
    const onBack =
      wsList.length > 0 ? () => router.push(paths.root()) : undefined;
    return <InvitePage invitationId={params.id} onBack={onBack} />;
  }

  // Unauthenticated: render the router that decides signup vs login.
  return (
    <UnauthenticatedInviteRouter
      invitationId={params.id}
    />
  );
}

function UnauthenticatedInviteRouter({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ["invitation-preview", invitationId],
    queryFn: async () => {
      const raw = await api.getInvitationPreview(invitationId);
      return parseWithFallback(
        raw,
        InvitationPreviewSchema,
        EMPTY_INVITATION_PREVIEW,
        { endpoint: "GET /api/invitations/:id/preview" },
      ) as InvitationPreview;
    },
  });

  useEffect(() => {
    // If user already exists, redirect to login with a return path.
    if (preview?.user_exists) {
      router.replace(
        `${paths.login()}?next=${encodeURIComponent(paths.invite(invitationId))}`,
      );
    }
  }, [preview?.user_exists, router, invitationId]);

  if (isLoading) return null;

  if (error || !preview) {
    // Let InviteSignupPage handle the error display.
    return (
      <InviteSignupPage
        invitationId={invitationId}
        onSuccess={(slug) => {
          const dest = slug ? paths.workspace(slug).issues() : paths.root();
          router.push(dest);
        }}
        onLoginInstead={() => {
          router.replace(
            `${paths.login()}?next=${encodeURIComponent(paths.invite(invitationId))}`,
          );
        }}
      />
    );
  }

  if (preview.user_exists) return null; // Redirecting to login.

  return (
    <InviteSignupPage
      invitationId={invitationId}
      onSuccess={(slug) => {
        const dest = slug ? paths.workspace(slug).issues() : paths.root();
        router.push(dest);
      }}
      onLoginInstead={() => {
        router.replace(
          `${paths.login()}?next=${encodeURIComponent(paths.invite(invitationId))}`,
        );
      }}
    />
  );
}
