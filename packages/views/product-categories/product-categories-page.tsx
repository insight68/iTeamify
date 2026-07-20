"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useCurrentMember } from "@teamify/core/permissions";
import {
  productCategoryListOptions,
  useUpdateProductCategory,
  type ProductCategoryRow,
  type ProductCategoryStatus,
} from "@teamify/core/product-categories";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@teamify/ui/components/ui/dialog";
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
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers3,
  Loader2,
  LockKeyhole,
  Pencil,
  RefreshCw,
  Search,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "../i18n";

const PAGE_SIZE = 30;

function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: number;
  icon: typeof Boxes;
  tone?: "muted" | "success" | "warning" | "info";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
  };
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
      <div className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-primary/70" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
        </div>
        <div className={cn("rounded-lg p-2", tones[tone])}>
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function ClassificationBadge({ status }: { status: string }) {
  const { t } = useT("product-categories");
  if (status === "mapped") {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        <CheckCircle2 className="size-3" />
        {t(($) => $.status.mapped)}
      </Badge>
    );
  }
  if (status === "unmapped") {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
        <TriangleAlert className="size-3" />
        {t(($) => $.status.unmapped)}
      </Badge>
    );
  }
  if (status === "mixed") {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        <TriangleAlert className="size-3" />
        {t(($) => $.status.mixed)}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t(($) => $.status.unknown)}</Badge>;
}

