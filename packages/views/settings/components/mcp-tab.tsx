"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Textarea } from "@teamify/ui/components/ui/textarea";
import { api } from "@teamify/core/api";
import { useCurrentWorkspace } from "@teamify/core/paths";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import type { Workspace, WorkspaceMcpConfig, WorkspaceMcpServerConfig } from "@teamify/core/types";
import { useT } from "../../i18n";

interface McpServerRow {
  id: string;
  name: string;
  command: string;
  argsText: string;
  envText: string;
}

const EMPTY_ROWS: McpServerRow[] = [];

function makeRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsFromConfig(config: WorkspaceMcpConfig | undefined): McpServerRow[] {
  const servers = config?.mcpServers;
  if (!servers || !isRecord(servers)) return EMPTY_ROWS;

  return Object.entries(servers).map(([name, server]) => {
    const serverConfig = isRecord(server) ? server : {};
    const args = Array.isArray(serverConfig.args)
      ? serverConfig.args.filter((arg): arg is string => typeof arg === "string")
      : [];
    const env = isRecord(serverConfig.env) ? serverConfig.env : {};
    return {
      id: makeRowId(),
      name,
      command: typeof serverConfig.command === "string" ? serverConfig.command : "",
      argsText: args.join("\n"),
      envText: Object.keys(env).length > 0 ? JSON.stringify(env, null, 2) : "",
    };
  });
}

function parseEnv(raw: string): Record<string, string> | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error();
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error();
    }
    env[key] = value;
  }
  return env;
}

function buildConfig(base: WorkspaceMcpConfig | undefined, rows: McpServerRow[]): WorkspaceMcpConfig {
  const next: WorkspaceMcpConfig = isRecord(base) ? { ...base } : {};
  const mcpServers: Record<string, WorkspaceMcpServerConfig> = {};

  for (const row of rows) {
    const name = row.name.trim();
    const command = row.command.trim();
    if (!name && !command && !row.argsText.trim() && !row.envText.trim()) {
      continue;
    }
    const args = row.argsText
      .split("\n")
      .map((arg) => arg.trim())
      .filter(Boolean);
    const server: WorkspaceMcpServerConfig = { command };
    if (args.length > 0) server.args = args;
    const env = parseEnv(row.envText);
    if (env && Object.keys(env).length > 0) server.env = env;
    mcpServers[name] = server;
  }

  if (Object.keys(mcpServers).length > 0) {
    next.mcpServers = mcpServers;
  } else {
    delete next.mcpServers;
  }
  return next;
}

export function McpTab() {
  const { t } = useT("settings");
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();
  const [rows, setRows] = useState<McpServerRow[]>(EMPTY_ROWS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(rowsFromConfig(workspace?.mcp_config));
  }, [workspace?.mcp_config]);

  const updateRow = (id: string, patch: Partial<McpServerRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      { id: makeRowId(), name: "", command: "", argsText: "", envText: "" },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const handleSave = async () => {
    if (!workspace) return;

    const seen = new Set<string>();
    for (const row of rows) {
      const name = row.name.trim();
      const command = row.command.trim();
      const hasAnyValue = name || command || row.argsText.trim() || row.envText.trim();
      if (!hasAnyValue) continue;
      if (!name || !command) {
        toast.error(t(($) => $.mcp.toast_required));
        return;
      }
      if (seen.has(name)) {
        toast.error(t(($) => $.mcp.toast_duplicate, { name }));
        return;
      }
      seen.add(name);
    }

    setSaving(true);
    try {
      let nextConfig: WorkspaceMcpConfig;
      try {
        nextConfig = buildConfig(workspace.mcp_config, rows);
      } catch {
        toast.error(t(($) => $.mcp.toast_env_invalid));
        return;
      }
      const updated = await api.updateWorkspace(workspace.id, { mcp_config: nextConfig });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success(t(($) => $.mcp.toast_saved));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.mcp.toast_save_failed));
    } finally {
      setSaving(false);
    }
  };

  if (!workspace) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{t(($) => $.mcp.section_title)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.mcp.description)}</p>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t(($) => $.mcp.empty_state)}
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-lg border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.name.trim() || t(($) => $.mcp.server_fallback)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t(($) => $.mcp.remove_server)}
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.mcp.name_label)}</Label>
                  <Input
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    placeholder={t(($) => $.mcp.name_placeholder)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.mcp.command_label)}</Label>
                  <Input
                    value={row.command}
                    onChange={(event) => updateRow(row.id, { command: event.target.value })}
                    placeholder={t(($) => $.mcp.command_placeholder)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.mcp.args_label)}</Label>
                  <Textarea
                    value={row.argsText}
                    onChange={(event) => updateRow(row.id, { argsText: event.target.value })}
                    placeholder={t(($) => $.mcp.args_placeholder)}
                    rows={3}
                    className="mt-1 resize-none font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.mcp.env_label)}</Label>
                  <Textarea
                    value={row.envText}
                    onChange={(event) => updateRow(row.id, { envText: event.target.value })}
                    placeholder={t(($) => $.mcp.env_placeholder)}
                    rows={3}
                    className="mt-1 resize-none font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3 w-3" />
          {t(($) => $.mcp.add_server)}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3 w-3" />
          {saving ? t(($) => $.mcp.saving) : t(($) => $.mcp.save)}
        </Button>
      </div>
    </div>
  );
}
