"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@teamify/core";
import { agentListOptions } from "@teamify/core/workspace/queries";
import { agentRunCounts30dOptions, workspaceAgentUsageOptions } from "@teamify/core/agents/queries";
import { useWorkspacePresenceMap } from "@teamify/core/agents/use-agent-presence";
import { ActorAvatar } from "../../common/actor-avatar";
import { aggregateCostByAgent, formatCny } from "../../runtimes/utils";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { availabilityConfig, workloadConfig } from "../../agents/presence";
import type { AgentAvailability, Workload } from "@teamify/core/agents";
import { useT } from "../../i18n";

export function AgentsTab() {
  const { t: ts } = useT("settings");
  const wsId = useWorkspaceId();

  const { data: agents, isPending: agentsPending } = useQuery({
    ...agentListOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { byAgent: presenceMap, loading: presenceLoading } = useWorkspacePresenceMap(wsId);
  const { data: runCounts, isPending: runCountsPending } = useQuery({
    ...agentRunCounts30dOptions(wsId ?? ""),
    enabled: !!wsId,
  });
  const { data: usageRows, isPending: usagePending } = useQuery({
    ...workspaceAgentUsageOptions(wsId ?? "", 30),
    enabled: !!wsId,
  });

  const loading = agentsPending || presenceLoading || runCountsPending || usagePending;

  const costMap = useMemo(() => {
    if (!usageRows) {
      return new Map<string, { cost: number; estimated: boolean }>();
    }
    return new Map(
      aggregateCostByAgent(usageRows).map((c) => [
        c.key,
        { cost: c.cost, estimated: c.estimated },
      ]),
    );
  }, [usageRows]);

  const runCountMap = useMemo(() => {
    if (!runCounts) return new Map<string, number>();
    return new Map(runCounts.map((r) => [r.agent_id, r.run_count]));
  }, [runCounts]);

  // Exclude archived agents
  const activeAgents = (agents ?? []).filter((a) => !a.archived_at);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (activeAgents.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {ts(($) => $.agents.empty_state)}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{ts(($) => $.agents.section_title)}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {ts(($) => $.agents.description)}
        </p>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {ts(($) => $.agents.col_name)}
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {ts(($) => $.agents.col_status)}
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {ts(($) => $.agents.col_workload)}
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                {ts(($) => $.agents.col_runs)}
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                {ts(($) => $.agents.col_cost)}
              </th>
            </tr>
          </thead>
          <tbody>
            {activeAgents.map((agent) => {
              const presence = presenceMap.get(agent.id);
              const availability = (presence?.availability ?? "offline") as AgentAvailability;
              const workload = (presence?.workload ?? "idle") as Workload;
              const runs = runCountMap.get(agent.id) ?? 0;
              const cost = costMap.get(agent.id) ?? { cost: 0, estimated: false };

              return (
                <tr key={agent.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ActorAvatar
                        actorType="agent"
                        actorId={agent.id}
                        size={28}
                      />
                      <span className="font-medium truncate max-w-[200px]">
                        {agent.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge availability={availability} />
                  </td>
                  <td className="px-4 py-2.5">
                    <WorkloadBadge workload={workload} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {runs}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums"
                    title={
                      cost.estimated
                        ? ts(($) => $.agents.cost_estimated_title)
                        : undefined
                    }
                  >
                    {formatCny(cost.cost, { estimated: cost.estimated })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DEFAULT_AVAILABILITY = availabilityConfig.offline;

function StatusBadge({ availability }: { availability: AgentAvailability }) {
  const { t } = useT("agents");
  const c = availabilityConfig[availability] ?? DEFAULT_AVAILABILITY;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${c.dotClass}`} />
      {t(($) => $.availability[availability])}
    </span>
  );
}

const DEFAULT_WORKLOAD = workloadConfig.idle;

function WorkloadBadge({ workload }: { workload: Workload }) {
  const { t } = useT("agents");
  const c = workloadConfig[workload] ?? DEFAULT_WORKLOAD;
  return <span className={`text-xs ${c.textClass}`}>{t(($) => $.workload[workload])}</span>;
}
