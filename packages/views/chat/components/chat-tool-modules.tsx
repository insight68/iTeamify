"use client";

import type { Agent } from "@teamify/core/types";
import { BrowserFullscreenFrame } from "../../common/browser-fullscreen-frame";
import { useT } from "../../i18n";
import { AgentReconciliationPanel } from "./agent-reconciliation-panel";
import { AgentTablePanel } from "./agent-table-panel";

interface ChatToolModulesProps {
  agent: Agent;
  sessionId: string;
}

export function hasEnabledChatToolModules(agent: Agent | null): agent is Agent {
  return !!agent && (
    agent.chat_table_config?.enabled === true ||
    agent.reconciliation_config?.enabled === true
  );
}

/**
 * Agent tools hosted by the chat workspace, outside the chat window itself.
 */
export function ChatToolModules({ agent, sessionId }: ChatToolModulesProps) {
  const { t } = useT("chat");
  const tableConfig = agent.chat_table_config;
  const reconciliationConfig = agent.reconciliation_config;

  return (
    <div
      data-slot="chat-tool-modules"
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-2 pb-0 pt-2"
    >
      {reconciliationConfig?.enabled === true && (
        <BrowserFullscreenFrame
          enterLabel={t(($) => $.window.expand_tooltip)}
          exitLabel={t(($) => $.window.restore_tooltip)}
          className="min-h-0 flex-1 rounded-lg border bg-card shadow-sm data-[fullscreen=true]:rounded-none data-[fullscreen=true]:border-0 data-[fullscreen=true]:bg-background data-[fullscreen=true]:shadow-none"
        >
          {(fullscreenControl) => (
            <AgentReconciliationPanel
              config={reconciliationConfig}
              fullscreenControl={fullscreenControl}
            />
          )}
        </BrowserFullscreenFrame>
      )}
      {tableConfig?.enabled === true && (
        <BrowserFullscreenFrame
          enterLabel={t(($) => $.window.expand_tooltip)}
          exitLabel={t(($) => $.window.restore_tooltip)}
          className="min-h-0 flex-1 rounded-lg border bg-card shadow-sm data-[fullscreen=true]:rounded-none data-[fullscreen=true]:border-0 data-[fullscreen=true]:bg-background data-[fullscreen=true]:shadow-none"
        >
          {(fullscreenControl) => (
            <AgentTablePanel
              config={tableConfig}
              agentId={agent.id}
              sessionId={sessionId}
              fullscreenControl={fullscreenControl}
            />
          )}
        </BrowserFullscreenFrame>
      )}
    </div>
  );
}
