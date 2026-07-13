"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@teamify/core/api";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  memberListOptions,
  workspaceListOptions,
} from "@teamify/core/workspace/queries";
import { useAuthStore } from "@teamify/core/auth";
import type { WorkspaceImportReport } from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import { Card, CardContent } from "@teamify/ui/components/ui/card";
import { Label } from "@teamify/ui/components/ui/label";
import { Download } from "lucide-react";
import { useT } from "../../i18n";

// Owner-only settings tab: pick a different workspace the current user owns
// and copy its runtime / agent / skill / mcp_config in one shot. Backend
// already enforces dual ownership; the dropdown is filtered to "workspaces
// other than the current one" client-side as a UX nicety — non-owner picks
// would 404 anyway.
export function ImportTab() {
  const { t } = useT("settings");
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const { data: workspaces = [] } = useQuery(workspaceListOptions());
  // We can't reliably tell "owner of workspace X" from the workspace list
  // alone, so we look up the current user's membership on each candidate.
  // The list of candidates is typically 1–5 entries — small enough that
  // running one members query per candidate isn't a problem; the
  // useQueries-style loop is hidden inside the membership lookups below.
  const candidates = useMemo(
    () => workspaces.filter((ws) => ws.id !== wsId),
    [workspaces, wsId],
  );

  const [selected, setSelected] = useState<string>("");

  const importMutation = useMutation({
    mutationFn: async (sourceId: string) =>
      api.importWorkspaceConfig(wsId, sourceId),
    onSuccess: () => {
      toast.success(t(($) => $.import_tab.toast_success));
      // Refetch everything that could have changed on this workspace.
      qc.invalidateQueries({ queryKey: ["workspace", wsId] });
      qc.invalidateQueries({ queryKey: ["agents", wsId] });
      qc.invalidateQueries({ queryKey: ["skills", wsId] });
      qc.invalidateQueries({ queryKey: ["runtimes", wsId] });
    },
    onError: (err: Error) => {
      toast.error(`${t(($) => $.import_tab.toast_failed)}: ${err.message}`);
    },
  });

  const report = importMutation.data as WorkspaceImportReport | undefined;

  const handleSubmit = () => {
    if (!selected) return;
    importMutation.mutate(selected);
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t(($) => $.import_tab.title)}</h2>
          <p className="text-sm text-muted-foreground">
            {t(($) => $.import_tab.description)}
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(($) => $.import_tab.source_empty)}
          </p>
        ) : (
          <SourcePicker
            candidates={candidates}
            value={selected}
            onChange={setSelected}
            userId={userId}
            placeholder={t(($) => $.import_tab.source_placeholder)}
            sourceLabel={t(($) => $.import_tab.source_label)}
          />
        )}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || importMutation.isPending}
          className="gap-1.5"
        >
          <Download className="size-4" />
          {importMutation.isPending
            ? t(($) => $.import_tab.submitting)
            : t(($) => $.import_tab.submit)}
        </Button>

        {report && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-1.5 text-sm">
            <div className="font-medium">{t(($) => $.import_tab.report_title)}</div>
            <div>
              {t(($) => $.import_tab.report_runtimes, {
                count: report.runtimes.copied,
                copied: report.runtimes.copied,
                skipped: report.runtimes.skipped,
              })}
            </div>
            <div>
              {t(($) => $.import_tab.report_agents, {
                count: report.agents.copied,
                copied: report.agents.copied,
                skipped: report.agents.skipped,
              })}
            </div>
            <div>
              {t(($) => $.import_tab.report_skills, {
                count: report.skills.copied,
                copied: report.skills.copied,
                skipped: report.skills.skipped,
              })}
            </div>
            <div>
              {report.mcp_config.applied
                ? t(($) => $.import_tab.report_mcp_applied)
                : t(($) => $.import_tab.report_mcp_skipped, {
                    reason: report.mcp_config.reason ?? "",
                  })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// SourcePicker filters the candidate list down to workspaces the current
// user actually owns by looking up their role on each via useQueries (so the
// number of hook calls is exactly one — useQueries — and stays stable as
// candidates change). Renders a plain HTML <select> rather than a custom
// combobox so this tab stays consistent with the other settings tabs
// (workspace-create / data-source create) which already use raw <select>.
function SourcePicker({
  candidates,
  value,
  onChange,
  userId,
  placeholder,
  sourceLabel,
}: {
  candidates: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  userId: string | undefined;
  placeholder: string;
  sourceLabel: string;
}) {
  const memberResults = useQueries({
    queries: candidates.map((ws) => memberListOptions(ws.id)),
  });

  const ownedCandidates = candidates.filter((_, idx) => {
    const members = memberResults[idx]?.data ?? [];
    return members.some((m) => m.user_id === userId && m.role === "owner");
  });

  if (ownedCandidates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="import-source">{sourceLabel}</Label>
      <select
        id="import-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">{placeholder}</option>
        {ownedCandidates.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.name}
          </option>
        ))}
      </select>
    </div>
  );
}
