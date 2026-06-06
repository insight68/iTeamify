"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Download,
  FileText,
  HardDrive,
  Loader2,
  Sparkles,
} from "lucide-react";
import type {
  RuntimeHermesProfileSummary,
} from "@teamify/core/types";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  runtimeListOptions,
  resolveHermesProfiles,
} from "@teamify/core/runtimes";
import { api } from "@teamify/core/api";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@teamify/ui/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamify/ui/components/ui/dialog";
import { toast } from "sonner";
import { runtimeLabel } from "../../runtimes/utils";
import { useT } from "../../i18n";

// ---------------------------------------------------------------------------
// Profile row with inline-expanded name/description editor when selected
// ---------------------------------------------------------------------------

function ProfileItem({
  profile,
  selected,
  onSelect,
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: {
  profile: RuntimeHermesProfileSummary;
  selected: boolean;
  onSelect: () => void;
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  const { t } = useT("agents");
  return (
    <div
      className={`overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-primary bg-primary/5" : "hover:bg-accent/40"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{profile.name}</span>
            {profile.model && (
              <Badge variant="secondary">{profile.model}</Badge>
            )}
          </div>
          {profile.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {profile.description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate font-mono">{profile.source_path}</span>
            {profile.soul_md_length > 0 && (
              <Badge variant="outline" className="shrink-0">
                {t(($) => $.hermes_import.soul_md_size, {
                  kb: Math.round(profile.soul_md_length / 1024),
                })}
              </Badge>
            )}
          </div>
        </div>
      </button>

      {selected && (
        <div className="space-y-2.5 border-t bg-card px-4 py-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t(($) => $.hermes_import.name_label)}
            </Label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={profile.name}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t(($) => $.hermes_import.description_label)}
            </Label>
            <Input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={profile.description}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function HermesProfileImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useT("agents");
  const wsId = useWorkspaceId();
  const qc = useQueryClient();

  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const hermesRuntimes = useMemo(
    () =>
      runtimes.filter(
        (r) => r.provider === "hermes" && r.runtime_mode === "local",
      ),
    [runtimes],
  );

  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string>("");
  const [selectedProfileName, setSelectedProfileName] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [profiles, setProfiles] = useState<RuntimeHermesProfileSummary[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRuntimeId((prev) => prev || hermesRuntimes[0]?.id || "");
  }, [hermesRuntimes]);

  useEffect(() => {
    setSelectedProfileName("");
    setName("");
    setDescription("");
    setProfiles([]);
    setDiscoverError(null);
  }, [selectedRuntimeId]);

  const selectedRuntime = hermesRuntimes.find(
    (r) => r.id === selectedRuntimeId,
  );
  const selectedProfile = profiles.find(
    (p) => p.name === selectedProfileName,
  );

  const handleDiscover = async () => {
    if (!selectedRuntimeId) return;
    setDiscovering(true);
    setDiscoverError(null);
    setProfiles([]);
    setSelectedProfileName("");
    try {
      const result = await resolveHermesProfiles(selectedRuntimeId);
      setProfiles(result.profiles);
      if (result.profiles.length > 0) {
        const first = result.profiles[0]!;
        setSelectedProfileName(first.name);
        setName(first.name);
        setDescription(first.description);
      }
    } catch (error) {
      setDiscoverError(
        error instanceof Error
          ? error.message
          : t(($) => $.hermes_import.discover_failed),
      );
    } finally {
      setDiscovering(false);
    }
  };

  const handleRowSelect = (p: RuntimeHermesProfileSummary) => {
    setSelectedProfileName(p.name);
    setName(p.name);
    setDescription(p.description);
  };

  const handleImport = async () => {
    if (!selectedRuntimeId || !selectedProfile) return;
    setImporting(true);
    try {
      await api.importHermesProfile({
        profile_name: selectedProfile.name,
        runtime_id: selectedRuntimeId,
        name_override: name.trim() !== selectedProfile.name ? name.trim() : undefined,
        description_override:
          description.trim() !== selectedProfile.description
            ? description.trim()
            : undefined,
        instructions: selectedProfile.soul_md_content
          ? selectedProfile.soul_md_content
          : undefined,
      });
      await qc.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
      toast.success(t(($) => $.hermes_import.toast_imported));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.hermes_import.toast_import_failed),
      );
    } finally {
      setImporting(false);
    }
  };

  const canImport =
    !!selectedRuntime &&
    selectedRuntime.status === "online" &&
    !!selectedProfile &&
    !!name.trim() &&
    !importing;

  const busy = discovering || importing;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(($) => $.hermes_import.title)}</DialogTitle>
          <DialogDescription>
            {t(($) => $.hermes_import.description)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Runtime picker */}
          <div
            aria-disabled={busy || undefined}
            className={`space-y-1.5 ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <Label className="text-xs text-muted-foreground">
              {t(($) => $.hermes_import.runtime_label)}
            </Label>
            <Select
              value={selectedRuntimeId}
              onValueChange={(v) => v && setSelectedRuntimeId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t(($) => $.hermes_import.runtime_placeholder)}
                >
                  {selectedRuntime ? runtimeLabel(selectedRuntime) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {hermesRuntimes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {runtimeLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedRuntime && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {runtimeLabel(selectedRuntime)}
                </span>
                <Badge
                  variant={
                    selectedRuntime.status === "online"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {selectedRuntime.status}
                </Badge>
              </div>
            )}
          </div>

          {/* Discover button */}
          {selectedRuntime && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDiscover}
              disabled={
                !selectedRuntime ||
                selectedRuntime.status !== "online" ||
                discovering
              }
              className="self-start"
            >
              {discovering ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t(($) => $.hermes_import.discovering)}
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" />
                  {t(($) => $.hermes_import.discover_button)}
                </>
              )}
            </Button>
          )}

          {/* Error state */}
          {discoverError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {discoverError}
            </div>
          )}

          {/* Profile list */}
          {discovering && profiles.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border px-4 py-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-48" />
                </div>
              ))}
            </div>
          )}

          {!discovering && profiles.length === 0 && !discoverError && selectedRuntime?.status === "online" && (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t(($) => $.hermes_import.empty_title)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(($) => $.hermes_import.empty_hint)}
              </p>
            </div>
          )}

          {profiles.length > 0 && (
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
              {profiles.map((p) => (
                <ProfileItem
                  key={p.name}
                  profile={p}
                  selected={selectedProfileName === p.name}
                  onSelect={() => handleRowSelect(p)}
                  name={selectedProfileName === p.name ? name : ""}
                  description={
                    selectedProfileName === p.name ? description : ""
                  }
                  onNameChange={setName}
                  onDescriptionChange={setDescription}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-3 border-t pt-3">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {selectedProfile
              ? t(($) => $.hermes_import.ready, {
                  name: name.trim() || selectedProfile.name,
                })
              : t(($) => $.hermes_import.select_profile)}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={!canImport}
          >
            {importing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t(($) => $.hermes_import.importing)}
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                {t(($) => $.hermes_import.import_button)}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
