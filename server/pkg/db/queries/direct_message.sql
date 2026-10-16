-- name: LockDirectMessageMembers :many
SELECT * FROM member
WHERE workspace_id = @workspace_id AND user_id = ANY(@user_ids::uuid[])
ORDER BY user_id FOR KEY SHARE;

-- name: EnsureDirectSession :one
INSERT INTO chat_session (id, workspace_id, creator_id, peer_user_id, kind, title)
VALUES (@id, @workspace_id, @creator_id, @peer_user_id, 'direct', @title)
ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
RETURNING *;

-- name: LockDirectSession :one
SELECT * FROM chat_session
WHERE id = @id AND workspace_id = @workspace_id AND kind = 'direct'
FOR UPDATE;

-- name: GetDirectMessageByClientID :one
SELECT m.* FROM chat_message m JOIN chat_session s ON s.id = m.chat_session_id
WHERE s.workspace_id = @workspace_id AND s.id = @conversation_id AND s.kind = 'direct'
  AND m.sender_id = @sender_id AND m.client_message_id = @client_message_id;

-- name: GetDirectSessionPreview :one
SELECT m.content FROM chat_message m JOIN chat_session s ON s.id = m.chat_session_id
WHERE s.workspace_id = @workspace_id AND s.id = @session_id AND s.kind = 'direct' AND m.sequence = s.last_sequence;

-- name: CreateDirectMessage :one
INSERT INTO chat_message (chat_session_id, sender_id, client_message_id, sequence, role, content, created_at)
VALUES (@conversation_id, @sender_id, @client_message_id, @sequence, 'user', @content, clock_timestamp())
RETURNING *;

-- name: AdvanceDirectConversation :one
UPDATE chat_session
SET last_sequence = @sequence, direct_last_message_at = @message_at, updated_at = @message_at,
    creator_read_sequence = CASE WHEN creator_id = @sender_id THEN @sequence ELSE creator_read_sequence END,
    peer_read_sequence = CASE WHEN peer_user_id = @sender_id THEN @sequence ELSE peer_read_sequence END
WHERE id = @id AND workspace_id = @workspace_id AND kind = 'direct'
RETURNING *;

-- name: ListDirectMessagesPage :many
SELECT m.* FROM chat_message m JOIN chat_session s ON s.id = m.chat_session_id
WHERE s.workspace_id = @workspace_id AND s.id = @conversation_id AND s.kind = 'direct'
  AND (sqlc.narg('before_sequence')::bigint IS NULL OR m.sequence < sqlc.narg('before_sequence'))
ORDER BY m.sequence DESC LIMIT @page_limit;

-- name: MarkDirectConversationRead :one
UPDATE chat_session
SET creator_read_sequence = CASE WHEN creator_id = @user_id THEN GREATEST(creator_read_sequence, LEAST(@sequence, last_sequence)) ELSE creator_read_sequence END,
    peer_read_sequence = CASE WHEN peer_user_id = @user_id THEN GREATEST(peer_read_sequence, LEAST(@sequence, last_sequence)) ELSE peer_read_sequence END
WHERE id = @id AND workspace_id = @workspace_id AND kind = 'direct'
RETURNING *;

