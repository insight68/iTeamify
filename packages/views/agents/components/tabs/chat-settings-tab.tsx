"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { AGENT_CHAT_EMPTY_STATE_TITLE_MAX_LENGTH } from "@teamify/core/agents";
import type { Agent } from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import { Label } from "@teamify/ui/components/ui/label";
import { Textarea } from "@teamify/ui/components/ui/textarea";
import { CharCounter } from "../char-counter";
import { useT } from "../../../i18n";

interface ChatSettingsTabProps {
  agent: Agent;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ChatSettingsTab({
  agent,
  onSave,
  onDirtyChange,
}: ChatSettingsTabProps) {
  const { t } = useT("agents");
  const { t: tChat } = useT("chat");
  const defaultTitle = tChat(($) => $.empty_state.first_time_title);
  const originalTitle = agent.chat_empty_state_title?.trim() || defaultTitle;
  const [draft, setDraft] = useState(originalTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(originalTitle);
  }, [agent.id, originalTitle]);

  const normalizedDraft = useMemo(() => draft.trim(), [draft]);
  const isDirty = normalizedDraft !== originalTitle;
  const isTooLong = draft.length > AGENT_CHAT_EMPTY_STATE_TITLE_MAX_LENGTH;
  const previewTitle = normalizedDraft || defaultTitle;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const restoreDefault = () => {
    setDraft(defaultTitle);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        chat_empty_state_title:
          normalizedDraft && normalizedDraft !== defaultTitle ? normalizedDraft : "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex-1 min-h-0 space-y-5 overflow-y-auto pr-2">
        <div className="space-y-2">
          <Label htmlFor="agent-chat-empty-title" className="text-sm font-medium">
            {t(($) => $.tab_body.chat.title_label)}
          </Label>
          <Textarea
            id="agent-chat-empty-title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={AGENT_CHAT_EMPTY_STATE_TITLE_MAX_LENGTH + 20}
            rows={3}
            className="min-h-24 resize-none text-sm"
            placeholder={defaultTitle}
            aria-invalid={isTooLong}
          />
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t(($) => $.tab_body.chat.title_hint)}
            </p>
            <div className="shrink-0">
              <CharCounter
                length={draft.length}
                max={AGENT_CHAT_EMPTY_STATE_TITLE_MAX_LENGTH}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium">
                {t(($) => $.tab_body.chat.preview_heading)}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t(($) => $.tab_body.chat.preview_agent, { name: agent.name })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restoreDefault}
              className="h-8 shrink-0 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t(($) => $.tab_body.chat.restore_default)}
            </Button>
          </div>
          <div className="rounded-md border bg-background px-4 py-5 text-center">
            <h3 className="text-base font-semibold">{previewTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {tChat(($) => $.empty_state.first_time_intro)}{" "}
              <span className="font-medium text-foreground">
                {tChat(($) => $.empty_state.first_time_pillars)}
              </span>
              {tChat(($) => $.empty_state.first_time_pillars_suffix)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t pt-4">
        {isDirty && (
          <span className="text-xs text-muted-foreground">
            {t(($) => $.tab_body.common.unsaved_changes)}
          </span>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isTooLong || saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {t(($) => $.tab_body.common.save)}
        </Button>
      </div>
    </div>
  );
}
