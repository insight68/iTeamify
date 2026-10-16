import { projectWorkflowSchema, projectWorkflowListSchema, type ProjectWorkflow, type ProjectWorkflowAction } from "../projects/workflow-schemas";
import { ProjectSchema } from "./schemas";
import type { WorkspaceOpenAgentConfig, WorkspaceOpenAgentConfigInput, WorkspaceOpenAgentConnectionTestResult } from "../types/openagent";
import { WorkspaceOpenAgentConfigSchema, WorkspaceOpenAgentConnectionTestSchema } from "./schemas";
import { contractReviewSchema, type ContractReview, type CreateContractReviewInput, type ContractActionInput } from "../session-containers/schemas";
import { applicationsSchema, sessionApplicationSchema, type Applications, type SessionApplication, type ApplicationWrite } from "../session-containers/application-schemas";
import { agentSessionsPageSchema, agentSessionSchema, sendChatMessageSchema } from "../chat/schemas";
import { redditConnectionsSchema, redditPageSchema, redditDraftSchema, redditDraftListSchema, redditAuthorizationSchema, emptyRedditPage, type RedditDraft, type RedditDraftInput } from "../reddit/schemas";
import {
  AuthChallengeSchema, AuthVerificationSchema, LoginResponseSchema,
  PasswordStatusSchema, PasswordResetSchema, InvitationLoginContextSchema, EMPTY_LOGIN,
  type AuthChallenge, type AuthProof, type AuthPurpose, type AuthVerification,
} from "../auth/schemas";
import { teamActivitySchema, directMessagesPageSchema, directSessionSchema, directSessionsPageSchema, directSendSchema } from "../team/schemas";
import type { TeamActivity, DirectSession, DirectSendResult, SessionsPage, DirectMessagesPage } from "../team/types";
import { OutboundEmailSchema, OutboundEmailListSchema, type OutboundEmail, type EmailDraft } from "../gmail/outbound-schemas";
import type { Issue, IssuePriority, CreateIssueRequest, MoveIssueRequest, UpdateIssueRequest, GroupedIssuesResponse, ListIssuesResponse, SearchIssuesResponse, SearchProjectsResponse, UpdateMeRequest, CreateMemberRequest, UpdateMemberRequest, ListIssuesParams, ListGroupedIssuesParams, IssueTableFacetsRequest, IssueTableFacetsResponse, IssueTableGroupsRequest, IssueTableGroupsResponse, IssueTableRowsRequest, IssueTableRowsResponse, Agent, CreateAgentRequest, AgentTemplate, AgentTemplateSummary, CreateAgentFromTemplateRequest, CreateAgentFromTemplateResponse, AgentBuilderRuntimeSwitch, AgentBuilderSession, UpdateAgentRequest, AgentEnvResponse, UpdateAgentEnvRequest, AgentTask, AgentActivityBucket, AgentRunCount, WorkspaceWorkingAgent, WorkspaceWorkingAgentMineRelation, WorkspaceWorkingAgentType, AgentRuntime, RuntimeProfile, CreateRuntimeProfileRequest, UpdateRuntimeProfileRequest, InboxItem, InboxWorkspaceUnread, IssueSubscriber, Comment, CommentTriggerPreview, IssueTriggerPreview, IssueTriggerPreviewParams, Reaction, IssueReaction, Workspace, WorkspaceRepo, MemberWithUser, User, Skill, SkillSummary, CreateSkillRequest, UpdateSkillRequest, SetAgentSkillsRequest, SetAgentRuntimeSkillEnabledRequest, PersonalAccessToken, CreatePersonalAccessTokenRequest, CreatePersonalAccessTokenResponse, RuntimeUsage, IssueUsageSummary, RuntimeHourlyActivity, RuntimeUsageByAgent, RuntimeUsageByHour, DashboardUsageDaily, DashboardUsageByAgent, DashboardAgentRunTime, DashboardRunTimeDaily, DashboardFailureDaily, DashboardFailureByAgent, RuntimeUpdate, RuntimeModelListRequest, RuntimeLocalSkillListRequest, CreateRuntimeLocalSkillImportRequest, RuntimeLocalSkillImportRequest, TimelineEntry, AssigneeFrequencyEntry, TaskMessagePayload, Attachment, ChatSession, ChatContextResource, UpsertChatContextResourceInput, ChatPinnedAgent, ChatMessage, ChatMessagesPage, ChatDraftRestoresResponse, ChatPendingTask, PendingChatTasksResponse, HasPendingChatTasksResponse, SendChatMessageResponse, CancelTaskResponse, Project, CreateProjectRequest, UpdateProjectRequest, ListProjectsResponse, ProjectResource, CreateProjectResourceRequest, UpdateProjectResourceRequest, ListProjectResourcesResponse, Label, IssueProperty, IssuePropertyValue, CreatePropertyRequest, UpdatePropertyRequest, ListPropertiesResponse, IssuePropertiesResponse, CreateLabelRequest, UpdateLabelRequest, ListLabelsResponse, IssueLabelsResponse, LabelResourceType, ResourceLabelsResponse, PinnedItem, CreatePinRequest, PinnedItemType, ReorderPinsRequest, Invitation, Autopilot, AutopilotTrigger, AutopilotRun, CreateAutopilotRequest, UpdateAutopilotRequest, CreateAutopilotTriggerRequest, UpdateAutopilotTriggerRequest, ListAutopilotsResponse, CronPreviewResponse, GetAutopilotResponse, AutopilotCollaboratorsResponse, ListAutopilotRunsResponse, ListWebhookDeliveriesResponse, WebhookDelivery, NotificationPreferenceResponse, NotificationPreferences, GitHubPullRequest, ListGitHubInstallationsResponse, ListGitHubRepositoriesResponse, GitHubConnectResponse, ListVCSConnectionsResponse, ConnectVCSRequest, ConnectVCSResponse, ListLarkInstallationsResponse, BeginLarkInstallResponse, LarkInstallStatusResponse, RedeemLarkBindingTokenResponse, ComposioToolkit, ComposioConnection, ComposioConnectInitResponse, ListGmailConnectionsResponse, GmailConnectInitResponse, SlackInstallation, ListSlackInstallationsResponse, RegisterSlackBYORequest, RedeemSlackBindingTokenResponse, Squad, SquadMember, SquadMemberStatusListResponse, BillingBalance, BillingTransactionsPage, BillingBatchesPage, BillingTopupsPage, BillingPriceTier, CreateBillingCheckoutSessionRequest, CreateBillingCheckoutSessionResponse, BillingCheckoutSessionStatus, CreateBillingPortalSessionResponse, TokenCreditRate, BusinessContextState, BusinessChangeProposal, ListBusinessReleasesResponse, ListBusinessProposalsResponse, SaveBusinessDraftInput, SaveBusinessProfileInput, PublishBusinessInput, PublishBusinessResponse, ApplyBusinessProposalResponse } from "../types";
import type { OnboardingCompletionPath } from "../onboarding/types";
import type { CreateFeedbackResponse, FeedbackKind } from "../feedback/types";
import type {
  CloudRuntimeNode,
  CreateCloudRuntimeNodeRequest,
  ListCloudRuntimeNodesParams,
} from "../runtimes/cloud-runtime";
import { type Logger, noopLogger } from "../logger";
import { createRequestId } from "../utils";
import { getCurrentSlug, getWorkspaceRequestSignal } from "../platform/workspace-storage";
import { createRequestLifetime } from "./request-lifetime";
import { parseWithFallback } from "./schema";
import { MemberWithUserListSchema, MemberUpdateResponseSchema, MemberInvitationSchema, MemberInvitationListSchema, EMPTY_MEMBERS_WITH_USER, AgentTaskListSchema, AgentRuntimeListSchema, AgentTemplateSchema, AgentTemplateSummaryListSchema, AttachmentResponseSchema, CancelTaskResponseSchema, ChatDraftRestoresResponseSchema, ChatContextResourceListSchema, ChatContextResourceSchema, ChildIssuesResponseSchema, CommentsListSchema, CommentTriggerPreviewSchema, IssueTriggerPreviewSchema, CloudRuntimeNodeListSchema, CloudRuntimeNodeSchema, CreateAgentFromTemplateResponseSchema, AgentBuilderRuntimeSwitchSchema, AgentBuilderSessionSchema, agentBuilderRuntimeSwitchFallback, DashboardAgentRunTimeListSchema, DashboardRunTimeDailyListSchema, DashboardFailureDailyListSchema, DashboardFailureByAgentListSchema, DashboardUsageByAgentListSchema, DashboardUsageDailyListSchema, EMPTY_AGENT_TEMPLATE_DETAIL, EMPTY_AGENT_RUNTIME_LIST, EMPTY_AGENT_TEMPLATE_SUMMARY_LIST, EMPTY_APP_CONFIG, EMPTY_ATTACHMENT, EMPTY_CHAT_CONTEXT_RESOURCES, EMPTY_CLOUD_RUNTIME_NODE, EMPTY_CLOUD_RUNTIME_NODE_LIST, EMPTY_CREATE_AGENT_FROM_TEMPLATE_RESPONSE, EMPTY_AGENT_BUILDER_SESSION, EMPTY_GROUPED_ISSUES_RESPONSE, EMPTY_ISSUE_TABLE_FACETS_RESPONSE, EMPTY_ISSUE_TABLE_GROUPS_RESPONSE, EMPTY_ISSUE_TABLE_ROWS_RESPONSE, EMPTY_LIST_ISSUES_RESPONSE, EMPTY_SEARCH_ISSUES_RESPONSE, EMPTY_SEARCH_PROJECTS_RESPONSE, EMPTY_SQUAD, EMPTY_SQUAD_LIST, EMPTY_SQUAD_MEMBER_STATUS_LIST, EMPTY_TIMELINE_ENTRIES, EMPTY_USER, EMPTY_LIST_WEBHOOK_DELIVERIES_RESPONSE, EMPTY_WEBHOOK_DELIVERY, AppConfigSchema, type AppConfigResponse, GroupedIssuesResponseSchema, IssueTableFacetsResponseSchema, IssueTableGroupsResponseSchema, IssueTableRowsResponseSchema, ListAutopilotsResponseSchema, EMPTY_LIST_AUTOPILOTS_RESPONSE, AutopilotRunSchema, FALLBACK_AUTOPILOT_RUN, CronPreviewResponseSchema, UNREADABLE_CRON_PREVIEW_RESPONSE, ListIssuesResponseSchema, IssueSchema, CreateIssueResponseSchema, ListWebhookDeliveriesResponseSchema, RuntimeHourlyActivityListSchema, RuntimeUsageByAgentListSchema, RuntimeUsageByHourListSchema, RuntimeUsageListSchema, SearchIssuesResponseSchema, SearchProjectsResponseSchema, SquadSchema, SquadListSchema, SquadMemberStatusListResponseSchema, SubscribersListSchema, TimelineEntriesSchema, UserSchema, WebhookDeliveryResponseSchema, BillingBalanceSchema, BillingUsageSchema, TokenCreditRateSchema, BillingTransactionsPageSchema, BillingBatchesPageSchema, BillingTopupsPageSchema, BillingPriceTierListSchema, CreateBillingCheckoutSessionResponseSchema, BillingCheckoutSessionStatusSchema, CreateBillingPortalSessionResponseSchema, EMPTY_BILLING_BALANCE, EMPTY_TOKEN_CREDIT_RATE, EMPTY_BILLING_TRANSACTIONS_PAGE, EMPTY_BILLING_BATCHES_PAGE, EMPTY_BILLING_TOPUPS_PAGE, EMPTY_BILLING_PRICE_TIER_LIST, EMPTY_CREATE_BILLING_CHECKOUT_SESSION_RESPONSE, EMPTY_BILLING_CHECKOUT_SESSION_STATUS, EMPTY_CREATE_BILLING_PORTAL_SESSION_RESPONSE, EMPTY_CANCEL_TASK_RESPONSE, EMPTY_CHAT_DRAFT_RESTORES, CreateFeedbackResponseSchema, EMPTY_CREATE_FEEDBACK_RESPONSE, InboxUnreadSummarySchema, EMPTY_INBOX_UNREAD_SUMMARY, InboxItemListSchema, EMPTY_INBOX_ITEMS, NotificationPreferenceResponseSchema, EMPTY_NOTIFICATION_PREFERENCE_RESPONSE, LabelSchema, ListLabelsResponseSchema, IssuePropertySchema, ListPropertiesResponseSchema, IssuePropertiesResponseSchema, EMPTY_ISSUE_PROPERTY, EMPTY_LIST_PROPERTIES_RESPONSE, EMPTY_ISSUE_PROPERTIES_RESPONSE, EMPTY_ISSUE_PULL_REQUESTS_RESPONSE, IssuePullRequestsResponseSchema, ResourceLabelsResponseSchema, EMPTY_LABEL, EMPTY_LIST_LABELS_RESPONSE, EMPTY_RESOURCE_LABELS_RESPONSE, GitHubConnectResponseSchema, ListGitHubInstallationsResponseSchema, ListGitHubRepositoriesResponseSchema, EMPTY_GITHUB_CONNECT_RESPONSE, EMPTY_LIST_GITHUB_INSTALLATIONS_RESPONSE, EMPTY_LIST_GITHUB_REPOSITORIES_RESPONSE, ListVCSConnectionsResponseSchema, ConnectVCSResponseSchema, EMPTY_LIST_VCS_CONNECTIONS_RESPONSE, EMPTY_CONNECT_VCS_RESPONSE, ListLarkInstallationsResponseSchema, BeginLarkInstallResponseSchema, LarkInstallStatusResponseSchema, EMPTY_LIST_LARK_INSTALLATIONS_RESPONSE, EMPTY_BEGIN_LARK_INSTALL_RESPONSE, EMPTY_LARK_INSTALL_STATUS_RESPONSE, ListSlackInstallationsResponseSchema, SlackInstallationResponseSchema, EMPTY_LIST_SLACK_INSTALLATIONS_RESPONSE, EMPTY_SLACK_INSTALLATION_RESPONSE, ComposioToolkitListSchema, ComposioConnectionListSchema, ComposioConnectInitResponseSchema, EMPTY_COMPOSIO_TOOLKIT_LIST, EMPTY_COMPOSIO_CONNECTION_LIST, EMPTY_COMPOSIO_CONNECT_INIT_RESPONSE, ListGmailConnectionsResponseSchema, GmailConnectInitResponseSchema, EMPTY_LIST_GMAIL_CONNECTIONS_RESPONSE, EMPTY_GMAIL_CONNECT_INIT_RESPONSE, BusinessContextStateSchema, BusinessChangeProposalSchema, ListBusinessReleasesResponseSchema, ListBusinessProposalsResponseSchema, PublishBusinessResponseSchema, ApplyBusinessProposalResponseSchema, EMPTY_BUSINESS_CONTEXT, EMPTY_BUSINESS_PROPOSAL, EMPTY_LIST_BUSINESS_RELEASES_RESPONSE, EMPTY_LIST_BUSINESS_PROPOSALS_RESPONSE, EMPTY_PUBLISH_BUSINESS_RESPONSE, EMPTY_APPLY_BUSINESS_PROPOSAL_RESPONSE } from "./schemas";

/** Identifies the calling client to the server.
 *  Sent on every HTTP request as X-Client-Platform / X-Client-Version /
 *  X-Client-OS so the backend can log, gate, or split metrics by client.
 *  See server/internal/middleware/client.go for the receiving end. */
export interface ApiClientIdentity {
  /** Logical client kind. Server expects: "web" | "desktop" | "cli" | "daemon". */
  platform?: string;
  /** Client/app version string (e.g. "0.1.0", git tag, commit). */
  version?: string;
  /** Coarse operating-system bucket (for example "macos", "windows", or "linux"). */
  os?: string;
}

export interface ApiClientOptions {
  logger?: Logger;
  onUnauthorized?: () => void;
  /** Identifies the client to the server. Sent as X-Client-* headers. */
  identity?: ApiClientIdentity;
  /** Ordinary JSON requests, including response-body decoding. */
  requestTimeoutMs?: number;
  /** Uploads and exports have a separate, bounded deadline. */
  transferTimeoutMs?: number;
}

