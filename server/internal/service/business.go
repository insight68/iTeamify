package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"reflect"
	"sort"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const maxBusinessContentBytes = 512 << 10
const maxCompanyProjectionCacheEntries = 512

var (
	ErrBusinessConflict        = errors.New("business context changed; refresh and try again")
	ErrBusinessNotFound        = errors.New("business context not found")
	ErrBusinessInvalid         = errors.New("company profile contains invalid fields")
	ErrBusinessIncomplete      = errors.New("business context is not ready to publish")
	ErrBusinessProposalInvalid = errors.New("business change proposal is invalid")
	ErrBusinessProposalStale   = errors.New("business change proposal is stale")
	ErrCompanyContextInvalid   = errors.New("company context query is invalid")
)

// BusinessContent is the stable, agent-readable contract stored in each
// business release. Drafts may be incomplete; published releases pass the
// stricter ValidateBusinessContent checks below.
type BusinessContent struct {
	BusinessName    string             `json:"business_name"`
	BrandName       string             `json:"brand_name"`
	WebsiteURL      string             `json:"website_url"`
	Summary         string             `json:"summary"`
	Positioning     string             `json:"positioning"`
	Differentiators []string           `json:"differentiators"`
	Principles      []string           `json:"principles"`
	Exclusions      []string           `json:"exclusions"`
	Offers          []BusinessOffer    `json:"offers"`
	Audiences       []BusinessAudience `json:"audiences"`
	Proof           []BusinessProof    `json:"proof"`
	Sources         []BusinessSource   `json:"sources"`
}

type BusinessOffer struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Summary         string   `json:"summary"`
	Outcomes        []string `json:"outcomes"`
	Deliverables    []string `json:"deliverables"`
	TypicalTimeline string   `json:"typical_timeline"`
	PricingNote     string   `json:"pricing_note"`
	FitNotes        string   `json:"fit_notes"`
	AudienceIDs     []string `json:"audience_ids"`
}

type BusinessAudience struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Industries     []string          `json:"industries"`
	CompanySizes   []string          `json:"company_sizes"`
	Geographies    []string          `json:"geographies"`
	PainPoints     []string          `json:"pain_points"`
	BuyingTriggers []string          `json:"buying_triggers"`
	MustHaves      []string          `json:"must_haves"`
	Exclusions     []string          `json:"exclusions"`
	BuyerPersonas  []BusinessPersona `json:"buyer_personas"`
	Priority       string            `json:"priority"`
}

type BusinessPersona struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Titles     []string `json:"titles"`
	Role       string   `json:"role"`
	Goals      []string `json:"goals"`
	PainPoints []string `json:"pain_points"`
	Objections []string `json:"objections"`
	Channels   []string `json:"channels"`
	BuyingRole string   `json:"buying_role"`
}

type BusinessProof struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	SourceURL string   `json:"source_url"`
	OfferIDs  []string `json:"offer_ids"`
}

type BusinessSource struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
	Notes string `json:"notes"`
}

var CompanyContextScopes = []string{
	"identity",
	"positioning",
	"offers",
	"audiences",
	"personas",
	"boundaries",
	"proof",
	"sources",
}

var companyContextScopeSet = map[string]struct{}{
	"identity": {}, "positioning": {}, "offers": {}, "audiences": {},
	"personas": {}, "boundaries": {}, "proof": {}, "sources": {},
}

// CompanyContextQuery is the task-scoped retrieval contract. A production
// agent must request explicit scopes; object filters and query text can then
// reduce larger collections without exposing unrelated company facts.
type CompanyContextQuery struct {
	Scopes      []string `json:"scopes"`
	OfferIDs    []string `json:"offer_ids,omitempty"`
	AudienceIDs []string `json:"audience_ids,omitempty"`
	PersonaIDs  []string `json:"persona_ids,omitempty"`
	Query       string   `json:"query,omitempty"`
	MaxItems    int      `json:"max_items,omitempty"`
}

type CompanyContextReleaseRef struct {
	ID          string `json:"id"`
	Version     int32  `json:"version"`
	PublishedAt string `json:"published_at"`
}

type CompanyContextSourceRef struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url,omitempty"`
}

type CompanyAudiencePersonas struct {
	AudienceID   string            `json:"audience_id"`
	AudienceName string            `json:"audience_name"`
	Personas     []BusinessPersona `json:"personas"`
}

type CompanyContextProjection struct {
	CompanyRelease  CompanyContextReleaseRef  `json:"company_release"`
	RequestedScopes []string                  `json:"requested_scopes"`
	Content         map[string]any            `json:"content"`
	SourceRefs      []CompanyContextSourceRef `json:"source_refs"`
	OmittedScopes   []string                  `json:"omitted_scopes"`
	Truncated       bool                      `json:"truncated"`
	ContentHash     string                    `json:"content_hash"`
}

type BusinessValidationIssue struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

type BusinessContextState struct {
	ID                    string                    `json:"id"`
	WorkspaceID           string                    `json:"workspace_id"`
	DraftRevision         int32                     `json:"draft_revision"`
	PublishedVersion      int32                     `json:"published_version"`
	Draft                 BusinessContent           `json:"draft"`
	Published             *BusinessContent          `json:"published"`
	HasUnpublishedChanges bool                      `json:"has_unpublished_changes"`
	UpdatedAt             string                    `json:"updated_at"`
	PublishedAt           *string                   `json:"published_at"`
	ValidationIssues      []BusinessValidationIssue `json:"validation_issues"`
}

type BusinessReleaseView struct {
	ID                string          `json:"id"`
	WorkspaceID       string          `json:"workspace_id"`
	Version           int32           `json:"version"`
	DraftRevision     int32           `json:"draft_revision"`
	Content           BusinessContent `json:"content"`
	ChangeSummary     string          `json:"change_summary"`
	PublishedByUserID string          `json:"published_by_user_id"`
	PublishedAt       string          `json:"published_at"`
}

type BusinessChangeOperation struct {
	Op     string          `json:"op"`
	Path   string          `json:"path"`
	Value  json.RawMessage `json:"value,omitempty"`
	Reason string          `json:"reason,omitempty"`
}

// BusinessOperationValidationError preserves the exact operation contract
// violation while still unwrapping to ErrBusinessProposalInvalid for existing
// callers and status-code mapping.
type BusinessOperationValidationError struct {
	OperationIndex int
	Field          string
	Path           string
	Expected       string
	Actual         string
	Detail         string
}

func (e *BusinessOperationValidationError) Error() string {
	location := fmt.Sprintf("operations[%d].%s", e.OperationIndex, e.Field)
	if e.Field == "value" && e.Path != "" {
		location += " for " + e.Path
	}
	message := fmt.Sprintf("%s: expected %s, got %s", location, e.Expected, e.Actual)
	if e.Detail != "" {
		message += ": " + e.Detail
	}
	return ErrBusinessProposalInvalid.Error() + ": " + message
}

