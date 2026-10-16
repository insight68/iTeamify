"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Globe2,
  Lightbulb,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useAuthStore } from "@iteamify/core/auth";
import { ApiError } from "@iteamify/core/api";
import { businessContextOptions, useSaveBusinessProfile } from "@iteamify/core/business";
import { useChatStore } from "@iteamify/core/chat";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@iteamify/core/paths";
import type {
  BusinessAudience,
  BusinessContent,
  BusinessOffer,
  BusinessPersona,
  BusinessProof,
  BusinessSource,
} from "@iteamify/core/types";
import { memberListOptions } from "@iteamify/core/workspace/queries";
import { resolvePublicFileUrl } from "@iteamify/core/workspace/avatar-url";
import { Badge } from "@iteamify/ui/components/ui/badge";
import { Button } from "@iteamify/ui/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@iteamify/ui/components/ui/chart";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@iteamify/ui/components/ui/sheet";
import { Skeleton } from "@iteamify/ui/components/ui/skeleton";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { parseAvatarEmoji } from "@iteamify/ui/lib/avatar-emoji";
import { cn } from "@iteamify/ui/lib/utils";
import { CollectionPageState } from "../../layout/collection-page";
import { useT } from "../../i18n";
import { useNavigation } from "../../navigation";
import { prepareBusinessConversation } from "../conversation";
import { CompanyManagementSheet } from "./company-management-sheet";

const EMPTY_CONTENT: BusinessContent = {
  business_name: "",
  brand_name: "",
  website_url: "",
  summary: "",
  positioning: "",
  differentiators: [],
  principles: [],
  exclusions: [],
  offers: [],
  audiences: [],
  proof: [],
  sources: [],
};

type EditorState =
  | { kind: "foundation" }
  | { kind: "offer"; index: number }
  | { kind: "audience"; index: number }
  | { kind: "proof"; index: number }
  | { kind: "source"; index: number };

type CompletionDimension = {
  key: "identity" | "positioning" | "offers" | "audiences" | "evidence";
  complete: boolean;
  editor: EditorState;
};

const ROLE_ORDER = ["initiator", "champion", "influencer", "decision_maker", "user"];
const PRIORITIES = ["core", "secondary", "explore"];

function cloneContent(content: BusinessContent): BusinessContent {
  return JSON.parse(JSON.stringify(content)) as BusinessContent;
}

