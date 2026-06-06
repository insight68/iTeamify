"use client";

import { useEffect, useState } from "react";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { PropertyPicker } from "../../../issues/components/pickers";
import { CHIP_CLASS } from "./chip";
import { useT } from "../../../i18n";

export function HermesProfilePicker({
  value,
  canEdit = true,
  onChange,
}: {
  value: string;
  /** When false, render a static read-only display and skip the popover. */
  canEdit?: boolean;
  onChange: (next: string) => Promise<void> | void;
}) {
  const { t } = useT("agents");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!canEdit) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        {value || t(($) => $.pickers.hermes_profile_placeholder)}
      </span>
    );
  }

  const commit = async () => {
    const trimmed = draft.trim();
    setOpen(false);
    if (trimmed !== value) await onChange(trimmed);
  };

  const tooltip = t(($) => $.pickers.hermes_profile_tooltip, { value: value || "" });

  return (
    <PropertyPicker
      open={open}
      onOpenChange={setOpen}
      width="w-auto"
      align="start"
      tooltip={tooltip}
      triggerRender={
        <button type="button" className={CHIP_CLASS} aria-label={tooltip} />
      }
      trigger={
        <span className="font-mono text-[11px]">
          {value || t(($) => $.pickers.hermes_profile_placeholder)}
        </span>
      }
    >
      <div className="space-y-2 p-2">
        <p className="text-xs text-muted-foreground">
          {t(($) => $.pickers.hermes_profile_description)}
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
            }}
            autoFocus
            placeholder="garrytan"
            className="h-8 w-36 font-mono text-xs"
          />
          <Button size="sm" onClick={() => void commit()}>
            {t(($) => $.inspector.save)}
          </Button>
        </div>
      </div>
    </PropertyPicker>
  );
}
