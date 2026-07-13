"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Switch } from "@teamify/ui/components/ui/switch";
import { Label } from "@teamify/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@teamify/ui/components/ui/select";
import { useWorkspaceId } from "@teamify/core/hooks";
import { dataSourceListOptions, dataTableListOptions, tableColumnsOptions } from "@teamify/core/datasources/queries";
import type { Agent, ChatTableConfig, ChatTableColumn, ChatTableFilter } from "@teamify/core/types";
import { getFilterVariables } from "@teamify/core/chat/filter-variables";
import { useT } from "../../../i18n";

interface ChatTableTabProps {
  agent: Agent;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

const DEFAULT_CONFIG: ChatTableConfig = {
  enabled: false,
  title: "",
  columns: [],
  filters: [],
  page_size: 20,
};

function resolveConfig(raw: ChatTableConfig | undefined): ChatTableConfig {
  if (!raw) return DEFAULT_CONFIG;
  return {
    enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
    title: raw.title ?? DEFAULT_CONFIG.title,
    data_source_id: raw.data_source_id,
    data_table_id: raw.data_table_id,
    data_table_name: raw.data_table_name,
    mcp_tool: raw.mcp_tool
      ? {
          tool_name: raw.mcp_tool.tool_name ?? "",
          tool_params: raw.mcp_tool.tool_params ?? {},
          response_data_path: raw.mcp_tool.response_data_path ?? "$.rows",
          save_tool_name: raw.mcp_tool.save_tool_name,
          create_tool_name: raw.mcp_tool.create_tool_name,
          delete_tool_name: raw.mcp_tool.delete_tool_name,
          save_params_mapping: raw.mcp_tool.save_params_mapping,
        }
      : undefined,
    columns: raw.columns ?? DEFAULT_CONFIG.columns,
    filters: raw.filters ?? DEFAULT_CONFIG.filters,
    page_size: raw.page_size ?? DEFAULT_CONFIG.page_size,
    default_sort: raw.default_sort ?? DEFAULT_CONFIG.default_sort,
    row_color_column: raw.row_color_column,
  };
}

/**
 * Chat Table configuration tab in the agent overview pane.
 */
export function ChatTableTab({ agent, onSave, onDirtyChange }: ChatTableTabProps) {
  const wsId = useWorkspaceId();
  const { t } = useT("agents");
  const config = resolveConfig(agent.chat_table_config);
  const [draft, setDraft] = useState<ChatTableConfig>(config);
  const [saving, setSaving] = useState(false);

  // Fetch workspace data sources for the picker.
  const { data: dataSources = [] } = useQuery(dataSourceListOptions(wsId));
  const dbDataSources = dataSources.filter((ds) => ds.type === "database");

  // Fetch tables for the selected data source.
  const { data: dataTables = [] } = useQuery({
    ...dataTableListOptions(wsId, draft.data_source_id ?? ""),
    enabled: !!draft.data_source_id,
  });

  // Fetch column metadata when a table is selected.
  const { data: columnData, isFetching: columnsLoading } = useQuery({
    ...tableColumnsOptions(wsId, draft.data_table_id ?? ""),
    enabled: !!draft.data_table_id,
  });

  // Auto-fill columns when metadata arrives and the user hasn't manually
  // configured columns yet. Uses a ref guard so the effect only auto-fills
  // once — adding draft.columns.length to deps would cause unwanted re-fills
  // when the user clears columns.
  const autoFilledRef = useRef(false);
  useEffect(() => {
    if (autoFilledRef.current) return;
    if (columnData?.columns?.length) {
      setDraft((d) => {
        if (d.columns.length > 0) return d;
        autoFilledRef.current = true;
        return { ...d, columns: columnData.columns };
      });
    }
  }, [columnData]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({ chat_table_config: draft });
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const setEnabled = (enabled: boolean): void =>
    setDraft((d) => ({ ...d, enabled }));

  const setTitle = (title: string): void =>
    setDraft((d) => ({ ...d, title }));

  const setDataSourceId = (id: string): void =>
    setDraft((d) => ({ ...d, data_source_id: id || undefined, data_table_id: undefined, data_table_name: undefined }));

  const setDataTable = (tableId: string, tableName: string): void =>
    setDraft((d) => ({
      ...d,
      data_table_id: tableId || undefined,
      data_table_name: tableName || undefined,
    }));

  const setPageSize = (n: number): void =>
    setDraft((d) => ({ ...d, page_size: n }));

  const addColumn = (): void =>
    setDraft((d) => ({
      ...d,
      columns: [...d.columns, { key: "", label: "", type: "text", editable: false, visible: true }],
    }));

  const updateColumn = (idx: number, field: string, value: unknown): void =>
    setDraft((d) => {
      const cols = [...d.columns];
      cols[idx] = { ...cols[idx], [field]: value } as ChatTableColumn;
      return { ...d, columns: cols };
    });

  const removeColumn = (idx: number): void =>
    setDraft((d) => ({ ...d, columns: d.columns.filter((_, i) => i !== idx) }));

  const addFilter = (): void =>
    setDraft((d) => ({
      ...d,
      filters: [...d.filters, { key: "", label: "", type: "text" }],
    }));

  const updateFilter = (idx: number, field: string, value: unknown): void =>
    setDraft((d) => {
      const flt = [...d.filters];
      flt[idx] = { ...flt[idx], [field]: value } as ChatTableFilter;
      return { ...d, filters: flt };
    });

  const removeFilter = (idx: number): void =>
    setDraft((d) => ({ ...d, filters: d.filters.filter((_, i) => i !== idx) }));

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 space-y-6 overflow-y-auto pr-2">
        {/* ── Enabled toggle ── */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t(($) => $.tab_body.chat_table.enable_label)}</Label>
            <p className="text-xs text-muted-foreground">
              {t(($) => $.tab_body.chat_table.enable_description)}
            </p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={setEnabled} />
        </div>

        {draft.enabled && (
          <>
            {/* ── Basic settings ── */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.basic_heading)}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.chat_table.title_label)}</Label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t(($) => $.tab_body.chat_table.title_placeholder)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.chat_table.page_size_label)}</Label>
                  <Input
                    type="number"
                    value={String(draft.page_size)}
                    onChange={(e) => setPageSize(Number(e.target.value) || 20)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* ── Data source picker ── */}
            <div className="space-y-3 rounded border p-3">
              <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.data_source_heading)}</h4>
              <p className="text-xs text-muted-foreground">
                {t(($) => $.tab_body.chat_table.data_source_description)}
              </p>

              <div className="space-y-1">
                <Label className="text-xs">{t(($) => $.tab_body.chat_table.data_source_label)}</Label>
                <Select
                  value={draft.data_source_id ?? ""}
                  onValueChange={(v) => setDataSourceId(v ?? "")}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder={t(($) => $.tab_body.chat_table.data_source_none_option)} />
                  </SelectTrigger>
                  <SelectContent>
                    {dbDataSources.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        {ds.name} ({ds.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {draft.data_source_id && (
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.chat_table.table_label)}</Label>
                  <Select
                    value={draft.data_table_name ?? ""}
                    onValueChange={(v) => {
                      const dt = dataTables.find((t) => t.name === (v ?? ""));
                      setDataTable(dt?.id ?? "", v ?? "");
                    }}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder={t(($) => $.tab_body.chat_table.table_select_placeholder)} />
                    </SelectTrigger>
                    <SelectContent>
                      {dataTables.map((dt) => (
                        <SelectItem key={dt.id} value={dt.name}>
                          {dt.name}
                          {dt.schema_name ? ` (${dt.schema_name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* ── MCP tool config (fallback when no data_source selected) ── */}
            {!draft.data_source_id && (
              <div className="space-y-3 rounded border p-3">
                <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.mcp_heading)}</h4>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.tab_body.chat_table.mcp_description)}
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t(($) => $.tab_body.chat_table.tool_name_label)}</Label>
                    <Input
                      value={draft.mcp_tool?.tool_name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          mcp_tool: { ...d.mcp_tool, tool_name: e.target.value, tool_params: d.mcp_tool?.tool_params ?? {}, response_data_path: d.mcp_tool?.response_data_path ?? "$.rows" },
                        }))
                      }
                      placeholder={t(($) => $.tab_body.chat_table.tool_name_placeholder)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Columns editor ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.columns_heading)}</h4>
                  {draft.data_table_id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (columnData?.columns?.length) {
                          setDraft((d) => ({ ...d, columns: columnData.columns }));
                        }
                      }}
                      disabled={columnsLoading || !columnData}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:no-underline disabled:text-muted-foreground/50"
                    >
                      {columnsLoading ? t(($) => $.tab_body.chat_table.columns_loading) : t(($) => $.tab_body.chat_table.columns_auto_load)}
                    </button>
                  )}
                  {!columnsLoading && columnData?.columns?.length != null && draft.columns.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t(($) => $.tab_body.chat_table.columns_count, { count: draft.columns.length })}
                    </span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={addColumn} className="h-7 text-xs">
                  <Plus className="size-3 mr-1" />
                  {t(($) => $.tab_body.chat_table.add_column)}
                </Button>
              </div>
              {draft.columns.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.tab_body.chat_table.columns_empty)}
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.columns.map((col, idx) => (
                    <div key={idx} className="space-y-2 rounded border p-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={col.key}
                          onChange={(e) => updateColumn(idx, "key", e.target.value)}
                          placeholder={t(($) => $.tab_body.chat_table.column_key_placeholder)}
                          className="h-7 text-xs w-24"
                        />
                        <Input
                          value={col.label}
                          onChange={(e) => updateColumn(idx, "label", e.target.value)}
                          placeholder={t(($) => $.tab_body.chat_table.column_label_placeholder)}
                          className="h-7 text-xs w-24"
                        />
                        <Select
                          value={col.type}
                          onValueChange={(v) => updateColumn(idx, "type", v)}
                        >
                          <SelectTrigger className="h-7 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">{t(($) => $.tab_body.chat_table.column_type_text)}</SelectItem>
                            <SelectItem value="number">{t(($) => $.tab_body.chat_table.column_type_number)}</SelectItem>
                            <SelectItem value="date">{t(($) => $.tab_body.chat_table.column_type_date)}</SelectItem>
                            <SelectItem value="boolean">{t(($) => $.tab_body.chat_table.column_type_boolean)}</SelectItem>
                            <SelectItem value="select">{t(($) => $.tab_body.chat_table.column_type_select)}</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={col.editable}
                            onChange={(e) => updateColumn(idx, "editable", e.target.checked)}
                            className="size-3"
                          />
                          {t(($) => $.tab_body.chat_table.column_editable_label)}
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={col.visible}
                            onChange={(e) => updateColumn(idx, "visible", e.target.checked)}
                            className="size-3"
                          />
                          {t(($) => $.tab_body.chat_table.column_visible_label)}
                        </label>
                        <Button variant="ghost" size="sm" onClick={() => removeColumn(idx)} className="h-7 w-7 p-0 ml-auto">
                          <Trash2 className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                      {col.type === "select" && (
                        <OptionsEditor
                          options={col.options}
                          showColor
                          onChange={(options) => updateColumn(idx, "options", options)}
                          t={t}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Row Coloring ── */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.row_color_heading)}</h4>
              <div className="space-y-1">
                <Label className="text-xs">{t(($) => $.tab_body.chat_table.row_color_column_label)}</Label>
                <Select
                  value={draft.row_color_column ?? ""}
                  onValueChange={(v) => setDraft((d) => ({ ...d, row_color_column: v || undefined }))}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder={t(($) => $.tab_body.chat_table.row_color_column_none)} />
                  </SelectTrigger>
                  <SelectContent>
                    {draft.columns
                      .filter((c) => c.type === "select")
                      .map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label || c.key}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {draft.row_color_column &&
                  (() => {
                    const col = draft.columns.find((c) => c.key === draft.row_color_column);
                    if (!col) {
                      return (
                        <p className="text-xs text-destructive mt-1">
                          {t(($) => $.tab_body.chat_table.row_color_column_warning_not_found)}
                        </p>
                      );
                    }
                    if (col.type !== "select") {
                      return (
                        <p className="text-xs text-destructive mt-1">
                          {t(($) => $.tab_body.chat_table.row_color_column_warning_not_select)}
                        </p>
                      );
                    }
                    return null;
                  })()}
              </div>
            </div>

            {/* ── Filters editor ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{t(($) => $.tab_body.chat_table.filters_heading)}</h4>
                <Button variant="outline" size="sm" onClick={addFilter} className="h-7 text-xs">
                  <Plus className="size-3 mr-1" />
                  {t(($) => $.tab_body.chat_table.add_filter)}
                </Button>
              </div>
              {/* Dynamic variable hint — compact chip list */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                  <Info className="size-3" />
                  {t(($) => $.tab_body.chat_table.filter_dynamic_vars_title)}
                </summary>
                <div className="mt-1.5 space-y-1 pl-5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-foreground/70">
                      {t(($) => $.tab_body.chat_table.filter_dynamic_vars_user)}:
                    </span>
                    {getFilterVariables()
                      .filter((v) => v.category === "user")
                      .map((v) => (
                        <code key={v.key} className="bg-muted px-1 rounded text-[10px] whitespace-nowrap">
                          {`{{${v.key}}}`}
                        </code>
                      ))}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium text-foreground/70">
                      {t(($) => $.tab_body.chat_table.filter_dynamic_vars_time)}:
                    </span>
                    {getFilterVariables()
                      .filter((v) => v.category === "time")
                      .map((v) => (
                        <code key={v.key} className="bg-muted px-1 rounded text-[10px] whitespace-nowrap">
                          {`{{${v.key}}}`}
                        </code>
                      ))}
                  </div>
                </div>
              </details>

              {draft.filters.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.tab_body.chat_table.filters_empty)}
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.filters.map((f, idx) => (
                    <div key={idx} className="space-y-2 rounded border p-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          value={f.key}
                          onChange={(e) => updateFilter(idx, "key", e.target.value)}
                          placeholder={t(($) => $.tab_body.chat_table.filter_key_placeholder)}
                          className="h-7 text-xs min-w-[72px] flex-1"
                        />
                        <Input
                          value={f.label}
                          onChange={(e) => updateFilter(idx, "label", e.target.value)}
                          placeholder={t(($) => $.tab_body.chat_table.filter_label_placeholder)}
                          className="h-7 text-xs min-w-[72px] flex-1"
                        />
                        <Select
                          value={f.type}
                          onValueChange={(v) => updateFilter(idx, "type", v)}
                        >
                          <SelectTrigger className="h-7 text-xs" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">{t(($) => $.tab_body.chat_table.filter_type_text)}</SelectItem>
                            <SelectItem value="select">{t(($) => $.tab_body.chat_table.filter_type_select)}</SelectItem>
                            <SelectItem value="multi_select">{t(($) => $.tab_body.chat_table.filter_type_multi_select)}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={String(f.default_value ?? "")}
                          onChange={(e) => updateFilter(idx, "default_value", e.target.value || undefined)}
                          placeholder={t(($) => $.tab_body.chat_table.filter_default_value_placeholder)}
                          className="h-7 text-xs w-24"
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeFilter(idx)} className="h-7 w-7 p-0 ml-auto">
                          <Trash2 className="size-3 text-muted-foreground" />
                        </Button>
                      </div>
                      {(f.type === "select" || f.type === "multi_select") && (
                        <OptionsEditor
                          options={f.options}
                          onChange={(options) =>
                            updateFilter(
                              idx,
                              "options",
                              options.map(({ label, value }) => ({ label, value })),
                            )
                          }
                          t={t}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Save (fixed at bottom, always visible) ── */}
      {dirty && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={() => setDraft(config)} className="h-7 text-xs">
            {t(($) => $.tab_body.chat_table.cancel)}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
            {saving ? t(($) => $.tab_body.chat_table.saving) : t(($) => $.tab_body.chat_table.save)}
          </Button>
        </div>
      )}
    </div>
  );
}

type TableOptionDraft = {
  label: string;
  value: string;
  color?: string;
};

function OptionsEditor({
  options,
  showColor = false,
  onChange,
  t,
}: {
  options?: TableOptionDraft[];
  showColor?: boolean;
  onChange: (options: TableOptionDraft[]) => void;
  t: ReturnType<typeof useT<"agents">>["t"];
}) {
  const optionRows = options ?? [];

  return (
    <div className="pl-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t(($) => $.tab_body.chat_table.options_heading)}
        </span>
        <button
          type="button"
          onClick={() => onChange([...optionRows, { label: "", value: "" }])}
          className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          + {t(($) => $.tab_body.chat_table.add_option)}
        </button>
      </div>
      {optionRows.map((opt, optIdx) => (
        <div key={optIdx} className="flex items-center gap-1.5">
          <Input
            value={opt.label}
            onChange={(e) => {
              const next = [...optionRows];
              next[optIdx] = { ...opt, label: e.target.value };
              onChange(next);
            }}
            placeholder="Label"
            className="h-6 text-xs w-20"
          />
          <Input
            value={opt.value}
            onChange={(e) => {
              const next = [...optionRows];
              next[optIdx] = { ...opt, value: e.target.value };
              onChange(next);
            }}
            placeholder="Value"
            className="h-6 text-xs w-20"
          />
          {showColor && (
            <input
              type="color"
              value={opt.color ?? "#000000"}
              onChange={(e) => {
                const next = [...optionRows];
                next[optIdx] = { ...opt, color: e.target.value };
                onChange(next);
              }}
              className="size-6 cursor-pointer rounded border border-input"
              title={t(($) => $.tab_body.chat_table.option_color_label)}
            />
          )}
          <button
            type="button"
            onClick={() => onChange(optionRows.filter((_, i) => i !== optIdx))}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
