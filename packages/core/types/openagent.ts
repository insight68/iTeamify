export interface WorkspaceOpenAgentConfig {
  configured: boolean;
  revision: number;
  base_url: string;
  model: string;
  credential_configured: boolean;
  updated_at: string | null;
}

export interface WorkspaceOpenAgentConfigInput {
  expected_revision: number;
  base_url: string;
  model: string;
  api_key?: string;
}

export type WorkspaceOpenAgentConnectionTestResult =
  | { ok: true }
  | { ok: false; code: string; error: string; upstream_status?: number | null };