function makeID() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `company-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function lineValue(value: string[] | undefined) {
  return (value ?? []).join("\n");
}

function safeHTTPURL(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function profileCompletion(content: BusinessContent, companyName: string): CompletionDimension[] {
  const audienceReady = content.audiences.some(
    (audience) =>
      audience.name.trim() &&
      audience.industries.length + audience.company_sizes.length + audience.geographies.length + audience.must_haves.length > 0,
  );
  return [
    { key: "identity", complete: Boolean(companyName.trim() && content.summary.trim()), editor: { kind: "foundation" } },
    { key: "positioning", complete: Boolean(content.positioning.trim() && content.differentiators.length), editor: { kind: "foundation" } },
    { key: "offers", complete: content.offers.some((offer) => offer.name.trim() && offer.summary.trim()), editor: { kind: "offer", index: 0 } },
    { key: "audiences", complete: Boolean(audienceReady), editor: { kind: "audience", index: 0 } },
    { key: "evidence", complete: content.proof.length + content.sources.length > 0, editor: { kind: "proof", index: 0 } },
  ];
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: typeof Building2;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/75 text-brand shadow-sm">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-1 font-[family-name:var(--font-serif)] text-2xl tracking-[-0.025em]">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function EditableSurface({
  canEdit,
  label,
  onClick,
  className,
  children,
}: {
  canEdit: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!canEdit) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "group/edit relative w-full rounded-xl text-left outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border bg-background/90 text-muted-foreground opacity-0 shadow-sm transition group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100">
        <Pencil className="size-3.5" />
      </span>
    </button>
  );
}

function FactBlock({ label, value, empty }: { label: string; value?: string; empty: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", value ? "text-foreground" : "italic text-muted-foreground/65")}>
        {value || empty}
      </p>
    </div>
  );
}

function TagCloud({ values, empty }: { values: string[]; empty: string }) {
  return values.length ? (
    <div className="flex flex-wrap gap-2">
      {values.map((value, index) => (
        <Badge key={`${value}-${index}`} variant="outline" className="rounded-full bg-background/70 px-2.5 py-1 font-normal">
          {value}
        </Badge>
      ))}
    </div>
  ) : (
    <p className="text-sm italic text-muted-foreground/65">{empty}</p>
  );
}

function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-2">
      <Label className="grid gap-2">
        <span>{label}</span>
        {children}
      </Label>
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed bg-background/45 px-6 text-center text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

export function BusinessPage() {
  const { t } = useT("business");
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const userID = useAuthStore((state) => state.user?.id);
  const contextQuery = useQuery(businessContextOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const currentMember = members.find((member) => member.user_id === userID);
  const canEdit = currentMember?.role === "owner" || currentMember?.role === "admin";
  const saveProfile = useSaveBusinessProfile();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [working, setWorking] = useState<BusinessContent | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);

  const context = contextQuery.data;
  const content = context
    ? canEdit
      ? context.draft
      : (context.published ?? context.draft)
    : EMPTY_CONTENT;
  const companyName = workspace?.name || t(($) => $.page.title);
  const brandName = content.brand_name || (content.business_name && content.business_name !== companyName ? content.business_name : "");
  const completion = useMemo(() => profileCompletion(content, companyName), [companyName, content]);
  const completed = completion.filter((item) => item.complete).length;
  const completionPercent = Math.round((completed / completion.length) * 100);
  const personas = useMemo(
    () => content.audiences.flatMap((audience, audienceIndex) =>
      audience.buyer_personas.map((persona, personaIndex) => ({ persona, audience, audienceIndex, personaIndex })),
    ),
    [content.audiences],
  );
  const marketData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const audience of content.audiences) {
      for (const item of [...audience.industries, ...audience.company_sizes, ...audience.geographies]) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [content.audiences]);
  const priorityCounts = useMemo(
    () => PRIORITIES.map((priority) => ({ priority, count: content.audiences.filter((item) => (item.priority || "core") === priority).length })),
    [content.audiences],
  );

  const updateWorking = (updater: (next: BusinessContent) => void) => {
    setWorking((previous) => {
      if (!previous) return previous;
      const next = cloneContent(previous);
      updater(next);
      return next;
    });
  };

  const updateOfferDraft = (index: number, updater: (offer: BusinessOffer) => void) => {
    updateWorking((next) => {
      const offer = next.offers[index];
      if (offer) updater(offer);
    });
  };

  const updateAudienceDraft = (index: number, updater: (audience: BusinessAudience) => void) => {
    updateWorking((next) => {
      const audience = next.audiences[index];
      if (audience) updater(audience);
    });
  };

  const updatePersonaDraft = (audienceIndex: number, personaIndex: number, updater: (persona: BusinessPersona) => void) => {
    updateAudienceDraft(audienceIndex, (audience) => {
      const persona = audience.buyer_personas[personaIndex];
      if (persona) updater(persona);
    });
  };

  const updateProofDraft = (index: number, updater: (proof: BusinessProof) => void) => {
    updateWorking((next) => {
      const proof = next.proof[index];
      if (proof) updater(proof);
    });
  };

  const updateSourceDraft = (index: number, updater: (source: BusinessSource) => void) => {
    updateWorking((next) => {
      const source = next.sources[index];
      if (source) updater(source);
    });
  };

  const openFoundation = () => {
    const next = cloneContent(content);
    next.business_name = companyName;
    next.brand_name = brandName;
    setWorking(next);
    setEditor({ kind: "foundation" });
  };

  const openOffer = (index?: number) => {
    const next = cloneContent(content);
    const actualIndex = index ?? next.offers.length;
    if (index === undefined) {
      next.offers.push({
        id: makeID(),
        name: "",
        summary: "",
        outcomes: [],
        deliverables: [],
        typical_timeline: "",
        pricing_note: "",
        fit_notes: "",
        audience_ids: [],
      });
    }
    setWorking(next);
    setEditor({ kind: "offer", index: actualIndex });
  };

  const openAudience = (index?: number) => {
    const next = cloneContent(content);
    const actualIndex = index ?? next.audiences.length;
    if (index === undefined) {
      next.audiences.push({
        id: makeID(),
        name: "",
        description: "",
        industries: [],
        company_sizes: [],
        geographies: [],
        pain_points: [],
        buying_triggers: [],
        must_haves: [],
        exclusions: [],
        buyer_personas: [],
        priority: "core",
      });
    }
    setWorking(next);
    setEditor({ kind: "audience", index: actualIndex });
  };

  const openProof = (index?: number) => {
    const next = cloneContent(content);
    const actualIndex = index ?? next.proof.length;
    if (index === undefined) next.proof.push({ id: makeID(), title: "", summary: "", source_url: "", offer_ids: [] });
    setWorking(next);
    setEditor({ kind: "proof", index: actualIndex });
  };

  const openSource = (index?: number) => {
    const next = cloneContent(content);
    const actualIndex = index ?? next.sources.length;
    if (index === undefined) next.sources.push({ id: makeID(), title: "", url: "", notes: "" });
    setWorking(next);
    setEditor({ kind: "source", index: actualIndex });
  };

  const openCompletionEditor = (dimension: CompletionDimension) => {
    if (dimension.key === "offers" && content.offers.length === 0) return openOffer();
    if (dimension.key === "audiences" && content.audiences.length === 0) return openAudience();
    if (dimension.key === "evidence" && content.proof.length === 0) return openProof();
    setWorking(cloneContent(content));
    setEditor(dimension.editor);
  };

  const save = async (next: BusinessContent, summary: string, close = true) => {
    if (!context || !canEdit) return;
    const normalized = cloneContent(next);
    if (!normalized.brand_name && normalized.business_name && normalized.business_name !== companyName) {
      normalized.brand_name = normalized.business_name;
    }
    normalized.business_name = companyName;
    try {
      await saveProfile.mutateAsync({
        expectedRevision: context.draft_revision,
        content: normalized,
        changeSummary: summary,
      });
      if (close) {
        setEditor(null);
        setWorking(null);
      }
      toast.success(t(($) => $.toast.saved));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(t(($) => $.toast.conflict));
        await contextQuery.refetch();
      } else {
        toast.error(t(($) => $.toast.save_failed));
      }
    }
  };

  const saveEditor = () => {
    if (!working || !editor) return;
    void save(working, t(($) => $.audit.manual_update));
  };

  const removeEditorItem = () => {
    if (!working || !editor || editor.kind === "foundation") return;
    const next = cloneContent(working);
    if (editor.kind === "offer") next.offers.splice(editor.index, 1);
    if (editor.kind === "audience") next.audiences.splice(editor.index, 1);
    if (editor.kind === "proof") next.proof.splice(editor.index, 1);
    if (editor.kind === "source") next.sources.splice(editor.index, 1);
    void save(next, t(($) => $.audit.item_removed));
  };

  const toggleOfferAudience = (offerIndex: number, audienceID: string) => {
    if (!canEdit || saveProfile.isPending) return;
    const next = cloneContent(content);
    const offer = next.offers[offerIndex];
    if (!offer) return;
    const current = offer.audience_ids ?? [];
    offer.audience_ids = current.includes(audienceID)
      ? current.filter((id) => id !== audienceID)
      : [...current, audienceID];
    void save(next, t(($) => $.audit.matrix_update), false);
  };

  const openConversation = () => {
    const prompt = companyName || content.summary
      ? t(($) => $.conversation.improve_prompt)
      : t(($) => $.conversation.start_prompt);
    const agentID = prepareBusinessConversation(useChatStore.getState(), prompt);
    navigation.push(agentID ? `${paths.chat()}?agent=${encodeURIComponent(agentID)}` : paths.chat());
  };

  if (contextQuery.isPending) {
    return (
      <div className="h-full overflow-y-auto bg-background p-6">
        <div className="mx-auto max-w-[1480px] space-y-5">
          <Skeleton className="h-52 rounded-3xl" />
          <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <CollectionPageState
        icon={CircleAlert}
        title={t(($) => $.error.title)}
        description={t(($) => $.error.description)}
        tone="destructive"
        actions={<Button variant="outline" onClick={() => contextQuery.refetch()}>{t(($) => $.actions.retry)}</Button>}
      />
    );
  }

  const websiteURL = safeHTTPURL(content.website_url);
  const avatarEmoji = parseAvatarEmoji(workspace?.avatar_url ?? null);
  const avatarURL = workspace?.avatar_url && !avatarEmoji ? resolvePublicFileUrl(workspace.avatar_url) : null;
  const evidenceCount = content.proof.length + content.sources.length;
  const isEmpty = !content.summary && !content.positioning && !content.offers.length && !content.audiences.length;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <main className="mx-auto w-full max-w-[1540px] px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <section className="relative overflow-hidden rounded-t-[28px] border border-b-0 bg-surface px-5 py-4 shadow-[0_24px_80px_-52px_var(--brand)] sm:px-6 sm:py-5 lg:px-8">
          <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-brand/[0.08] blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(var(--border)_0.7px,transparent_0.7px)] [background-size:18px_18px]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setManagementOpen(true)}
                aria-label={t(($) => $.actions.manage)}
                className="group flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand/15 bg-brand/[0.08] text-brand shadow-sm outline-none transition hover:border-brand/30 hover:bg-brand/[0.12] focus-visible:ring-2 focus-visible:ring-ring sm:size-12"
              >
                {avatarEmoji ? <span className="text-2xl leading-none">{avatarEmoji}</span> : avatarURL ? <img src={avatarURL} alt="" className="size-full object-cover" /> : <Building2 className="size-5" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
                  <span>{t(($) => $.page.eyebrow)}</span>
                  {context.updated_at ? <><span aria-hidden>·</span><span>{t(($) => $.status.updated, { time: formatUpdatedAt(context.updated_at) })}</span></> : null}
                </div>

                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <button type="button" onClick={() => setManagementOpen(true)} aria-label={t(($) => $.actions.manage)} className="group flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left outline-none transition hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring">
                    <h1 title={companyName} className="min-w-0 truncate font-[family-name:var(--font-serif)] text-[clamp(1.6rem,3vw,2.25rem)] leading-tight tracking-[-0.035em]">
                      {companyName}
                    </h1>
                    <Settings2 className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                  {brandName ? <p className="shrink-0 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{t(($) => $.fields.brand_name)} · {brandName}</p> : null}
                </div>

                <EditableSurface canEdit={canEdit} label={t(($) => $.editor.foundation_title)} onClick={openFoundation} className="-ml-2 mt-0.5 max-w-4xl px-2 py-1.5">
                  <p className={cn("line-clamp-1 text-sm leading-5 sm:text-base sm:leading-6", content.summary ? "text-foreground/75" : "italic text-muted-foreground")}>
                    {content.summary || t(($) => $.empty.summary)}
                  </p>
                </EditableSurface>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {websiteURL ? (
                    <a href={websiteURL} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-72 items-center gap-1.5 transition hover:text-foreground">
                      <Globe2 className="size-3.5 shrink-0" /><span className="truncate">{content.website_url}</span><ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  ) : null}
                  {!canEdit ? <Badge variant="outline">{t(($) => $.status.readonly)}</Badge> : null}
                  {saveProfile.isPending ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="size-3.5 animate-spin" />{t(($) => $.status.saving)}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 lg:pl-6">
              <Button size="sm" variant="outline" className="bg-background/75" onClick={() => setManagementOpen(true)}><Settings2 />{t(($) => $.actions.manage)}</Button>
              {canEdit ? (
                <Button size="sm" onClick={openConversation}><Sparkles />{t(($) => $.actions.ai)}</Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="relative grid overflow-hidden rounded-b-[28px] border bg-surface shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: t(($) => $.metrics.completeness), value: `${completionPercent}%`, icon: BarChart3 },
            { label: t(($) => $.metrics.offers), value: content.offers.length, icon: BriefcaseBusiness },
            { label: t(($) => $.metrics.audiences), value: content.audiences.length, icon: Target },
            { label: t(($) => $.metrics.personas), value: personas.length, icon: UsersRound },
            { label: t(($) => $.metrics.evidence), value: evidenceCount, icon: BadgeCheck },
          ].map((metric) => (
            <div key={metric.label} className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-r lg:border-b-0 lg:px-5">
              <metric.icon className="size-4 text-brand" />
              <div><p className="font-[family-name:var(--font-serif)] text-2xl tabular-nums">{metric.value}</p><p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p></div>
            </div>
          ))}
        </section>

        {isEmpty ? (
          <section className="mt-8 rounded-3xl border border-dashed bg-surface/60 px-6 py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Sparkles className="size-5" /></div>
            <h2 className="mt-5 font-[family-name:var(--font-serif)] text-2xl">{t(($) => $.empty.title)}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t(($) => $.empty.description)}</p>
            {canEdit ? <div className="mt-6 flex justify-center gap-2"><Button onClick={openConversation}><Bot />{t(($) => $.actions.ai)}</Button><Button variant="outline" onClick={openFoundation}><Pencil />{t(($) => $.actions.manual)}</Button></div> : null}
          </section>
        ) : (
          <div className="mt-12 space-y-16">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
              <div className="rounded-3xl border bg-surface p-5 sm:p-7">
                <SectionTitle icon={Lightbulb} eyebrow="01 / FOUNDATION" title={t(($) => $.sections.foundation_title)} description={t(($) => $.sections.foundation_description)} />
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <EditableSurface canEdit={canEdit} label={t(($) => $.fields.positioning)} onClick={openFoundation} className="border bg-background/60 p-5 sm:col-span-2">
                    <FactBlock label={t(($) => $.fields.positioning)} value={content.positioning} empty={t(($) => $.empty.click_to_add)} />
                  </EditableSurface>
                  {[
                    [t(($) => $.fields.differentiators), content.differentiators],
                    [t(($) => $.fields.principles), content.principles],
                    [t(($) => $.fields.exclusions), content.exclusions],
                  ].map(([label, values], index) => (
                    <EditableSurface key={String(label)} canEdit={canEdit} label={String(label)} onClick={openFoundation} className={cn("border bg-background/60 p-5", index === 2 && "sm:col-span-2")}>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                      <TagCloud values={values as string[]} empty={t(($) => $.empty.click_to_add)} />
                    </EditableSurface>
                  ))}
                </div>
              </div>

              <button type="button" disabled={!canEdit} onClick={() => openCompletionEditor(completion.find((item) => !item.complete) ?? completion[0]!)} className="group rounded-3xl border bg-surface p-6 text-left outline-none transition hover:border-brand/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t(($) => $.charts.completeness_title)}</p>
                <div className="relative mx-auto mt-5 size-48">
                  <ChartContainer config={{ complete: { color: "var(--chart-1)" }, missing: { color: "var(--muted)" } }} className="aspect-square size-48">
                    <PieChart>
                      <Pie data={[{ name: "complete", value: completed }, { name: "missing", value: completion.length - completed }]} dataKey="value" nameKey="name" innerRadius={63} outerRadius={82} startAngle={90} endAngle={-270} strokeWidth={0}>
                        <Cell fill="var(--color-complete)" /><Cell fill="var(--color-missing)" />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-[family-name:var(--font-serif)] text-4xl tracking-tight">{completionPercent}%</span><span className="mt-1 text-xs text-muted-foreground">{t(($) => $.charts.complete)}</span></div>
                </div>
                <div className="mt-5 space-y-2">
                  {completion.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t(($) => $.completion[item.key])}</span>{item.complete ? <Check className="size-4 text-success" /> : <span className="text-xs text-brand">{t(($) => $.charts.missing)}</span>}</div>
                  ))}
                </div>
              </button>
            </section>

            <section className="space-y-6">
              <SectionTitle icon={BriefcaseBusiness} eyebrow="02 / PORTFOLIO" title={t(($) => $.sections.portfolio_title)} description={t(($) => $.sections.portfolio_description)} action={canEdit ? <Button size="sm" variant="outline" onClick={() => openOffer()}><Plus />{t(($) => $.actions.add_offer)}</Button> : undefined} />
              {content.offers.length ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {content.offers.map((offer, index) => (
                    <EditableSurface key={offer.id || index} canEdit={canEdit} label={t(($) => $.editor.offer_title)} onClick={() => openOffer(index)} className="h-full border bg-surface p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4"><span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">SERVICE {String(index + 1).padStart(2, "0")}</span><BriefcaseBusiness className="size-4 text-brand" /></div>
                      <h3 className="mt-5 font-[family-name:var(--font-serif)] text-xl">{offer.name || t(($) => $.empty.untitled_offer)}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{offer.summary || t(($) => $.empty.click_to_add)}</p>
                      <div className="mt-5 flex flex-wrap gap-1.5">{offer.outcomes.slice(0, 3).map((item) => <Badge key={item} variant="secondary" className="font-normal">{item}</Badge>)}</div>
                      <div className="mt-6 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground"><span>{offer.typical_timeline || t(($) => $.empty.no_timeline)}</span><span>{(offer.audience_ids ?? []).length} {t(($) => $.charts.matched_audiences)}</span></div>
                    </EditableSurface>
                  ))}
                </div>
              ) : <EmptyPanel>{canEdit ? t(($) => $.empty.add_offer) : t(($) => $.empty.no_offers)}</EmptyPanel>}
            </section>

            <section className="rounded-3xl border bg-surface p-5 sm:p-7">
              <SectionTitle icon={Target} eyebrow="03 / FIT MAP" title={t(($) => $.charts.matrix_title)} description={t(($) => $.charts.matrix_description)} />
              {content.offers.length && content.audiences.length ? (
                <div className="mt-7 overflow-x-auto rounded-2xl border bg-background/55">
                  <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `minmax(190px, 1.2fr) repeat(${content.audiences.length}, minmax(150px, 1fr))` }}>
                    <div className="border-b border-r p-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t(($) => $.charts.services_axis)}</div>
                    {content.audiences.map((audience, index) => <button type="button" disabled={!canEdit} onClick={() => openAudience(index)} key={audience.id || index} className="border-b border-r p-4 text-left text-sm font-medium transition hover:bg-muted/50 disabled:cursor-default">{audience.name || t(($) => $.empty.untitled_audience)}</button>)}
                    {content.offers.map((offer, offerIndex) => (
                      <div key={offer.id || offerIndex} className="contents">
                        <button type="button" disabled={!canEdit} onClick={() => openOffer(offerIndex)} className="border-b border-r p-4 text-left text-sm font-medium transition hover:bg-muted/50 disabled:cursor-default">{offer.name || t(($) => $.empty.untitled_offer)}</button>
                        {content.audiences.map((audience) => {
                          const matched = (offer.audience_ids ?? []).includes(audience.id);
                          return <button type="button" disabled={!canEdit || saveProfile.isPending} onClick={() => toggleOfferAudience(offerIndex, audience.id)} key={audience.id} className={cn("flex min-h-16 items-center justify-center gap-2 border-b border-r p-3 text-xs font-medium transition", matched ? "bg-brand/[0.08] text-brand hover:bg-brand/[0.13]" : "text-muted-foreground hover:bg-muted/50", !canEdit && "cursor-default")}><span className={cn("size-2 rounded-full", matched ? "bg-brand" : "bg-border")} />{matched ? t(($) => $.charts.match) : t(($) => $.charts.no_match)}</button>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="mt-7"><EmptyPanel>{t(($) => $.empty.matrix)}</EmptyPanel></div>}
            </section>

            <section className="space-y-6">
              <SectionTitle icon={Target} eyebrow="04 / MARKET" title={t(($) => $.sections.market_title)} description={t(($) => $.sections.market_description)} action={canEdit ? <Button size="sm" variant="outline" onClick={() => openAudience()}><Plus />{t(($) => $.actions.add_audience)}</Button> : undefined} />
              <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
                <button type="button" disabled={!canEdit || content.audiences.length === 0} onClick={() => openAudience(0)} className="rounded-3xl border bg-surface p-5 text-left outline-none transition hover:border-brand/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:p-7">
                  <div className="flex items-center justify-between"><div><h3 className="font-medium">{t(($) => $.charts.market_title)}</h3><p className="mt-1 text-sm text-muted-foreground">{t(($) => $.charts.market_description)}</p></div><BarChart3 className="size-5 text-brand" /></div>
                  {marketData.length ? (
                    <ChartContainer config={{ count: { label: t(($) => $.charts.icp_coverage), color: "var(--chart-1)" } }} className="mt-5 h-[260px] w-full">
                      <BarChart data={marketData} layout="vertical" margin={{ left: 0, right: 12 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" allowDecimals={false} hide />
                        <YAxis type="category" dataKey="label" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} barSize={18} />
                      </BarChart>
                    </ChartContainer>
                  ) : <div className="mt-5"><EmptyPanel>{t(($) => $.empty.market)}</EmptyPanel></div>}
                </button>

                <div className="rounded-3xl border bg-surface p-5 sm:p-7">
                  <h3 className="font-medium">{t(($) => $.charts.priority_title)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.charts.priority_description)}</p>
                  <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-muted">
                    {priorityCounts.map((item, index) => item.count ? <div key={item.priority} className={cn(index === 0 ? "bg-chart-1" : index === 1 ? "bg-chart-3" : "bg-chart-5")} style={{ width: `${(item.count / Math.max(content.audiences.length, 1)) * 100}%` }} /> : null)}
                  </div>
                  <div className="mt-6 space-y-4">
                    {priorityCounts.map((item, index) => (
                      <div key={item.priority} className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm"><span className={cn("size-2 rounded-full", index === 0 ? "bg-chart-1" : index === 1 ? "bg-chart-3" : "bg-chart-5")} />{t(($) => $.priorities[item.priority as "core" | "secondary" | "explore"])}</div><span className="font-[family-name:var(--font-serif)] text-xl">{item.count}</span></div>
                    ))}
                  </div>
                  <div className="mt-7 space-y-2 border-t pt-5">
                    {content.audiences.map((audience, index) => <button type="button" disabled={!canEdit} onClick={() => openAudience(index)} key={audience.id || index} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted/50 disabled:cursor-default"><span className="truncate">{audience.name || t(($) => $.empty.untitled_audience)}</span><ChevronRight className="size-4 text-muted-foreground" /></button>)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-surface p-5 sm:p-7">
              <SectionTitle icon={UsersRound} eyebrow="05 / BUYING COMMITTEE" title={t(($) => $.sections.buying_title)} description={t(($) => $.sections.buying_description)} />
              {personas.length ? (
                <div className="mt-8 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-stretch gap-3">
                    {[...personas].sort((a, b) => ROLE_ORDER.indexOf(a.persona.buying_role || "user") - ROLE_ORDER.indexOf(b.persona.buying_role || "user")).map(({ persona, audience, audienceIndex }, index) => (
                      <div key={`${audience.id}-${persona.id || index}`} className="flex items-center gap-3">
                        <button type="button" disabled={!canEdit} onClick={() => openAudience(audienceIndex)} className="group w-52 rounded-2xl border bg-background/65 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/35 disabled:cursor-default">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">{t(($) => $.roles[(persona.buying_role || "user") as "initiator" | "champion" | "influencer" | "decision_maker" | "user"])}</p>
                          <p className="mt-3 font-medium">{persona.name || t(($) => $.empty.untitled_persona)}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{persona.titles.join(" · ") || persona.role || audience.name}</p>
                        </button>
                        {index < personas.length - 1 ? <ChevronRight className="size-4 text-muted-foreground/45" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="mt-7"><EmptyPanel>{t(($) => $.empty.personas)}</EmptyPanel></div>}
            </section>

            <section className="space-y-6">
              <SectionTitle icon={FileCheck2} eyebrow="06 / TRUST" title={t(($) => $.sections.evidence_title)} description={t(($) => $.sections.evidence_description)} action={canEdit ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openProof()}><Plus />{t(($) => $.actions.add_proof)}</Button><Button size="sm" variant="outline" onClick={() => openSource()}><Link2 />{t(($) => $.actions.add_source)}</Button></div> : undefined} />
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-3xl border bg-surface p-5 sm:p-7">
                  <h3 className="font-medium">{t(($) => $.charts.evidence_title)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.charts.evidence_description)}</p>
                  <div className="mt-6 space-y-5">
                    {content.offers.length ? content.offers.map((offer, index) => {
                      const count = content.proof.filter((proof) => (proof.offer_ids ?? []).includes(offer.id)).length;
                      const max = Math.max(1, ...content.offers.map((item) => content.proof.filter((proof) => (proof.offer_ids ?? []).includes(item.id)).length));
                      return <button key={offer.id || index} type="button" disabled={!canEdit} onClick={() => content.proof.length ? openProof(Math.max(0, content.proof.findIndex((proof) => (proof.offer_ids ?? []).includes(offer.id)))) : openProof()} className="w-full text-left disabled:cursor-default"><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{offer.name || t(($) => $.empty.untitled_offer)}</span><span className="font-mono text-xs text-muted-foreground">{count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-chart-1 transition-all" style={{ width: `${(count / max) * 100}%` }} /></div></button>;
                    }) : <p className="text-sm text-muted-foreground">{t(($) => $.empty.no_offers)}</p>}
                  </div>
                </div>
                <div className="rounded-3xl border bg-surface p-5 sm:p-7">
                  <div className="grid gap-3">
                    {content.proof.map((proof, index) => <EditableSurface key={proof.id || index} canEdit={canEdit} label={t(($) => $.editor.proof_title)} onClick={() => openProof(index)} className="border bg-background/60 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 size-4 text-success" /><div><p className="font-medium">{proof.title || t(($) => $.empty.untitled_proof)}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{proof.summary || t(($) => $.empty.click_to_add)}</p></div></div></EditableSurface>)}
                    {content.sources.map((source, index) => <EditableSurface key={source.id || index} canEdit={canEdit} label={t(($) => $.editor.source_title)} onClick={() => openSource(index)} className="border bg-background/60 p-4"><div className="flex items-start gap-3"><Link2 className="mt-0.5 size-4 text-brand" /><div><p className="font-medium">{source.title || t(($) => $.empty.untitled_source)}</p><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{source.url || source.notes || t(($) => $.empty.click_to_add)}</p></div></div></EditableSurface>)}
                    {!evidenceCount ? <EmptyPanel>{t(($) => $.empty.evidence)}</EmptyPanel> : null}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      <Sheet open={Boolean(editor && working)} onOpenChange={(open) => { if (!open && !saveProfile.isPending) { setEditor(null); setWorking(null); } }}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{editor ? t(($) => $.editor[`${editor.kind}_title` as "foundation_title" | "offer_title" | "audience_title" | "proof_title" | "source_title"]) : ""}</SheetTitle>
            <SheetDescription>{t(($) => $.editor.description)}</SheetDescription>
          </SheetHeader>

          {editor && working ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {editor.kind === "foundation" ? (
                <>
                  <FormField label={t(($) => $.fields.brand_name)}><Input value={working.brand_name} onChange={(event) => updateWorking((next) => { next.brand_name = event.target.value; })} placeholder={t(($) => $.fields.brand_name_placeholder)} /></FormField>
                  <FormField label={t(($) => $.fields.website)}><Input type="url" value={working.website_url} onChange={(event) => updateWorking((next) => { next.website_url = event.target.value; })} placeholder="https://" /></FormField>
                  <FormField label={t(($) => $.fields.summary)}><Textarea rows={4} value={working.summary} onChange={(event) => updateWorking((next) => { next.summary = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.positioning)}><Textarea rows={4} value={working.positioning} onChange={(event) => updateWorking((next) => { next.positioning = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.differentiators)} hint={t(($) => $.fields.one_per_line)}><Textarea rows={5} value={lineValue(working.differentiators)} onChange={(event) => updateWorking((next) => { next.differentiators = lines(event.target.value); })} /></FormField>
                  <FormField label={t(($) => $.fields.principles)} hint={t(($) => $.fields.one_per_line)}><Textarea rows={5} value={lineValue(working.principles)} onChange={(event) => updateWorking((next) => { next.principles = lines(event.target.value); })} /></FormField>
                  <FormField label={t(($) => $.fields.exclusions)} hint={t(($) => $.fields.one_per_line)}><Textarea rows={5} value={lineValue(working.exclusions)} onChange={(event) => updateWorking((next) => { next.exclusions = lines(event.target.value); })} /></FormField>
                </>
              ) : null}

              {editor.kind === "offer" && working.offers[editor.index] ? (() => {
                const offer = working.offers[editor.index]!;
                return <>
                  <FormField label={t(($) => $.fields.offer_name)}><Input value={offer.name} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.name = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.offer_summary)}><Textarea rows={4} value={offer.summary} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.summary = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.outcomes)} hint={t(($) => $.fields.one_per_line)}><Textarea rows={4} value={lineValue(offer.outcomes)} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.outcomes = lines(event.target.value); })} /></FormField>
                  <FormField label={t(($) => $.fields.deliverables)} hint={t(($) => $.fields.one_per_line)}><Textarea rows={4} value={lineValue(offer.deliverables)} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.deliverables = lines(event.target.value); })} /></FormField>
                  <div className="grid gap-4 sm:grid-cols-2"><FormField label={t(($) => $.fields.timeline)}><Input value={offer.typical_timeline} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.typical_timeline = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.pricing_note)}><Input value={offer.pricing_note} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.pricing_note = event.target.value; })} /></FormField></div>
                  <FormField label={t(($) => $.fields.fit_notes)}><Textarea rows={3} value={offer.fit_notes} onChange={(event) => updateOfferDraft(editor.index, (item) => { item.fit_notes = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.matched_audiences)}><div className="flex flex-wrap gap-2">{working.audiences.map((audience) => { const active = (offer.audience_ids ?? []).includes(audience.id); return <button key={audience.id} type="button" onClick={() => updateOfferDraft(editor.index, (item) => { const ids = item.audience_ids ?? []; item.audience_ids = active ? ids.filter((id) => id !== audience.id) : [...ids, audience.id]; })} className={cn("rounded-full border px-3 py-1.5 text-xs transition", active ? "border-brand/30 bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted")}>{audience.name || t(($) => $.empty.untitled_audience)}</button>; })}</div></FormField>
                </>;
              })() : null}

              {editor.kind === "audience" && working.audiences[editor.index] ? (() => {
                const audience = working.audiences[editor.index]!;
                return <>
                  <FormField label={t(($) => $.fields.audience_name)}><Input value={audience.name} onChange={(event) => updateAudienceDraft(editor.index, (item) => { item.name = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.audience_description)}><Textarea rows={3} value={audience.description} onChange={(event) => updateAudienceDraft(editor.index, (item) => { item.description = event.target.value; })} /></FormField>
                  <FormField label={t(($) => $.fields.priority)}><select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" value={audience.priority || "core"} onChange={(event) => updateAudienceDraft(editor.index, (item) => { item.priority = event.target.value; })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{t(($) => $.priorities[priority as "core" | "secondary" | "explore"])}</option>)}</select></FormField>
                  {(["industries", "company_sizes", "geographies", "pain_points", "buying_triggers", "must_haves", "exclusions"] as const).map((field) => <FormField key={field} label={t(($) => $.fields[field])} hint={t(($) => $.fields.one_per_line)}><Textarea rows={4} value={lineValue(audience[field])} onChange={(event) => updateAudienceDraft(editor.index, (item) => { item[field] = lines(event.target.value); })} /></FormField>)}
                  <div className="border-t pt-5">
                    <div className="flex items-center justify-between"><div><p className="font-medium">{t(($) => $.fields.personas)}</p><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.fields.personas_hint)}</p></div><Button size="sm" variant="outline" onClick={() => updateAudienceDraft(editor.index, (item) => { item.buyer_personas.push({ id: makeID(), name: "", titles: [], role: "", buying_role: "user", goals: [], pain_points: [], objections: [], channels: [] }); })}><Plus />{t(($) => $.actions.add_persona)}</Button></div>
                    <div className="mt-4 space-y-4">{audience.buyer_personas.map((persona, personaIndex) => <div key={persona.id || personaIndex} className="space-y-4 rounded-2xl border bg-muted/20 p-4"><div className="flex justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t(($) => $.fields.persona)} {personaIndex + 1}</p><Button size="icon-xs" variant="ghost" onClick={() => updateAudienceDraft(editor.index, (item) => { item.buyer_personas.splice(personaIndex, 1); })}><Trash2 /></Button></div><div className="grid gap-4 sm:grid-cols-2"><FormField label={t(($) => $.fields.persona_name)}><Input value={persona.name} onChange={(event) => updatePersonaDraft(editor.index, personaIndex, (item) => { item.name = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.buying_role)}><select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={persona.buying_role || "user"} onChange={(event) => updatePersonaDraft(editor.index, personaIndex, (item) => { item.buying_role = event.target.value; })}>{ROLE_ORDER.map((role) => <option key={role} value={role}>{t(($) => $.roles[role as "initiator" | "champion" | "influencer" | "decision_maker" | "user"])}</option>)}</select></FormField></div><FormField label={t(($) => $.fields.persona_role)}><Input value={persona.role} onChange={(event) => updatePersonaDraft(editor.index, personaIndex, (item) => { item.role = event.target.value; })} /></FormField>{(["titles", "goals", "pain_points", "objections", "channels"] as const).map((field) => <FormField key={field} label={t(($) => $.fields[field])} hint={t(($) => $.fields.one_per_line)}><Textarea rows={3} value={lineValue(persona[field])} onChange={(event) => updatePersonaDraft(editor.index, personaIndex, (item) => { item[field] = lines(event.target.value); })} /></FormField>)}</div>)}</div>
                  </div>
                </>;
              })() : null}

              {editor.kind === "proof" && working.proof[editor.index] ? (() => {
                const proof = working.proof[editor.index]!;
                return <><FormField label={t(($) => $.fields.proof_title)}><Input value={proof.title} onChange={(event) => updateProofDraft(editor.index, (item) => { item.title = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.proof_summary)}><Textarea rows={5} value={proof.summary} onChange={(event) => updateProofDraft(editor.index, (item) => { item.summary = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.source_url)}><Input type="url" value={proof.source_url} onChange={(event) => updateProofDraft(editor.index, (item) => { item.source_url = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.related_offers)}><div className="flex flex-wrap gap-2">{working.offers.map((offer) => { const active = (proof.offer_ids ?? []).includes(offer.id); return <button type="button" key={offer.id} onClick={() => updateProofDraft(editor.index, (item) => { const ids = item.offer_ids ?? []; item.offer_ids = active ? ids.filter((id) => id !== offer.id) : [...ids, offer.id]; })} className={cn("rounded-full border px-3 py-1.5 text-xs", active ? "border-brand/30 bg-brand/10 text-brand" : "text-muted-foreground")}>{offer.name || t(($) => $.empty.untitled_offer)}</button>; })}</div></FormField></>;
              })() : null}

              {editor.kind === "source" && working.sources[editor.index] ? (() => {
                const source = working.sources[editor.index]!;
                return <><FormField label={t(($) => $.fields.source_title)}><Input value={source.title} onChange={(event) => updateSourceDraft(editor.index, (item) => { item.title = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.source_url)}><Input type="url" value={source.url} onChange={(event) => updateSourceDraft(editor.index, (item) => { item.url = event.target.value; })} /></FormField><FormField label={t(($) => $.fields.source_notes)}><Textarea rows={6} value={source.notes} onChange={(event) => updateSourceDraft(editor.index, (item) => { item.notes = event.target.value; })} /></FormField></>;
              })() : null}
            </div>
          ) : null}

          <SheetFooter className="flex-row border-t px-6 py-4">
            {editor && editor.kind !== "foundation" ? <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={removeEditorItem} disabled={saveProfile.isPending}><Trash2 />{t(($) => $.actions.delete)}</Button> : <span className="mr-auto" />}
            <Button variant="outline" onClick={() => { setEditor(null); setWorking(null); }} disabled={saveProfile.isPending}>{t(($) => $.actions.cancel)}</Button>
            <Button onClick={saveEditor} disabled={saveProfile.isPending}>{saveProfile.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}{saveProfile.isPending ? t(($) => $.actions.saving) : t(($) => $.actions.save)}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <CompanyManagementSheet open={managementOpen} onOpenChange={setManagementOpen} />
    </div>
  );
}
