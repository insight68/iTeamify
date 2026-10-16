package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/iteamify-ai/iteamify/server/pkg/agent"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type ContractApplicationConfig struct {
	ServiceName        string   `json:"service_name"`
	Description        string   `json:"description"`
	ContractTypes      []string `json:"contract_types"`
	RequireBackground  bool     `json:"require_background"`
	RequireFocus       bool     `json:"require_focus"`
	DefaultPriority    string   `json:"default_priority"`
	ReviewInstructions string   `json:"review_instructions"`
	ResultRequirements string   `json:"result_requirements"`
	AgentInstructions  string   `json:"agent_instructions"`
}

func (c ContractApplicationConfig) Validate() error {
	if strings.TrimSpace(c.ServiceName) == "" || len(c.ServiceName) > 200 || len(c.Description) > 5000 || len(c.ContractTypes) > 30 || len(c.ReviewInstructions) > 20000 || len(c.ResultRequirements) > 10000 || len(c.AgentInstructions) > 20000 {
		return fmt.Errorf("%w: invalid service configuration", ErrContractInput)
	}
	if c.DefaultPriority != "normal" && c.DefaultPriority != "high" && c.DefaultPriority != "urgent" {
		return fmt.Errorf("%w: invalid default priority", ErrContractInput)
	}
	seen := map[string]bool{}
	for _, kind := range c.ContractTypes {
		if strings.TrimSpace(kind) == "" || len(kind) > 200 || seen[kind] {
			return fmt.Errorf("%w: invalid contract types", ErrContractInput)
		}
		seen[kind] = true
	}
	return nil
}
func (c ContractApplicationConfig) ValidateFields(f ContractReviewFields) error {
	if c.RequireBackground && strings.TrimSpace(f.Background) == "" || c.RequireFocus && strings.TrimSpace(f.Focus) == "" {
		return fmt.Errorf("%w: background and review focus must meet the service requirements", ErrContractInput)
	}
	if len(c.ContractTypes) > 0 {
		for _, kind := range c.ContractTypes {
			if f.ContractType == kind {
				return nil
			}
		}
		return fmt.Errorf("%w: contract type is outside this service's scope", ErrContractInput)
	}
	return nil
}

type SessionApplicationWrite struct {
	TargetKind string                    `json:"target_kind"`
	TargetID   string                    `json:"target_id"`
	Status     string                    `json:"status"`
	Version    int32                     `json:"version"`
	Config     ContractApplicationConfig `json:"config"`
}

// Managed MCP-only runtimes currently expose neither private file reading nor
// the host CLI. Do not advertise a review service that cannot read contracts.
func ContractRuntimeSupportsFiles(ctx context.Context, q *db.Queries, id pgtype.UUID) (bool, error) {
	if !id.Valid {
		return false, nil
	}
	runtime, err := q.GetAgentRuntime(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return !(agent.IsSystemRuntimeProvider(runtime.Provider) && !runtime.ProfileID.Valid), nil
}

// QueueContractSubmission persists the task and its real submission evidence in
// the business transaction. No user chat message is fabricated for a form.
func queueContractSubmission(ctx context.Context, q *db.Queries, session db.ChatSession, review db.ContractReview) (db.AgentTaskQueue, error) {
	agent, err := q.GetAgentInWorkspace(ctx, db.GetAgentInWorkspaceParams{ID: session.AgentID, WorkspaceID: session.WorkspaceID})
	if err != nil {
		return db.AgentTaskQueue{}, err
	}
	if !agent.RuntimeID.Valid || agent.ArchivedAt.Valid {
		return db.AgentTaskQueue{}, ErrContractForbidden
	}
	ready, err := ContractRuntimeSupportsFiles(ctx, q, agent.RuntimeID)
	if err != nil {
		return db.AgentTaskQueue{}, err
	}
	if !ready {
		return db.AgentTaskQueue{}, fmt.Errorf("%w: this runtime does not support private contract file reading", ErrContractInput)
	}

	task, err := q.CreateChatTask(ctx, db.CreateChatTaskParams{AgentID: agent.ID, RuntimeID: agent.RuntimeID, Priority: 2, ChatSessionID: session.ID, InitiatorUserID: review.CreatorID, OriginatorUserID: review.CreatorID, AccountableUserID: review.CreatorID, ForceFreshSession: pgtype.Bool{Bool: true, Valid: true}, OriginatorSource: pgtype.Text{String: "direct_human", Valid: true}, TriggerEvidenceKind: pgtype.Text{String: "chat", Valid: true}, TriggerEvidenceRefID: session.ID})
	if err != nil {
		return task, err
	}
	task, err = q.SetChatTaskInputOwnerSelf(ctx, task.ID)
	if err != nil {
		return task, err
	}
	input, err := json.Marshal(struct {
		Fields        json.RawMessage `json:"fields"`
		Configuration json.RawMessage `json:"configuration"`
		Note          string          `json:"note"`
	}{review.Fields, review.ApplicationSnapshot, review.Note})
	if err != nil {
		return task, err
	}
	_, err = q.CreateContractSubmission(ctx, db.CreateContractSubmissionParams{ID: pgtype.UUID{Bytes: uuid.New(), Valid: true}, WorkspaceID: session.WorkspaceID, ReviewID: review.ID, SubmittedBy: review.CreatorID, ReviewVersion: review.Version, TaskID: task.ID, Input: input})
	return task, err
}
