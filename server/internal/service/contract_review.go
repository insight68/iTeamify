package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/internal/storage"
	"github.com/iteamify-ai/iteamify/server/internal/util/secretbox"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrContractInput = errors.New("invalid contract review input")
var ErrContractConflict = errors.New("contract review changed or request key already used")
var ErrContractForbidden = errors.New("contract review action is not allowed")

const MaxContractFileSize = 20 << 20
const MaxContractFiles = 10

type ContractReviewFields struct {
	Title            string `json:"title"`
	ContractType     string `json:"contract_type"`
	Priority         string `json:"priority"`
	Deadline         string `json:"deadline"`
	OpportunityStage string `json:"opportunity_stage"`
	Background       string `json:"background"`
	Focus            string `json:"focus"`
}

func (f ContractReviewFields) Validate() error {
	if strings.TrimSpace(f.Title) == "" || utf8.RuneCountInString(f.Title) > 200 || len(f.ContractType) > 200 || len(f.Background) > 20000 || len(f.Focus) > 20000 {
		return fmt.Errorf("%w: title and bounded fields are required", ErrContractInput)
	}
	if f.Priority != "normal" && f.Priority != "high" && f.Priority != "urgent" {
		return fmt.Errorf("%w: invalid priority", ErrContractInput)
	}
	if f.Deadline != "" {
		if _, err := time.Parse("2006-01-02", f.Deadline); err != nil {
			return fmt.Errorf("%w: invalid deadline", ErrContractInput)
		}
	}
	switch f.OpportunityStage {
	case "", "contacted", "qualified", "proposal", "negotiating", "won", "lost":
	default:
		return fmt.Errorf("%w: invalid opportunity stage", ErrContractInput)
	}
	return nil
}

type ContractFileInput struct {
	Filename string
	Data     []byte
}
type ContractReviewCreate struct {
	ApplicationID      pgtype.UUID
	ApplicationVersion int32
	SessionID          pgtype.UUID
	WorkspaceID        pgtype.UUID
	CreatorID          pgtype.UUID
	PeerUserID         pgtype.UUID
	AgentID            pgtype.UUID
	Kind               string
	Fields             ContractReviewFields
	Files              []ContractFileInput
}
type ContractReviewUpdate struct {
	RequestKey string                `json:"request_key"`
	Version    int32                 `json:"version"`
	Action     string                `json:"action"`
	Fields     *ContractReviewFields `json:"fields,omitempty"`
	Result     string                `json:"result"`
	Note       string                `json:"note"`
}
type ContractReviewService struct {
	Tasks     *TaskService
	Queries   *db.Queries
	TxStarter TxStarter
	Storage   storage.Storage
}

func ContractReviewTransition(status, action string, requester bool) (string, error) {
	if requester {
		if action == "supplement" && status == "needs_info" {
			return "submitted", nil
		}
		return "", ErrContractForbidden
	}
	switch {
	case action == "accept" && status == "submitted":
		return "accepted", nil
	case action == "request_info" && (status == "submitted" || status == "accepted" || status == "in_review"):
		return "needs_info", nil
	case action == "start" && status == "accepted":
		return "in_review", nil
	case action == "complete" && status == "in_review":
		return "completed", nil
	default:
		return "", ErrContractForbidden
	}
}

func contractFileType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		return "application/pdf"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".doc":
		return "application/msword"
	case ".txt":
		return "text/plain"
	default:
		return ""
	}
}
func validateContractFiles(files []ContractFileInput) error {
	if len(files) > MaxContractFiles {
		return fmt.Errorf("%w: at most ten files", ErrContractInput)
	}
	for _, f := range files {
		if len(f.Data) == 0 || len(f.Data) > MaxContractFileSize || len(f.Filename) > 255 || contractFileType(f.Filename) == "" {
			return fmt.Errorf("%w: PDF, Word or text files up to 20 MB are accepted", ErrContractInput)
		}
	}
	return nil
}

