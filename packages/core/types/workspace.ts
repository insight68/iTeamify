export type MemberRole = "owner" | "admin" | "member";

export interface WorkspaceRepo {
  url: string;
}

export interface WorkspaceMcpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface WorkspaceMcpConfig {
  mcpServers?: Record<string, WorkspaceMcpServerConfig>;
  [key: string]: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  context: string | null;
  settings: Record<string, unknown>;
  repos: WorkspaceRepo[];
  mcp_config?: WorkspaceMcpConfig;
  issue_prefix: string;
  created_at: string;
  updated_at: string;
}

// Returned by POST /api/workspaces/{id}/import-from/{sourceId}.
// `copied` is the count actually inserted on the target; `skipped` is the
// count not touched because an entity with the same name already exists on
// the target (skip-by-name conflict policy — never overwrite).
export interface WorkspaceImportCounts {
  copied: number;
  skipped: number;
}

export interface WorkspaceImportApply {
  applied: boolean;
  // Free-text reason when not applied; empty when applied. Examples: "target
  // workspace already has MCP config", "source workspace has no MCP config".
  reason?: string;
}

export interface WorkspaceImportReport {
  runtimes: WorkspaceImportCounts;
  agents: WorkspaceImportCounts;
  skills: WorkspaceImportCounts;
  mcp_config: WorkspaceImportApply;
}

export interface Member {
  id: string;
  workspace_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url: string | null;
  onboarded_at: string | null;
  /**
   * JSONB payload from the server. Typed as `unknown` here so this module
   * stays independent of the questionnaire shape — the onboarding views
   * cast into `Partial<QuestionnaireAnswers>` when reading. Server always
   * returns an object (defaults to `{}`), never null.
   */
  onboarding_questionnaire: Record<string, unknown>;
  /**
   * Terminal state for the post-onboarding "import starter content" prompt.
   *   null             → new user, dialog will show on issues-list landing
   *   'imported'       → accepted, starter project + issues were seeded
   *   'dismissed'      → declined, never ask again
   *   'skipped_legacy' → backfilled for users who finished onboarding
   *                      before this feature shipped
   * Kept as a generic `string | null` here so future states (e.g.
   * 'retry_after_error') can be added without churning this type.
   */
  starter_content_state: string | null;
  /** Preferred UI language. null means "follow client/system". */
  language: string | null;
  has_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberWithUser {
  id: string;
  workspace_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url: string | null;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  inviter_id: string;
  invitee_email: string;
  invitee_phone?: string | null;
  invitee_user_id: string | null;
  role: MemberRole;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  updated_at: string;
  expires_at: string;
  inviter_name?: string;
  inviter_email?: string;
  workspace_name?: string;
}

export interface InvitationPreview {
  id: string;
  workspace_id: string;
  invitee_email: string;
  invitee_phone?: string;
  role: string;
  status: string;
  expires_at: string;
  workspace_name?: string;
  inviter_name?: string;
  inviter_email?: string;
  user_exists: boolean;
}
