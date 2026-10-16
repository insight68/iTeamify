export interface BusinessOffer {
  id: string;
  name: string;
  summary: string;
  outcomes: string[];
  deliverables: string[];
  typical_timeline: string;
  pricing_note: string;
  fit_notes: string;
  audience_ids?: string[];
}

export interface BusinessPersona {
  id: string;
  name: string;
  titles: string[];
  role: string;
  buying_role?: string;
  goals: string[];
  pain_points: string[];
  objections: string[];
  channels: string[];
}

export interface BusinessAudience {
  id: string;
  name: string;
  description: string;
  industries: string[];
  company_sizes: string[];
  geographies: string[];
  pain_points: string[];
  buying_triggers: string[];
  must_haves: string[];
  exclusions: string[];
  buyer_personas: BusinessPersona[];
  priority?: string;
}

export interface BusinessProof {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  offer_ids?: string[];
}

export interface BusinessSource {
  id: string;
  title: string;
  url: string;
  notes: string;
}

export interface BusinessContent {
  /**
   * Compatibility field retained for immutable releases and older clients.
   * New UI treats workspace.name as the canonical company name and writes it
   * here when the live profile is saved.
   */
  business_name: string;
  brand_name: string;
  website_url: string;
  summary: string;
  positioning: string;
  differentiators: string[];
  principles: string[];
  exclusions: string[];
  offers: BusinessOffer[];
  audiences: BusinessAudience[];
  proof: BusinessProof[];
  sources: BusinessSource[];
}

export interface BusinessValidationIssue {
  path: string;
  message: string;
}

export interface BusinessContextState {
  id: string;
  workspace_id: string;
  draft_revision: number;
  published_version: number;
  draft: BusinessContent;
  published: BusinessContent | null;
  has_unpublished_changes: boolean;
  updated_at: string;
  published_at: string | null;
  validation_issues: BusinessValidationIssue[];
}

export interface BusinessRelease {
  id: string;
  workspace_id: string;
  version: number;
  draft_revision: number;
  content: BusinessContent;
  change_summary: string;
  published_by_user_id: string;
  published_at: string;
}

export interface BusinessChangeOperation {
  op: "add" | "replace" | "remove" | string;
  path: string;
  value?: unknown;
  reason?: string;
}

export interface BusinessSourceRef {
  type: string;
  id?: string;
  label?: string;
  url?: string;
}

export interface BusinessChangeProposal {
  id: string;
  workspace_id: string;
  chat_session_id: string | null;
  source_task_id: string | null;
  base_revision: number;
  title: string;
  rationale: string;
  operations: BusinessChangeOperation[];
  source_refs: BusinessSourceRef[];
  status: string;
  created_by_actor_type: string;
  created_by_actor_id: string | null;
  applied_revision: number | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListBusinessReleasesResponse {
  releases: BusinessRelease[];
}

export interface ListBusinessProposalsResponse {
  proposals: BusinessChangeProposal[];
}

export interface SaveBusinessDraftInput {
  expected_revision: number;
  content: BusinessContent;
}

export interface SaveBusinessProfileInput {
  expected_revision: number;
  content: BusinessContent;
  change_summary?: string;
}

export interface PublishBusinessInput {
  expected_revision: number;
  change_summary: string;
}

export interface PublishBusinessResponse {
  release: BusinessRelease;
  context: BusinessContextState;
}

export interface ApplyBusinessProposalResponse {
  proposal: BusinessChangeProposal;
  context: BusinessContextState;
}