-- name: ListDirectSessions :many
WITH participant_sessions AS (
    (SELECT c.* FROM chat_session c
     WHERE c.workspace_id = @workspace_id AND c.kind = 'direct' AND c.creator_id = @user_id AND c.peer_user_id = @peer_user_id
       AND (sqlc.narg('before_time')::timestamptz IS NULL OR (COALESCE(GREATEST(c.direct_last_message_at, c.last_activity_at), c.created_at), c.id) < (sqlc.narg('before_time'), sqlc.narg('before_id')::uuid))
     ORDER BY COALESCE(GREATEST(c.direct_last_message_at, c.last_activity_at), c.created_at) DESC, c.id DESC LIMIT @page_limit)
    UNION ALL
    (SELECT p.* FROM chat_session p
     WHERE p.workspace_id = @workspace_id AND p.kind = 'direct' AND p.peer_user_id = @user_id AND p.creator_id = @peer_user_id
       AND (sqlc.narg('before_time')::timestamptz IS NULL OR (COALESCE(GREATEST(p.direct_last_message_at, p.last_activity_at), p.created_at), p.id) < (sqlc.narg('before_time'), sqlc.narg('before_id')::uuid))
     ORDER BY COALESCE(GREATEST(p.direct_last_message_at, p.last_activity_at), p.created_at) DESC, p.id DESC LIMIT @page_limit)
), recent AS (
    SELECT * FROM participant_sessions
    ORDER BY COALESCE(GREATEST(direct_last_message_at, last_activity_at), created_at) DESC, id DESC LIMIT @page_limit
)
SELECT s.*, COALESCE(cr.version > CASE WHEN cs.creator_id = @user_id THEN cr.creator_read_version ELSE cr.peer_read_version END, false)::boolean AS container_has_unread, COALESCE(m.content, '')::text AS last_message_content
FROM recent s
JOIN chat_session cs ON cs.id = s.id
LEFT JOIN contract_review cr ON cr.id = s.id AND cr.workspace_id = s.workspace_id
LEFT JOIN chat_message m ON m.chat_session_id = s.id AND m.sequence = s.last_sequence
ORDER BY COALESCE(GREATEST(s.direct_last_message_at, s.last_activity_at), s.created_at) DESC, s.id DESC;

-- name: ListDirectConversationActivity :many
SELECT (CASE WHEN cs.creator_id = @user_id THEN cs.peer_user_id ELSE cs.creator_id END)::uuid AS other_user_id,
       MAX(GREATEST(cs.direct_last_message_at, cs.last_activity_at))::timestamptz AS last_message_at,
       (array_agg(cs.id ORDER BY GREATEST(cs.direct_last_message_at, cs.last_activity_at) DESC NULLS LAST, cs.created_at DESC, cs.id DESC))[1]::uuid AS resume_session_id,
       bool_or(cs.last_sequence > CASE WHEN cs.creator_id = @user_id THEN cs.creator_read_sequence ELSE cs.peer_read_sequence END OR COALESCE(cr.version > CASE WHEN cs.creator_id = @user_id THEN cr.creator_read_version ELSE cr.peer_read_version END, false))::boolean AS has_unread
FROM chat_session cs
LEFT JOIN contract_review cr ON cr.id = cs.id AND cr.workspace_id = cs.workspace_id
WHERE cs.workspace_id = @workspace_id AND cs.kind = 'direct' AND (cs.creator_id = @user_id OR cs.peer_user_id = @user_id)
GROUP BY (CASE WHEN cs.creator_id = @user_id THEN cs.peer_user_id ELSE cs.creator_id END);

-- name: ListTeamAgentActivity :many
SELECT cs.agent_id, MAX(GREATEST(lm.created_at, cs.last_activity_at))::timestamptz AS last_contact_at,
       (array_agg(cs.id ORDER BY GREATEST(lm.created_at, cs.last_activity_at) DESC NULLS LAST, cs.created_at DESC, cs.id)
        FILTER (WHERE cs.status = 'active'))[1]::uuid AS resume_session_id,
       bool_or(cs.status = 'active' AND EXISTS (
           SELECT 1 FROM chat_message m WHERE m.chat_session_id = cs.id
             AND m.role = 'assistant' AND m.created_at > cs.last_read_at
       ) OR (cs.status = 'active' AND EXISTS (SELECT 1 FROM contract_review cr WHERE cr.id = cs.id AND cr.workspace_id = cs.workspace_id AND cr.version > cr.creator_read_version)))::boolean AS has_unread
FROM chat_session cs
LEFT JOIN LATERAL (
    SELECT created_at FROM chat_message WHERE chat_session_id = cs.id
    ORDER BY created_at DESC, id DESC LIMIT 1
) lm ON true
WHERE cs.workspace_id = @workspace_id AND cs.creator_id = @user_id AND cs.kind = 'agent'
GROUP BY cs.agent_id;