func (e *BusinessOperationValidationError) Unwrap() error {
	return ErrBusinessProposalInvalid
}

type BusinessSourceRef struct {
	Type  string `json:"type"`
	ID    string `json:"id,omitempty"`
	Label string `json:"label,omitempty"`
	URL   string `json:"url,omitempty"`
}

type CreateBusinessProposalInput struct {
	BaseRevision int32                     `json:"base_revision"`
	Title        string                    `json:"title"`
	Rationale    string                    `json:"rationale"`
	Operations   []BusinessChangeOperation `json:"operations"`
	SourceRefs   []BusinessSourceRef       `json:"source_refs"`
}

type BusinessProposalView struct {
	ID                 string                    `json:"id"`
	WorkspaceID        string                    `json:"workspace_id"`
	ChatSessionID      *string                   `json:"chat_session_id"`
	SourceTaskID       *string                   `json:"source_task_id"`
	BaseRevision       int32                     `json:"base_revision"`
	Title              string                    `json:"title"`
	Rationale          string                    `json:"rationale"`
	Operations         []BusinessChangeOperation `json:"operations"`
	SourceRefs         []BusinessSourceRef       `json:"source_refs"`
	Status             string                    `json:"status"`
	CreatedByActorType string                    `json:"created_by_actor_type"`
	CreatedByActorID   *string                   `json:"created_by_actor_id"`
	AppliedRevision    *int32                    `json:"applied_revision"`
	RejectedReason     *string                   `json:"rejected_reason"`
	CreatedAt          string                    `json:"created_at"`
	UpdatedAt          string                    `json:"updated_at"`
}

type BusinessService struct {
	Queries   *db.Queries
	TxStarter TxStarter
	// Company releases are immutable, so a projection is safe to reuse for
	// the exact same release/query pair without an invalidation path. The
	// bounded map prevents arbitrary text filters from growing process memory.
	companyProjectionMu    sync.RWMutex
	companyProjectionCache map[string]CompanyContextProjection
}

func NewBusinessService(queries *db.Queries, txStarter TxStarter) *BusinessService {
	return &BusinessService{
		Queries: queries, TxStarter: txStarter,
		companyProjectionCache: make(map[string]CompanyContextProjection),
	}
}

func EmptyBusinessContent() BusinessContent {
	return normalizeBusinessContent(BusinessContent{})
}

func (s *BusinessService) Get(ctx context.Context, workspaceID pgtype.UUID) (BusinessContextState, error) {
	row, err := s.Queries.GetBusinessContext(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessContextState{
			WorkspaceID:      util.UUIDToString(workspaceID),
			Draft:            EmptyBusinessContent(),
			ValidationIssues: ValidateBusinessContent(EmptyBusinessContent(), true),
		}, nil
	}
	if err != nil {
		return BusinessContextState{}, fmt.Errorf("get business context: %w", err)
	}
	return businessContextState(row)
}