export interface RequestContext {
  /** Explicit scope for a query; null deliberately omits workspace headers. */
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ClientRuntimeSnapshot {
  probe_result: "success" | "error";
  runtime_count?: number;
  provider_summary?: Record<string, number>;
  online_count?: number;
  offline_count?: number;
}

export interface ClientUsageRequest {
  install_id: string;
  runtime?: ClientRuntimeSnapshot;
}

type RequestScope = "member" | "account" | "public";

type InternalRequestInit = RequestInit & {
  extraHeaders?: Record<string, string>;
  /** Platform requests omit workspace identity; public requests omit member auth. */
  requestScope?: RequestScope;
  /** Stable, credential-free label used by client logs. */
  logEndpoint?: string;
  timeoutMs?: number;
};

export interface LoginResponse {
  token: string;
  user: User;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  // Raw decoded JSON body (when the server returned one). Carries structured
  // error fields like `code` so callers can branch on machine-readable
  // identifiers instead of pattern-matching the human-readable message.
  readonly body?: unknown;

  constructor(message: string, status: number, statusText: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// dispatchReasonCode extracts the stable, machine-readable admission reason
// (MUL-4525) from a blocked-trigger error's structured body, when present. UI
// callers localize a blocked/partial trigger from this code instead of pattern
// matching the human-readable message. Returns undefined for non-ApiErrors or
// bodies without a reason_code (older servers), so callers fall back to their
// generic failure toast.
export function dispatchReasonCode(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const code = (err.body as { reason_code?: unknown }).reason_code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

// Thrown by getAttachmentTextContent when the server refuses to inline a
// file because it exceeds the 2 MB cap. UI maps to a "too large, please
// download" affordance with the Download CTA still available.
export class PreviewTooLargeError extends Error {
  constructor() {
    super("attachment too large for inline preview");
    this.name = "PreviewTooLargeError";
  }
}

// Thrown by getAttachmentTextContent when the server's text whitelist
// rejects the content type. Normally the client's isPreviewable() guard
// catches this earlier, but the two whitelists can drift — surfacing the
// 415 as a typed error makes the drift visible.
export class PreviewUnsupportedError extends Error {
  constructor() {
    super("attachment type not supported for inline preview");
    this.name = "PreviewUnsupportedError";
  }
}

/**
 * Advertised in X-Client-Capabilities so the server knows this client can
 * recover a cancelled prompt from the durable draft-restore row (#5219).
 * Must stay in sync with protocol.AppCapabilityChatDraftRestoreV1.
 */
export const CHAT_DRAFT_RESTORE_CAPABILITY = "chat-draft-restore-v1";

export class ApiClient {
  private baseUrl: string;
  private authSession = { token: null as string | null, generation: 0, controller: new AbortController() };
  private requestContext?: RequestContext;
  private contextGeneration?: number;
  private contextWorkspaceSignal?: AbortSignal;

  advanceAuthSession(): void {
    this.authSession.generation += 1;
    this.authSession.controller.abort(new DOMException("Session changed", "AbortError"));
    this.authSession.controller = new AbortController();
  }
  private logger: Logger;
  private options: ApiClientOptions;

  constructor(baseUrl: string, options?: ApiClientOptions) {
    this.baseUrl = baseUrl;
    this.options = options ?? {};
    this.logger = options?.logger ?? noopLogger;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** A request-bound client shares auth lifecycle, without mutating the singleton's scope. */
  withRequestContext(context: RequestContext): ApiClient {
    const client = new ApiClient(this.baseUrl, this.options);
    client.authSession = this.authSession;
    client.requestContext = { workspaceSlug: getCurrentSlug(), ...context };
    client.contextGeneration = this.authSession.generation;
    if (context.workspaceId !== null && (!context.workspaceSlug || context.workspaceSlug === getCurrentSlug())) {
      client.contextWorkspaceSignal = getWorkspaceRequestSignal(context.workspaceId);
    }
    return client;
  }

  setToken(token: string | null) {
    if (this.authSession.token !== token) this.advanceAuthSession();
    this.authSession.token = token;
  }

  private readCsrfToken(): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith("iteamify_csrf="));
    return match ? match.split("=")[1] ?? null : null;
  }

  private authHeaders(scope: RequestScope = "member"): Record<string, string> {
    const headers: Record<string, string> = {};
    if (scope !== "public") {
      if (this.authSession.token) headers["Authorization"] = `Bearer ${this.authSession.token}`;
      if (scope === "member") {
        if (this.requestContext?.workspaceId) {
          headers["X-Workspace-ID"] = this.requestContext.workspaceId;
        } else if (this.requestContext?.workspaceId === undefined) {
          const slug = this.requestContext ? this.requestContext.workspaceSlug : getCurrentSlug();
          if (slug) headers["X-Workspace-Slug"] = slug;
        }
      }
      const csrf = this.readCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    const id = this.options.identity;
    if (id?.platform) headers["X-Client-Platform"] = id.platform;
    if (id?.version) headers["X-Client-Version"] = id.version;
    if (id?.os) headers["X-Client-OS"] = id.os;
    return headers;
  }

  private handleUnauthorized() {
    this.authSession.token = null;
    this.advanceAuthSession();
    // Workspace id is owned by the URL-driven workspace-storage singleton
    // (set by [workspaceSlug]/layout.tsx). On 401, the auth flow navigates
    // to /login which leaves the workspace route, and the next workspace
    // entry will overwrite the id. No clear needed here.
    this.options.onUnauthorized?.();
  }

  // Reads the response body once for both human-readable error message and
  // structured fields. The Response stream can only be consumed once, so
  // both pieces have to come from a single read.
  private async parseErrorBody(res: Response, fallback: string): Promise<{ message: string; body: unknown }> {
    try {
      const data = await res.json() as { error?: string };
      const message = typeof data.error === "string" && data.error ? data.error : fallback;
      return { message, body: data };
    } catch {
      return { message: fallback, body: undefined };
    }
  }

  // Keep cancellation and the deadline alive until decoding finishes.
  private async fetchResponse<T>(
    path: string,
    init: InternalRequestInit | undefined,
    decode: (response: Response) => Promise<T>,
  ): Promise<T> {
    const { extraHeaders, requestScope = "member", logEndpoint, timeoutMs, ...requestInit } = init ?? {};
    const generation = this.contextGeneration ?? this.authSession.generation;
    if (requestScope !== "public" && generation !== this.authSession.generation) {
      throw new DOMException("Session changed", "AbortError");
    }
    const headers: Record<string, string> = {
      "X-Request-ID": createRequestId(),
      ...(requestScope === "member" ? { "X-Client-Capabilities": "session-containers-v1" } : {}),
      ...this.authHeaders(requestScope),
      ...(extraHeaders ?? {}),
      ...((requestInit.headers as Record<string, string>) ?? {}),
    };
    // UUID selection takes precedence; never send an unrelated active slug.
    if (headers["X-Workspace-ID"] && headers["X-Workspace-Slug"] !== "") delete headers["X-Workspace-Slug"];
    const method = requestInit.method ?? "GET";
    const deadline = timeoutMs ?? this.requestContext?.timeoutMs ?? this.options.requestTimeoutMs ?? (method === "GET" ? 30_000 : 60_000);
    if (!Number.isFinite(deadline) || deadline <= 0) throw new RangeError("Request timeout must be positive");
    const explicitSlug = extraHeaders?.["X-Workspace-Slug"];
    const workspaceSignal = requestScope === "member" && this.requestContext?.workspaceId !== null &&
      (!explicitSlug || explicitSlug === (this.requestContext?.workspaceSlug ?? getCurrentSlug()))
      ? this.contextWorkspaceSignal ?? getWorkspaceRequestSignal(headers["X-Workspace-ID"])
      : undefined;
    const lifetime = createRequestLifetime([
      requestInit.signal,
      this.requestContext?.signal,
      requestScope !== "public" ? this.authSession.controller.signal : undefined,
      workspaceSignal,
    ], deadline);
    const rid = headers["X-Request-ID"];
    const start = Date.now();
    const safePath = logEndpoint ?? path;
    this.logger.debug(`→ ${method} ${safePath}`, { rid });
    let response: Response | undefined;
    try {
      return await lifetime.run(async () => {
        response = await fetch(`${this.baseUrl}${path}`, {
          ...requestInit, headers, credentials: "include", signal: lifetime.signal,
        });
        lifetime.signal.throwIfAborted();
        if (!response.ok) {
          const { message, body } = await this.parseErrorBody(response, `API error: ${response.status} ${response.statusText}`);
          lifetime.signal.throwIfAborted();
          // Public auth rejections are handled by the form, not runtime failures.
          const logLevel = response.status === 404 ||
            (requestScope === "public" && response.status >= 400 && response.status < 500)
            ? "warn" : "error";
          this.logger[logLevel](`← ${response.status} ${safePath}`, { rid, duration: `${Date.now() - start}ms`, error: message });
          throw new ApiError(message, response.status, response.statusText, body);
        }
        const result = await decode(response);
        lifetime.signal.throwIfAborted();
        this.logger.debug(`← ${response.status} ${safePath}`, { rid, duration: `${Date.now() - start}ms` });
        return result;
      });
    } catch (error) {
      if (response?.body) void response.body.cancel().catch(() => {});
      if (error instanceof ApiError && error.status === 401 && requestScope !== "public" && generation === this.authSession.generation && !lifetime.signal.aborted) this.handleUnauthorized();
      throw error;
    }
  }

  private async fetch<T>(path: string, init?: InternalRequestInit): Promise<T> {
    return this.fetchResponse(path, {
      ...init,
      extraHeaders: { "Content-Type": "application/json", ...(init?.extraHeaders ?? {}) },
    }, async (response) => response.status === 204 ? undefined as T : response.json());
  }

  // Auth
  async sendCode(email: string, language?: string): Promise<void> {
    await this.fetch("/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ email, language }),
      requestScope: "public",
    });
  }

  async verifyCode(email: string, code: string): Promise<LoginResponse> {
    const raw = await this.fetch<unknown>("/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
      requestScope: "public",
    });
    return this.parseLogin(raw, "POST /auth/verify-code");
  }

  async googleLogin(code: string, redirectUri: string): Promise<LoginResponse> {
    const raw = await this.fetch<unknown>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      requestScope: "public",
    });
    return this.parseLogin(raw, "POST /auth/google");
  }

  private parseLogin(raw: unknown, endpoint: string): LoginResponse {
    const result = parseWithFallback(raw, LoginResponseSchema, EMPTY_LOGIN, { endpoint, redactReceived: true });
    if (!result.token || !result.user?.id) throw new ApiError("Invalid authentication response", 502, "Bad Gateway");
    return result;
  }

  async loginWithPassword(email: string, password: string): Promise<LoginResponse> {
    const raw = await this.fetch<unknown>("/auth/password/login", {
      method: "POST", body: JSON.stringify({ email, password }), requestScope: "public",
    });
    return this.parseLogin(raw, "POST /auth/password/login");
  }

  async getInvitationLoginContext(invitationId: string): Promise<{ email: string }> {
    const endpoint = `/auth/invitations/${encodeURIComponent(invitationId)}`;
    const raw = await this.fetch<unknown>(endpoint, { requestScope: "public" });
    const result = parseWithFallback<{ email: string } | null>(raw, InvitationLoginContextSchema, null, {
      endpoint, redactReceived: true,
    });
    if (!result) throw new ApiError("Invalid invitation response", 502, "Bad Gateway");
    return result;
  }

