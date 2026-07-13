"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { Agent, ReconciliationConfig, ChatTableColumn, ChatTableFilter } from "@teamify/core/types";
import { useT } from "../../../i18n";

interface ReconciliationTabProps {
  agent: Agent;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

const DEFAULT_CONFIG: ReconciliationConfig = {
  enabled: false,
  title: "",
  batch_no_column: "batch_no",
  confirmable: false,
  columns: [],
  filters: [],
  page_size: 20,
};

function resolveConfig(raw: ReconciliationConfig | undefined): ReconciliationConfig {
  if (!raw) return DEFAULT_CONFIG;
  return {
    enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
    title: raw.title ?? DEFAULT_CONFIG.title,
    data_source_id: raw.data_source_id,
    summary_table_id: raw.summary_table_id,
    summary_table_name: raw.summary_table_name,
    detail_table_id: raw.detail_table_id,
    detail_table_name: raw.detail_table_name,
    batch_no_column: raw.batch_no_column ?? DEFAULT_CONFIG.batch_no_column,
    confirmable: raw.confirmable ?? DEFAULT_CONFIG.confirmable,
    columns: raw.columns ?? DEFAULT_CONFIG.columns,
    filters: raw.filters ?? DEFAULT_CONFIG.filters,
    page_size: raw.page_size ?? DEFAULT_CONFIG.page_size,
    default_sort: raw.default_sort,
  };
}

/**
 * Reconciliation configuration tab in the agent overview pane.
 */
export function ReconciliationTab({ agent, onSave, onDirtyChange }: ReconciliationTabProps) {
  const { t } = useT("agents");
  const config = resolveConfig(agent.reconciliation_config as ReconciliationConfig);
  const [draft, setDraft] = useState<ReconciliationConfig>(config);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({ reconciliation_config: draft });
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const setEnabled = (enabled: boolean): void =>
    setDraft((d) => ({ ...d, enabled }));

  const setTitle = (title: string): void =>
    setDraft((d) => ({ ...d, title }));

  const setBatchNoColumn = (col: string): void =>
    setDraft((d) => ({ ...d, batch_no_column: col }));

  const setConfirmable = (confirmable: boolean): void =>
    setDraft((d) => ({ ...d, confirmable }));

  const setPageSize = (n: number): void =>
    setDraft((d) => ({ ...d, page_size: n }));

  const addColumn = (): void =>
    setDraft((d) => ({
      ...d,
      columns: [...d.columns, { key: "", label: "", type: "text", editable: false, visible: true }],
    }));

  const updateColumn = (idx: number, field: keyof ChatTableColumn, value: unknown): void =>
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

  const updateFilter = (idx: number, field: keyof ChatTableFilter, value: unknown): void =>
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
            <Label className="text-sm font-medium">{t(($) => $.tab_body.reconciliation.enable_label)}</Label>
            <p className="text-xs text-muted-foreground">
              {t(($) => $.tab_body.reconciliation.enable_description)}
            </p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={setEnabled} />
        </div>

        {draft.enabled && (
          <>
            {/* ── Basic settings ── */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t(($) => $.tab_body.reconciliation.basic_heading)}</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.reconciliation.title_label)}</Label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t(($) => $.tab_body.reconciliation.title_placeholder)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.reconciliation.page_size_label)}</Label>
                  <Input
                    type="number"
                    value={String(draft.page_size)}
                    onChange={(e) => setPageSize(Number(e.target.value) || 20)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t(($) => $.tab_body.reconciliation.batch_no_column_label)}</Label>
                  <Input
                    value={draft.batch_no_column}
                    onChange={(e) => setBatchNoColumn(e.target.value)}
                    placeholder="batch_no"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* ── Confirmation settings ── */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t(($) => $.tab_body.reconciliation.confirmable_label)}</Label>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.tab_body.reconciliation.confirmable_description)}
                </p>
              </div>
              <Switch checked={draft.confirmable} onCheckedChange={setConfirmable} />
            </div>

            {/* ── Columns editor ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{t(($) => $.tab_body.reconciliation.columns_heading)}</h4>
                <Button size="sm" variant="outline" onClick={addColumn}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t(($) => $.tab_body.reconciliation.add_column)}
                </Button>
              </div>

              {draft.columns.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t(($) => $.tab_body.reconciliation.columns_empty)}</p>
              ) : (
                <div className="space-y-2">
                  {draft.columns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded border p-2">
                      <Input
                        value={col.key}
                        onChange={(e) => updateColumn(idx, "key", e.target.value)}
                        placeholder={t(($) => $.tab_body.reconciliation.column_key_placeholder)}
                        className="h-7 w-20 text-xs"
                      />
                      <Input
                        value={col.label}
                        onChange={(e) => updateColumn(idx, "label", e.target.value)}
                        placeholder={t(($) => $.tab_body.reconciliation.column_label_placeholder)}
                        className="h-7 w-20 text-xs"
                      />
                      <Select
                        value={col.type}
                        onValueChange={(v) => updateColumn(idx, "type", v)}
                      >
                        <SelectTrigger className="h-7 w-16 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t(($) => $.tab_body.reconciliation.column_type_text)}</SelectItem>
                          <SelectItem value="number">{t(($) => $.tab_body.reconciliation.column_type_number)}</SelectItem>
                          <SelectItem value="date">{t(($) => $.tab_body.reconciliation.column_type_date)}</SelectItem>
                          <SelectItem value="boolean">{t(($) => $.tab_body.reconciliation.column_type_boolean)}</SelectItem>
                          <SelectItem value="select">{t(($) => $.tab_body.reconciliation.column_type_select)}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Switch
                        checked={col.visible}
                        onCheckedChange={(v) => updateColumn(idx, "visible", v)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeColumn(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Filters editor ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{t(($) => $.tab_body.reconciliation.filters_heading)}</h4>
                <Button size="sm" variant="outline" onClick={addFilter}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t(($) => $.tab_body.reconciliation.add_filter)}
                </Button>
              </div>

              {draft.filters.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t(($) => $.tab_body.reconciliation.filters_empty)}</p>
              ) : (
                <div className="space-y-2">
                  {draft.filters.map((flt, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded border p-2">
                      <Input
                        value={flt.key}
                        onChange={(e) => updateFilter(idx, "key", e.target.value)}
                        placeholder={t(($) => $.tab_body.reconciliation.filter_key_placeholder)}
                        className="h-7 w-20 text-xs"
                      />
                      <Input
                        value={flt.label}
                        onChange={(e) => updateFilter(idx, "label", e.target.value)}
                        placeholder={t(($) => $.tab_body.reconciliation.filter_label_placeholder)}
                        className="h-7 w-20 text-xs"
                      />
                      <Select
                        value={flt.type}
                        onValueChange={(v) => updateFilter(idx, "type", v)}
                      >
                        <SelectTrigger className="h-7 w-16 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t(($) => $.tab_body.reconciliation.filter_type_text)}</SelectItem>
                          <SelectItem value="select">{t(($) => $.tab_body.reconciliation.filter_type_select)}</SelectItem>
                          <SelectItem value="multi_select">{t(($) => $.tab_body.reconciliation.filter_type_multi_select)}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFilter(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer with save button */}
      {dirty && (
        <div className="flex items-center justify-end border-t pt-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t(($) => $.tab_body.reconciliation.saving) : t(($) => $.tab_body.reconciliation.save)}
          </Button>
        </div>
      )}
    </div>
  );
}
