"use client";

import { lazy, Suspense, type ReactNode } from "react";
import type { SessionContainer } from "@iteamify/core/session-containers";
import { useT } from "../../i18n";
import { ChatMessageSkeleton } from "../components/chat-message-skeleton";

const ContractReviewContainer = lazy(() => import("./contract-review-container").then((m) => ({ default: m.ContractReviewContainer })));
const CONTAINERS = { conversation: "conversation", contract_review: "contract_review" } as const;

export interface ContainerTarget { kind: "agent" | "direct"; id: string; name: string }
export function SessionContainerHost({ descriptor, target, sessionId, creating, onCreated, conversation }: {
  descriptor?: SessionContainer | null; target: ContainerTarget; sessionId: string; creating: boolean;
  onCreated: (id: string) => void; conversation: () => ReactNode;
}) {
  const { t } = useT("chat");
  const type = descriptor?.type ?? "conversation";
  switch (type) {
    case CONTAINERS.conversation: return conversation();
    case CONTAINERS.contract_review: return <Suspense fallback={<ChatMessageSkeleton />}><ContractReviewContainer key={sessionId} target={target} sessionId={sessionId} creating={creating} onCreated={onCreated} conversation={conversation} /></Suspense>;
    default: return <div role="alert" className="m-auto max-w-md p-8 text-center text-sm text-muted-foreground">{t(($) => $.containers.unsupported)}</div>;
  }
}