func (s *BusinessService) SaveDraft(ctx context.Context, workspaceID, userID pgtype.UUID, expectedRevision int32, content BusinessContent) (BusinessContextState, error) {
	content = normalizeBusinessContent(content)
	encoded, err := encodeBusinessContent(content)
	if err != nil {
		return BusinessContextState{}, err
	}
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return BusinessContextState{}, fmt.Errorf("begin business draft update: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	qtx := s.Queries.WithTx(tx)
	row, err := saveBusinessDraftInTx(ctx, qtx, workspaceID, userID, expectedRevision, encoded)
	if err != nil {
		return BusinessContextState{}, err
	}
	if _, err := qtx.MarkStaleBusinessChangeProposals(ctx, db.MarkStaleBusinessChangeProposalsParams{
		WorkspaceID:  workspaceID,
		BaseRevision: row.DraftRevision,
	}); err != nil {
		return BusinessContextState{}, fmt.Errorf("mark stale business proposals: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessContextState{}, fmt.Errorf("commit business draft update: %w", err)
	}
	return businessContextState(row)
}

// SaveProfile updates the single live Company profile and creates an internal
// immutable snapshot in one transaction. The snapshot is infrastructure for
// task reproducibility; users never need to publish or manage versions.
func (s *BusinessService) SaveProfile(ctx context.Context, workspaceID, userID pgtype.UUID, expectedRevision int32, content BusinessContent, changeSummary string) (BusinessContextState, error) {
	workspace, err := s.Queries.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return BusinessContextState{}, fmt.Errorf("get company identity: %w", err)
	}
	// workspace.name is the canonical company name. Keep the compatibility
	// field populated in live releases so older task snapshots and clients
	// continue to receive a stable name without exposing a second editable
	// company-name field in the product.
	content.BusinessName = workspace.Name
	content = normalizeBusinessContent(content)
	if issues := ValidateBusinessContent(content, false); len(issues) > 0 {
		return BusinessContextState{}, ErrBusinessInvalid
	}
	encoded, err := encodeBusinessContent(content)
	if err != nil {
		return BusinessContextState{}, err
	}
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return BusinessContextState{}, fmt.Errorf("begin company profile update: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	qtx := s.Queries.WithTx(tx)
	updated, err := saveBusinessDraftInTx(ctx, qtx, workspaceID, userID, expectedRevision, encoded)
	if err != nil {
		return BusinessContextState{}, err
	}
	published, err := qtx.PublishBusinessContext(ctx, db.PublishBusinessContextParams{
		WorkspaceID: workspaceID, PublishedByUserID: userID, DraftRevision: updated.DraftRevision,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessContextState{}, ErrBusinessConflict
	}
	if err != nil {
		return BusinessContextState{}, fmt.Errorf("activate company profile: %w", err)
	}
	if _, err := qtx.CreateBusinessRelease(ctx, db.CreateBusinessReleaseParams{
		WorkspaceID:       workspaceID,
		Version:           published.PublishedVersion,
		DraftRevision:     published.DraftRevision,
		Content:           published.PublishedContent,
		ChangeSummary:     strings.TrimSpace(changeSummary),
		PublishedByUserID: userID,
		PublishedAt:       published.PublishedAt,
	}); err != nil {
		return BusinessContextState{}, fmt.Errorf("snapshot company profile: %w", err)
	}
	if _, err := qtx.MarkStaleBusinessChangeProposals(ctx, db.MarkStaleBusinessChangeProposalsParams{
		WorkspaceID: workspaceID, BaseRevision: published.DraftRevision,
	}); err != nil {
		return BusinessContextState{}, fmt.Errorf("archive stale company proposals: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessContextState{}, fmt.Errorf("commit company profile update: %w", err)
	}
	return businessContextState(published)
}

// UpdateProfile applies user-confirmed top-level changes from a maintenance
// Chat directly to the live profile. The exact revision prevents an agent
// from overwriting a newer manual edit.
func (s *BusinessService) UpdateProfile(ctx context.Context, workspaceID, userID pgtype.UUID, input CreateBusinessProposalInput) (BusinessContextState, error) {
	state, content, err := s.PreviewProfileUpdate(ctx, workspaceID, input)
	if err != nil {
		return BusinessContextState{}, err
	}
	return s.SaveProfile(ctx, workspaceID, userID, state.DraftRevision, content, input.Title)
}

// PreviewProfileUpdate runs the exact validation and in-memory apply path used
// by UpdateProfile without writing. Resource previews call this method so a
// successful preview cannot later fail because the same operation has an
// invalid path or value shape.
func (s *BusinessService) PreviewProfileUpdate(ctx context.Context, workspaceID pgtype.UUID, input CreateBusinessProposalInput) (BusinessContextState, BusinessContent, error) {
	if err := validateBusinessChangeInput(input); err != nil {
		return BusinessContextState{}, BusinessContent{}, err
	}
	state, err := s.Get(ctx, workspaceID)
	if err != nil {
		return BusinessContextState{}, BusinessContent{}, err
	}
	if state.DraftRevision != input.BaseRevision {
		return BusinessContextState{}, BusinessContent{}, ErrBusinessConflict
	}
	content, err := applyBusinessOperations(state.Draft, input.Operations)
	if err != nil {
		return BusinessContextState{}, BusinessContent{}, err
	}
	return state, content, nil
}

func saveBusinessDraftInTx(ctx context.Context, qtx *db.Queries, workspaceID, userID pgtype.UUID, expectedRevision int32, encoded []byte) (db.BusinessContext, error) {
	current, err := qtx.LockBusinessContext(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		if expectedRevision != 0 {
			return db.BusinessContext{}, ErrBusinessConflict
		}
		created, createErr := qtx.CreateBusinessContextDraft(ctx, db.CreateBusinessContextDraftParams{
			WorkspaceID: workspaceID, DraftContent: encoded, UpdatedByUserID: userID,
		})
		if createErr != nil {
			return db.BusinessContext{}, fmt.Errorf("create business draft: %w", createErr)
		}
		return created, nil
	}
	if err != nil {
		return db.BusinessContext{}, fmt.Errorf("lock business context: %w", err)
	}
	if current.DraftRevision != expectedRevision {
		return db.BusinessContext{}, ErrBusinessConflict
	}
	updated, err := qtx.UpdateBusinessContextDraft(ctx, db.UpdateBusinessContextDraftParams{
		WorkspaceID: workspaceID, DraftContent: encoded,
		UpdatedByUserID: userID, DraftRevision: expectedRevision,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.BusinessContext{}, ErrBusinessConflict
	}
	if err != nil {
		return db.BusinessContext{}, fmt.Errorf("update business draft: %w", err)
	}
	return updated, nil
}

func (s *BusinessService) Publish(ctx context.Context, workspaceID, userID pgtype.UUID, expectedRevision int32, changeSummary string) (BusinessReleaseView, BusinessContextState, error) {
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, fmt.Errorf("begin business publish: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	qtx := s.Queries.WithTx(tx)
	current, err := qtx.LockBusinessContext(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessReleaseView{}, BusinessContextState{}, ErrBusinessNotFound
	}
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, fmt.Errorf("lock business context: %w", err)
	}
	if current.DraftRevision != expectedRevision {
		return BusinessReleaseView{}, BusinessContextState{}, ErrBusinessConflict
	}
	content, err := decodeBusinessContent(current.DraftContent)
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, err
	}
	if issues := ValidateBusinessContent(content, true); len(issues) > 0 {
		return BusinessReleaseView{}, BusinessContextState{}, ErrBusinessIncomplete
	}
	published, err := qtx.PublishBusinessContext(ctx, db.PublishBusinessContextParams{
		WorkspaceID: workspaceID, PublishedByUserID: userID, DraftRevision: expectedRevision,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessReleaseView{}, BusinessContextState{}, ErrBusinessConflict
	}
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, fmt.Errorf("publish business context: %w", err)
	}
	release, err := qtx.CreateBusinessRelease(ctx, db.CreateBusinessReleaseParams{
		WorkspaceID:       workspaceID,
		Version:           published.PublishedVersion,
		DraftRevision:     published.DraftRevision,
		Content:           published.PublishedContent,
		ChangeSummary:     strings.TrimSpace(changeSummary),
		PublishedByUserID: userID,
		PublishedAt:       published.PublishedAt,
	})
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, fmt.Errorf("create business release: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, fmt.Errorf("commit business publish: %w", err)
	}
	releaseView, err := businessReleaseView(release)
	if err != nil {
		return BusinessReleaseView{}, BusinessContextState{}, err
	}
	state, err := businessContextState(published)
	return releaseView, state, err
}

func (s *BusinessService) ListReleases(ctx context.Context, workspaceID pgtype.UUID, limit int32) ([]BusinessReleaseView, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.Queries.ListBusinessReleases(ctx, db.ListBusinessReleasesParams{WorkspaceID: workspaceID, Limit: limit})
	if err != nil {
		return nil, fmt.Errorf("list business releases: %w", err)
	}
	out := make([]BusinessReleaseView, 0, len(rows))
	for _, row := range rows {
		view, viewErr := businessReleaseView(row)
		if viewErr != nil {
			return nil, viewErr
		}
		out = append(out, view)
	}
	return out, nil
}

func (s *BusinessService) GetRelease(ctx context.Context, workspaceID, releaseID pgtype.UUID) (BusinessReleaseView, error) {
	row, err := s.Queries.GetBusinessRelease(ctx, db.GetBusinessReleaseParams{WorkspaceID: workspaceID, ID: releaseID})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessReleaseView{}, ErrBusinessNotFound
	}
	if err != nil {
		return BusinessReleaseView{}, fmt.Errorf("get business release: %w", err)
	}
	return businessReleaseView(row)
}

func (s *BusinessService) CreateProposal(ctx context.Context, workspaceID, chatSessionID, taskID pgtype.UUID, actorType string, actorID pgtype.UUID, input CreateBusinessProposalInput) (BusinessProposalView, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.Rationale = strings.TrimSpace(input.Rationale)
	if err := validateBusinessChangeInput(input); err != nil {
		return BusinessProposalView{}, err
	}
	state, err := s.Get(ctx, workspaceID)
	if err != nil {
		return BusinessProposalView{}, err
	}
	if state.DraftRevision != input.BaseRevision {
		return BusinessProposalView{}, ErrBusinessProposalStale
	}
	operations, err := json.Marshal(input.Operations)
	if err != nil {
		return BusinessProposalView{}, ErrBusinessProposalInvalid
	}
	sourceRefs, err := json.Marshal(input.SourceRefs)
	if err != nil {
		return BusinessProposalView{}, ErrBusinessProposalInvalid
	}
	row, err := s.Queries.CreateBusinessChangeProposal(ctx, db.CreateBusinessChangeProposalParams{
		WorkspaceID: workspaceID, ChatSessionID: chatSessionID, SourceTaskID: taskID,
		BaseRevision: input.BaseRevision, Title: input.Title, Rationale: input.Rationale,
		Operations: operations, SourceRefs: sourceRefs,
		CreatedByActorType: actorType, CreatedByActorID: actorID,
	})
	if err != nil {
		return BusinessProposalView{}, fmt.Errorf("create business proposal: %w", err)
	}
	return businessProposalView(row)
}

func (s *BusinessService) ListProposals(ctx context.Context, workspaceID pgtype.UUID, status string, limit int32) ([]BusinessProposalView, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var statusArg pgtype.Text
	if strings.TrimSpace(status) != "" {
		statusArg = pgtype.Text{String: strings.TrimSpace(status), Valid: true}
	}
	rows, err := s.Queries.ListBusinessChangeProposals(ctx, db.ListBusinessChangeProposalsParams{
		WorkspaceID: workspaceID, Limit: limit, Status: statusArg,
	})
	if err != nil {
		return nil, fmt.Errorf("list business proposals: %w", err)
	}
	out := make([]BusinessProposalView, 0, len(rows))
	for _, row := range rows {
		view, viewErr := businessProposalView(row)
		if viewErr != nil {
			return nil, viewErr
		}
		out = append(out, view)
	}
	return out, nil
}

func (s *BusinessService) GetProposal(ctx context.Context, workspaceID, proposalID pgtype.UUID) (BusinessProposalView, error) {
	row, err := s.Queries.GetBusinessChangeProposal(ctx, db.GetBusinessChangeProposalParams{WorkspaceID: workspaceID, ID: proposalID})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessProposalView{}, ErrBusinessNotFound
	}
	if err != nil {
		return BusinessProposalView{}, fmt.Errorf("get business proposal: %w", err)
	}
	return businessProposalView(row)
}

func (s *BusinessService) ApplyProposal(ctx context.Context, workspaceID, proposalID, userID pgtype.UUID, expectedRevision int32) (BusinessProposalView, BusinessContextState, error) {
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("begin apply business proposal: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	qtx := s.Queries.WithTx(tx)
	proposal, err := qtx.LockBusinessChangeProposal(ctx, db.LockBusinessChangeProposalParams{WorkspaceID: workspaceID, ID: proposalID})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessProposalView{}, BusinessContextState{}, ErrBusinessNotFound
	}
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("lock business proposal: %w", err)
	}
	if proposal.Status != "pending" || proposal.BaseRevision != expectedRevision {
		return BusinessProposalView{}, BusinessContextState{}, ErrBusinessProposalStale
	}
	current, err := qtx.LockBusinessContext(ctx, workspaceID)
	if errors.Is(err, pgx.ErrNoRows) {
		if expectedRevision != 0 {
			return BusinessProposalView{}, BusinessContextState{}, ErrBusinessProposalStale
		}
		current = db.BusinessContext{WorkspaceID: workspaceID, DraftContent: []byte(`{}`)}
	} else if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("lock business context: %w", err)
	}
	if current.DraftRevision != expectedRevision {
		return BusinessProposalView{}, BusinessContextState{}, ErrBusinessProposalStale
	}
	content, err := decodeBusinessContent(current.DraftContent)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, err
	}
	var operations []BusinessChangeOperation
	if err := json.Unmarshal(proposal.Operations, &operations); err != nil {
		return BusinessProposalView{}, BusinessContextState{}, ErrBusinessProposalInvalid
	}
	content, err = applyBusinessOperations(content, operations)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, err
	}
	encoded, err := encodeBusinessContent(content)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, err
	}
	updated, err := saveBusinessDraftInTx(ctx, qtx, workspaceID, userID, expectedRevision, encoded)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, err
	}
	proposal, err = qtx.MarkBusinessChangeProposalApplied(ctx, db.MarkBusinessChangeProposalAppliedParams{
		WorkspaceID: workspaceID, ID: proposalID,
		AppliedRevision: pgtype.Int4{Int32: updated.DraftRevision, Valid: true},
	})
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("mark business proposal applied: %w", err)
	}
	if _, err := qtx.MarkStaleBusinessChangeProposals(ctx, db.MarkStaleBusinessChangeProposalsParams{
		WorkspaceID: workspaceID, BaseRevision: updated.DraftRevision,
	}); err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("mark stale business proposals: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BusinessProposalView{}, BusinessContextState{}, fmt.Errorf("commit apply business proposal: %w", err)
	}
	proposalView, err := businessProposalView(proposal)
	if err != nil {
		return BusinessProposalView{}, BusinessContextState{}, err
	}
	state, err := businessContextState(updated)
	return proposalView, state, err
}

