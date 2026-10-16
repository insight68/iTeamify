"use client";

import { MessageSquare, FileText, Plus } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@iteamify/ui/components/ui/dropdown-menu";
import { useT } from "../../i18n";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useAuthStore } from "@iteamify/core/auth";
import { applicationsOptions } from "@iteamify/core/session-containers";

export function ContainerPicker({ onSelect, disabled, target }: { onSelect: (type: "conversation" | "contract_review") => void; disabled?: boolean; target: { kind: "member" | "agent"; id: string } }) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const query = useQuery(applicationsOptions(wsId, userId, target));
  const hasContract = query.data?.providers?.some((p) => p.type === "contract_review" && p.available === true) === true;
  if (query.isSuccess && !hasContract) return <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={t(($) => $.containers.new_session)} onClick={() => onSelect("conversation")}><Plus className="size-4" /></Button>;
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={t(($) => $.containers.new_session)}><Plus className="size-4" /></Button>} />
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => onSelect("conversation")}><MessageSquare className="size-4" />{t(($) => $.containers.conversation)}</DropdownMenuItem>
      {hasContract && <DropdownMenuItem onClick={() => onSelect("contract_review")}><FileText className="size-4" />{t(($) => $.containers.contract_review)}</DropdownMenuItem>}
      {query.isPending && <DropdownMenuItem disabled>{t(($) => $.applications.loading)}</DropdownMenuItem>}
      {query.isError && <DropdownMenuItem onClick={(e) => { e.preventDefault(); void query.refetch(); }}>{t(($) => $.applications.retry_load)}</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
