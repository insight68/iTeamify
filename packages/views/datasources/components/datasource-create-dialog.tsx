"use client";

import { useState } from "react";
import { useCreateDataSource } from "@teamify/core/datasources/mutations";
import type { DataSourceType } from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@teamify/ui/components/ui/dialog";
import { Input } from "@teamify/ui/components/ui/input";
import { Textarea } from "@teamify/ui/components/ui/textarea";
import { Plus } from "lucide-react";
import { useT } from "../../i18n";

export function DataSourceCreateDialog() {
  const { t } = useT("datasources");
  const createDataSource = useCreateDataSource();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<DataSourceType>("database");
  const [description, setDescription] = useState("");

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createDataSource.mutate(
      {
        name: trimmedName,
        type,
        config: {},
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setType("database");
          setDescription("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" />
            {t(($) => $.source_dialog.trigger)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.source_dialog.title)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(($) => $.source_dialog.name_placeholder)}
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as DataSourceType)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="database">{t(($) => $.source_dialog.types.database)}</option>
            <option value="api">{t(($) => $.source_dialog.types.api)}</option>
            <option value="file">{t(($) => $.source_dialog.types.file)}</option>
          </select>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t(($) => $.source_dialog.description_placeholder)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!name.trim() || createDataSource.isPending}
          >
            {t(($) => $.source_dialog.submit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
