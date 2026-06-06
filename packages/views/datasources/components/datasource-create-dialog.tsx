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

export function DataSourceCreateDialog() {
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
            新建数据源
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建数据源</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="数据源名称"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as DataSourceType)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="database">数据库</option>
            <option value="api">API</option>
            <option value="file">文件</option>
          </select>
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
            disabled={!name.trim() || createDataSource.isPending}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