func (s *BusinessService) RejectProposal(ctx context.Context, workspaceID, proposalID pgtype.UUID, reason string) (BusinessProposalView, error) {
	row, err := s.Queries.RejectBusinessChangeProposal(ctx, db.RejectBusinessChangeProposalParams{
		WorkspaceID: workspaceID, ID: proposalID,
		RejectedReason: pgtype.Text{String: strings.TrimSpace(reason), Valid: strings.TrimSpace(reason) != ""},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BusinessProposalView{}, ErrBusinessProposalStale
	}
	if err != nil {
		return BusinessProposalView{}, fmt.Errorf("reject business proposal: %w", err)
	}
	return businessProposalView(row)
}

// PublishedSnapshot returns the immutable content and release metadata that a
// production job should capture. Draft content is deliberately never returned.
func (s *BusinessService) PublishedSnapshot(ctx context.Context, workspaceID pgtype.UUID) (*BusinessReleaseView, error) {
	releases, err := s.ListReleases(ctx, workspaceID, 1)
	if err != nil {
		return nil, err
	}
	if len(releases) == 0 {
		return nil, nil
	}
	return &releases[0], nil
}

// ProjectPublishedCompanyContext adds an immutable release/query cache around
// the pure projector. Cache keys contain no content; release IDs naturally
// isolate new publications and the query hash captures requested scopes and
// filters. The bool reports whether this call reused an existing projection.
func (s *BusinessService) ProjectPublishedCompanyContext(release BusinessReleaseView, query CompanyContextQuery) (CompanyContextProjection, bool, error) {
	encoded, err := json.Marshal(query)
	if err != nil {
		return CompanyContextProjection{}, false, ErrCompanyContextInvalid
	}
	queryHash := sha256.Sum256(encoded)
	key := fmt.Sprintf("%s:%x", release.ID, queryHash)
	s.companyProjectionMu.RLock()
	cached, ok := s.companyProjectionCache[key]
	s.companyProjectionMu.RUnlock()
	if ok {
		return cached, true, nil
	}
	projection, err := ProjectCompanyContext(release, query)
	if err != nil {
		return CompanyContextProjection{}, false, err
	}
	s.companyProjectionMu.Lock()
	defer s.companyProjectionMu.Unlock()
	if cached, ok := s.companyProjectionCache[key]; ok {
		return cached, true, nil
	}
	if len(s.companyProjectionCache) >= maxCompanyProjectionCacheEntries {
		clear(s.companyProjectionCache)
	}
	s.companyProjectionCache[key] = projection
	return projection, false, nil
}

// ProjectCompanyContext returns only the published scopes requested by an
// agent. It is pure: version pinning and authorization happen at the task
// boundary, while this function enforces the retrieval shape and budget.
func ProjectCompanyContext(release BusinessReleaseView, query CompanyContextQuery) (CompanyContextProjection, error) {
	requested, requestedSet, err := normalizeCompanyScopes(query.Scopes)
	if err != nil {
		return CompanyContextProjection{}, err
	}
	limit := query.MaxItems
	if limit == 0 {
		limit = 25
	}
	if limit < 1 || limit > 100 {
		return CompanyContextProjection{}, ErrCompanyContextInvalid
	}

	content := make(map[string]any, len(requested)*2)
	sourceRefs := make([]CompanyContextSourceRef, 0)
	seenSourceRefs := make(map[string]struct{})
	truncated := false
	addSourceRef := func(ref CompanyContextSourceRef) {
		key := ref.Type + "\x00" + ref.ID + "\x00" + ref.URL
		if _, exists := seenSourceRefs[key]; exists {
			return
		}
		seenSourceRefs[key] = struct{}{}
		sourceRefs = append(sourceRefs, ref)
	}

	if companyScopeRequested(requestedSet, "identity") {
		content["company_name"] = release.Content.BusinessName
		content["business_name"] = release.Content.BusinessName
		content["brand_name"] = release.Content.BrandName
		content["website_url"] = release.Content.WebsiteURL
		content["summary"] = release.Content.Summary
	}
	if companyScopeRequested(requestedSet, "positioning") {
		content["positioning"] = release.Content.Positioning
		content["differentiators"] = release.Content.Differentiators
		content["principles"] = release.Content.Principles
	}
	if companyScopeRequested(requestedSet, "boundaries") {
		content["principles"] = release.Content.Principles
		content["exclusions"] = release.Content.Exclusions
	}

	if companyScopeRequested(requestedSet, "offers") {
		items := make([]BusinessOffer, 0)
		allowedIDs := companyIDSet(query.OfferIDs)
		for _, offer := range release.Content.Offers {
			if !companyIDAllowed(allowedIDs, offer.ID) || !companyTextMatches(query.Query,
				offer.Name, offer.Summary, offer.TypicalTimeline, offer.PricingNote,
				offer.FitNotes, strings.Join(offer.Outcomes, " "), strings.Join(offer.Deliverables, " ")) {
				continue
			}
			if len(items) == limit {
				truncated = true
				break
			}
			items = append(items, offer)
		}
		content["offers"] = items
	}

	wantAudiences := companyScopeRequested(requestedSet, "audiences")
	wantPersonas := companyScopeRequested(requestedSet, "personas")
	if wantAudiences || wantPersonas {
		allowedAudienceIDs := companyIDSet(query.AudienceIDs)
		allowedPersonaIDs := companyIDSet(query.PersonaIDs)
		audiences := make([]BusinessAudience, 0)
		personas := make([]CompanyAudiencePersonas, 0)
		for _, audience := range release.Content.Audiences {
			if !companyIDAllowed(allowedAudienceIDs, audience.ID) || !companyAudienceMatches(query.Query, audience) {
				continue
			}
			if wantAudiences {
				if len(audiences) == limit {
					truncated = true
				} else {
					projected := audience
					if !wantPersonas {
						projected.BuyerPersonas = []BusinessPersona{}
					}
					audiences = append(audiences, projected)
				}
			}
			if wantPersonas {
				selected := make([]BusinessPersona, 0)
				for _, persona := range audience.BuyerPersonas {
					if !companyIDAllowed(allowedPersonaIDs, persona.ID) || !companyPersonaMatches(query.Query, persona) {
						continue
					}
					if len(selected) == limit {
						truncated = true
						break
					}
					selected = append(selected, persona)
				}
				if len(selected) > 0 || len(allowedPersonaIDs) == 0 && strings.TrimSpace(query.Query) == "" {
					if len(personas) == limit {
						truncated = true
					} else {
						personas = append(personas, CompanyAudiencePersonas{
							AudienceID: audience.ID, AudienceName: audience.Name, Personas: selected,
						})
					}
				}
			}
		}
		if wantAudiences {
			content["audiences"] = audiences
		}
		if wantPersonas {
			content["personas"] = personas
		}
	}

	if companyScopeRequested(requestedSet, "proof") {
		items := make([]BusinessProof, 0)
		for _, proof := range release.Content.Proof {
			if !companyTextMatches(query.Query, proof.Title, proof.Summary, proof.SourceURL) {
				continue
			}
			if len(items) == limit {
				truncated = true
				break
			}
			items = append(items, proof)
			if proof.SourceURL != "" {
				addSourceRef(CompanyContextSourceRef{Type: "proof", ID: proof.ID, Title: proof.Title, URL: proof.SourceURL})
			}
		}
		content["proof"] = items
	}

	if companyScopeRequested(requestedSet, "sources") {
		items := make([]BusinessSource, 0)
		for _, source := range release.Content.Sources {
			if !companyTextMatches(query.Query, source.Title, source.Notes, source.URL) {
				continue
			}
			if len(items) == limit {
				truncated = true
				break
			}
			items = append(items, source)
			addSourceRef(CompanyContextSourceRef{Type: "source", ID: source.ID, Title: source.Title, URL: source.URL})
		}
		content["sources"] = items
	}

	omitted := make([]string, 0, len(CompanyContextScopes)-len(requested))
	for _, scope := range CompanyContextScopes {
		if !companyScopeRequested(requestedSet, scope) {
			omitted = append(omitted, scope)
		}
	}
	encoded, err := json.Marshal(content)
	if err != nil {
		return CompanyContextProjection{}, fmt.Errorf("encode company context projection: %w", err)
	}
	hash := sha256.Sum256(encoded)
	return CompanyContextProjection{
		CompanyRelease:  CompanyContextReleaseRef{ID: release.ID, Version: release.Version, PublishedAt: release.PublishedAt},
		RequestedScopes: requested,
		Content:         content,
		SourceRefs:      sourceRefs,
		OmittedScopes:   omitted,
		Truncated:       truncated,
		ContentHash:     fmt.Sprintf("sha256:%x", hash),
	}, nil
}

func normalizeCompanyScopes(scopes []string) ([]string, map[string]struct{}, error) {
	if len(scopes) == 0 {
		return nil, nil, ErrCompanyContextInvalid
	}
	out := make([]string, 0, len(scopes))
	set := make(map[string]struct{}, len(scopes))
	for _, raw := range scopes {
		scope := strings.ToLower(strings.TrimSpace(raw))
		if _, valid := companyContextScopeSet[scope]; !valid {
			return nil, nil, ErrCompanyContextInvalid
		}
		if _, exists := set[scope]; exists {
			continue
		}
		set[scope] = struct{}{}
		out = append(out, scope)
	}
	return out, set, nil
}

func companyScopeRequested(scopes map[string]struct{}, scope string) bool {
	_, ok := scopes[scope]
	return ok
}

func companyIDSet(ids []string) map[string]struct{} {
	set := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if value := strings.TrimSpace(id); value != "" {
			set[value] = struct{}{}
		}
	}
	return set
}

