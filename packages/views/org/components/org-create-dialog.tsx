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
import { useT } from "../../i18n";

export function OrgCreateDialog({ orgUnits }: { orgUnits: OrgUnitResponse[] }) {
  const { t } = useT("org");
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
            {t(($) => $.create_dialog.trigger)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.create_dialog.title)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(($) => $.create_dialog.name_placeholder)}
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as OrgUnitType)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="company">{t(($) => $.create_dialog.types.company)}</option>
            <option value="department">{t(($) => $.create_dialog.types.department)}</option>
            <option value="team">{t(($) => $.create_dialog.types.team)}</option>
          </select>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t(($) => $.create_dialog.parent_none)}</option>
            {parentOptions.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t(($) => $.create_dialog.description_placeholder)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!name.trim() || createOrgUnit.isPending}
          >
            {t(($) => $.create_dialog.submit)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
