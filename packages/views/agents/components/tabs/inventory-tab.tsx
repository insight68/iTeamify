"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, InventoryConfig } from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Switch } from "@teamify/ui/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@teamify/ui/components/ui/select";
import { useT } from "../../../i18n";

const DEFAULT_CONFIG: InventoryConfig = { enabled: false, title: "", focus: "all" };

export function InventoryTab({ agent, onSave, onDirtyChange }: {
  agent: Agent;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useT("agents");
  const saved = useMemo<InventoryConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...(agent.inventory_config ?? {}),
  }), [agent.inventory_config]);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => setDraft(saved), [saved]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ inventory_config: draft });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>{t(($) => $.tab_body.inventory.enable_label)}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.tab_body.inventory.enable_description)}</p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft((v) => ({ ...v, enabled }))} />
        </div>
        {draft.enabled && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t(($) => $.tab_body.inventory.title_label)}</Label>
              <Input value={draft.title} placeholder={t(($) => $.tab_body.inventory.title_placeholder)} onChange={(event) => setDraft((v) => ({ ...v, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t(($) => $.tab_body.inventory.focus_label)}</Label>
              <Select value={draft.focus} onValueChange={(focus) => setDraft((v) => ({ ...v, focus: focus as InventoryConfig["focus"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(($) => $.tab_body.inventory.focus_all)}</SelectItem>
                  <SelectItem value="shortage">{t(($) => $.tab_body.inventory.focus_shortage)}</SelectItem>
                  <SelectItem value="overstock">{t(($) => $.tab_body.inventory.focus_overstock)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end border-t pt-4">
        <Button onClick={save} disabled={!dirty || saving}>{saving ? t(($) => $.tab_body.inventory.saving) : t(($) => $.tab_body.inventory.save)}</Button>
      </div>
    </div>
  );
}