func companyIDAllowed(allowed map[string]struct{}, id string) bool {
	if len(allowed) == 0 {
		return true
	}
	_, ok := allowed[id]
	return ok
}

func companyTextMatches(query string, fields ...string) bool {
	needle := strings.ToLower(strings.TrimSpace(query))
	if needle == "" {
		return true
	}
	return strings.Contains(strings.ToLower(strings.Join(fields, "\n")), needle)
}

func companyPersonaMatches(query string, persona BusinessPersona) bool {
	return companyTextMatches(query,
		persona.Name, persona.Role,
		strings.Join(persona.Titles, " "), strings.Join(persona.Goals, " "),
		strings.Join(persona.PainPoints, " "), strings.Join(persona.Objections, " "),
		strings.Join(persona.Channels, " "))
}

func companyAudienceMatches(query string, audience BusinessAudience) bool {
	fields := []string{
		audience.Name, audience.Description,
		strings.Join(audience.Industries, " "), strings.Join(audience.CompanySizes, " "),
		strings.Join(audience.Geographies, " "), strings.Join(audience.PainPoints, " "),
		strings.Join(audience.BuyingTriggers, " "), strings.Join(audience.MustHaves, " "),
		strings.Join(audience.Exclusions, " "),
	}
	for _, persona := range audience.BuyerPersonas {
		fields = append(fields, persona.Name, persona.Role, strings.Join(persona.Titles, " "))
	}
	return companyTextMatches(query, fields...)
}

