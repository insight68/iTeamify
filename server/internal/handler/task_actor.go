package handler

import (
	"github.com/iteamify-ai/iteamify/server/internal/util"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
)

func taskActorContext(w http.ResponseWriter, r *http.Request) (workspaceID, taskID pgtype.UUID, ok bool) {
	if r.Header.Get("X-Actor-Source") != "task_token" {
		writeError(w, http.StatusForbidden, "this operation is only available from within an agent task")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	workspaceID, err := util.ParseUUID(ctxWorkspaceID(r.Context()))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid workspace context")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	taskID, err = util.ParseUUID(r.Header.Get("X-Task-ID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task context")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	return workspaceID, taskID, true
}