func (s *ContractReviewService) Create(ctx context.Context, in ContractReviewCreate) (db.ContractReview, bool, error) {
	if err := in.Fields.Validate(); err != nil {
		return db.ContractReview{}, false, err
	}
	if !in.SessionID.Valid || !in.WorkspaceID.Valid || !in.CreatorID.Valid || (in.Kind != "agent" && in.Kind != "direct") || (in.Kind == "agent" && !in.AgentID.Valid) || (in.Kind == "direct" && (!in.PeerUserID.Valid || in.PeerUserID == in.CreatorID)) {
		return db.ContractReview{}, false, ErrContractInput
	}
	if len(in.Files) == 0 {
		return db.ContractReview{}, false, fmt.Errorf("%w: a contract file is required", ErrContractInput)
	}
	if err := validateContractFiles(in.Files); err != nil {
		return db.ContractReview{}, false, err
	}
	fields, err := json.Marshal(in.Fields)
	if err != nil {
		return db.ContractReview{}, false, err
	}
	fileHashes := make([]string, len(in.Files))
	for i, f := range in.Files {
		sum := sha256.Sum256(f.Data)
		fileHashes[i] = f.Filename + ":" + hex.EncodeToString(sum[:])
	}
	payload, err := json.Marshal(struct {
		Kind               string
		Peer, Agent        pgtype.UUID
		Fields             ContractReviewFields
		Files              []string
		Application        pgtype.UUID
		ApplicationVersion int32
	}{in.Kind, in.PeerUserID, in.AgentID, in.Fields, fileHashes, in.ApplicationID, in.ApplicationVersion})
	if err != nil {
		return db.ContractReview{}, false, err
	}
	digest := sha256.Sum256(payload)
	hash := hex.EncodeToString(digest[:])
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return db.ContractReview{}, false, err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	q := s.Queries.WithTx(tx)
	if _, err = q.LockWorkspaceForChatSessionCreate(ctx, in.WorkspaceID); err != nil {
		return db.ContractReview{}, false, err
	}
	people := []pgtype.UUID{in.CreatorID}
	if in.Kind == "direct" {
		people = append(people, in.PeerUserID)
	}
	members, err := q.LockDirectMessageMembers(ctx, db.LockDirectMessageMembersParams{WorkspaceID: in.WorkspaceID, UserIds: people})
	if err != nil {
		return db.ContractReview{}, false, err
	}
	if len(members) != len(people) {
		return db.ContractReview{}, false, ErrContractForbidden
	}
	if in.Kind == "agent" {
		if err := lockContractAgent(ctx, q, in.WorkspaceID, in.AgentID, in.CreatorID); err != nil {
			return db.ContractReview{}, false, err
		}
	}

	cs, err := q.CreateContractReviewSession(ctx, db.CreateContractReviewSessionParams{ID: in.SessionID, WorkspaceID: in.WorkspaceID, CreatorID: in.CreatorID, Kind: in.Kind, PeerUserID: in.PeerUserID, AgentID: in.AgentID, Title: in.Fields.Title})
	if err != nil {
		return db.ContractReview{}, false, err
	}
	if cs.WorkspaceID != in.WorkspaceID || cs.CreatorID != in.CreatorID || cs.Kind != in.Kind || cs.AgentID != in.AgentID || cs.PeerUserID != in.PeerUserID || cs.ContainerType != "contract_review" {
		return db.ContractReview{}, false, ErrContractConflict
	}
	existing, err := q.GetContractReview(ctx, db.GetContractReviewParams{ID: in.SessionID, WorkspaceID: in.WorkspaceID})
	if err == nil {
		if existing.SubmissionHash != hash {
			return db.ContractReview{}, false, ErrContractConflict
		}
		return existing, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.ContractReview{}, false, err
	}
	application, err := q.LockSessionApplication(ctx, db.LockSessionApplicationParams{ID: in.ApplicationID, WorkspaceID: in.WorkspaceID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.ContractReview{}, false, ErrContractForbidden
		}
		return db.ContractReview{}, false, err
	}
	targetKind, targetID := "member", in.PeerUserID
	if in.Kind == "agent" {
		targetKind, targetID = "agent", in.AgentID
	}
	if application.Status != "enabled" || application.ApplicationType != "contract_review" || application.TargetKind != targetKind || application.TargetID != targetID {
		return db.ContractReview{}, false, ErrContractForbidden
	}
	if application.Version != in.ApplicationVersion {
		return db.ContractReview{}, false, ErrContractConflict
	}
	var rules ContractApplicationConfig
	if err = json.Unmarshal(application.Config, &rules); err != nil {
		return db.ContractReview{}, false, err
	}
	if err = rules.ValidateFields(in.Fields); err != nil {
		return db.ContractReview{}, false, err
	}
	review, err := q.CreateContractReview(ctx, db.CreateContractReviewParams{ID: in.SessionID, WorkspaceID: in.WorkspaceID, CreatorID: in.CreatorID, Fields: fields, SubmissionHash: hash})
	if err != nil {
		return db.ContractReview{}, false, err
	}
	if err = q.BindContractApplication(ctx, db.BindContractApplicationParams{ID: in.SessionID, WorkspaceID: in.WorkspaceID, ApplicationID: application.ID, ApplicationVersion: pgtype.Int4{Int32: application.Version, Valid: true}, ApplicationSnapshot: application.Config}); err != nil {
		return db.ContractReview{}, false, err
	}
	if err = q.BindSessionApplication(ctx, db.BindSessionApplicationParams{ID: in.SessionID, WorkspaceID: in.WorkspaceID, ApplicationID: application.ID, ApplicationVersion: pgtype.Int4{Int32: application.Version, Valid: true}}); err != nil {
		return db.ContractReview{}, false, err
	}
	review.ApplicationID = application.ID
	review.ApplicationVersion = pgtype.Int4{Int32: application.Version, Valid: true}
	review.ApplicationSnapshot = application.Config
	var queued db.AgentTaskQueue
	if in.Kind == "agent" {
		if _, err = q.UpsertChatContextResource(ctx, db.UpsertChatContextResourceParams{
			WorkspaceID: in.WorkspaceID, ChatSessionID: in.SessionID, ResourceType: "contract_review", ResourceID: uuid.UUID(in.SessionID.Bytes).String(),
			ResourceVersion: pgtype.Int4{Int32: review.Version, Valid: true}, Label: in.Fields.Title, Source: "system", CreatedByUserID: in.CreatorID,
		}); err != nil {
			return db.ContractReview{}, false, err
		}
		queued, err = queueContractSubmission(ctx, q, cs, review)
		if err != nil {
			return db.ContractReview{}, false, err
		}
	}
	keys, err := s.saveFiles(ctx, q, in.WorkspaceID, in.SessionID, in.CreatorID, in.Files)
	committed := false
	defer func() {
		if !committed && s.Storage != nil {
			s.Storage.DeleteKeys(context.WithoutCancel(ctx), keys)
		}
	}()
	if err != nil {
		return db.ContractReview{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return db.ContractReview{}, false, err
	}
	committed = true
	if queued.ID.Valid && s.Tasks != nil {
		s.Tasks.NotifyTaskEnqueued(ctx, queued)
	}
	return review, true, nil
}

// Update shares the domain transitions between the human API and the resource adapter.
func (s *ContractReviewService) Update(ctx context.Context, session db.ChatSession, actor pgtype.UUID, agentActor bool, in ContractReviewUpdate, files []ContractFileInput) (db.ContractReview, error) {
	if in.RequestKey == "" || len(in.RequestKey) > 200 || in.Version < 1 || len(in.Result) > 50000 || len(in.Note) > 20000 {
		return db.ContractReview{}, ErrContractInput
	}
	if err := validateContractFiles(files); err != nil {
		return db.ContractReview{}, err
	}
	if in.Fields != nil {
		if err := in.Fields.Validate(); err != nil {
			return db.ContractReview{}, err
		}
	}
	tx, err := s.TxStarter.Begin(ctx)
	if err != nil {
		return db.ContractReview{}, err
	}
	defer tx.Rollback(context.WithoutCancel(ctx))
	q := s.Queries.WithTx(tx)
	currentSession, err := q.LockContainerSession(ctx, db.LockContainerSessionParams{ID: session.ID, WorkspaceID: session.WorkspaceID})
	if err != nil {
		return db.ContractReview{}, err
	}
	if currentSession.Status != "active" || currentSession.ContainerType != "contract_review" || (!agentActor && actor != currentSession.CreatorID && actor != currentSession.PeerUserID) || (agentActor && (currentSession.Kind != "agent" || actor != currentSession.AgentID)) {
		return db.ContractReview{}, ErrContractForbidden
	}
	people := []pgtype.UUID{currentSession.CreatorID}
	if currentSession.Kind == "direct" {
		people = append(people, currentSession.PeerUserID)
	}
	members, err := q.LockDirectMessageMembers(ctx, db.LockDirectMessageMembersParams{WorkspaceID: session.WorkspaceID, UserIds: people})
	if err != nil {
		return db.ContractReview{}, err
	}
	if len(members) != len(people) {
		return db.ContractReview{}, ErrContractForbidden
	}
	if currentSession.Kind == "agent" {
		if err := lockContractAgent(ctx, q, session.WorkspaceID, currentSession.AgentID, currentSession.CreatorID); err != nil {
			return db.ContractReview{}, err
		}
	}
	review, err := q.LockContractReview(ctx, db.LockContractReviewParams{ID: session.ID, WorkspaceID: session.WorkspaceID})
	if err != nil {
		return db.ContractReview{}, err
	}
	fileHashes := make([]string, len(files))
	for i, f := range files {
		hash := sha256.Sum256(f.Data)
		fileHashes[i] = f.Filename + ":" + hex.EncodeToString(hash[:])
	}
	payload, err := json.Marshal(struct {
		Input ContractReviewUpdate
		Files []string
	}{in, fileHashes})
	if err != nil {
		return db.ContractReview{}, err
	}
	digest := sha256.Sum256(payload)
	hash := hex.EncodeToString(digest[:])
	prior, err := q.GetContractReviewAction(ctx, db.GetContractReviewActionParams{ReviewID: session.ID, WorkspaceID: session.WorkspaceID, RequestKey: in.RequestKey})
	if err == nil {
		if prior.ActorID != actor || prior.RequestHash != hash {
			return db.ContractReview{}, ErrContractConflict
		}
		return review, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.ContractReview{}, err
	}
	if review.Version != in.Version {
		return db.ContractReview{}, ErrContractConflict
	}
	requester := !agentActor && actor == review.CreatorID
	status, err := ContractReviewTransition(review.Status, in.Action, requester)
	if in.Action == "retry" && requester && currentSession.Kind == "agent" && (review.Status == "submitted" || review.Status == "accepted" || review.Status == "in_review") {
		latest, e := q.GetLatestContractTask(ctx, db.GetLatestContractTaskParams{WorkspaceID: session.WorkspaceID, ReviewID: session.ID})
		if e != nil || (latest.Status != "failed" && latest.Status != "cancelled" && latest.Status != "completed") {
			return db.ContractReview{}, ErrContractConflict
		}
		status, err = review.Status, nil
	}
	if err != nil {
		return db.ContractReview{}, err
	}
	if in.Fields != nil && !requester {
		return db.ContractReview{}, ErrContractForbidden
	}
	if in.Action == "complete" && strings.TrimSpace(in.Result) == "" {
		return db.ContractReview{}, fmt.Errorf("%w: result is required", ErrContractInput)
	}
	if in.Action == "request_info" && strings.TrimSpace(in.Note) == "" {
		return db.ContractReview{}, fmt.Errorf("%w: supplementary requirements are required", ErrContractInput)
	}
	if in.Fields != nil {
		var previous ContractReviewFields
		if err := json.Unmarshal(review.Fields, &previous); err != nil {
			return db.ContractReview{}, err
		}
		if in.Fields.Title != previous.Title {
			if _, err := q.UpdateChatSessionTitle(ctx, db.UpdateChatSessionTitleParams{ID: session.ID, Title: in.Fields.Title}); err != nil {
				return db.ContractReview{}, err
			}
		}
	}
	fields := review.Fields
	if in.Fields != nil {
		fields, err = json.Marshal(in.Fields)
		if err != nil {
			return db.ContractReview{}, err
		}
	}
	if requester && in.Action == "supplement" && len(review.ApplicationSnapshot) > 0 {
		var rules ContractApplicationConfig
		var f ContractReviewFields
		if err = json.Unmarshal(review.ApplicationSnapshot, &rules); err != nil {
			return db.ContractReview{}, err
		}
		if err = json.Unmarshal(fields, &f); err != nil {
			return db.ContractReview{}, err
		}
		if err = rules.ValidateFields(f); err != nil {
			return db.ContractReview{}, err
		}
	}
	result := review.Result
	if in.Action == "complete" {
		result = in.Result
	}
	review, err = q.UpdateContractReview(ctx, db.UpdateContractReviewParams{Fields: fields, Status: status, Result: result, Note: in.Note, ActorID: actor, ID: session.ID, WorkspaceID: session.WorkspaceID, ExpectedVersion: in.Version})
	if err != nil {
		return db.ContractReview{}, err
	}
	if err = q.TouchContainerSession(ctx, db.TouchContainerSessionParams{ID: session.ID, WorkspaceID: session.WorkspaceID, ActivityAt: review.UpdatedAt}); err != nil {
		return db.ContractReview{}, err
	}
	if err = q.CreateContractReviewAction(ctx, db.CreateContractReviewActionParams{ReviewID: session.ID, WorkspaceID: session.WorkspaceID, RequestKey: in.RequestKey, RequestHash: hash, ActorID: actor, Action: in.Action, Note: in.Note, Version: review.Version}); err != nil {
		return db.ContractReview{}, err
	}
	if len(files) > 0 {
		existingFiles, listErr := q.ListContractReviewFiles(ctx, db.ListContractReviewFilesParams{WorkspaceID: session.WorkspaceID, ReviewID: session.ID})
		if listErr != nil {
			return db.ContractReview{}, listErr
		}
		if len(existingFiles)+len(files) > MaxContractFiles {
			return db.ContractReview{}, fmt.Errorf("%w: at most ten files per review", ErrContractInput)
		}
	}
	keys, err := s.saveFiles(ctx, q, session.WorkspaceID, session.ID, actor, files)
	committed := false
	defer func() {
		if !committed && s.Storage != nil {
			s.Storage.DeleteKeys(context.WithoutCancel(ctx), keys)
		}
	}()
	if err != nil {
		return db.ContractReview{}, err
	}
	var queued db.AgentTaskQueue
	if currentSession.Kind == "agent" && review.ApplicationID.Valid && requester && (in.Action == "supplement" || in.Action == "retry") {
		queued, err = queueContractSubmission(ctx, q, currentSession, review)
		if err != nil {
			return db.ContractReview{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return db.ContractReview{}, err
	}
	committed = true
	if queued.ID.Valid && s.Tasks != nil {
		s.Tasks.NotifyTaskEnqueued(ctx, queued)
	}
	return review, nil
}

func (s *ContractReviewService) saveFiles(ctx context.Context, q *db.Queries, workspace, review, actor pgtype.UUID, files []ContractFileInput) ([]string, error) {
	keys := make([]string, 0, len(files))
	if len(files) > 0 && s.Storage == nil {
		return keys, fmt.Errorf("file storage is unavailable")
	}
	for _, f := range files {
		id := uuid.New()
		key := "private-contracts/" + uuid.UUID(workspace.Bytes).String() + "/" + id.String()
		secret := make([]byte, secretbox.KeySize)
		if _, err := rand.Read(secret); err != nil {
			return keys, err
		}
		box, err := secretbox.New(secret)
		if err != nil {
			return keys, err
		}
		sealed, err := box.Seal(f.Data)
		if err != nil {
			return keys, err
		}
		// Public storage URLs expose only authenticated ciphertext. Keys stay in DB.
		keys = append(keys, key)
		if _, err = s.Storage.Upload(ctx, key, sealed, "application/octet-stream", id.String()); err != nil {
			return keys, err
		}
		_, err = q.CreateContractReviewFile(ctx, db.CreateContractReviewFileParams{ID: pgtype.UUID{Bytes: id, Valid: true}, ReviewID: review, WorkspaceID: workspace, UploadedBy: actor, Filename: filepath.Base(f.Filename), ContentType: contractFileType(f.Filename), SizeBytes: int64(len(f.Data)), ObjectKey: key, EncryptionKey: secret})
		if err != nil {
			return keys, err
		}
	}
	return keys, nil
}

func (s *ContractReviewService) FileContent(ctx context.Context, f db.ContractReviewFile) ([]byte, error) {
	if s.Storage == nil {
		return nil, errors.New("file storage is unavailable")
	}
	r, err := s.Storage.GetReader(ctx, f.ObjectKey)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	sealed, err := io.ReadAll(io.LimitReader(r, MaxContractFileSize+1024))
	if err != nil {
		return nil, err
	}
	box, err := secretbox.New(f.EncryptionKey)
	if err != nil {
		return nil, err
	}
	return box.Open(sealed)
}

func lockContractAgent(ctx context.Context, q *db.Queries, workspace, agentID, creator pgtype.UUID) error {
	agent, err := q.LockContainerAgent(ctx, db.LockContainerAgentParams{ID: agentID, WorkspaceID: workspace})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrContractForbidden
	}
	if err != nil {
		return err
	}
	if agent.OwnerID == creator {
		return nil
	}
	if agent.PermissionMode != "public_to" {
		return ErrContractForbidden
	}
	targets, err := q.ListAgentInvocationTargets(ctx, agent.ID)
	if err != nil {
		return err
	}
	for _, target := range targets {
		if (target.TargetType == "workspace" && target.TargetID == workspace) || (target.TargetType == "member" && target.TargetID == creator) {
			return nil
		}
	}
	return ErrContractForbidden
}