func businessContextState(row db.BusinessContext) (BusinessContextState, error) {
	draft, err := decodeBusinessContent(row.DraftContent)
	if err != nil {
		return BusinessContextState{}, err
	}
	var published *BusinessContent
	if len(row.PublishedContent) > 0 && string(row.PublishedContent) != "null" {
		decoded, decodeErr := decodeBusinessContent(row.PublishedContent)
		if decodeErr != nil {
			return BusinessContextState{}, decodeErr
		}
		published = &decoded
	}
	return BusinessContextState{
		ID: util.UUIDToString(row.ID), WorkspaceID: util.UUIDToString(row.WorkspaceID),
		DraftRevision: row.DraftRevision, PublishedVersion: row.PublishedVersion,
		Draft: draft, Published: published,
		HasUnpublishedChanges: published == nil || !reflect.DeepEqual(draft, *published),
		UpdatedAt:             util.TimestampToString(row.UpdatedAt), PublishedAt: util.TimestampToPtr(row.PublishedAt),
		ValidationIssues: ValidateBusinessContent(draft, true),
	}, nil
}

func businessReleaseView(row db.BusinessRelease) (BusinessReleaseView, error) {
	content, err := decodeBusinessContent(row.Content)
	if err != nil {
		return BusinessReleaseView{}, err
	}
	return BusinessReleaseView{
		ID: util.UUIDToString(row.ID), WorkspaceID: util.UUIDToString(row.WorkspaceID),
		Version: row.Version, DraftRevision: row.DraftRevision, Content: content,
		ChangeSummary: row.ChangeSummary, PublishedByUserID: util.UUIDToString(row.PublishedByUserID),
		PublishedAt: util.TimestampToString(row.PublishedAt),
	}, nil
}

func businessProposalView(row db.BusinessChangeProposal) (BusinessProposalView, error) {
	var operations []BusinessChangeOperation
	if err := json.Unmarshal(row.Operations, &operations); err != nil {
		return BusinessProposalView{}, fmt.Errorf("decode business proposal operations: %w", err)
	}
	if operations == nil {
		operations = []BusinessChangeOperation{}
	}
	var refs []BusinessSourceRef
	if err := json.Unmarshal(row.SourceRefs, &refs); err != nil {
		return BusinessProposalView{}, fmt.Errorf("decode business proposal sources: %w", err)
	}
	if refs == nil {
		refs = []BusinessSourceRef{}
	}
	return BusinessProposalView{
		ID: util.UUIDToString(row.ID), WorkspaceID: util.UUIDToString(row.WorkspaceID),
		ChatSessionID: util.UUIDToPtr(row.ChatSessionID), SourceTaskID: util.UUIDToPtr(row.SourceTaskID),
		BaseRevision: row.BaseRevision, Title: row.Title, Rationale: row.Rationale,
		Operations: operations, SourceRefs: refs, Status: row.Status,
		CreatedByActorType: row.CreatedByActorType, CreatedByActorID: util.UUIDToPtr(row.CreatedByActorID),
		AppliedRevision: util.Int4ToPtr(row.AppliedRevision), RejectedReason: util.TextToPtr(row.RejectedReason),
		CreatedAt: util.TimestampToString(row.CreatedAt), UpdatedAt: util.TimestampToString(row.UpdatedAt),
	}, nil
}

func encodeBusinessContent(content BusinessContent) ([]byte, error) {
	encoded, err := json.Marshal(normalizeBusinessContent(content))
	if err != nil || len(encoded) > maxBusinessContentBytes {
		return nil, fmt.Errorf("business content is invalid or exceeds %d bytes", maxBusinessContentBytes)
	}
	return encoded, nil
}

