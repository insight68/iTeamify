"use client";

import { useMemo, useState } from "react";
import { useCreateOrgUnit } from "@teamify/core/org/mutations";
import type { OrgUnitResponse, OrgUnitType } from "@teamify/core/types";
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

export function OrgCreateDialog({ orgUnits }: { orgUnits: OrgUnitResponse[] }) {
  const createOrgUnit = useCreateOrgUnit();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgUnitType>("department");
  const [parentId, setParentId] = useState<string>("");
  const [description, setDescription] = useState("");

  const parentOptions = useMemo(
    () => orgUnits.filter((unit) => unit.type !== "team"),
    [orgUnits],
  );

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createOrgUnit.mutate(
      {
        name: trimmedName,
        type,
        parent_id: parentId || null,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setType("department");
          setParentId("");
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
            新建节点
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建组织节点</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="节点名称"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as OrgUnitType)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="company">公司</option>
            <option value="department">部门</option>
            <option value="team">团队</option>
          </select>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">无父级</option>
            {parentOptions.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
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
            disabled={!name.trim() || createOrgUnit.isPending}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