  async createAuthChallenge(email: string, purpose: AuthPurpose, language?: string): Promise<AuthChallenge> {
    const setting = purpose === "set_password";
    const endpoint = setting ? "/api/me/password/challenge" : "/auth/challenges";
    const raw = await this.fetch<unknown>(endpoint, {
      method: "POST", body: JSON.stringify({ email, purpose, language }),
      requestScope: setting ? "account" : "public",
    });
    const result = parseWithFallback<AuthChallenge | null>(raw, AuthChallengeSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid verification response", 502, "Bad Gateway");
    return result;
  }

  async verifyAuthChallenge(input: { email: string; purpose: AuthPurpose; challenge_id: string; code: string }): Promise<AuthVerification> {
    const endpoint = "/auth/challenges/verify";
    const raw = await this.fetch<unknown>(endpoint, { method: "POST", body: JSON.stringify(input), requestScope: "public" });
    const result = parseWithFallback<AuthVerification | null>(raw, AuthVerificationSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid verification response", 502, "Bad Gateway");
    return result;
  }

  async signupWithPassword(input: AuthProof & { password: string }): Promise<LoginResponse> {
    const raw = await this.fetch<unknown>("/auth/signup", { method: "POST", body: JSON.stringify(input), requestScope: "public" });
    return this.parseLogin(raw, "POST /auth/signup");
  }

  async resetPassword(input: AuthProof & { password: string; language?: string }): Promise<void> {
    const raw = await this.fetch<unknown>("/auth/password/reset", { method: "POST", body: JSON.stringify(input), requestScope: "public" });
    const result = parseWithFallback<{ success: true } | null>(raw, PasswordResetSchema, null, { endpoint: "POST /auth/password/reset", redactReceived: true });
    if (!result) throw new ApiError("Invalid password response", 502, "Bad Gateway");
  }

  async getPasswordStatus(): Promise<{ has_password: boolean }> {
    const raw = await this.fetch<unknown>("/api/me/password", { requestScope: "account" });
    const result = parseWithFallback<{ has_password: boolean } | null>(raw, PasswordStatusSchema, null, { endpoint: "GET /api/me/password", redactReceived: true });
    if (!result) throw new ApiError("Password status unavailable", 502, "Bad Gateway");
    return result;
  }

  async changePassword(input: { password: string; current_password?: string; language?: string } & Partial<AuthProof>): Promise<LoginResponse> {
    const raw = await this.fetch<unknown>("/api/me/password", { method: "PUT", body: JSON.stringify(input), requestScope: "account" });
    return this.parseLogin(raw, "PUT /api/me/password");
  }

  async logout(): Promise<void> {
    await this.fetch("/auth/logout", { method: "POST" });
  }

  async issueCliToken(): Promise<{ token: string }> {
    return this.fetch("/api/cli-token", { method: "POST" });
  }

  async getMe(): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me");
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "GET /api/me",
    });
  }

  async markOnboardingComplete(payload?: {
    completion_path?: OnboardingCompletionPath;
    workspace_id?: string;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding/complete", {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/onboarding/complete",
    });
  }

  async joinCloudWaitlist(payload: {
    email: string;
    reason?: string;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding/cloud-waitlist", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/onboarding/cloud-waitlist",
    });
  }

  async patchOnboarding(payload: {
    questionnaire?: Record<string, unknown>;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "PATCH /api/me/onboarding",
    });
  }

  async updateMe(data: UpdateMeRequest): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    const user = parseWithFallback<User | null>(raw, UserSchema, null, {
      endpoint: "PATCH /api/me",
      redactReceived: true,
    });
    if (!user?.id) throw new ApiError("Invalid profile response", 502, "Bad Gateway");
    return user;
  }

  // Issues
  async listIssues(params?: ListIssuesParams, options?: { strict?: boolean }): Promise<ListIssuesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.q?.trim()) search.set("q", params.q.trim());
    if (params?.status) search.set("status", params.status);
    if (params?.statuses?.length) search.set("statuses", params.statuses.join(","));
    if (params?.priority) search.set("priority", params.priority);
    if (params?.priorities?.length) search.set("priorities", params.priorities.join(","));
    if (params?.assignee_id) search.set("assignee_id", params.assignee_id);
    if (params?.assignee_ids?.length) search.set("assignee_ids", params.assignee_ids.join(","));
    if (params?.assignee_types?.length) search.set("assignee_types", params.assignee_types.join(","));
    if (params?.creator_id) search.set("creator_id", params.creator_id);
    if (params?.project_id) search.set("project_id", params.project_id);
    if (params?.assignee_filters?.length) {
      search.set("assignee_filters", params.assignee_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params?.include_no_assignee) search.set("include_no_assignee", "true");
    if (params?.creator_filters?.length) {
      search.set("creator_filters", params.creator_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params?.project_ids?.length) search.set("project_ids", params.project_ids.join(","));
    if (params?.include_no_project) search.set("include_no_project", "true");
    if (params?.label_ids?.length) search.set("label_ids", params.label_ids.join(","));
    if (params?.top_level_only) search.set("top_level_only", "true");
    // No `.length` guard on purpose: an empty ids array must still send
    // `ids=` — the server treats a PRESENT-but-empty list as an empty window
    // (nothing running), while an absent param means no restriction.
    if (params?.ids) search.set("ids", params.ids.join(","));
    if (params?.involves_user_id) search.set("involves_user_id", params.involves_user_id);
    if (params?.metadata && Object.keys(params.metadata).length > 0) {
      search.set("metadata", JSON.stringify(params.metadata));
    }
    if (params?.properties && Object.keys(params.properties).length > 0) {
      search.set("properties", JSON.stringify(params.properties));
    }
    if (params?.open_only) search.set("open_only", "true");
    if (params?.scheduled) search.set("scheduled", "true");
    if (params?.date_field) search.set("date_field", params.date_field);
    if (params?.date_start) search.set("date_start", params.date_start);
    if (params?.date_end) search.set("date_end", params.date_end);
    if (params?.sort_by) search.set("sort", params.sort_by);
    if (params?.sort_direction) search.set("direction", params.sort_direction);
    const parseList = (raw: unknown, endpoint: string): ListIssuesResponse => {
      const result = parseWithFallback<ListIssuesResponse | null>(raw, ListIssuesResponseSchema,
        options?.strict ? null : EMPTY_LIST_ISSUES_RESPONSE, { endpoint });
      if (!result) throw new ApiError("Invalid issue list response", 502, "Bad Gateway");
      return result;
    };
    // An ids facet can carry hundreds of UUIDs (agents-working filter) —
    // enough to blow the ~8 KB request-line cap of common reverse proxies.
    // Route those windows through the POST twin, which takes the SAME
    // key/value pairs as a JSON body.
    if (params?.ids) {
      const raw = await this.fetch<unknown>("/api/issues/query", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(search)),
      });
      return parseList(raw, "POST /api/issues/query");
    }
    const path = `/api/issues?${search}`;
    const raw = await this.fetch<unknown>(path);
    return parseList(raw, "GET /api/issues");
  }

  async listGroupedIssues(params: ListGroupedIssuesParams): Promise<GroupedIssuesResponse> {
    const search = new URLSearchParams({ group_by: params.group_by });
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    if (params.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params.statuses?.length) search.set("statuses", params.statuses.join(","));
    if (params.priorities?.length) search.set("priorities", params.priorities.join(","));
    if (params.assignee_types?.length) search.set("assignee_types", params.assignee_types.join(","));
    if (params.assignee_id) search.set("assignee_id", params.assignee_id);
    if (params.assignee_ids?.length) search.set("assignee_ids", params.assignee_ids.join(","));
    if (params.creator_id) search.set("creator_id", params.creator_id);
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.involves_user_id) search.set("involves_user_id", params.involves_user_id);
    if (params.metadata && Object.keys(params.metadata).length > 0) {
      search.set("metadata", JSON.stringify(params.metadata));
    }
    if (params.properties && Object.keys(params.properties).length > 0) {
      search.set("properties", JSON.stringify(params.properties));
    }
    if (params.assignee_filters?.length) {
      search.set("assignee_filters", params.assignee_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params.include_no_assignee) search.set("include_no_assignee", "true");
    if (params.creator_filters?.length) {
      search.set("creator_filters", params.creator_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params.project_ids?.length) search.set("project_ids", params.project_ids.join(","));
    if (params.include_no_project) search.set("include_no_project", "true");
    if (params.label_ids?.length) search.set("label_ids", params.label_ids.join(","));
    if (params.group_assignee_type) search.set("group_assignee_type", params.group_assignee_type);
    if (params.group_assignee_id) search.set("group_assignee_id", params.group_assignee_id);
    if (params.date_field) search.set("date_field", params.date_field);
    if (params.date_start) search.set("date_start", params.date_start);
    if (params.date_end) search.set("date_end", params.date_end);
    if (params.sort_by) search.set("sort", params.sort_by);
    if (params.sort_direction) search.set("direction", params.sort_direction);
    const raw = await this.fetch<unknown>(`/api/issues/grouped?${search}`);
    return parseWithFallback(raw, GroupedIssuesResponseSchema, EMPTY_GROUPED_ISSUES_RESPONSE, {
      endpoint: "GET /api/issues/grouped",
    });
  }

  async listIssueTableGroups(params: IssueTableGroupsRequest): Promise<IssueTableGroupsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/groups", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableGroupsResponseSchema,
      EMPTY_ISSUE_TABLE_GROUPS_RESPONSE,
      { endpoint: "POST /api/issues/table/groups" },
    );
  }

  async listIssueTableRows(params: IssueTableRowsRequest): Promise<IssueTableRowsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/rows", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableRowsResponseSchema,
      EMPTY_ISSUE_TABLE_ROWS_RESPONSE,
      { endpoint: "POST /api/issues/table/rows" },
    );
  }

  async listIssueTableFacets(params: IssueTableFacetsRequest): Promise<IssueTableFacetsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/facets", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableFacetsResponseSchema,
      EMPTY_ISSUE_TABLE_FACETS_RESPONSE,
      { endpoint: "POST /api/issues/table/facets" },
    );
  }

  async searchIssues(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchIssuesResponse> {
    const search = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.include_closed) search.set("include_closed", "true");
    const raw = await this.fetch<unknown>(
      `/api/issues/search?${search}`,
      params.signal ? { signal: params.signal } : undefined,
    );
    return parseWithFallback(raw, SearchIssuesResponseSchema, EMPTY_SEARCH_ISSUES_RESPONSE, {
      endpoint: "GET /api/issues/search",
    });
  }

  async searchProjects(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchProjectsResponse> {
    const search = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.include_closed) search.set("include_closed", "true");
    const raw = await this.fetch<unknown>(
      `/api/projects/search?${search}`,
      params.signal ? { signal: params.signal } : undefined,
    );
    return parseWithFallback(raw, SearchProjectsResponseSchema, EMPTY_SEARCH_PROJECTS_RESPONSE, {
      endpoint: "GET /api/projects/search",
    });
  }

  async getIssue(id: string): Promise<Issue> {
    const raw = await this.fetch<unknown>(`/api/issues/${encodeURIComponent(id)}`);
    const issue = parseWithFallback<Issue | null>(raw, IssueSchema.nullable(), null, {
      endpoint: "GET /api/issues/:id",
    });
    if (!issue?.id) throw new ApiError("Invalid issue response", 502, "Bad Gateway");
    return issue;
  }

  async createIssue(data: CreateIssueRequest): Promise<Issue> {
    // Parse through a schema (not a raw cast): the create modal keys its
    // label-attach compatibility fallback off `labels` being absent vs a
    // validated Label[], so an unvalidated wrong shape must not slip through.
    // Unlike list endpoints, a create that returns an unusable body is a
    // FAILED mutation, not a safe-empty read: fall back to null and reject so
    // the modal keeps the draft and shows a failure toast instead of a blank
    // "created" card pointing at an empty issue id. parseWithFallback already
    // logged the schema issues + raw payload; the empty message lets the modal
    // render its localized "failed to create" toast.
    const raw = await this.fetch<unknown>("/api/issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const issue = parseWithFallback<Issue | null>(raw, CreateIssueResponseSchema, null, {
      endpoint: "POST /api/issues",
    });
    if (!issue) {
      throw new Error();
    }
    return issue;
  }

  async quickCreateIssue(data: {
    agent_id?: string;
    squad_id?: string;
    prompt: string;
    priority?: IssuePriority;
    due_date?: string;
    project_id?: string | null;
    parent_issue_id?: string | null;
    attachment_ids?: string[];
  }): Promise<{ task_id: string }> {
    return this.fetch("/api/issues/quick-create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createFeedback(data: {
    message: string;
    url?: string;
    workspace_id?: string;
    kind?: FeedbackKind;
  }): Promise<CreateFeedbackResponse> {
    const raw = await this.fetch<unknown>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreateFeedbackResponseSchema, EMPTY_CREATE_FEEDBACK_RESPONSE, {
      endpoint: "POST /api/feedback",
    });
  }

  async upsertClientUsage(data: ClientUsageRequest): Promise<void> {
    await this.fetch("/api/client-usage", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateIssue(id: string, data: UpdateIssueRequest): Promise<Issue> {
    return this.fetch(`/api/issues/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async moveIssue(id: string, data: MoveIssueRequest): Promise<Issue> {
    return this.fetch(`/api/issues/${id}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listChildIssues(id: string): Promise<{ issues: Issue[] }> {
    const raw = await this.fetch<unknown>(`/api/issues/${id}/children`);
    return parseWithFallback(raw, ChildIssuesResponseSchema, { issues: [] }, {
      endpoint: "GET /api/issues/:id/children",
    });
  }

  /** Batched variant — returns children for multiple parents in one request.
   *  Avoids an N-request fan-out in Swimlane (one per visible parent lane).
   *  parentIds must be non-empty; pass a sorted, deduplicated list so the
   *  React Query cache key is stable across renders. */
  async listChildrenByParents(parentIds: string[]): Promise<{ issues: Issue[] }> {
    const raw = await this.fetch<unknown>(
      `/api/issues/children?parent_ids=${parentIds.join(",")}`,
    );
    return parseWithFallback(raw, ChildIssuesResponseSchema, { issues: [] }, {
      endpoint: "GET /api/issues/children",
    });
  }

  async getChildIssueProgress(): Promise<{ progress: { parent_issue_id: string; total: number; done: number }[] }> {
    return this.fetch("/api/issues/child-progress");
  }

  async deleteIssue(id: string): Promise<void> {
    await this.fetch(`/api/issues/${id}`, { method: "DELETE" });
  }

  async batchUpdateIssues(issueIds: string[], updates: UpdateIssueRequest): Promise<{ updated: number }> {
    return this.fetch("/api/issues/batch-update", {
      method: "POST",
      body: JSON.stringify({ issue_ids: issueIds, updates }),
    });
  }

  async batchDeleteIssues(issueIds: string[]): Promise<{ deleted: number }> {
    return this.fetch("/api/issues/batch-delete", {
      method: "POST",
      body: JSON.stringify({ issue_ids: issueIds }),
    });
  }

  // Comments
  async listComments(issueId: string): Promise<Comment[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/comments`);
    return parseWithFallback(raw, CommentsListSchema, [], {
      endpoint: "GET /api/issues/:id/comments",
    });
  }

  async createComment(
    issueId: string,
    content: string,
    type?: string,
    parentId?: string,
    attachmentIds?: string[],
    suppressAgentIds?: string[],
  ): Promise<Comment> {
    return this.fetch(`/api/issues/${issueId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        content,
        type: type ?? "comment",
        ...(parentId ? { parent_id: parentId } : {}),
        ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}),
        ...(suppressAgentIds?.length ? { suppress_agent_ids: suppressAgentIds } : {}),
      }),
    });
  }

  async previewCommentTriggers(issueId: string, content: string, parentId?: string, editingCommentId?: string): Promise<CommentTriggerPreview> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/comments/trigger-preview`, {
      method: "POST",
      body: JSON.stringify({
        content,
        ...(parentId ? { parent_id: parentId } : {}),
        ...(editingCommentId ? { editing_comment_id: editingCommentId } : {}),
      }),
    });
    return parseWithFallback(raw, CommentTriggerPreviewSchema, { agents: [] }, {
      endpoint: "POST /api/issues/:id/comments/trigger-preview",
    });
  }

  /** Dry-run the unified run-enqueue predicate for a prospective issue write
   *  (create / single assign / single status / batch). Returns the runs that
   *  would start; no side effect. The four entry points consult this instead
   *  of re-implementing the rule (MUL-3375). */
  async previewIssueTrigger(params: IssueTriggerPreviewParams): Promise<IssueTriggerPreview> {
    const raw = await this.fetch<unknown>("/api/issues/preview-trigger", {
      method: "POST",
      body: JSON.stringify({
        ...(params.issueIds?.length ? { issue_ids: params.issueIds } : {}),
        ...(params.isCreate ? { is_create: true } : {}),
        ...(params.assigneeType ? { assignee_type: params.assigneeType } : {}),
        ...(params.assigneeId ? { assignee_id: params.assigneeId } : {}),
        ...(params.status ? { status: params.status } : {}),
      }),
    });
    return parseWithFallback(raw, IssueTriggerPreviewSchema, { triggers: [], total_count: 0 }, {
      endpoint: "POST /api/issues/preview-trigger",
    });
  }

  async listTimeline(issueId: string): Promise<TimelineEntry[]> {
    const raw = await this.fetch<unknown>(
      `/api/issues/${issueId}/timeline`,
    );
    return parseWithFallback(raw, TimelineEntriesSchema, EMPTY_TIMELINE_ENTRIES, {
      endpoint: "GET /api/issues/:id/timeline",
    });
  }

  async getAssigneeFrequency(): Promise<AssigneeFrequencyEntry[]> {
    return this.fetch("/api/assignee-frequency");
  }

  async updateComment(commentId: string, content: string, attachmentIds?: string[], suppressAgentIds?: string[]): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}`, {
      method: "PUT",
      body: JSON.stringify({
        content,
        attachment_ids: attachmentIds,
        ...(suppressAgentIds?.length ? { suppress_agent_ids: suppressAgentIds } : {}),
      }),
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.fetch(`/api/comments/${commentId}`, { method: "DELETE" });
  }

  async resolveComment(commentId: string): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}/resolve`, { method: "POST" });
  }

  async unresolveComment(commentId: string): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}/resolve`, { method: "DELETE" });
  }

  async addReaction(commentId: string, emoji: string): Promise<Reaction> {
    return this.fetch(`/api/comments/${commentId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(commentId: string, emoji: string): Promise<void> {
    await this.fetch(`/api/comments/${commentId}/reactions`, {
      method: "DELETE",
      body: JSON.stringify({ emoji }),
    });
  }

  async addIssueReaction(issueId: string, emoji: string): Promise<IssueReaction> {
    return this.fetch(`/api/issues/${issueId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  }

  async removeIssueReaction(issueId: string, emoji: string): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/reactions`, {
      method: "DELETE",
      body: JSON.stringify({ emoji }),
    });
  }

  // Subscribers
  async listIssueSubscribers(issueId: string): Promise<IssueSubscriber[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/subscribers`);
    return parseWithFallback(raw, SubscribersListSchema, [], {
      endpoint: "GET /api/issues/:id/subscribers",
    });
  }

  async subscribeToIssue(issueId: string, userId?: string, userType?: string): Promise<void> {
    const body: Record<string, string> = {};
    if (userId) body.user_id = userId;
    if (userType) body.user_type = userType;
    await this.fetch(`/api/issues/${issueId}/subscribe`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async unsubscribeFromIssue(issueId: string, userId?: string, userType?: string): Promise<void> {
    const body: Record<string, string> = {};
    if (userId) body.user_id = userId;
    if (userType) body.user_type = userType;
    await this.fetch(`/api/issues/${issueId}/unsubscribe`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Agents
  async listAgents(params?: { workspace_id?: string; include_archived?: boolean }): Promise<Agent[]> {
    const search = new URLSearchParams();
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.include_archived) search.set("include_archived", "true");
    return this.fetch(`/api/agents?${search}`, {
      extraHeaders: params?.workspace_id ? { "X-Workspace-ID": params.workspace_id } : undefined,
    });
  }

  async getAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}`);
  }

  async createAgent(data: CreateAgentRequest): Promise<Agent> {
    return this.fetch("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createAgentBuilderSession(data: {
    runtime_id: string;
    model?: string;
  }): Promise<AgentBuilderSession> {
    const raw = await this.fetch<unknown>("/api/agent-builder/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      AgentBuilderSessionSchema,
      EMPTY_AGENT_BUILDER_SESSION,
      { endpoint: "POST /api/agent-builder/sessions" },
    );
  }

  /** Rebinds a live builder conversation to another runtime. Callers must not
   *  show the new runtime as selected until this resolves — the whole point is
   *  that the UI's runtime and the executing runtime agree.
   *
   *  A non-2xx throws before we get here and nothing was committed. Reaching the
   *  parse means the server bound `data.runtime_id`, so that is the fallback for
   *  an unparseable body — see agentBuilderRuntimeSwitchFallback. */
  async switchAgentBuilderRuntime(
    sessionId: string,
    data: { runtime_id: string },
  ): Promise<AgentBuilderRuntimeSwitch> {
    const raw = await this.fetch<unknown>(
      `/api/agent-builder/sessions/${sessionId}/runtime`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return parseWithFallback(
      raw,
      AgentBuilderRuntimeSwitchSchema,
      agentBuilderRuntimeSwitchFallback(data.runtime_id),
      { endpoint: "PATCH /api/agent-builder/sessions/{id}/runtime" },
    );
  }

  async listAgentTemplates(): Promise<AgentTemplateSummary[]> {
    const raw = await this.fetch<unknown>("/api/agent-templates");
    return parseWithFallback(
      raw,
      AgentTemplateSummaryListSchema,
      EMPTY_AGENT_TEMPLATE_SUMMARY_LIST,
      { endpoint: "GET /api/agent-templates" },
    );
  }

  async getAgentTemplate(slug: string): Promise<AgentTemplate> {
    const raw = await this.fetch<unknown>(
      `/api/agent-templates/${encodeURIComponent(slug)}`,
    );
    // Round-trip the requested slug into the fallback so a malformed
    // detail response still produces a navigable record matching the URL
    // the user clicked.
    return parseWithFallback(
      raw,
      AgentTemplateSchema,
      { ...EMPTY_AGENT_TEMPLATE_DETAIL, slug },
      { endpoint: "GET /api/agent-templates/:slug" },
    );
  }

  /** Creates an agent from a curated template. The server fetches every
   *  referenced skill URL in parallel, materializes them into the workspace
   *  (find-or-create by name), and writes the agent + skill bindings in a
   *  single transaction. On any upstream fetch failure, the entire write is
   *  rolled back and the API returns 422 with `failed_urls`. */
  async createAgentFromTemplate(
    data: CreateAgentFromTemplateRequest,
  ): Promise<CreateAgentFromTemplateResponse> {
    const raw = await this.fetch<unknown>("/api/agents/from-template", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      CreateAgentFromTemplateResponseSchema,
      EMPTY_CREATE_AGENT_FROM_TEMPLATE_RESPONSE,
      { endpoint: "POST /api/agents/from-template" },
    );
  }

  async updateAgent(id: string, data: UpdateAgentRequest): Promise<Agent> {
    return this.fetch(`/api/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async archiveAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}/archive`, { method: "POST" });
  }

  /**
   * Returns the plaintext `custom_env` map for an agent. Owner/admin
   * only; calls from agent-actor sessions get a 403. Every successful
   * call writes an `agent_env_revealed` activity_log row server-side.
   * MUL-2600.
   */
  async getAgentEnv(id: string): Promise<AgentEnvResponse> {
    return this.fetch(`/api/agents/${id}/env`);
  }

  /**
   * Replaces an agent's `custom_env` wholesale. Values equal to
   * `"****"` are preserved server-side (the **** guard) so a partial
   * UI edit doesn't overwrite real secrets with the masked
   * placeholder. Owner/admin only; agent actors get a 403. Every
   * successful call writes an `agent_env_updated` activity_log row.
   * MUL-2600.
   */
  async updateAgentEnv(id: string, data: UpdateAgentEnvRequest): Promise<AgentEnvResponse> {
    return this.fetch(`/api/agents/${id}/env`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async restoreAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}/restore`, { method: "POST" });
  }

  // Bulk-cancel every active task (queued/dispatched/running) for the agent.
  // Permission: agent owner or workspace admin/owner. Server returns the
  // count of cancelled rows; broadcasts task:cancelled for each so other
  // surfaces can clear their live cards.
  async cancelAgentTasks(id: string): Promise<{ cancelled: number }> {
    return this.fetch(`/api/agents/${id}/cancel-tasks`, { method: "POST" });
  }

  async listRuntimes(params?: { workspace_id?: string; owner?: "me" }): Promise<AgentRuntime[]> {
    const search = new URLSearchParams();
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.owner) search.set("owner", params.owner);
    const raw = await this.fetch<unknown>(`/api/runtimes?${search}`);
    return parseWithFallback(
      raw,
      AgentRuntimeListSchema,
      EMPTY_AGENT_RUNTIME_LIST,
      { endpoint: "GET /api/runtimes" },
    );
  }

  async listCloudRuntimeNodes(
    params?: ListCloudRuntimeNodesParams,
  ): Promise<CloudRuntimeNode[]> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.offset !== undefined) search.set("offset", String(params.offset));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-runtime/nodes${query ? `?${query}` : ""}`,
    );
    return parseWithFallback(
      raw,
      CloudRuntimeNodeListSchema,
      EMPTY_CLOUD_RUNTIME_NODE_LIST,
      { endpoint: "GET /api/cloud-runtime/nodes" },
    );
  }

  async createCloudRuntimeNode(
    data: CreateCloudRuntimeNodeRequest,
  ): Promise<CloudRuntimeNode> {
    const raw = await this.fetch<unknown>("/api/cloud-runtime/nodes", {
      method: "POST",
      body: JSON.stringify(data),
      extraHeaders: { "Content-Type": "application/json" },
    });
    return parseWithFallback(
      raw,
      CloudRuntimeNodeSchema,
      EMPTY_CLOUD_RUNTIME_NODE,
      { endpoint: "POST /api/cloud-runtime/nodes" },
    );
  }

  async deleteCloudRuntimeNode(instanceId: string): Promise<void> {
    await this.fetchResponse("/api/cloud-runtime/nodes", {
      method: "DELETE",
      body: JSON.stringify({ instance_id: instanceId }),
      extraHeaders: { "Content-Type": "application/json" },
    }, async (response) => { await response.body?.cancel(); });
  }

  // ---------------------------------------------------------------------
  // Local workspace Billing. Legacy route names remain stable for installed
  // clients, while the server owns wallet, order, and ledger state.
  // ---------------------------------------------------------------------

  async getCloudBillingBalance(workspaceId: string): Promise<BillingBalance> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/balance", {
      extraHeaders: { "X-Workspace-ID": workspaceId },
    });
    const balance = parseWithFallback(raw, BillingBalanceSchema, EMPTY_BILLING_BALANCE, {
      endpoint: "GET /api/cloud-billing/balance",
    });
    if (balance.workspace_id !== workspaceId) {
      throw new Error("billing balance workspace mismatch");
    }
    return balance;
  }

  async getWorkspaceCreditUsage(workspaceId: string, days: number, projectId: string | null, tz: string) {
    const search = new URLSearchParams({ days: String(days), tz });
    if (projectId) search.set("project_id", projectId);
    const raw = await this.fetch<unknown>(`/api/cloud-billing/usage?${search}`, { extraHeaders: { "X-Workspace-ID": workspaceId } });
    const result = parseWithFallback<{ workspace_id: string; credit_micro: number } | null>(raw, BillingUsageSchema, null, { endpoint: "GET /api/cloud-billing/usage" });
    if (!result || result.workspace_id !== workspaceId) throw new Error("Invalid workspace credit usage response");
    return result;
  }

  async getTokenCreditRate(): Promise<TokenCreditRate> {
    const raw = await this.fetch<unknown>("/api/token-credit-rate");
    return parseWithFallback(raw, TokenCreditRateSchema, EMPTY_TOKEN_CREDIT_RATE, {
      endpoint: "GET /api/token-credit-rate",
    });
  }

  async listCloudBillingTransactions(
    workspaceId: string,
    params?: { page?: number; page_size?: number; cursor?: string },
  ): Promise<BillingTransactionsPage> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set("cursor", params.cursor);
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/transactions${query ? `?${query}` : ""}`,
      { extraHeaders: { "X-Workspace-ID": workspaceId } },
    );
    const page = parseWithFallback(
      raw,
      BillingTransactionsPageSchema,
      EMPTY_BILLING_TRANSACTIONS_PAGE,
      { endpoint: "GET /api/cloud-billing/transactions" },
    );
    if (page.items.some((item) => item.workspace_id !== workspaceId)) {
      throw new Error("billing transactions workspace mismatch");
    }
    return page;
  }

  async listCloudBillingBatches(
    workspaceId: string,
    params?: { page?: number; page_size?: number },
  ): Promise<BillingBatchesPage> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/batches${query ? `?${query}` : ""}`,
      { extraHeaders: { "X-Workspace-ID": workspaceId } },
    );
    const page = parseWithFallback(
      raw,
      BillingBatchesPageSchema,
      EMPTY_BILLING_BATCHES_PAGE,
      { endpoint: "GET /api/cloud-billing/batches" },
    );
    if (page.items.some((item) => item.workspace_id !== workspaceId)) {
      throw new Error("billing batches workspace mismatch");
    }
    return page;
  }

  async listCloudBillingTopups(
    workspaceId: string,
    params?: { page?: number; page_size?: number; cursor?: string },
  ): Promise<BillingTopupsPage> {
    const search = new URLSearchParams();
    if (params?.cursor) search.set("cursor", params.cursor);
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/topups${query ? `?${query}` : ""}`,
      { extraHeaders: { "X-Workspace-ID": workspaceId } },
    );
    const page = parseWithFallback(
      raw,
      BillingTopupsPageSchema,
      EMPTY_BILLING_TOPUPS_PAGE,
      { endpoint: "GET /api/cloud-billing/topups" },
    );
    if (page.items.some((item) => item.workspace_id !== workspaceId)) {
      throw new Error("billing topups workspace mismatch");
    }
    return page;
  }

  async listCloudBillingPriceTiers(workspaceId: string): Promise<BillingPriceTier[]> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/price-tiers", {
      extraHeaders: { "X-Workspace-ID": workspaceId },
    });
    return parseWithFallback(
      raw,
      BillingPriceTierListSchema,
      EMPTY_BILLING_PRICE_TIER_LIST,
      { endpoint: "GET /api/cloud-billing/price-tiers" },
    );
  }

  async createCloudBillingCheckoutSession(
    workspaceId: string,
    data: CreateBillingCheckoutSessionRequest,
  ): Promise<CreateBillingCheckoutSessionResponse> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/checkout-sessions", {
      method: "POST",
      body: JSON.stringify(data),
      extraHeaders: { "Content-Type": "application/json", "X-Workspace-ID": workspaceId },
    });
    const result = parseWithFallback(
      raw,
      CreateBillingCheckoutSessionResponseSchema,
      EMPTY_CREATE_BILLING_CHECKOUT_SESSION_RESPONSE,
      { endpoint: "POST /api/cloud-billing/checkout-sessions" },
    );
    if (result.workspace_id !== workspaceId) {
      throw new Error("billing checkout workspace mismatch");
    }
    return result;
  }

  async getCloudBillingCheckoutSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<BillingCheckoutSessionStatus> {
    // Stripe session ids are `cs_<base62>` so they're URL-safe by
    // construction; encodeURIComponent is paranoia for the case where a
    // future Stripe format change adds a non-alphanumeric character. The
    // server has its own allow-list rejection for unsafe ids.
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/checkout-sessions/${encodeURIComponent(sessionId)}`,
      { extraHeaders: { "X-Workspace-ID": workspaceId } },
    );
    const result = parseWithFallback(
      raw,
      BillingCheckoutSessionStatusSchema,
      EMPTY_BILLING_CHECKOUT_SESSION_STATUS,
      { endpoint: "GET /api/cloud-billing/checkout-sessions/{sessionId}" },
    );
    if (result.workspace_id !== workspaceId) {
      throw new Error("billing checkout workspace mismatch");
    }
    return result;
  }

  async createCloudBillingPortalSession(workspaceId: string): Promise<CreateBillingPortalSessionResponse> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/portal-sessions", {
      method: "POST",
      extraHeaders: { "X-Workspace-ID": workspaceId },
      // Body is intentionally absent — the upstream endpoint requires no
      // payload today.
    });
    return parseWithFallback(
      raw,
      CreateBillingPortalSessionResponseSchema,
      EMPTY_CREATE_BILLING_PORTAL_SESSION_RESPONSE,
      { endpoint: "POST /api/cloud-billing/portal-sessions" },
    );
  }

  async deleteRuntime(runtimeId: string): Promise<void> {
    await this.fetch(`/api/runtimes/${runtimeId}`, { method: "DELETE" });
  }

  // Cascade variant of deleteRuntime. The strict DELETE refuses with
  // structured 409 (`code: "runtime_has_active_agents"`, body carries the
  // blocking agents) when active agents are bound; the front-end then opens
  // the cascade-mode confirmation dialog and submits the user-confirmed
  // active agent set here. Server compares the snapshot to the live set
  // inside the transaction and refuses with `code: "runtime_delete_plan_changed"`
  // (same shape, fresh `active_agents`) if they don't match — caller should
  // re-render the agent list and force the user to re-confirm.
  async archiveAgentsAndDeleteRuntime(
    runtimeId: string,
    expectedActiveAgentIds: string[],
  ): Promise<{ status: string; agents_archived: number; tasks_cancelled: number }> {
    return this.fetch(`/api/runtimes/${runtimeId}/archive-agents-and-delete`, {
      method: "POST",
      body: JSON.stringify({ expected_active_agent_ids: expectedActiveAgentIds }),
    });
  }

  async updateRuntime(
    runtimeId: string,
    patch: {
      visibility?: "private" | "public";
      /**
       * Custom display name. Pass an empty string to clear it (the server
       * reverts to the default name). Omit to leave it unchanged — a JSON
       * `null` is treated as "unchanged", not "clear". See MUL-4217.
       */
      custom_name?: string;
      /** Apply custom_name to every runtime on the same machine. */
      apply_to_machine?: boolean;
    },
  ): Promise<AgentRuntime> {
    return this.fetch(`/api/runtimes/${runtimeId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  // ---------------------------------------------------------------------
  // Custom runtime profiles (MUL-3284). All workspace-scoped: the caller
  // passes the workspace id the same way the runtimes list resolves it.
  // ---------------------------------------------------------------------

  async listRuntimeProfiles(workspaceId: string): Promise<RuntimeProfile[]> {
    const res = await this.fetch<{ runtime_profiles?: RuntimeProfile[] }>(
      `/api/workspaces/${workspaceId}/runtime-profiles`,
    );
    return res.runtime_profiles ?? [];
  }

  async getRuntimeProfile(
    workspaceId: string,
    profileId: string,
  ): Promise<RuntimeProfile> {
    return this.fetch(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
    );
  }

  async createRuntimeProfile(
    workspaceId: string,
    body: CreateRuntimeProfileRequest,
  ): Promise<RuntimeProfile> {
    return this.fetch(`/api/workspaces/${workspaceId}/runtime-profiles`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateRuntimeProfile(
    workspaceId: string,
    profileId: string,
    patch: UpdateRuntimeProfileRequest,
  ): Promise<RuntimeProfile> {
    return this.fetch(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
  }

  async deleteRuntimeProfile(
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    await this.fetch(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
      { method: "DELETE" },
    );
  }

  async getRuntimeUsage(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsage[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    // `tz` drives the calendar-day boundary for the trend chart (Viewing
    // layer). Caller-supplied; the backend falls back to user.timezone /
    // UTC if omitted.
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage?${search}`,
    );
    return parseWithFallback<RuntimeUsage[]>(raw, RuntimeUsageListSchema, [], {
      endpoint: "GET /api/runtimes/:id/usage",
    });
  }

  async getRuntimeTaskActivity(
    runtimeId: string,
    params?: { tz?: string },
  ): Promise<RuntimeHourlyActivity[]> {
    // Hour-of-day heatmap follows the viewer's tz, like the other reports on
    // this page. Pass the viewer's IANA zone so the server buckets correctly.
    const search = new URLSearchParams();
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/activity?${search}`,
    );
    return parseWithFallback<RuntimeHourlyActivity[]>(
      raw,
      RuntimeHourlyActivityListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/activity" },
    );
  }

  async getRuntimeUsageByAgent(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsageByAgent[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage/by-agent?${search}`,
    );
    return parseWithFallback<RuntimeUsageByAgent[]>(
      raw,
      RuntimeUsageByAgentListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/usage/by-agent" },
    );
  }

  async getRuntimeUsageByHour(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsageByHour[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage/by-hour?${search}`,
    );
    return parseWithFallback<RuntimeUsageByHour[]>(
      raw,
      RuntimeUsageByHourListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/usage/by-hour" },
    );
  }

  // ---------------------------------------------------------------------------
  // Workspace dashboard — three independent rollups for `/{slug}/dashboard`.
  // Each accepts an optional `project_id` to narrow the scope to one project.
  // User-facing credits are settled server-side from the immutable task rate
  // snapshot. Provider cost fields remain available for internal operations.
  // ---------------------------------------------------------------------------

  async getDashboardUsageDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardUsageDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/usage/daily?${search}`);
    return parseWithFallback<DashboardUsageDaily[]>(
      raw,
      DashboardUsageDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/usage/daily" },
    );
  }

  async getDashboardUsageByAgent(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardUsageByAgent[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/usage/by-agent?${search}`);
    return parseWithFallback<DashboardUsageByAgent[]>(
      raw,
      DashboardUsageByAgentListSchema,
      [],
      { endpoint: "GET /api/dashboard/usage/by-agent" },
    );
  }

  async getDashboardAgentRunTime(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardAgentRunTime[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` aligns the "last N days" cutoff with the viewer's calendar,
    // matching the per-agent token card.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/agent-runtime?${search}`);
    return parseWithFallback<DashboardAgentRunTime[]>(
      raw,
      DashboardAgentRunTimeListSchema,
      [],
      { endpoint: "GET /api/dashboard/agent-runtime" },
    );
  }

  async getDashboardRunTimeDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardRunTimeDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` cuts the day buckets in the viewer's calendar so Time / Tasks
    // align with the Cost / Tokens charts.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/runtime/daily?${search}`);
    return parseWithFallback<DashboardRunTimeDaily[]>(
      raw,
      DashboardRunTimeDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/runtime/daily" },
    );
  }

  async getDashboardFailuresDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardFailureDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` cuts the day buckets in the viewer's calendar so the Errors chart
    // shares an x-axis with the other four metrics.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/failures/daily?${search}`);
    return parseWithFallback<DashboardFailureDaily[]>(
      raw,
      DashboardFailureDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/failures/daily" },
    );
  }

  async getDashboardFailuresByAgent(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardFailureByAgent[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/failures/by-agent?${search}`);
    return parseWithFallback<DashboardFailureByAgent[]>(
      raw,
      DashboardFailureByAgentListSchema,
      [],
      { endpoint: "GET /api/dashboard/failures/by-agent" },
    );
  }

  async initiateUpdate(
    runtimeId: string,
    targetVersion: string,
  ): Promise<RuntimeUpdate> {
    return this.fetch(`/api/runtimes/${runtimeId}/update`, {
      method: "POST",
      body: JSON.stringify({ target_version: targetVersion }),
    });
  }

  async getUpdateResult(
    runtimeId: string,
    updateId: string,
  ): Promise<RuntimeUpdate> {
    return this.fetch(`/api/runtimes/${runtimeId}/update/${updateId}`);
  }

  async initiateListModels(runtimeId: string): Promise<RuntimeModelListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/models`, { method: "POST" });
  }

  async getListModelsResult(
    runtimeId: string,
    requestId: string,
  ): Promise<RuntimeModelListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/models/${requestId}`);
  }

  async initiateListLocalSkills(
    runtimeId: string,
  ): Promise<RuntimeLocalSkillListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills`, {
      method: "POST",
    });
  }

  async getListLocalSkillsResult(
    runtimeId: string,
    requestId: string,
  ): Promise<RuntimeLocalSkillListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/${requestId}`);
  }

  async initiateImportLocalSkill(
    runtimeId: string,
    data: CreateRuntimeLocalSkillImportRequest,
  ): Promise<RuntimeLocalSkillImportRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/import`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getImportLocalSkillResult(
    runtimeId: string,
    requestId: string,
  ): Promise<RuntimeLocalSkillImportRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/import/${requestId}`);
  }

  async listAgentTasks(agentId: string): Promise<AgentTask[]> {
    return this.fetch(`/api/agents/${agentId}/tasks`);
  }

  // Workspace-scoped agent task snapshot: every active task
  // (queued/dispatched/running) plus each agent's most recent terminal task.
  // Powers the front-end's "active wins, else latest terminal" presence
  // derivation; one fetch backs every per-agent presence read in the app.
  // Workspace is resolved server-side from the X-Workspace-Slug header.
  async getAgentTaskSnapshot(): Promise<AgentTask[]> {
    return this.fetch(`/api/agent-task-snapshot`);
  }

  // Independent workspace-level projection. Unlike the task snapshot, this
  // already deduplicates running agents and returns only the display fields
  // consumers need. Callers may narrow the projection by task source and, for
  // issue work, the authenticated member's My Issues relation.
  // `parentIssueId` narrows the projection to that issue's direct children,
  // which is how the sub-issue header on issue detail reads the same source
  // as the Issues list header. The server rejects combining it with `scope`,
  // so callers pass one or the other.
  async getWorkspaceWorkingAgents(
    type?: WorkspaceWorkingAgentType,
    mineRelation?: WorkspaceWorkingAgentMineRelation,
    parentIssueId?: string,
  ): Promise<WorkspaceWorkingAgent[]> {
    const search = new URLSearchParams();
    if (type) search.set("type", type);
    if (mineRelation) {
      search.set("scope", "mine");
      search.set("relation", mineRelation);
    } else if (parentIssueId) {
      search.set("parent", parentIssueId);
    }
    const query = search.toString();
    return this.fetch(`/api/working-agents${query ? `?${query}` : ""}`);
  }

  // Per-agent daily activity for the last 30 days, anchored on
  // completed_at. One workspace-wide fetch backs both the Agents-list
  // sparkline (uses trailing 7 buckets) and the agent detail "Last 30
  // days" panel (uses all 30).
  async getWorkspaceAgentActivity30d(): Promise<AgentActivityBucket[]> {
    return this.fetch(`/api/agent-activity-30d`);
  }

  // Per-agent 30-day total run count for the Agents-list RUNS column.
  async getWorkspaceAgentRunCounts(): Promise<AgentRunCount[]> {
    return this.fetch(`/api/agent-run-counts`);
  }

  async getActiveTasksForIssue(issueId: string): Promise<{ tasks: AgentTask[] }> {
    return this.fetch(`/api/issues/${issueId}/active-task`);
  }

  async listTaskMessages(taskId: string): Promise<TaskMessagePayload[]> {
    return this.fetch(`/api/tasks/${taskId}/messages`);
  }

  async listTasksByIssue(issueId: string): Promise<AgentTask[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/task-runs`);
    return parseWithFallback<AgentTask[]>(raw, AgentTaskListSchema, [], {
      endpoint: "GET /api/issues/:id/task-runs",
    });
  }

  async getIssueUsage(issueId: string): Promise<IssueUsageSummary> {
    return this.fetch(`/api/issues/${issueId}/usage`);
  }

  async cancelTask(issueId: string, taskId: string): Promise<AgentTask> {
    return this.fetch(`/api/issues/${issueId}/tasks/${taskId}/cancel`, {
      method: "POST",
    });
  }

  async rerunIssue(issueId: string, taskId?: string): Promise<AgentTask> {
    return this.fetch(`/api/issues/${issueId}/rerun`, {
      method: "POST",
      body: JSON.stringify(taskId ? { task_id: taskId } : {}),
    });
  }

  // Inbox
  async listInbox(): Promise<InboxItem[]> {
    return this.fetch("/api/inbox");
  }

  async markInboxRead(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/read`, { method: "POST" });
  }

  async archiveInbox(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/archive`, { method: "POST" });
  }

  // Archived notifications, backing the inbox's "Archived" sub-view. Capped
  // server-side (no pagination in v1). Schema-guarded so a contract drift
  // renders an empty archive instead of taking the inbox down with it.
  async listArchivedInbox(): Promise<InboxItem[]> {
    const raw = await this.fetch<unknown>("/api/inbox/archived");
    return parseWithFallback(raw, InboxItemListSchema, EMPTY_INBOX_ITEMS, {
      endpoint: "GET /api/inbox/archived",
    });
  }

  async unarchiveInbox(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/unarchive`, { method: "POST" });
  }

  async getUnreadInboxCount(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/unread-count");
  }

  // Cross-workspace unread summary: one entry per workspace the user belongs
  // to that has unread inbox items. Backs the workspace-switcher dot for
  // OTHER workspaces. Schema-guarded so a contract drift hides the dot rather
  // than crashing the sidebar.
  async getInboxUnreadSummary(): Promise<InboxWorkspaceUnread[]> {
    const raw = await this.fetch<unknown>("/api/inbox/unread-summary");
    return parseWithFallback(raw, InboxUnreadSummarySchema, EMPTY_INBOX_UNREAD_SUMMARY, {
      endpoint: "GET /api/inbox/unread-summary",
    });
  }

  async markAllInboxRead(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/mark-all-read", { method: "POST" });
  }

  async archiveAllInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-all", { method: "POST" });
  }

  async archiveAllReadInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-all-read", { method: "POST" });
  }

  async archiveCompletedInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-completed", { method: "POST" });
  }

  // Notification preferences
  //
  // `workspaceSlug` overrides the default `X-Workspace-Slug` header (which
  // follows the active workspace) so a caller can read a SPECIFIC workspace's
  // preferences — e.g. honoring the mute setting of the workspace an inbox
  // notification came from while the user is viewing a different one (#3766).
  async getNotificationPreferences(workspaceSlug?: string): Promise<NotificationPreferenceResponse> {
    const raw = await this.fetch<unknown>(
      "/api/notification-preferences",
      workspaceSlug ? { headers: { "X-Workspace-Slug": workspaceSlug } } : undefined,
    );
    return parseWithFallback(
      raw,
      NotificationPreferenceResponseSchema,
      EMPTY_NOTIFICATION_PREFERENCE_RESPONSE,
      { endpoint: "GET /api/notification-preferences" },
    );
  }

  async updateNotificationPreferences(
    preferences: NotificationPreferences,
    workspaceSlug?: string,
  ): Promise<NotificationPreferenceResponse> {
    const raw = await this.fetch<unknown>("/api/notification-preferences", {
      method: "PATCH",
      headers: workspaceSlug
        ? { "X-Workspace-Slug": workspaceSlug }
        : undefined,
      body: JSON.stringify({ preferences }),
    });
    return parseWithFallback(
      raw,
      NotificationPreferenceResponseSchema,
      EMPTY_NOTIFICATION_PREFERENCE_RESPONSE,
      { endpoint: "PATCH /api/notification-preferences" },
    );
  }

  // App Config
  async getConfig(): Promise<AppConfigResponse> {
    const raw = await this.fetch<unknown>("/api/config");
    return parseWithFallback<AppConfigResponse>(raw, AppConfigSchema, EMPTY_APP_CONFIG, {
      endpoint: "GET /api/config",
    });
  }

  // Workspaces
  async listWorkspaces(): Promise<Workspace[]> {
    return this.fetch("/api/workspaces");
  }

  async getWorkspace(id: string): Promise<Workspace> {
    return this.fetch(`/api/workspaces/${id}`);
  }

  async createWorkspace(data: { name: string; slug: string; description?: string; context?: string }): Promise<Workspace> {
    return this.fetch("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWorkspace(id: string, data: { name?: string; description?: string; context?: string; settings?: Record<string, unknown>; repos?: WorkspaceRepo[]; issue_prefix?: string; avatar_url?: string }): Promise<Workspace> {
    return this.fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Members
  async listMembers(workspaceId: string): Promise<MemberWithUser[]> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/members`);
    return parseWithFallback(raw, MemberWithUserListSchema, EMPTY_MEMBERS_WITH_USER, {
      endpoint: "GET /api/workspaces/:id/members",
    });
  }

  async createMember(workspaceId: string, data: CreateMemberRequest): Promise<Invitation> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const result = parseWithFallback<Invitation | null>(raw, MemberInvitationSchema, null, { endpoint: "POST /api/workspaces/:id/members", redactReceived: true });
    if (!result) throw new ApiError("Invalid invitation response", 502, "Bad Gateway");
    return result;
  }

  async updateMember(workspaceId: string, memberId: string, data: UpdateMemberRequest): Promise<MemberWithUser> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    const result = parseWithFallback<MemberWithUser | null>(raw, MemberUpdateResponseSchema, null, { endpoint: "PATCH /api/workspaces/:id/members/:memberId", redactReceived: true });
    if (!result) throw new ApiError("Invalid member response", 502, "Bad Gateway");
    return result;
  }

  async deleteMember(workspaceId: string, memberId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
    });
  }

  async leaveWorkspace(workspaceId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/leave`, {
      method: "POST",
    });
  }

  // Invitations
  async listWorkspaceInvitations(workspaceId: string): Promise<Invitation[]> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/invitations`);
    const result = parseWithFallback<Invitation[] | null>(raw, MemberInvitationListSchema, null, { endpoint: "GET /api/workspaces/:id/invitations", redactReceived: true });
    if (!result) throw new ApiError("Invalid invitations response", 502, "Bad Gateway");
    return result;
  }

  async revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: "DELETE",
    });
  }

  async listMyInvitations(): Promise<Invitation[]> {
    return this.fetch("/api/invitations");
  }

  async getInvitation(invitationId: string): Promise<Invitation> {
    return this.fetch(`/api/invitations/${invitationId}`);
  }

  async acceptInvitation(invitationId: string): Promise<MemberWithUser> {
    return this.fetch(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
    });
  }

  async declineInvitation(invitationId: string): Promise<void> {
    await this.fetch(`/api/invitations/${invitationId}/decline`, {
      method: "POST",
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
  }

  // Skills
  async listSkills(): Promise<SkillSummary[]> {
    return this.fetch("/api/skills");
  }

  async getSkill(id: string): Promise<Skill> {
    return this.fetch(`/api/skills/${id}`);
  }

  async createSkill(data: CreateSkillRequest): Promise<Skill> {
    return this.fetch("/api/skills", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSkill(id: string, data: UpdateSkillRequest): Promise<Skill> {
    return this.fetch(`/api/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSkill(id: string): Promise<void> {
    await this.fetch(`/api/skills/${id}`, { method: "DELETE" });
  }

  async importSkill(data: { url: string }): Promise<Skill> {
    return this.fetch("/api/skills/import", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listAgentSkills(agentId: string): Promise<SkillSummary[]> {
    return this.fetch(`/api/agents/${agentId}/skills`);
  }

  async setAgentSkills(agentId: string, data: SetAgentSkillsRequest): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/skills`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Incremental attach: POST /skills/add only inserts the given ids (the
  // server upserts with ON CONFLICT DO NOTHING), so callers don't need to
  // read the agent's current skill set first.
  async addAgentSkills(agentId: string, data: SetAgentSkillsRequest): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/skills/add`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

	async setAgentSkillEnabled(agentId: string, skillId: string, enabled: boolean): Promise<void> {
		await this.fetch(`/api/agents/${agentId}/skills/${skillId}/enabled`, {
			method: "PUT",
			body: JSON.stringify({ enabled }),
		});
	}

  async setAgentRuntimeSkillEnabled(
    agentId: string,
    data: SetAgentRuntimeSkillEnabledRequest,
  ): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/runtime-skills/enabled`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

	async removeAgentSkill(agentId: string, skillId: string): Promise<void> {
		await this.fetch(`/api/agents/${agentId}/skills/${skillId}`, {
			method: "DELETE",
		});
	}

  // Personal Access Tokens
  async listPersonalAccessTokens(): Promise<PersonalAccessToken[]> {
    return this.fetch("/api/tokens");
  }

  async createPersonalAccessToken(data: CreatePersonalAccessTokenRequest): Promise<CreatePersonalAccessTokenResponse> {
    return this.fetch("/api/tokens", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokePersonalAccessToken(id: string): Promise<void> {
    await this.fetch(`/api/tokens/${id}`, { method: "DELETE" });
  }

  // File Upload & Attachments
  async uploadFile(
    file: File,
    opts?: { issueId?: string; commentId?: string; chatSessionId?: string },
    // Optional abort signal so a module-level upload coordinator (MUL-5181)
    // can cancel an in-flight upload on logout. When aborted, `fetch` rejects
    // with an AbortError, which the coordinator distinguishes from a real
    // failure via `signal.aborted` / `err.name === "AbortError"`.
    signal?: AbortSignal,
  ): Promise<Attachment> {
    const formData = new FormData();
    formData.append("file", file);
    if (opts?.issueId) formData.append("issue_id", opts.issueId);
    if (opts?.commentId) formData.append("comment_id", opts.commentId);
    if (opts?.chatSessionId) formData.append("chat_session_id", opts.chatSessionId);

    const raw = await this.fetchResponse("/api/upload-file", {
      method: "POST",
      body: formData,
      signal,
      timeoutMs: this.options.transferTimeoutMs ?? 120_000,
    }, (response) => response.json());
    return parseWithFallback(raw, AttachmentResponseSchema, EMPTY_ATTACHMENT, {
      endpoint: "POST /api/upload-file",
    });
  }

  async getContractReview(id: string): Promise<ContractReview> {
    const endpoint = `/api/contract-reviews/${encodeURIComponent(id)}`;
    const raw = await this.fetch<unknown>(endpoint);
    const result = parseWithFallback<ContractReview | null>(raw, contractReviewSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid contract review response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async listSessionApplications(target?: { kind: "member" | "agent"; id: string }): Promise<Applications> {
    const endpoint = `/api/session-applications${target ? `?${new URLSearchParams({ target_kind: target.kind, target_id: target.id })}` : ""}`;
    const raw = await this.fetch<unknown>(endpoint);
    const result = parseWithFallback<Applications | null>(raw, applicationsSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid application response", 502, "Bad Gateway");
    return result;
  }
  async saveSessionApplication(input: ApplicationWrite, id?: string): Promise<SessionApplication> {
    const endpoint = `/api/session-applications${id ? `/${encodeURIComponent(id)}` : ""}`;
    const raw = await this.fetch<unknown>(endpoint, { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
    const result = parseWithFallback<SessionApplication | null>(raw, sessionApplicationSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid application receipt", 502, "Bad Gateway");
    return result;
  }
  async deleteSessionApplication(id: string, version: number): Promise<void> {
    await this.fetch(`/api/session-applications/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ version }) });
  }

  private async submitContractReview(endpoint: string, input: CreateContractReviewInput | ContractActionInput, files: File[]): Promise<ContractReview> {
    const body = new FormData(); body.append("request", JSON.stringify(input));
    for (const file of files) body.append("files", file);
    const raw = await this.fetchResponse(endpoint, { method: "POST", body, timeoutMs: this.options.transferTimeoutMs ?? 120_000 }, (response) => response.json());
    const result = parseWithFallback<ContractReview | null>(raw, contractReviewSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid contract review response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async createContractReview(input: CreateContractReviewInput, files: File[]): Promise<ContractReview> {
    return this.submitContractReview("/api/contract-reviews", input, files);
  }
  async contractReviewAction(id: string, input: ContractActionInput, files: File[]): Promise<ContractReview> {
    return this.submitContractReview(`/api/contract-reviews/${encodeURIComponent(id)}/actions`, input, files);
  }
  async markContractReviewRead(id: string, version: number): Promise<void> {
    await this.fetch(`/api/contract-reviews/${encodeURIComponent(id)}/read`, { method: "POST", body: JSON.stringify({ version }) });
  }
  async downloadContractReviewFile(id: string): Promise<Blob> {
    return this.fetchResponse(`/api/contract-review-files/${encodeURIComponent(id)}/download`, undefined, (response) => response.blob());
  }

  async listTeamActivity(workspaceId: string): Promise<TeamActivity[]> {
    const endpoint = "/api/team/activity";
    const raw = await this.fetch<unknown>(endpoint, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    return parseWithFallback(raw, teamActivitySchema, [], { endpoint, redactReceived: true });
  }

  async listDirectMessages(workspaceId: string, sessionId: string, before: number | null): Promise<DirectMessagesPage> {
    const endpoint = `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/page?kind=direct`;
    const raw = await this.fetch<unknown>(`${endpoint}${before ? `&before=${before}` : ""}`, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    const result = parseWithFallback<DirectMessagesPage | null>(raw, directMessagesPageSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid message response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async listDirectSessions(workspaceId: string, peerUserId: string, cursor: string | null): Promise<SessionsPage<DirectSession>> {
    const endpoint = `/api/chat/sessions?kind=direct&peer_user_id=${encodeURIComponent(peerUserId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const raw = await this.fetch<unknown>(endpoint, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    const result = parseWithFallback<SessionsPage<DirectSession> | null>(raw, directSessionsPageSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid session response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async getDirectSession(workspaceId: string, sessionId: string): Promise<DirectSession> {
    const endpoint = `/api/chat/sessions/${encodeURIComponent(sessionId)}?kind=direct`;
    const raw = await this.fetch<unknown>(endpoint, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    const result = parseWithFallback<DirectSession | null>(raw, directSessionSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid session response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async sendDirectMessage(workspaceId: string, sessionId: string, data: { content: string; client_message_id: string; peer_user_id?: string }): Promise<DirectSendResult> {
    const endpoint = data.peer_user_id ? "/api/chat/sessions" : `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?kind=direct`;
    const raw = await this.fetch<unknown>(endpoint, { method: "POST", body: JSON.stringify({ ...data, kind: "direct", session_id: sessionId }), extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    const result = parseWithFallback<DirectSendResult | null>(raw, directSendSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid message response. Retry to confirm delivery.", 502, "Bad Gateway");
    return result;
  }

  async markDirectMessagesRead(workspaceId: string, sessionId: string, sequence: number): Promise<void> {
    await this.fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/read?kind=direct`, { method: "POST", body: JSON.stringify({ sequence }), extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
  }

  async listScopedAgentSessions(workspaceId: string, agentId: string, cursor: string | null, status = "all"): Promise<SessionsPage<ChatSession>> {
    const endpoint = `/api/chat/sessions?agent_id=${encodeURIComponent(agentId)}&status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const raw = await this.fetch<unknown>(endpoint, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    const result = parseWithFallback<SessionsPage<ChatSession> | null>(raw, agentSessionsPageSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid session response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  // Chat Sessions
  async listChatSessions(params?: { status?: string }): Promise<ChatSession[]> {
    const query = params?.status ? `?status=${params.status}` : "";
    return this.fetch(`/api/chat/sessions${query}`);
  }

  async getChatSession(id: string, workspaceId?: string): Promise<ChatSession> {
    const endpoint = `/api/chat/sessions/${id}`;
    const raw = await this.fetch<unknown>(endpoint, { ...(workspaceId ? { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } } : {}) });
    const result = parseWithFallback<ChatSession | null>(raw, agentSessionSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid session response. Please retry.", 502, "Bad Gateway");
    return result;
  }

  async createChatSession(data: {
    session_id?: string;
    agent_id: string;
    title?: string;
    project_id?: string | null;
    context_resources?: UpsertChatContextResourceInput[];
  }, workspaceId?: string): Promise<ChatSession> {
    const endpoint = "/api/chat/sessions";
    const raw = await this.fetch<unknown>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
      ...(workspaceId ? { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } } : {}),
    });
    const result = parseWithFallback<ChatSession | null>(raw, agentSessionSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid session response. Retry to confirm creation.", 502, "Bad Gateway");
    return result;
  }

  async deleteChatSession(id: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
  }

  async updateChatSession(
    id: string,
    data: { title: string } | { project_id: string | null },
  ): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async setChatSessionPinned(id: string, pinned: boolean): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    });
  }

  async setChatSessionArchived(id: string, archived: boolean): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    });
  }

  async listChatContextResources(sessionId: string): Promise<ChatContextResource[]> {
    const raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/resources`);
    return parseWithFallback(
      raw,
      ChatContextResourceListSchema,
      EMPTY_CHAT_CONTEXT_RESOURCES,
      { endpoint: "GET /api/chat/sessions/:id/resources" },
    );
  }

  async upsertChatContextResource(
    sessionId: string,
    data: UpsertChatContextResourceInput,
  ): Promise<ChatContextResource> {
    const raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/resources`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      ChatContextResourceSchema,
      {
        id: "",
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        resource_version: data.resource_version,
        label: data.label,
        source: data.source ?? "page",
        created_at: "",
        updated_at: "",
      },
      { endpoint: "PUT /api/chat/sessions/:id/resources" },
    );
  }

  async deleteChatContextResource(sessionId: string, contextId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/resources/${contextId}`, {
      method: "DELETE",
    });
  }

  // Quick-agent bar: per-user pinned agents.
  async listChatPinnedAgents(): Promise<ChatPinnedAgent[]> {
    return this.fetch("/api/chat/pinned-agents");
  }

  async pinChatAgent(agentId: string): Promise<ChatPinnedAgent> {
    return this.fetch("/api/chat/pinned-agents", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    });
  }

  async unpinChatAgent(agentId: string): Promise<void> {
    await this.fetch(`/api/chat/pinned-agents/${agentId}`, { method: "DELETE" });
  }

  async listChatMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.fetch(`/api/chat/sessions/${sessionId}/messages`);
  }

  async listChatMessagesPage(
    sessionId: string,
    params: { before?: { created_at: string; id: string } | null; limit?: number } = {},
  ): Promise<ChatMessagesPage> {
    const limit = params.limit ?? 50;
    const query = new URLSearchParams({ limit: String(limit) });
    if (params.before) {
      query.set("before_created_at", params.before.created_at);
      query.set("before_id", params.before.id);
    }
    try {
      return await this.fetch(
        `/api/chat/sessions/${sessionId}/messages/page?${query.toString()}`,
      );
    } catch (err) {
      // Deployment-order compatibility: a backend deployed before this endpoint
      // existed returns 404 for the unknown route. Fall back to the legacy
      // full-list endpoint so chat never white-screens regardless of whether
      // the server or the client deploys first. Only the initial (cursorless)
      // page falls back — the legacy endpoint returns every message at once, so
      // the fallback page reports has_more: false and there is no follow-up
      // request to translate. A 404 on a cursor request is an unexpected state
      // and propagates instead of duplicating the whole list.
      if (err instanceof ApiError && err.status === 404 && !params.before) {
        const messages = await this.listChatMessages(sessionId);
        return { messages, limit, has_more: false, next_cursor: null };
      }
      throw err;
    }
  }

  async sendChatMessage(
    sessionId: string,
    content: string,
    attachmentIds?: string[],
    clientMessageId?: string,
    workspaceId?: string,
  ): Promise<SendChatMessageResponse> {
    const body: { content: string; attachment_ids?: string[]; client_message_id?: string } = { content, client_message_id: clientMessageId };
    if (attachmentIds && attachmentIds.length > 0) {
      body.attachment_ids = attachmentIds;
    }
    const endpoint = `/api/chat/sessions/${sessionId}/messages`;
    const raw = await this.fetch<unknown>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      ...(workspaceId ? { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } } : {}),
    });
    const result = parseWithFallback<SendChatMessageResponse | null>(raw, sendChatMessageSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid message response. Retry to confirm delivery.", 502, "Bad Gateway");
    return result;
  }

  async getPendingChatTask(sessionId: string): Promise<ChatPendingTask> {
    return this.fetch(`/api/chat/sessions/${sessionId}/pending-task`);
  }

  /**
   * Pending deferred-cancellation draft restores for a session (#5219).
   * A 404 means the backend predates the endpoint — treat as "nothing
   * pending" so older servers never error the composer.
   */
  async listChatDraftRestores(sessionId: string): Promise<ChatDraftRestoresResponse> {
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/draft-restores`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { restores: [] };
      }
      throw err;
    }
    return parseWithFallback(raw, ChatDraftRestoresResponseSchema, EMPTY_CHAT_DRAFT_RESTORES, {
      endpoint: "GET /api/chat/sessions/{id}/draft-restores",
    });
  }

  /** Idempotent consume — deleting an already-consumed restore is a 204 no-op. */
  async consumeChatDraftRestore(sessionId: string, restoreId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/draft-restores/${restoreId}`, {
      method: "DELETE",
    });
  }

  async listPendingChatTasks(): Promise<PendingChatTasksResponse> {
    return this.fetch(`/api/chat/pending-tasks`);
  }

  async hasAnyPendingChatTasks(): Promise<HasPendingChatTasksResponse> {
    return this.fetch(`/api/chat/pending-tasks/has-any`);
  }

  async markChatSessionRead(sessionId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/read`, { method: "POST" });
  }

  // Advertises the durable draft-restore capability (#5219). The server only
  // defers the empty-transcript judgment — and therefore only withholds the
  // synchronous restore from the response — for clients that send this; without
  // it we would be treated as a pre-#5219 client and get the legacy behaviour.
  async cancelTaskById(taskId: string): Promise<CancelTaskResponse> {
    const raw = await this.fetch<unknown>(`/api/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: { "X-Client-Capabilities": CHAT_DRAFT_RESTORE_CAPABILITY },
    });
    return parseWithFallback(raw, CancelTaskResponseSchema, EMPTY_CANCEL_TASK_RESPONSE, {
      endpoint: "POST /api/tasks/{taskId}/cancel",
    });
  }

  async listAttachments(issueId: string): Promise<Attachment[]> {
    return this.fetch(`/api/issues/${issueId}/attachments`);
  }

  // Fetches a fresh attachment metadata record. The server re-signs
  // `download_url` on every call (30 min expiry), so the click-time
  // download flow uses this endpoint to avoid handing the user a stale
  // signed URL cached in TanStack Query.
  async getAttachment(id: string): Promise<Attachment> {
    const raw = await this.fetch<unknown>(`/api/attachments/${id}`);
    return parseWithFallback(raw, AttachmentResponseSchema, EMPTY_ATTACHMENT, {
      endpoint: "GET /api/attachments/{id}",
    });
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.fetch(`/api/attachments/${id}`, { method: "DELETE" });
  }

  // Fetches the raw bytes of a text-previewable attachment.
  //
  // The endpoint sidesteps CloudFront CORS (not configured on the CDN) and
  // bypasses Content-Disposition: attachment for the `text/*` family, both
  // of which would otherwise prevent the renderer from getting the body.
  // The server always replies with `text/plain; charset=utf-8` for safety;
  // the original MIME ships back in the `X-Original-Content-Type` header so
  // the preview dispatcher can choose between markdown / html / plain code.
  //
  // Routes through `fetchResponse` so it inherits the standard auth headers,
  // 401 → handleUnauthorized recovery, request-id logging, and ApiError
  // shape. 413 / 415 are translated to typed `Preview*Error` instances so
  // the modal can render specific fallbacks instead of generic failure.
  async getAttachmentTextContent(
    id: string,
  ): Promise<{ text: string; originalContentType: string }> {
    try {
      return await this.fetchResponse(`/api/attachments/${id}/content`, undefined, async (response) => ({
        text: await response.text(),
        originalContentType: response.headers.get("X-Original-Content-Type") ?? "",
      }));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 413) throw new PreviewTooLargeError();
        if (err.status === 415) throw new PreviewUnsupportedError();
      }
      throw err;
    }
  }

  async listProjectWorkflows(): Promise<ProjectWorkflow[]> {
    const endpoint = "/api/projects/workflows";
    const raw = await this.fetch<unknown>(endpoint);
    const result = parseWithFallback<ProjectWorkflow[] | null>(raw, projectWorkflowListSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid project list response", 502, "Bad Gateway");
    return result;
  }

  async getProjectWorkflow(id: string): Promise<ProjectWorkflow> {
    const endpoint = `/api/projects/${encodeURIComponent(id)}/workflow`;
    const raw = await this.fetch<unknown>(endpoint);
    const result = parseWithFallback<ProjectWorkflow | null>(raw, projectWorkflowSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid project response", 502, "Bad Gateway");
    return result;
  }

  async projectWorkflowAction(id: string, input: ProjectWorkflowAction): Promise<ProjectWorkflow> {
    const endpoint = `/api/projects/${encodeURIComponent(id)}/workflow`;
    const raw = await this.fetch<unknown>(endpoint, { method: "POST", body: JSON.stringify(input) });
    const result = parseWithFallback<ProjectWorkflow | null>(raw, projectWorkflowSchema, null, { endpoint, redactReceived: true });
    if (!result) throw new ApiError("Invalid project action receipt", 502, "Bad Gateway");
    return result;
  }

  // Projects
  async listProjects(params?: { status?: string }): Promise<ListProjectsResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    return this.fetch(`/api/projects?${search}`);
  }

  async getProject(id: string): Promise<Project> {
    return this.fetch(`/api/projects/${id}`);
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    const raw = await this.fetch<unknown>("/api/projects", { method: "POST", body: JSON.stringify(data) });
    const result = parseWithFallback<Project | null>(raw, ProjectSchema, null, { endpoint: "/api/projects", redactReceived: true });
    if (!result) throw new ApiError("Invalid project create receipt", 502, "Bad Gateway");
    return result;
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    return this.fetch(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.fetch(`/api/projects/${id}`, { method: "DELETE" });
  }

  // Project resources
  async listProjectResources(
    projectId: string,
  ): Promise<ListProjectResourcesResponse> {
    return this.fetch(`/api/projects/${projectId}/resources`);
  }

  async createProjectResource(
    projectId: string,
    data: CreateProjectResourceRequest,
  ): Promise<ProjectResource> {
    return this.fetch(`/api/projects/${projectId}/resources`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProjectResource(
    projectId: string,
    resourceId: string,
    data: UpdateProjectResourceRequest,
  ): Promise<ProjectResource> {
    return this.fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProjectResource(
    projectId: string,
    resourceId: string,
  ): Promise<void> {
    await this.fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
      method: "DELETE",
    });
  }

  // Labels
  async listLabels(resourceType: LabelResourceType = "issue"): Promise<ListLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/labels?resource_type=${resourceType}`);
    return parseWithFallback(raw, ListLabelsResponseSchema, EMPTY_LIST_LABELS_RESPONSE, {
      endpoint: "GET /api/labels",
    });
  }

  async getLabel(id: string): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels/${id}`);
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "GET /api/labels/{id}",
    });
  }

  async createLabel(data: CreateLabelRequest): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "POST /api/labels",
    });
  }

  async updateLabel(id: string, data: UpdateLabelRequest): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "PUT /api/labels/{id}",
    });
  }

  async deleteLabel(id: string): Promise<void> {
    await this.fetch(`/api/labels/${id}`, { method: "DELETE" });
  }

  // Custom issue properties
  async listProperties(includeArchived = false): Promise<ListPropertiesResponse> {
    const suffix = includeArchived ? "?include_archived=true" : "";
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/properties${suffix}`);
    } catch (error) {
      // A backend predating custom properties 404s here (e.g. after a
      // server-only rollback). Treat it as an empty catalog: the property
      // UI sections disappear and the active-catalog reconciliation strips
      // persisted property sorts/filters, so no property params ever reach
      // the old server. Other errors keep normal query-error semantics.
      if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) {
        return EMPTY_LIST_PROPERTIES_RESPONSE;
      }
      throw error;
    }
    return parseWithFallback(raw, ListPropertiesResponseSchema, EMPTY_LIST_PROPERTIES_RESPONSE, {
      endpoint: "GET /api/properties",
    });
  }

  async createProperty(data: CreatePropertyRequest): Promise<IssueProperty> {
    const raw = await this.fetch<unknown>(`/api/properties`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssuePropertySchema, EMPTY_ISSUE_PROPERTY, {
      endpoint: "POST /api/properties",
    });
  }

  async updateProperty(id: string, data: UpdatePropertyRequest): Promise<IssueProperty> {
    const raw = await this.fetch<unknown>(`/api/properties/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssuePropertySchema, EMPTY_ISSUE_PROPERTY, {
      endpoint: "PATCH /api/properties/{id}",
    });
  }

  async setIssueProperty(issueId: string, propertyId: string, value: IssuePropertyValue): Promise<IssuePropertiesResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/properties/${propertyId}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    return parseWithFallback(raw, IssuePropertiesResponseSchema, EMPTY_ISSUE_PROPERTIES_RESPONSE, {
      endpoint: "PUT /api/issues/{id}/properties/{propertyId}",
    });
  }

  async unsetIssueProperty(issueId: string, propertyId: string): Promise<IssuePropertiesResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/properties/${propertyId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, IssuePropertiesResponseSchema, EMPTY_ISSUE_PROPERTIES_RESPONSE, {
      endpoint: "DELETE /api/issues/{id}/properties/{propertyId}",
    });
  }

  async listLabelsForIssue(issueId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels`);
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "GET /api/issues/{id}/labels",
    });
  }

  async attachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels`, {
      method: "POST",
      body: JSON.stringify({ label_id: labelId }),
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "POST /api/issues/{id}/labels",
    });
  }

  async detachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels/${labelId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "DELETE /api/issues/{id}/labels/{labelId}",
    });
  }

  async listLabelsForResource(
    resourceType: "agent" | "skill",
    resourceId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels`);
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `GET /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels`,
    });
  }

  async attachLabelToResource(
    resourceType: "agent" | "skill",
    resourceId: string,
    labelId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels`, {
      method: "POST",
      body: JSON.stringify({ label_id: labelId }),
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `POST /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels`,
    });
  }

  async detachLabelFromResource(
    resourceType: "agent" | "skill",
    resourceId: string,
    labelId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels/${labelId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `DELETE /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels/{labelId}`,
    });
  }

  // Pins
  async listPins(): Promise<PinnedItem[]> {
    return this.fetch("/api/pins");
  }

  async createPin(data: CreatePinRequest): Promise<PinnedItem> {
    return this.fetch("/api/pins", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deletePin(itemType: PinnedItemType, itemId: string): Promise<void> {
    await this.fetch(`/api/pins/${itemType}/${itemId}`, { method: "DELETE" });
  }

  async reorderPins(data: ReorderPinsRequest): Promise<void> {
    await this.fetch("/api/pins/reorder", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Squads
  async listSquads(): Promise<Squad[]> {
    const raw = await this.fetch<unknown>(`/api/squads`);
    return parseWithFallback(raw, SquadListSchema, EMPTY_SQUAD_LIST, {
      endpoint: "GET /api/squads",
    }) as Squad[];
  }

  async getSquad(id: string): Promise<Squad> {
    const raw = await this.fetch<unknown>(`/api/squads/${id}`);
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "GET /api/squads/:id",
    }) as Squad;
  }

  async createSquad(data: { name: string; description?: string; leader_id: string; avatar_url?: string }): Promise<Squad> {
    const raw = await this.fetch<unknown>("/api/squads", { method: "POST", body: JSON.stringify(data) });
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "POST /api/squads",
    }) as Squad;
  }

  async updateSquad(id: string, data: { name?: string; description?: string; instructions?: string; leader_id?: string; avatar_url?: string }): Promise<Squad> {
    const raw = await this.fetch<unknown>(`/api/squads/${id}`, { method: "PUT", body: JSON.stringify(data) });
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "PUT /api/squads/:id",
    }) as Squad;
  }

  async deleteSquad(id: string): Promise<void> {
    await this.fetch(`/api/squads/${id}`, { method: "DELETE" });
  }

  async listSquadMembers(squadId: string): Promise<SquadMember[]> {
    return this.fetch(`/api/squads/${squadId}/members`);
  }

  async addSquadMember(squadId: string, data: { member_type: string; member_id: string; role?: string }): Promise<SquadMember> {
    return this.fetch(`/api/squads/${squadId}/members`, { method: "POST", body: JSON.stringify(data) });
  }

  async removeSquadMember(squadId: string, data: { member_type: string; member_id: string }): Promise<void> {
    await this.fetch(`/api/squads/${squadId}/members`, { method: "DELETE", body: JSON.stringify(data) });
  }

  async updateSquadMemberRole(squadId: string, data: { member_type: string; member_id: string; role: string }): Promise<SquadMember> {
    return this.fetch(`/api/squads/${squadId}/members/role`, { method: "PATCH", body: JSON.stringify(data) });
  }

  // Per-squad members status snapshot: one row per member with derived
  // working/idle/offline/unstable plus the issues each agent is currently
  // running. Parsed with a lenient schema so a new server-side status
  // value or extra field can't white-screen the Squad page (#2143).
  async getSquadMemberStatus(squadId: string): Promise<SquadMemberStatusListResponse> {
    const raw = await this.fetch<unknown>(`/api/squads/${squadId}/members/status`);
    return parseWithFallback(raw, SquadMemberStatusListResponseSchema, EMPTY_SQUAD_MEMBER_STATUS_LIST, {
      endpoint: "GET /api/squads/:id/members/status",
    }) as SquadMemberStatusListResponse;
  }

  // Autopilots
  async listAutopilots(params?: { status?: string }): Promise<ListAutopilotsResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    const raw = await this.fetch<unknown>(`/api/autopilots?${search}`);
    return parseWithFallback(
      raw,
      ListAutopilotsResponseSchema,
      EMPTY_LIST_AUTOPILOTS_RESPONSE as ListAutopilotsResponse,
      { endpoint: "GET /api/autopilots" },
    );
  }

  async getAutopilot(id: string): Promise<GetAutopilotResponse> {
    return this.fetch(`/api/autopilots/${id}`);
  }

  async createAutopilot(data: CreateAutopilotRequest): Promise<Autopilot> {
    return this.fetch("/api/autopilots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAutopilot(id: string, data: UpdateAutopilotRequest): Promise<Autopilot> {
    return this.fetch(`/api/autopilots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteAutopilot(id: string): Promise<void> {
    await this.fetch(`/api/autopilots/${id}`, { method: "DELETE" });
  }

  // Grant a workspace member explicit write access to the autopilot. Both
  // grant and revoke return the full updated collaborator list so callers can
  // refresh without a second round-trip.
  async grantAutopilotAccess(id: string, userId: string): Promise<AutopilotCollaboratorsResponse> {
    return this.fetch(`/api/autopilots/${id}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async revokeAutopilotAccess(id: string, userId: string): Promise<AutopilotCollaboratorsResponse> {
    return this.fetch(`/api/autopilots/${id}/collaborators/${userId}`, {
      method: "DELETE",
    });
  }

  async triggerAutopilot(id: string): Promise<AutopilotRun> {
    // Manual "run now" returns 200 even when admission blocks the run (status
    // skipped/failed). The UI branches on status/reason_code to avoid a
    // false-success toast (MUL-4525), so parse defensively rather than casting.
    const raw = await this.fetch<unknown>(`/api/autopilots/${id}/trigger`, { method: "POST" });
    return parseWithFallback(raw, AutopilotRunSchema, FALLBACK_AUTOPILOT_RUN, {
      endpoint: "POST /api/autopilots/:id/trigger",
    });
  }

  async listAutopilotRuns(id: string, params?: { limit?: number; offset?: number }): Promise<ListAutopilotRunsResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", params.limit.toString());
    if (params?.offset) search.set("offset", params.offset.toString());
    return this.fetch(`/api/autopilots/${id}/runs?${search}`);
  }

  // Returns a single run including its full trigger_payload. List responses
  // omit trigger_payload to keep them small (a webhook envelope can be
  // up to 256 KiB × limit rows), so the detail view fetches via this route.
  async getAutopilotRun(autopilotId: string, runId: string): Promise<AutopilotRun> {
    return this.fetch(`/api/autopilots/${autopilotId}/runs/${runId}`);
  }

  async createAutopilotTrigger(autopilotId: string, data: CreateAutopilotTriggerRequest): Promise<AutopilotTrigger> {
    return this.fetch(`/api/autopilots/${autopilotId}/triggers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAutopilotTrigger(autopilotId: string, triggerId: string, data: UpdateAutopilotTriggerRequest): Promise<AutopilotTrigger> {
    return this.fetch(`/api/autopilots/${autopilotId}/triggers/${triggerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteAutopilotTrigger(autopilotId: string, triggerId: string): Promise<void> {
    await this.fetch(`/api/autopilots/${autopilotId}/triggers/${triggerId}`, { method: "DELETE" });
  }

  async cronPreview(params: { expr: string; tz: string }): Promise<CronPreviewResponse> {
    const search = new URLSearchParams();
    search.set("expr", params.expr);
    search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/autopilots/cron-preview?${search}`);
    return parseWithFallback(
      raw,
      CronPreviewResponseSchema,
      UNREADABLE_CRON_PREVIEW_RESPONSE,
      { endpoint: "GET /api/autopilots/cron-preview" },
    );
  }

  async rotateAutopilotTriggerWebhookToken(
    autopilotId: string,
    triggerId: string,
  ): Promise<AutopilotTrigger> {
    return this.fetch(
      `/api/autopilots/${autopilotId}/triggers/${triggerId}/rotate-webhook-token`,
      { method: "POST" },
    );
  }

  // Webhook deliveries — list is slim (no raw_body / selected_headers /
  // response_body); detail returns the full row. Both responses are parsed
  // through a lenient schema so an unknown server-side `status` /
  // `signature_status` value degrades to a generic row instead of dropping
  // the whole list.
  async listAutopilotDeliveries(
    autopilotId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<ListWebhookDeliveriesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", params.limit.toString());
    if (params?.offset) search.set("offset", params.offset.toString());
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries?${search}`,
    );
    return parseWithFallback(
      raw,
      ListWebhookDeliveriesResponseSchema,
      EMPTY_LIST_WEBHOOK_DELIVERIES_RESPONSE,
      { endpoint: "GET /api/autopilots/:id/deliveries" },
    );
  }

  async getAutopilotDelivery(
    autopilotId: string,
    deliveryId: string,
  ): Promise<WebhookDelivery> {
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries/${deliveryId}`,
    );
    return parseWithFallback(
      raw,
      WebhookDeliveryResponseSchema,
      { ...EMPTY_WEBHOOK_DELIVERY, id: deliveryId, autopilot_id: autopilotId },
      { endpoint: "GET /api/autopilots/:id/deliveries/:deliveryId" },
    );
  }

  // Replay creates a NEW delivery row referencing the original via
  // `replayed_from_delivery_id`. Server rejects replays of
  // signature-invalid / rejected deliveries with 400 — the UI keeps the
  // button disabled for those rows, but the server is the source of truth.
  async replayAutopilotDelivery(
    autopilotId: string,
    deliveryId: string,
  ): Promise<WebhookDelivery> {
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries/${deliveryId}/replay`,
      { method: "POST" },
    );
    return parseWithFallback(
      raw,
      WebhookDeliveryResponseSchema,
      { ...EMPTY_WEBHOOK_DELIVERY, autopilot_id: autopilotId },
      { endpoint: "POST /api/autopilots/:id/deliveries/:deliveryId/replay" },
    );
  }

  // GitHub integration
  async getGitHubConnectURL(
    workspaceId: string,
    returnTo?: "github" | "repositories",
  ): Promise<GitHubConnectResponse> {
    const search = new URLSearchParams();
    if (returnTo) search.set("return_to", returnTo);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/connect${suffix}`,
    );
    return parseWithFallback(
      raw,
      GitHubConnectResponseSchema,
      EMPTY_GITHUB_CONNECT_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/connect" },
    );
  }

  async listGitHubInstallations(workspaceId: string): Promise<ListGitHubInstallationsResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/installations`,
    );
    return parseWithFallback(
      raw,
      ListGitHubInstallationsResponseSchema,
      EMPTY_LIST_GITHUB_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/installations" },
    );
  }

  async listGitHubInstallationRepositories(
    workspaceId: string,
    installationId: string,
    params: { page?: number; per_page?: number } = {},
  ): Promise<ListGitHubRepositoriesResponse> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.per_page !== undefined) search.set("per_page", String(params.per_page));
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/installations/${installationId}/repositories${suffix}`,
    );
    return parseWithFallback(
      raw,
      ListGitHubRepositoriesResponseSchema,
      EMPTY_LIST_GITHUB_REPOSITORIES_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/installations/:installationId/repositories" },
    );
  }

  async deleteGitHubInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/github/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async listIssuePullRequests(issueId: string): Promise<{ pull_requests: GitHubPullRequest[] }> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/pull-requests`);
    return parseWithFallback(
      raw,
      IssuePullRequestsResponseSchema,
      EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
      { endpoint: "GET /api/issues/:id/pull-requests" },
    );
  }

  // VCS integration (Forgejo / Gitea / GitLab)
  async listVCSConnections(workspaceId: string): Promise<ListVCSConnectionsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/vcs/connections`);
    return parseWithFallback(
      raw,
      ListVCSConnectionsResponseSchema,
      EMPTY_LIST_VCS_CONNECTIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/vcs/connections" },
    );
  }

  async connectVCS(
    workspaceId: string,
    body: ConnectVCSRequest,
  ): Promise<ConnectVCSResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/vcs/connections`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseWithFallback(raw, ConnectVCSResponseSchema, EMPTY_CONNECT_VCS_RESPONSE, {
      endpoint: "POST /api/workspaces/:id/vcs/connections",
    });
  }

  async deleteVCSConnection(workspaceId: string, connectionId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/vcs/connections/${connectionId}`, {
      method: "DELETE",
    });
  }

  async rotateVCSWebhook(
    workspaceId: string,
    connectionId: string,
  ): Promise<ConnectVCSResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/vcs/connections/${connectionId}/rotate-webhook`,
      { method: "POST" },
    );
    return parseWithFallback(raw, ConnectVCSResponseSchema, EMPTY_CONNECT_VCS_RESPONSE, {
      endpoint: "POST /api/workspaces/:id/vcs/connections/:connectionId/rotate-webhook",
    });
  }

  // Lark integration
  async listLarkInstallations(workspaceId: string): Promise<ListLarkInstallationsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/lark/installations`);
    return parseWithFallback(
      raw,
      ListLarkInstallationsResponseSchema,
      EMPTY_LIST_LARK_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/lark/installations" },
    );
  }

  async beginLarkInstall(
    workspaceId: string,
    agentId: string,
    region: "feishu" | "lark",
  ): Promise<BeginLarkInstallResponse> {
    // The user picks the cloud explicitly in the UI ("Bind to Feishu"
    // vs "Bind to Lark"), and the backend POSTs the device-flow `begin`
    // against the corresponding accounts host (accounts.feishu.cn vs
    // accounts.larksuite.com) so the QR renders against the right
    // cloud up front. Empty / omitted region still resolves to Feishu
    // server-side (RegionOrDefault) — we surface region as a required
    // arg here so every call site is forced to make a deliberate
    // choice rather than silently defaulting to mainland.
    const search = new URLSearchParams({ agent_id: agentId, region });
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/lark/install/begin?${search.toString()}`, {
      method: "POST",
    });
    return parseWithFallback(raw, BeginLarkInstallResponseSchema, EMPTY_BEGIN_LARK_INSTALL_RESPONSE, {
      endpoint: "POST /api/workspaces/:id/lark/install/begin",
    });
  }

  async getLarkInstallStatus(workspaceId: string, sessionId: string): Promise<LarkInstallStatusResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/lark/install/${sessionId}/status`);
    return parseWithFallback(raw, LarkInstallStatusResponseSchema, EMPTY_LARK_INSTALL_STATUS_RESPONSE, {
      endpoint: "GET /api/workspaces/:id/lark/install/:sessionId/status",
    });
  }

  async deleteLarkInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/lark/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemLarkBindingToken(token: string): Promise<RedeemLarkBindingTokenResponse> {
    return this.fetch(`/api/lark/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  // Composio integration (MUL-3720). All routes are user-scoped (a connection
  // belongs to a user, not a workspace), so none take a workspaceId.

  /** The project's connectable Composio toolkits (those with an enabled auth
   * config). Since MUL-4009 the backend filters out non-connectable toolkits,
   * so every entry has `connectable: true`. A resolver/upstream failure is a
   * 502 rather than an empty list. */
  async listComposioToolkits(): Promise<ComposioToolkit[]> {
    const raw = await this.fetch<unknown>(`/api/integrations/composio/toolkits`);
    return parseWithFallback(raw, ComposioToolkitListSchema, EMPTY_COMPOSIO_TOOLKIT_LIST, {
      endpoint: "GET /api/integrations/composio/toolkits",
    });
  }

  /** The caller's active Composio connections. */
  async listComposioConnections(): Promise<ComposioConnection[]> {
    const raw = await this.fetch<unknown>(`/api/integrations/composio/connections`);
    return parseWithFallback(raw, ComposioConnectionListSchema, EMPTY_COMPOSIO_CONNECTION_LIST, {
      endpoint: "GET /api/integrations/composio/connections",
    });
  }

  /** Starts a hosted Composio connect flow for a toolkit and returns the
   * redirect URL the browser should be sent to. The optional returnPath is a
   * site-relative path the browser is redirected to after the Composio
   * callback (e.g. "/connections"); omit it to use the default
   * Connections page. */
  async beginComposioConnect(
    toolkitSlug: string,
    returnPath?: string,
  ): Promise<ComposioConnectInitResponse> {
    const raw = await this.fetch<unknown>(`/api/integrations/composio/connect/init`, {
      method: "POST",
      body: JSON.stringify(
        returnPath
          ? { toolkit_slug: toolkitSlug, return_path: returnPath }
          : { toolkit_slug: toolkitSlug },
      ),
    });
    return parseWithFallback(raw, ComposioConnectInitResponseSchema, EMPTY_COMPOSIO_CONNECT_INIT_RESPONSE, {
      endpoint: "POST /api/integrations/composio/connect/init",
    });
  }

  /** Disconnects a Composio connection the caller owns. */
  async deleteComposioConnection(connectionId: string): Promise<void> {
    await this.fetch(`/api/integrations/composio/connections/${connectionId}`, {
      method: "DELETE",
    });
  }

  // Native Gmail. Credentials belong to the current user while analysis
  // routing is resolved from the active workspace header.
  async listOutboundEmails(workspaceId: string, filters: { chat_session_id?: string; lead_id?: string }): Promise<OutboundEmail[]> {
    const search = new URLSearchParams();
    if (filters.chat_session_id) search.set("chat_session_id", filters.chat_session_id);
    if (filters.lead_id) search.set("lead_id", filters.lead_id);
    const raw = await this.fetch<unknown>(`/api/outbound-emails/?${search}`, { extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" } });
    return parseWithFallback(raw, OutboundEmailListSchema, [], { endpoint: "GET /api/outbound-emails", redactReceived: true });
  }

  async updateOutboundEmail(workspaceId: string, id: string, version: number, draft: EmailDraft): Promise<OutboundEmail> {
    const raw = await this.fetch<unknown>(`/api/outbound-emails/${encodeURIComponent(id)}`, {
      method: "PATCH", extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" }, body: JSON.stringify({ ...draft, expected_version: version }),
    });
    const email = parseWithFallback<OutboundEmail | null>(raw, OutboundEmailSchema, null, { endpoint: "PATCH /api/outbound-emails/:id", redactReceived: true });
    if (!email) throw new Error("Invalid email response");
    return email;
  }

  async sendOutboundEmail(workspaceId: string, id: string, version: number): Promise<OutboundEmail> {
    const raw = await this.fetch<unknown>(`/api/outbound-emails/${encodeURIComponent(id)}/send`, {
      method: "POST", extraHeaders: { "X-Workspace-ID": workspaceId, "X-Workspace-Slug": "" }, body: JSON.stringify({ expected_version: version }),
    });
    const email = parseWithFallback<OutboundEmail | null>(raw, OutboundEmailSchema, null, { endpoint: "POST /api/outbound-emails/:id/send", redactReceived: true });
    if (!email) throw new Error("Invalid email response");
    return email;
  }

  async listGmailConnections(): Promise<ListGmailConnectionsResponse> {
    const raw = await this.fetch<unknown>(`/api/integrations/gmail/connections`);
    return parseWithFallback(
      raw,
      ListGmailConnectionsResponseSchema,
      EMPTY_LIST_GMAIL_CONNECTIONS_RESPONSE,
      { endpoint: "GET /api/integrations/gmail/connections", redactReceived: true },
    );
  }

  async beginGmailConnect(returnPath?: string): Promise<GmailConnectInitResponse> {
    const raw = await this.fetch<unknown>(`/api/integrations/gmail/connect/init`, {
      method: "POST",
      body: JSON.stringify(returnPath ? { return_path: returnPath } : {}),
    });
    return parseWithFallback(
      raw,
      GmailConnectInitResponseSchema,
      EMPTY_GMAIL_CONNECT_INIT_RESPONSE,
      { endpoint: "POST /api/integrations/gmail/connect/init", redactReceived: true },
    );
  }

  async updateGmailAnalysis(connectionId: string, enabled: boolean): Promise<void> {
    await this.fetch(`/api/integrations/gmail/connections/${encodeURIComponent(connectionId)}/analysis`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  }

  async deleteGmailConnection(connectionId: string): Promise<void> {
    await this.fetch(`/api/integrations/gmail/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
  }

  // Slack integration (MUL-3666)
  async listSlackInstallations(workspaceId: string): Promise<ListSlackInstallationsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/slack/installations`);
    return parseWithFallback(
      raw,
      ListSlackInstallationsResponseSchema,
      EMPTY_LIST_SLACK_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/slack/installations" },
    );
  }

  // registerSlackBYO performs a bring-your-own-app install: the admin pastes the
  // bot token (xoxb-) + app-level token (xapp-) of the Slack app they created,
  // and the backend validates + persists it, returning the new installation.
  async registerSlackBYO(
    workspaceId: string,
    agentId: string,
    body: RegisterSlackBYORequest,
  ): Promise<SlackInstallation> {
    const search = new URLSearchParams({ agent_id: agentId });
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/slack/install/byo?${search.toString()}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseWithFallback(raw, SlackInstallationResponseSchema, EMPTY_SLACK_INSTALLATION_RESPONSE, {
      endpoint: "POST /api/workspaces/:id/slack/install/byo",
    });
  }

  async deleteSlackInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/slack/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemSlackBindingToken(token: string): Promise<RedeemSlackBindingTokenResponse> {
    return this.fetch(`/api/slack/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async redditConnections(wsId: string) {
    const raw = await this.fetch<unknown>("/api/reddit/connections", {
      extraHeaders: { "X-Workspace-ID": wsId },
    });
    return parseWithFallback(
      raw,
      redditConnectionsSchema,
      {
        configured: false,
        connections: [] as import("../reddit/schemas").RedditConnection[],
      },
      { endpoint: "reddit/connections", redactReceived: true },
    );
  }
  async redditConnect(wsId: string, connectionId: string, canReply: boolean) {
    const raw = await this.fetch<unknown>("/api/reddit/connect", {
      method: "POST",
      extraHeaders: { "X-Workspace-ID": wsId },
      body: JSON.stringify({
        connection_id: connectionId,
        can_reply: canReply,
      }),
    });
    const result = parseWithFallback(
      raw,
      redditAuthorizationSchema,
      { url: "" },
      { endpoint: "reddit/connect", redactReceived: true },
    );
    if (!result.url) throw new Error("reddit_invalid_response");
    return result;
  }
  async redditDisconnect(wsId: string, id: string) {
    await this.fetch(`/api/reddit/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
      extraHeaders: { "X-Workspace-ID": wsId },
    });
  }
  async redditRead(
    wsId: string,
    kind: "search" | "thread",
    params: Record<string, string>,
  ) {
    const raw = await this.fetch<unknown>(
      `/api/reddit/${kind}?${new URLSearchParams(params)}`,
      { extraHeaders: { "X-Workspace-ID": wsId } },
    );
    return parseWithFallback(raw, redditPageSchema, emptyRedditPage, {
      endpoint: `reddit/${kind}`,
      redactReceived: true,
    });
  }
  async redditDrafts(wsId: string) {
    const raw = await this.fetch<unknown>("/api/reddit/drafts", {
      extraHeaders: { "X-Workspace-ID": wsId },
    });
    return parseWithFallback(raw, redditDraftListSchema, [] as RedditDraft[], {
      endpoint: "reddit/drafts",
      redactReceived: true,
    });
  }
  async redditSaveDraft(wsId: string, input: RedditDraftInput, id?: string) {
    const path = id
      ? `/api/reddit/drafts/${encodeURIComponent(id)}`
      : "/api/reddit/drafts";
    const raw = await this.fetch<unknown>(path, {
      method: id ? "PATCH" : "POST",
      extraHeaders: { "X-Workspace-ID": wsId },
      body: JSON.stringify(input),
    });
    const result = parseWithFallback<RedditDraft | null>(
      raw,
      redditDraftSchema,
      null,
      { endpoint: path, redactReceived: true },
    );
    if (!result) throw new Error("reddit_invalid_response");
    return result;
  }
  async redditDraftAction(
    wsId: string,
    id: string,
    action: "approve" | "cancel" | "verify",
    expectedVersion: number,
    fullname = "",
  ) {
    const raw = await this.fetch<unknown>(
      `/api/reddit/drafts/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        extraHeaders: { "X-Workspace-ID": wsId },
        body: JSON.stringify({ expected_version: expectedVersion, fullname }),
      },
    );
    if (action === "cancel") return null;
    const result = parseWithFallback<RedditDraft | null>(
      raw,
      redditDraftSchema,
      null,
      { endpoint: `reddit/drafts/${action}`, redactReceived: true },
    );
    if (!result) throw new Error("reddit_invalid_response");
    return result;
  }

  // ---------------------------------------------------------------------------
  // Company context — shared draft, immutable releases, and AI proposals.
  // ---------------------------------------------------------------------------

  async getBusinessContext(): Promise<BusinessContextState> {
    const raw = await this.fetch<unknown>("/api/company");
    return parseWithFallback(raw, BusinessContextStateSchema, EMPTY_BUSINESS_CONTEXT, {
      endpoint: "GET /api/company",
    });
  }

  async saveBusinessDraft(input: SaveBusinessDraftInput): Promise<BusinessContextState> {
    const raw = await this.fetch<unknown>("/api/company/draft", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return parseWithFallback(raw, BusinessContextStateSchema, EMPTY_BUSINESS_CONTEXT, {
      endpoint: "PATCH /api/company/draft",
    });
  }

  async saveBusinessProfile(input: SaveBusinessProfileInput): Promise<BusinessContextState> {
    const raw = await this.fetch<unknown>("/api/company/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return parseWithFallback(raw, BusinessContextStateSchema, EMPTY_BUSINESS_CONTEXT, {
      endpoint: "PATCH /api/company/profile",
    });
  }

  async publishBusiness(input: PublishBusinessInput): Promise<PublishBusinessResponse> {
    const raw = await this.fetch<unknown>("/api/company/publish", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return parseWithFallback(raw, PublishBusinessResponseSchema, EMPTY_PUBLISH_BUSINESS_RESPONSE, {
      endpoint: "POST /api/company/publish",
    });
  }

  async listBusinessReleases(): Promise<ListBusinessReleasesResponse> {
    const raw = await this.fetch<unknown>("/api/company/releases");
    return parseWithFallback(raw, ListBusinessReleasesResponseSchema, EMPTY_LIST_BUSINESS_RELEASES_RESPONSE, {
      endpoint: "GET /api/company/releases",
    });
  }

  async listBusinessProposals(status = "pending"): Promise<ListBusinessProposalsResponse> {
    const search = new URLSearchParams();
    if (status) search.set("status", status);
    const raw = await this.fetch<unknown>(`/api/company/proposals?${search.toString()}`);
    return parseWithFallback(raw, ListBusinessProposalsResponseSchema, EMPTY_LIST_BUSINESS_PROPOSALS_RESPONSE, {
      endpoint: "GET /api/company/proposals",
    });
  }

  async getBusinessProposal(id: string): Promise<BusinessChangeProposal> {
    const raw = await this.fetch<unknown>(`/api/company/proposals/${encodeURIComponent(id)}`);
    return parseWithFallback(raw, BusinessChangeProposalSchema, EMPTY_BUSINESS_PROPOSAL, {
      endpoint: "GET /api/company/proposals/:id",
    });
  }

  async applyBusinessProposal(id: string, expectedRevision: number): Promise<ApplyBusinessProposalResponse> {
    const raw = await this.fetch<unknown>(`/api/company/proposals/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: expectedRevision }),
    });
    return parseWithFallback(raw, ApplyBusinessProposalResponseSchema, EMPTY_APPLY_BUSINESS_PROPOSAL_RESPONSE, {
      endpoint: "POST /api/company/proposals/:id/apply",
    });
  }

  async rejectBusinessProposal(id: string, reason: string): Promise<BusinessChangeProposal> {
    const raw = await this.fetch<unknown>(`/api/company/proposals/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return parseWithFallback(raw, BusinessChangeProposalSchema, EMPTY_BUSINESS_PROPOSAL, {
      endpoint: "POST /api/company/proposals/:id/reject",
    });
  }
  async getWorkspaceOpenAgentConfig(workspaceId: string): Promise<WorkspaceOpenAgentConfig> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${encodeURIComponent(workspaceId)}/openagent/config`);
    const parsed = parseWithFallback(raw, WorkspaceOpenAgentConfigSchema.nullable(), null, { endpoint: "GET /api/workspaces/:id/openagent/config" });
    if (!parsed) throw new ApiError("Invalid OpenAgent configuration", 502, "Bad Gateway");
    return parsed;
  }
  async updateWorkspaceOpenAgentConfig(workspaceId: string, input: WorkspaceOpenAgentConfigInput): Promise<WorkspaceOpenAgentConfig> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${encodeURIComponent(workspaceId)}/openagent/config`, { method: "PUT", body: JSON.stringify(input) });
    const parsed = parseWithFallback(raw, WorkspaceOpenAgentConfigSchema.nullable(), null, { endpoint: "PUT /api/workspaces/:id/openagent/config" });
    if (!parsed) throw new ApiError("Invalid OpenAgent configuration", 502, "Bad Gateway");
    return parsed;
  }
  async testWorkspaceOpenAgentConfig(workspaceId: string, input: WorkspaceOpenAgentConfigInput): Promise<void> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${encodeURIComponent(workspaceId)}/openagent/test`, { method: "POST", body: JSON.stringify(input) });
    const result = parseWithFallback<WorkspaceOpenAgentConnectionTestResult | null>(raw, WorkspaceOpenAgentConnectionTestSchema.nullable(), null, { endpoint: "POST /api/workspaces/:id/openagent/test", redactReceived: true });
    if (!result) throw new ApiError("Invalid connection test response", 502, "Bad Gateway");
    if (result.ok === false) throw new ApiError(result.error, 422, "Connection test failed", result);
  }

}