func decodeBusinessContent(raw []byte) (BusinessContent, error) {
	if len(raw) == 0 || string(raw) == "{}" || string(raw) == "null" {
		return EmptyBusinessContent(), nil
	}
	var content BusinessContent
	if err := json.Unmarshal(raw, &content); err != nil {
		return BusinessContent{}, fmt.Errorf("decode business content: %w", err)
	}
	return normalizeBusinessContent(content), nil
}

func normalizeBusinessContent(content BusinessContent) BusinessContent {
	content.BusinessName = strings.TrimSpace(content.BusinessName)
	content.BrandName = strings.TrimSpace(content.BrandName)
	content.WebsiteURL = strings.TrimSpace(content.WebsiteURL)
	content.Summary = strings.TrimSpace(content.Summary)
	content.Positioning = strings.TrimSpace(content.Positioning)
	content.Differentiators = normalizeStrings(content.Differentiators)
	content.Principles = normalizeStrings(content.Principles)
	content.Exclusions = normalizeStrings(content.Exclusions)
	if content.Offers == nil {
		content.Offers = []BusinessOffer{}
	}
	if content.Audiences == nil {
		content.Audiences = []BusinessAudience{}
	}
	if content.Proof == nil {
		content.Proof = []BusinessProof{}
	}
	if content.Sources == nil {
		content.Sources = []BusinessSource{}
	}
	for i := range content.Offers {
		item := &content.Offers[i]
		if strings.TrimSpace(item.ID) == "" {
			item.ID = uuid.NewString()
		}
		item.ID, item.Name, item.Summary = strings.TrimSpace(item.ID), strings.TrimSpace(item.Name), strings.TrimSpace(item.Summary)
		item.Outcomes, item.Deliverables = normalizeStrings(item.Outcomes), normalizeStrings(item.Deliverables)
		item.AudienceIDs = normalizeStrings(item.AudienceIDs)
		item.TypicalTimeline, item.PricingNote, item.FitNotes = strings.TrimSpace(item.TypicalTimeline), strings.TrimSpace(item.PricingNote), strings.TrimSpace(item.FitNotes)
	}
	for i := range content.Audiences {
		item := &content.Audiences[i]
		if strings.TrimSpace(item.ID) == "" {
			item.ID = uuid.NewString()
		}
		item.ID, item.Name, item.Description = strings.TrimSpace(item.ID), strings.TrimSpace(item.Name), strings.TrimSpace(item.Description)
		item.Priority = strings.TrimSpace(item.Priority)
		item.Industries, item.CompanySizes, item.Geographies = normalizeStrings(item.Industries), normalizeStrings(item.CompanySizes), normalizeStrings(item.Geographies)
		item.PainPoints, item.BuyingTriggers = normalizeStrings(item.PainPoints), normalizeStrings(item.BuyingTriggers)
		item.MustHaves, item.Exclusions = normalizeStrings(item.MustHaves), normalizeStrings(item.Exclusions)
		if item.BuyerPersonas == nil {
			item.BuyerPersonas = []BusinessPersona{}
		}
		for j := range item.BuyerPersonas {
			persona := &item.BuyerPersonas[j]
			if strings.TrimSpace(persona.ID) == "" {
				persona.ID = uuid.NewString()
			}
			persona.ID, persona.Name, persona.Role = strings.TrimSpace(persona.ID), strings.TrimSpace(persona.Name), strings.TrimSpace(persona.Role)
			persona.BuyingRole = strings.TrimSpace(persona.BuyingRole)
			persona.Titles, persona.Goals = normalizeStrings(persona.Titles), normalizeStrings(persona.Goals)
			persona.PainPoints, persona.Objections, persona.Channels = normalizeStrings(persona.PainPoints), normalizeStrings(persona.Objections), normalizeStrings(persona.Channels)
		}
	}
	for i := range content.Proof {
		item := &content.Proof[i]
		if strings.TrimSpace(item.ID) == "" {
			item.ID = uuid.NewString()
		}
		item.ID, item.Title, item.Summary, item.SourceURL = strings.TrimSpace(item.ID), strings.TrimSpace(item.Title), strings.TrimSpace(item.Summary), strings.TrimSpace(item.SourceURL)
		item.OfferIDs = normalizeStrings(item.OfferIDs)
	}
	for i := range content.Sources {
		item := &content.Sources[i]
		if strings.TrimSpace(item.ID) == "" {
			item.ID = uuid.NewString()
		}
		item.ID, item.Title, item.URL, item.Notes = strings.TrimSpace(item.ID), strings.TrimSpace(item.Title), strings.TrimSpace(item.URL), strings.TrimSpace(item.Notes)
	}
	return content
}

func normalizeStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func ValidateBusinessContent(content BusinessContent, publish bool) []BusinessValidationIssue {
	issues := make([]BusinessValidationIssue, 0)
	add := func(path, message string) {
		issues = append(issues, BusinessValidationIssue{Path: path, Message: message})
	}
	if publish && strings.TrimSpace(content.BusinessName) == "" {
		add("business_name", "Business name is required")
	}
	if publish && strings.TrimSpace(content.Summary) == "" {
		add("summary", "Business summary is required")
	}
	if publish && strings.TrimSpace(content.Positioning) == "" {
		add("positioning", "Positioning is required")
	}
	if content.WebsiteURL != "" && !validHTTPURL(content.WebsiteURL) {
		add("website_url", "Website must be an http or https URL")
	}
	if publish && len(content.Offers) == 0 {
		add("offers", "At least one offer is required")
	}
	if publish && len(content.Audiences) == 0 {
		add("audiences", "At least one target audience is required")
	}
	for i, offer := range content.Offers {
		if strings.TrimSpace(offer.Name) == "" {
			add(fmt.Sprintf("offers.%d.name", i), "Offer name is required")
		}
		if publish && strings.TrimSpace(offer.Summary) == "" {
			add(fmt.Sprintf("offers.%d.summary", i), "Offer value summary is required")
		}
	}
	for i, audience := range content.Audiences {
		if strings.TrimSpace(audience.Name) == "" {
			add(fmt.Sprintf("audiences.%d.name", i), "Audience name is required")
		}
		if publish && len(audience.Industries)+len(audience.CompanySizes)+len(audience.Geographies)+len(audience.MustHaves) == 0 {
			add(fmt.Sprintf("audiences.%d.fit", i), "Add at least one concrete fit condition")
		}
	}
	for i, proof := range content.Proof {
		if proof.SourceURL != "" && !validHTTPURL(proof.SourceURL) {
			add(fmt.Sprintf("proof.%d.source_url", i), "Proof source must be an http or https URL")
		}
	}
	for i, source := range content.Sources {
		if source.URL != "" && !validHTTPURL(source.URL) {
			add(fmt.Sprintf("sources.%d.url", i), "Source must be an http or https URL")
		}
	}
	return issues
}

func validHTTPURL(value string) bool {
	parsed, err := url.ParseRequestURI(value)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}