export function ProductCategoriesPage() {
  const { t } = useT("product-categories");
  const wsId = useWorkspaceId();
  const { role } = useCurrentMember(wsId);
  const canManage = role === "owner" || role === "admin";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [series, setSeries] = useState("all");
  const [status, setStatus] = useState<ProductCategoryStatus>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductCategoryRow | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [seriesDraft, setSeriesDraft] = useState("");

  const query = useQuery(productCategoryListOptions(wsId, {
    search,
    category: category === "all" ? "" : category,
    series: series === "all" ? "" : series,
    status,
    page,
    pageSize: PAGE_SIZE,
  }));
  const updateCategory = useUpdateProductCategory(wsId);
  const data = query.data;
  const summary = data?.summary;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const statusFilterLabel = status === "all"
    ? t(($) => $.filters.all_statuses)
    : t(($) => $.status[status]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const range = useMemo(() => {
    const total = data?.total ?? 0;
    if (total === 0) return { from: 0, to: 0 };
    return {
      from: (page - 1) * PAGE_SIZE + 1,
      to: Math.min(page * PAGE_SIZE, total),
    };
  }, [data?.total, page]);

  const openEditor = (row: ProductCategoryRow) => {
    setEditing(row);
    setCategoryDraft(row.business_category_name);
    setSeriesDraft(row.product_series_name);
  };

  const saveClassification = async () => {
    if (!editing) return;
    try {
      const result = await updateCategory.mutateAsync({
        materialCode: editing.material_code,
        businessCategoryName: categoryDraft,
        productSeriesName: seriesDraft,
      });
      toast.success(t(($) => $.toast.success, { count: result.synced_records }));
      setEditing(null);
    } catch {
      toast.error(t(($) => $.toast.error));
    }
  };

  const resetPage = () => setPage(1);
  const isUnavailable = query.isError || (!!data && data.available !== true);
  const unavailableMessage = () => {
    switch (query.isError ? "" : data?.reason) {
      case "data_source_not_configured":
        return t(($) => $.unavailable.data_source_not_configured);
      case "data_source_unavailable":
        return t(($) => $.unavailable.data_source_unavailable);
      case "table_missing":
        return t(($) => $.unavailable.table_missing);
      case "capability_check_failed":
        return t(($) => $.unavailable.capability_check_failed);
      case "invalid_response":
        return t(($) => $.unavailable.invalid_response);
      default:
        return t(($) => $.unavailable.unknown);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card/70 px-5 py-4 backdrop-blur-sm md:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-lg border bg-primary/10 p-2 text-primary">
                <Tags className="size-4" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{t(($) => $.title)}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(($) => $.subtitle)}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 bg-background font-mono text-[11px] font-normal">
              <Database className="size-3" />
              {t(($) => $.source)}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
              {t(($) => $.refresh)}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t(($) => $.sync_note)}</span>
          <span className="hidden h-3 w-px bg-border sm:block" />
          <span>
            {summary?.last_updated_at
              ? t(($) => $.last_synced, { time: formatDateTime(summary.last_updated_at) })
              : t(($) => $.never_synced)}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1680px] space-y-5">
          {!canManage && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              {t(($) => $.read_only)}
            </div>
          )}

          {query.isLoading && !data ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
            </section>
          ) : isUnavailable ? (
            <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 text-center">
              <div className="rounded-full bg-warning/10 p-3 text-warning">
                <Database className="size-6" />
              </div>
              <h2 className="mt-4 text-base font-semibold">{t(($) => $.unavailable.title)}</h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                {unavailableMessage()}
              </p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => query.refetch()}>
                <RefreshCw className="size-3.5" />
                {t(($) => $.refresh)}
              </Button>
            </section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label={t(($) => $.stats.total)} value={summary?.total ?? 0} icon={Boxes} />
                <MetricCard label={t(($) => $.stats.mapped)} value={summary?.mapped ?? 0} icon={CheckCircle2} tone="success" />
                <MetricCard label={t(($) => $.stats.unmapped)} value={(summary?.unmapped ?? 0) + (summary?.mixed ?? 0)} icon={TriangleAlert} tone="warning" />
                <MetricCard label={t(($) => $.stats.categories)} value={summary?.category_count ?? 0} icon={Layers3} tone="info" />
              </section>

              <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <div className="flex flex-col gap-3 border-b bg-muted/15 p-4 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1 lg:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => { setSearch(event.target.value); resetPage(); }}
                      className="pl-9"
                      placeholder={t(($) => $.filters.search)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={category} onValueChange={(value) => { setCategory(value ?? "all"); resetPage(); }}>
                      <SelectTrigger className="w-40" aria-label={t(($) => $.filters.category)}>
                        <SelectValue>{category === "all" ? t(($) => $.filters.all_categories) : category}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t(($) => $.filters.all_categories)}</SelectItem>
                        {(data?.categories ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={series} onValueChange={(value) => { setSeries(value ?? "all"); resetPage(); }}>
                      <SelectTrigger className="w-40" aria-label={t(($) => $.filters.series)}>
                        <SelectValue>{series === "all" ? t(($) => $.filters.all_series) : series}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t(($) => $.filters.all_series)}</SelectItem>
                        {(data?.series ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={(value) => { setStatus((value ?? "all") as ProductCategoryStatus); resetPage(); }}>
                      <SelectTrigger className="w-36" aria-label={t(($) => $.filters.status)}>
                        <SelectValue>{statusFilterLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t(($) => $.filters.all_statuses)}</SelectItem>
                        <SelectItem value="mapped">{t(($) => $.status.mapped)}</SelectItem>
                        <SelectItem value="unmapped">{t(($) => $.status.unmapped)}</SelectItem>
                        <SelectItem value="mixed">{t(($) => $.status.mixed)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/25 hover:bg-muted/25">
                        <TableHead className="min-w-72">{t(($) => $.table.product)}</TableHead>
                        <TableHead className="min-w-40">{t(($) => $.table.category)}</TableHead>
                        <TableHead className="min-w-40">{t(($) => $.table.series)}</TableHead>
                        <TableHead>{t(($) => $.table.status)}</TableHead>
                        <TableHead className="min-w-44">{t(($) => $.table.scope)}</TableHead>
                        <TableHead className="min-w-36">{t(($) => $.table.updated)}</TableHead>
                        <TableHead className="w-20 text-right">{t(($) => $.table.actions)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.isLoading && !data
                        ? Array.from({ length: 8 }, (_, index) => (
                            <TableRow key={index}><TableCell colSpan={7}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
                          ))
                        : (data?.rows ?? []).map((row) => (
                            <TableRow key={row.material_code} className="group">
                              <TableCell>
                                <div className="max-w-md truncate font-medium" title={row.product_name}>{row.product_name || row.product_no || "—"}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{row.material_code}</code>
                                  {row.product_no && <span className="font-mono">{row.product_no}</span>}
                                  {row.brand_name && <span className="truncate">{row.brand_name}</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                {row.business_category_name
                                  ? <span className="inline-flex max-w-48 truncate rounded-md border bg-background px-2 py-1 text-xs font-medium" title={row.business_category_name}>{row.business_category_name}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                {row.product_series_name
                                  ? <span className="inline-flex max-w-48 truncate rounded-md bg-muted px-2 py-1 text-xs" title={row.product_series_name}>{row.product_series_name}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell><ClassificationBadge status={row.taxonomy_status} /></TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {t(($) => $.table.records, { records: row.synced_records, credentials: row.credential_count })}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.taxonomy_updated_at)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={!canManage}
                                  aria-label={t(($) => $.table.edit)}
                                  title={canManage ? t(($) => $.table.edit) : t(($) => $.read_only)}
                                  onClick={() => openEditor(row)}
                                >
                                  {canManage ? <Pencil className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                      {!query.isLoading && (data?.rows.length ?? 0) === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="h-64 text-center">
                            <div className="mx-auto flex max-w-sm flex-col items-center">
                              <div className="rounded-full bg-muted p-3 text-muted-foreground"><Tags className="size-5" /></div>
                              <p className="mt-3 text-sm font-medium">{t(($) => $.empty.title)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.empty.description)}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {t(($) => $.pagination.summary, { from: range.from, to: range.to, total: data?.total ?? 0 })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1} aria-label={t(($) => $.pagination.previous)} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <span className="min-w-14 text-center font-mono text-xs text-muted-foreground">{page} / {pageCount}</span>
                    <Button type="button" variant="outline" size="icon-sm" disabled={page >= pageCount} aria-label={t(($) => $.pagination.next)} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !updateCategory.isPending) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(($) => $.editor.title)}</DialogTitle>
            <DialogDescription>
              {t(($) => $.editor.description, {
                name: editing?.product_name || editing?.product_no || "—",
                materialCode: editing?.material_code ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label htmlFor="product-category-name" className="text-xs font-medium">{t(($) => $.editor.category)}</label>
              <Input
                id="product-category-name"
                list="product-category-options"
                value={categoryDraft}
                maxLength={200}
                onChange={(event) => setCategoryDraft(event.target.value)}
                placeholder={t(($) => $.editor.category_placeholder)}
              />
              <datalist id="product-category-options">
                {(data?.categories ?? []).map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>
            <div className="grid gap-2">
              <label htmlFor="product-series-name" className="text-xs font-medium">{t(($) => $.editor.series)}</label>
              <Input
                id="product-series-name"
                list="product-series-options"
                value={seriesDraft}
                maxLength={200}
                onChange={(event) => setSeriesDraft(event.target.value)}
                placeholder={t(($) => $.editor.series_placeholder)}
              />
              <datalist id="product-series-options">
                {(data?.series ?? []).map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div>
                  <p>{t(($) => $.editor.sync_scope, { count: editing?.synced_records ?? 0 })}</p>
                  <p className="mt-1">{t(($) => $.editor.clear_hint)}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={updateCategory.isPending} />}>
              {t(($) => $.editor.cancel)}
            </DialogClose>
            <Button type="button" disabled={updateCategory.isPending} onClick={saveClassification}>
              {updateCategory.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {updateCategory.isPending ? t(($) => $.editor.saving) : t(($) => $.editor.save)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
