"use client";

import { useRef, useState, type DragEvent } from "react";
import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Play,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { api } from "@teamify/core/api";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  supplyFeeKeys,
  workspaceSupplyFeeBillsOptions,
  workspaceSupplyFeeConfigOptions,
  type SupplyFeeBillBatch,
} from "@teamify/core/supply-reconciliation";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@teamify/ui/components/ui/select";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { toast } from "sonner";
import { useT } from "../i18n";
import { SupplyFeePageHeader } from "./components/supply-fee-page-header";

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const now = new Date();
  return {
    start: localDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function BatchStatusBadge({ batch }: { batch: SupplyFeeBillBatch }) {
  const { t } = useT("supply-reconciliation");
  const labels: Record<string, string> = {
    uploaded: t(($) => $.bills.status_labels.uploaded),
    validating: t(($) => $.bills.status_labels.validating),
    validated: t(($) => $.bills.status_labels.validated),
    invalid: t(($) => $.bills.status_labels.invalid),
    reconciling: t(($) => $.bills.status_labels.reconciling),
    reconciled: t(($) => $.bills.status_labels.reconciled),
    failed: t(($) => $.bills.status_labels.failed),
    superseded: t(($) => $.bills.status_labels.superseded),
  };
  const active = batch.status === "reconciling"
    || batch.latest_run_status === "queued"
    || batch.latest_run_status === "running";
  const failed = batch.status === "failed" || batch.status === "invalid";
  return (
    <Badge variant={failed ? "destructive" : batch.status === "reconciled" ? "default" : "outline"}>
      {active ? <Loader2 className="animate-spin" /> : batch.status === "reconciled" ? <CheckCircle2 /> : null}
      {active ? t(($) => $.bills.status_labels.reconciling) : labels[batch.status] ?? batch.status}
    </Badge>
  );
}

export function SupplyReconciliationBillsPage() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useT("supply-reconciliation");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const period = defaultPeriod();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [providerMode, setProviderMode] = useState<"existing" | "new">("existing");
  const [providerId, setProviderId] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<"carrier" | "warehouse" | "3pl">("3pl");
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [declaredAmount, setDeclaredAmount] = useState("");

  const configQuery = useQuery(workspaceSupplyFeeConfigOptions(wsId));
  const available = configQuery.data?.available === true;
  const billsQuery = useQuery({
    ...workspaceSupplyFeeBillsOptions(wsId),
    enabled: !!wsId && available,
  });
  const fetching = useIsFetching({ queryKey: supplyFeeKeys.all(wsId) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: supplyFeeKeys.all(wsId) });
  const importMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("file_required");
      return api.importWorkspaceSupplyFeeBill(wsId, {
        file,
        provider_id: providerMode === "existing" ? providerId : undefined,
        provider_code: providerMode === "new" ? providerCode.trim() : undefined,
        provider_name: providerMode === "new" ? providerName.trim() : undefined,
        provider_type: providerMode === "new" ? providerType : undefined,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        invoice_no: invoiceNo.trim() || undefined,
        currency_code: currency.trim().toUpperCase(),
        declared_amount: declaredAmount.trim() ? Number(declaredAmount) : undefined,
      });
    },
    onSuccess: (batch) => {
      toast.success(t(($) => $.bills.upload_success, {
        count: batch.line_count,
        invalid: batch.invalid_line_count,
      }));
      setFile(null);
      setInvoiceNo("");
      setDeclaredAmount("");
      void queryClient.invalidateQueries({ queryKey: supplyFeeKeys.all(wsId) });
    },
    onError: () => toast.error(t(($) => $.bills.upload_failed)),
  });
  const runMutation = useMutation({
    mutationFn: (batchId: string) => api.runWorkspaceSupplyFeeReconciliation(wsId, batchId),
    onSuccess: (run) => {
      toast.success(t(($) => $.bills.run_success, { run: run.run_no }));
      void queryClient.invalidateQueries({ queryKey: supplyFeeKeys.all(wsId) });
    },
    onError: () => toast.error(t(($) => $.bills.run_failed)),
  });

  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split(".").at(-1);
    if ((extension !== "xlsx" && extension !== "csv") || candidate.size <= 0 || candidate.size > MAX_UPLOAD_BYTES) {
      toast.error(t(($) => $.bills.upload_failed));
      return;
    }
    setFile(candidate);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };
  const canSubmit = configQuery.data?.can_manage === true
    && !!file
    && !!periodStart
    && !!periodEnd
    && periodEnd >= periodStart
    && (providerMode === "existing" ? !!providerId : !!providerCode.trim() && !!providerName.trim())
    && !importMutation.isPending;
  const rows = billsQuery.data?.rows ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SupplyFeePageHeader
        latestRunNo={configQuery.data?.latest_run_no}
        latestRunAt={configQuery.data?.latest_run_at}
        refreshing={fetching > 0}
        onRefresh={refresh}
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-5 md:p-7">
          <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <UploadCloud className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">{t(($) => $.bills.import_title)}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.bills.import_note)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {t(($) => $.bills.required_columns)}
              </div>
            </div>

            {configQuery.data && configQuery.data.available !== true ? (
              <div className="m-5 flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium">{t(($) => $.not_configured)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.not_configured_detail)}</p>
                </div>
              </div>
            ) : configQuery.data && configQuery.data.can_manage !== true ? (
              <div className="m-5 flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                <div>
                  <p className="text-sm font-medium">{t(($) => $.bills.permission_title)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.bills.permission_note)}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 p-5 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.5fr)]">
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 px-6 text-center outline-none transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring",
                    dragging && "border-primary bg-primary/[0.05]",
                    file && "border-primary/40 bg-primary/[0.025]",
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                  }}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(event) => acceptFile(event.target.files?.[0])}
                  />
                  <div className="rounded-lg border bg-background p-3 shadow-sm">
                    <FileSpreadsheet className="size-7 text-primary" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">
                    {file ? t(($) => $.bills.replace_file) : t(($) => $.bills.choose_file)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.bills.drop_hint)}</p>
                  {file ? (
                    <Badge variant="outline" className="mt-4 max-w-full font-mono">
                      <span className="truncate">{t(($) => $.bills.selected_file, { name: file.name, size: formatBytes(file.size) })}</span>
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="flex w-fit rounded-lg border bg-muted/20 p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={providerMode === "existing" ? "secondary" : "ghost"}
                      onClick={() => setProviderMode("existing")}
                    >
                      {t(($) => $.bills.provider_mode_existing)}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={providerMode === "new" ? "secondary" : "ghost"}
                      onClick={() => setProviderMode("new")}
                    >
                      {t(($) => $.bills.provider_mode_new)}
                    </Button>
                  </div>

                  {providerMode === "existing" ? (
                    <label className="block space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.provider)}</span>
                      <Select value={providerId} onValueChange={(value) => setProviderId(value ?? "")}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={t(($) => $.bills.select_provider)} /></SelectTrigger>
                        <SelectContent>
                          {(configQuery.data?.providers ?? []).map((provider) => (
                            <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr_0.7fr]">
                      <label className="space-y-1.5 text-xs font-medium">
                        <span>{t(($) => $.bills.provider_code)}</span>
                        <Input value={providerCode} onChange={(event) => setProviderCode(event.target.value)} placeholder="SF-EXPRESS" />
                      </label>
                      <label className="space-y-1.5 text-xs font-medium">
                        <span>{t(($) => $.bills.provider_name)}</span>
                        <Input value={providerName} onChange={(event) => setProviderName(event.target.value)} />
                      </label>
                      <label className="space-y-1.5 text-xs font-medium">
                        <span>{t(($) => $.bills.provider_type)}</span>
                        <Select value={providerType} onValueChange={(value) => setProviderType((value ?? "3pl") as typeof providerType)}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="carrier">{t(($) => $.bills.carrier)}</SelectItem>
                            <SelectItem value="warehouse">{t(($) => $.bills.warehouse)}</SelectItem>
                            <SelectItem value="3pl">{t(($) => $.bills.third_party)}</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.period_start)}</span>
                      <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.period_end)}</span>
                      <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.invoice_no)}</span>
                      <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.currency)}</span>
                      <Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} />
                    </label>
                  </div>
                  <div className="flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-end">
                    <label className="w-full max-w-xs space-y-1.5 text-xs font-medium">
                      <span>{t(($) => $.bills.declared_amount)}</span>
                      <Input type="number" step="0.01" value={declaredAmount} onChange={(event) => setDeclaredAmount(event.target.value)} />
                    </label>
                    <Button disabled={!canSubmit} onClick={() => importMutation.mutate()}>
                      {importMutation.isPending ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                      {importMutation.isPending ? t(($) => $.bills.uploading) : t(($) => $.bills.upload)}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">{t(($) => $.bills.list_title)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.bills.list_subtitle)}</p>
              </div>
              <Badge variant="outline">{t(($) => $.bills.count, { count: billsQuery.data?.total ?? 0 })}</Badge>
            </div>
            {billsQuery.isLoading ? (
              <div className="space-y-2 p-5">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>
            ) : billsQuery.isError ? (
              <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
                <ShieldAlert className="size-5 text-destructive" />
                <p className="mt-3 text-sm font-medium">{t(($) => $.bills.load_failed)}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => billsQuery.refetch()}>{t(($) => $.refresh)}</Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <FileSpreadsheet className="size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">{t(($) => $.bills.empty)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.bills.empty_note)}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(($) => $.bills.batch)}</TableHead>
                      <TableHead>{t(($) => $.bills.file)}</TableHead>
                      <TableHead>{t(($) => $.bills.period)}</TableHead>
                      <TableHead className="text-right">{t(($) => $.bills.amount)}</TableHead>
                      <TableHead>{t(($) => $.bills.quality)}</TableHead>
                      <TableHead>{t(($) => $.bills.status)}</TableHead>
                      <TableHead className="text-right">{t(($) => $.bills.action)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((batch) => {
                      const active = batch.status === "reconciling"
                        || batch.latest_run_status === "queued"
                        || batch.latest_run_status === "running";
                      const runPending = runMutation.isPending && runMutation.variables === batch.id;
                      const canRun = configQuery.data?.can_manage === true
                        && batch.line_count > 0
                        && batch.status !== "validating"
                        && batch.status !== "uploaded"
                        && !active;
                      const validPercent = batch.line_count > 0 ? (batch.valid_line_count / batch.line_count) * 100 : 0;
                      return (
                        <TableRow key={batch.id}>
                          <TableCell>
                            <p className="font-mono text-xs font-semibold">{batch.batch_no}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{batch.provider_name}</p>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-56 truncate text-xs font-medium" title={batch.source_file_name}>{batch.source_file_name}</p>
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {formatBytes(batch.source_file_size_bytes)} · {t(($) => $.bills.import_perf, { rows: batch.line_count, time: formatDuration(batch.import_duration_ms) })}
                            </p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {batch.billing_period_start}<span className="px-1 text-muted-foreground">→</span>{batch.billing_period_end}
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-mono text-xs font-semibold">{formatMoney(batch.parsed_amount, batch.currency_code)}</p>
                            {batch.declared_amount !== 0 ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatMoney(batch.declared_amount, batch.currency_code)}</p> : null}
                          </TableCell>
                          <TableCell>
                            <div className="w-40">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-success">{t(($) => $.bills.valid_lines, { count: batch.valid_line_count })}</span>
                                <span className={cn("text-muted-foreground", batch.invalid_line_count > 0 && "text-destructive")}>{t(($) => $.bills.invalid_lines, { count: batch.invalid_line_count })}</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-destructive/15">
                                <div className="h-full bg-success transition-[width]" style={{ width: `${validPercent}%` }} />
                              </div>
                              {Object.keys(batch.error_summary).length > 0 ? (
                                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-destructive">
                                  <AlertCircle className="size-3" />
                                  <span className="truncate" title={Object.entries(batch.error_summary).map(([code, count]) => `${code}: ${count}`).join(", ")}>
                                    {t(($) => $.bills.error_summary)} · {Object.keys(batch.error_summary).length}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <BatchStatusBadge batch={batch} />
                            {batch.latest_run_no ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">{batch.latest_run_no}</p> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={batch.status === "reconciled" ? "outline" : "default"}
                              disabled={!canRun || runPending}
                              onClick={() => runMutation.mutate(batch.id)}
                            >
                              {active || runPending ? <Loader2 className="animate-spin" /> : <Play />}
                              {active || runPending
                                ? t(($) => $.bills.running)
                                : batch.status === "reconciled"
                                  ? t(($) => $.bills.rerun)
                                  : t(($) => $.bills.run)}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
