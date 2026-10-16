"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  Database,
  FileCheck2,
  GitPullRequest,
  History,
  LibraryBig,
  Radar,
  ShieldCheck,
} from "lucide-react";
import {
  businessContextOptions,
  businessProposalListOptions,
  businessReleaseListOptions,
} from "@iteamify/core/business";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useWorkspacePaths } from "@iteamify/core/paths";
import type { BusinessContent } from "@iteamify/core/types";
import { Badge } from "@iteamify/ui/components/ui/badge";
import { Button } from "@iteamify/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@iteamify/ui/components/ui/card";
import { Progress } from "@iteamify/ui/components/ui/progress";
import { Skeleton } from "@iteamify/ui/components/ui/skeleton";
import { AppLink } from "../../navigation";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import { useT } from "../../i18n";

function readinessScore(content: BusinessContent) {
  const checks = [
    Boolean(content.business_name.trim()),
    Boolean(content.summary.trim() && content.positioning.trim()),
    content.offers.some((offer) => Boolean(offer.name.trim() && offer.summary.trim())),
    content.audiences.some((audience) => Boolean(audience.name.trim())),
    content.audiences.some(
      (audience) =>
        audience.industries.length +
          audience.company_sizes.length +
          audience.geographies.length +
          audience.must_haves.length >
        0,
    ),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function KnowledgeMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-l pl-3 first:border-l-0 first:pl-0">
      <p className="font-mono text-lg tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ContractStep({
  icon: Icon,
  title,
  description,
  complete,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  complete: boolean;
}) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className="absolute bottom-0 left-4 top-8 w-px bg-border last:hidden" />
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {complete ? <Check className="size-3.5 text-success" /> : <CircleDashed className="size-3.5 text-muted-foreground/60" />}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const { t } = useT("knowledge");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const contextQuery = useQuery(businessContextOptions(wsId));
  const releasesQuery = useQuery(businessReleaseListOptions(wsId));
  const proposalsQuery = useQuery(businessProposalListOptions(wsId));

  const content = contextQuery.data?.draft;
  const readiness = useMemo(() => (content ? readinessScore(content) : 0), [content]);
  const releases = releasesQuery.data?.releases ?? [];
  const proposals = proposalsQuery.data?.proposals ?? [];
  const currentRelease = releases[0];

  if (contextQuery.isPending) {
    return (
      <div className="flex h-full flex-col">
        <CollectionPageHeader icon={LibraryBig} title={t(($) => $.page.title)} description={t(($) => $.page.description)} />
        <div className="grid flex-1 gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="min-h-96" />
          <Skeleton className="min-h-80" />
        </div>
      </div>
    );
  }

  if (contextQuery.isError || !content) {
    return (
      <div className="flex h-full flex-col">
        <CollectionPageHeader icon={LibraryBig} title={t(($) => $.page.title)} description={t(($) => $.page.description)} />
        <CollectionPageState
          icon={AlertCircle}
          title={t(($) => $.error.title)}
          description={t(($) => $.error.description)}
          tone="destructive"
          actions={<Button variant="outline" onClick={() => contextQuery.refetch()}>{t(($) => $.actions.retry)}</Button>}
        />
      </div>
    );
  }

  const published = contextQuery.data.published_version > 0;
  const evidenceCount = content.proof.length + content.sources.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CollectionPageHeader
        icon={LibraryBig}
        title={t(($) => $.page.title)}
        description={t(($) => $.page.description)}
        actions={
          <Button size="sm" render={<AppLink href={paths.business()} />}>
            <BriefcaseBusiness />
            {t(($) => $.actions.open_business)}
          </Button>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] space-y-5 p-4 sm:p-6">
          <section className="relative overflow-hidden border bg-surface px-5 py-6 sm:px-7">
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-brand/[0.025] lg:block" />
            <div className="relative max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary"><Database />{t(($) => $.hero.shared_truth)}</Badge>
                {published ? (
                  <Badge variant="outline">{t(($) => $.hero.production_version, { version: contextQuery.data.published_version })}</Badge>
                ) : (
                  <Badge variant="outline">{t(($) => $.hero.not_published)}</Badge>
                )}
              </div>
              <h2 className="max-w-2xl text-pretty text-xl font-medium tracking-tight sm:text-2xl">
                {t(($) => $.hero.title)}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t(($) => $.hero.description)}</p>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="shadow-none">
              <CardHeader className="border-b">
                <div className="flex size-9 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <BriefcaseBusiness className="size-4" />
                </div>
                <CardTitle>{t(($) => $.business.title)}</CardTitle>
                <CardDescription>{t(($) => $.business.description)}</CardDescription>
                <CardAction>
                  <Badge variant={readiness === 100 ? "secondary" : "outline"}>
                    {t(($) => $.business.readiness, { percent: readiness })}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-6 pt-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t(($) => $.business.completeness)}</span>
                    <span className="font-mono tabular-nums">{readiness}%</span>
                  </div>
                  <Progress value={readiness} aria-label={t(($) => $.business.completeness)} />
                </div>
                <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
                  <KnowledgeMetric value={content.offers.length} label={t(($) => $.business.offers)} />
                  <KnowledgeMetric value={content.audiences.length} label={t(($) => $.business.audiences)} />
                  <KnowledgeMetric value={content.audiences.reduce((sum, audience) => sum + audience.buyer_personas.length, 0)} label={t(($) => $.business.personas)} />
                  <KnowledgeMetric value={evidenceCount} label={t(($) => $.business.evidence)} />
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 border bg-muted/20 p-3">
                    <ShieldCheck className="size-4 shrink-0 text-foreground" />
                    <span>{t(($) => $.business.draft_policy)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t">
                <Button size="sm" variant="outline" render={<AppLink href={paths.business()} />}>
                  {t(($) => $.actions.manage_business)}
                  <ArrowRight />
                </Button>
              </CardFooter>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle>{t(($) => $.contract.title)}</CardTitle>
                <CardDescription>{t(($) => $.contract.description)}</CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <ContractStep icon={Bot} title={t(($) => $.contract.propose_title)} description={t(($) => $.contract.propose_description)} complete={contextQuery.data.draft_revision > 0} />
                <ContractStep icon={GitPullRequest} title={t(($) => $.contract.review_title)} description={t(($) => $.contract.review_description)} complete={contextQuery.data.draft_revision > 0} />
                <ContractStep icon={ShieldCheck} title={t(($) => $.contract.publish_title)} description={t(($) => $.contract.publish_description)} complete={published} />
                <ContractStep icon={Radar} title={t(($) => $.contract.consume_title)} description={t(($) => $.contract.consume_description)} complete={published} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card size="sm" className="shadow-none">
              <CardHeader>
                <History className="size-4 text-muted-foreground" />
                <CardTitle>{t(($) => $.signals.releases_title)}</CardTitle>
                <CardAction><span className="font-mono text-sm">{releases.length}</span></CardAction>
              </CardHeader>
              <CardContent><p className="text-xs leading-5 text-muted-foreground">{currentRelease?.change_summary || t(($) => $.signals.releases_empty)}</p></CardContent>
            </Card>
            <Card size="sm" className="shadow-none">
              <CardHeader>
                <GitPullRequest className="size-4 text-muted-foreground" />
                <CardTitle>{t(($) => $.signals.proposals_title)}</CardTitle>
                <CardAction><span className="font-mono text-sm">{proposals.length}</span></CardAction>
              </CardHeader>
              <CardContent><p className="text-xs leading-5 text-muted-foreground">{t(($) => $.signals.proposals_description)}</p></CardContent>
            </Card>
            <Card size="sm" className="shadow-none">
              <CardHeader>
                <FileCheck2 className="size-4 text-muted-foreground" />
                <CardTitle>{t(($) => $.signals.sources_title)}</CardTitle>
                <CardAction><span className="font-mono text-sm">{evidenceCount}</span></CardAction>
              </CardHeader>
              <CardContent><p className="text-xs leading-5 text-muted-foreground">{t(($) => $.signals.sources_description)}</p></CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
