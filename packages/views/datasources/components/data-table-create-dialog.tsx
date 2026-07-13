"use client";

import { useState } from "react";
import { useCreateDataTable } from "@teamify/core/datasources/mutations";
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

export function DataTableCreateDialog({ dataSourceId }: { dataSourceId: string }) {
  const { t } = useT("datasources");
  const createDataTable = useCreateDataTable();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [schemaName, setSchemaName] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createDataTable.mutate(
      {
        dataSourceId,
        name: trimmedName,
        schema_name: schemaName.trim() || undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setSchemaName("");
          setDescription("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="size-4" />
            {t(($) => $.table_dialog.trigger)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.table_dialog.title)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(($) => $.table_dialog.name_placeholder)}
          />
          <Input
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            placeholder={t(($) => $.table_dialog.schema_placeholder)}
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t(($) => $.table_dialog.description_placeholder)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!name.trim() || createDataTable.isPending}
          >
            {t(($) => $.table_dialog.submit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