type businessOperationValueSpec struct {
	expected string
	kind     string
	target   func() any
}

var businessOperationValueSpecs = map[string]businessOperationValueSpec{
	"/brand_name":      {expected: "string", kind: "string", target: func() any { return new(string) }},
	"/website_url":     {expected: "string", kind: "string", target: func() any { return new(string) }},
	"/summary":         {expected: "string", kind: "string", target: func() any { return new(string) }},
	"/positioning":     {expected: "string", kind: "string", target: func() any { return new(string) }},
	"/differentiators": {expected: "array of strings", kind: "string_array", target: func() any { return new([]string) }},
	"/principles":      {expected: "array of strings", kind: "string_array", target: func() any { return new([]string) }},
	"/exclusions":      {expected: "array of strings", kind: "string_array", target: func() any { return new([]string) }},
	"/offers":          {expected: "array of offer objects", kind: "object_array", target: func() any { return new([]BusinessOffer) }},
	"/audiences":       {expected: "array of audience objects", kind: "object_array", target: func() any { return new([]BusinessAudience) }},
	"/proof":           {expected: "array of proof objects", kind: "object_array", target: func() any { return new([]BusinessProof) }},
	"/sources":         {expected: "array of source objects", kind: "object_array", target: func() any { return new([]BusinessSource) }},
}

// BusinessOperationJSONSchema returns the AI-facing operation contract from
// the same path registry used by service validation. Both MCP tools and the
// generic resource description use this function so their schemas cannot
// silently drift from execution behavior.
func BusinessOperationJSONSchema() map[string]any {
	pathsByKind := map[string][]string{}
	allPaths := make([]string, 0, len(businessOperationValueSpecs))
	for path, spec := range businessOperationValueSpecs {
		pathsByKind[spec.kind] = append(pathsByKind[spec.kind], path)
		allPaths = append(allPaths, path)
	}
	for kind := range pathsByKind {
		sort.Strings(pathsByKind[kind])
	}
	sort.Strings(allPaths)
	writeOperation := func(paths []string, value map[string]any) map[string]any {
		return businessObjectSchema(map[string]any{
			"op":     map[string]any{"type": "string", "enum": []string{"add", "replace"}},
			"path":   map[string]any{"type": "string", "enum": paths},
			"value":  value,
			"reason": map[string]any{"type": "string"},
		}, []string{"op", "path", "value"})
	}
	return map[string]any{
		"oneOf": []any{
			writeOperation(pathsByKind["string"], map[string]any{"type": "string"}),
			writeOperation(pathsByKind["string_array"], map[string]any{"type": "array", "items": map[string]any{"type": "string"}}),
			writeOperation(pathsByKind["object_array"], map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "object"},
				"description": "Complete collection value. To add one item, include all existing items and the new item.",
			}),
			businessObjectSchema(map[string]any{
				"op":     map[string]any{"const": "remove"},
				"path":   map[string]any{"type": "string", "enum": allPaths},
				"reason": map[string]any{"type": "string"},
			}, []string{"op", "path"}),
		},
	}
}

func businessObjectSchema(properties map[string]any, required []string) map[string]any {
	schema := map[string]any{"type": "object", "additionalProperties": false, "properties": properties}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func validateBusinessChangeInput(input CreateBusinessProposalInput) error {
	if input.BaseRevision < 0 {
		return fmt.Errorf("%w: base_revision must be non-negative", ErrBusinessProposalInvalid)
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || len(title) > 240 {
		return fmt.Errorf("%w: title must contain 1 to 240 characters", ErrBusinessProposalInvalid)
	}
	if len(input.Operations) == 0 || len(input.Operations) > 32 {
		return fmt.Errorf("%w: operations must contain between 1 and 32 items", ErrBusinessProposalInvalid)
	}
	return validateBusinessOperations(input.Operations)
}

func validateBusinessOperations(operations []BusinessChangeOperation) error {
	for index, operation := range operations {
		if operation.Op != "add" && operation.Op != "replace" && operation.Op != "remove" {
			return newBusinessOperationValidationError(index, "op", operation.Path, "add, replace, or remove", operation.Op, "")
		}
		spec, ok := businessOperationValueSpecs[operation.Path]
		if !ok {
			return newBusinessOperationValidationError(index, "path", operation.Path, "an allowlisted top-level path", operation.Path, "nested and company identity paths are read-only")
		}
		if operation.Op == "remove" {
			continue
		}
		if len(operation.Value) == 0 {
			return newBusinessOperationValidationError(index, "value", operation.Path, spec.expected, "missing value", "")
		}
		if !json.Valid(operation.Value) {
			return newBusinessOperationValidationError(index, "value", operation.Path, spec.expected, "invalid JSON", "")
		}
		actual := businessJSONKind(operation.Value)
		if err := decodeStrictBusinessOperationValue(operation.Value, spec.target()); err != nil {
			return newBusinessOperationValidationError(index, "value", operation.Path, spec.expected, actual, err.Error())
		}
	}
	return nil
}

func newBusinessOperationValidationError(index int, field, path, expected, actual, detail string) error {
	return &BusinessOperationValidationError{
		OperationIndex: index,
		Field:          field,
		Path:           path,
		Expected:       expected,
		Actual:         actual,
		Detail:         detail,
	}
}

func businessJSONKind(value json.RawMessage) string {
	trimmed := bytes.TrimSpace(value)
	if len(trimmed) == 0 {
		return "missing value"
	}
	switch trimmed[0] {
	case '"':
		return "string"
	case '[':
		return "array"
	case '{':
		return "object"
	case 'n':
		return "null"
	case 't', 'f':
		return "boolean"
	default:
		return "number"
	}
}

func decodeStrictBusinessOperationValue(value json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(value))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func applyBusinessOperations(content BusinessContent, operations []BusinessChangeOperation) (BusinessContent, error) {
	if err := validateBusinessOperations(operations); err != nil {
		return BusinessContent{}, err
	}
	encoded, _ := json.Marshal(content)
	fields := map[string]json.RawMessage{}
	if err := json.Unmarshal(encoded, &fields); err != nil {
		return BusinessContent{}, ErrBusinessProposalInvalid
	}
	for _, operation := range operations {
		key := strings.TrimPrefix(operation.Path, "/")
		if operation.Op == "remove" {
			delete(fields, key)
		} else {
			fields[key] = operation.Value
		}
	}
	patched, err := json.Marshal(fields)
	if err != nil {
		return BusinessContent{}, ErrBusinessProposalInvalid
	}
	var result BusinessContent
	if err := json.Unmarshal(patched, &result); err != nil {
		return BusinessContent{}, ErrBusinessProposalInvalid
	}
	return normalizeBusinessContent(result), nil
}
