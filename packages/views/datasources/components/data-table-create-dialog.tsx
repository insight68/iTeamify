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

export function DataTableCreateDialog({ dataSourceId }: { dataSourceId: string }) {
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
            添加数据表
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加数据表</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="表名"
          />
          <Input
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            placeholder="Schema，可选"
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="描述"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!name.trim() || createDataTable.isPending}
          >
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
