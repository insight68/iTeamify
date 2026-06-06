"use client";

import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@teamify/ui/components/ui/input";
import { Button } from "@teamify/ui/components/ui/button";
import { Card, CardContent } from "@teamify/ui/components/ui/card";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@teamify/core/paths";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import { api } from "@teamify/core/api";
import type { Workspace, WorkspaceRepo } from "@teamify/core/types";
import { useT } from "../../i18n";

export function RepositoriesTab() {
  const { t } = useT("settings");
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();

  const [repos, setRepos] = useState<WorkspaceRepo[]>(workspace?.repos ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRepos(workspace?.repos ?? []);
  }, [workspace]);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, { repos });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success(t(($) => $.repositories.toast_saved));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.repositories.toast_save_failed));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepo = () => {
    setRepos([...repos, { url: "" }]);
  };

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index));
  };

  const handleRepoChange = (index: number, value: string) => {
    setRepos(repos.map((r, i) => (i === index ? { ...r, url: value } : r)));
  };

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.repositories.section_title)}</h2>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t(($) => $.repositories.description)}
            </p>

            {repos.map((repo, index) => (
              <div key={index} className="flex items-start gap-2">
                <Input
                  type="url"
                  value={repo.url}
                  onChange={(e) => handleRepoChange(index, e.target.value)}
                  placeholder={t(($) => $.repositories.url_placeholder)}
                  className="flex-1 min-w-0 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveRepo(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleAddRepo}>
                <Plus className="h-3 w-3" />
                {t(($) => $.repositories.add)}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-3 w-3" />
                {saving ? t(($) => $.repositories.saving) : t(($) => $.repositories.save)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
