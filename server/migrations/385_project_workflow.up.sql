CREATE TABLE project_workflow (
    project_id uuid NOT NULL,
    acceptance_criteria text NOT NULL DEFAULT '',
    created_by uuid,
    execution_issue_id uuid,
    state text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'in_review', 'completed', 'cancelled')),
    result text NOT NULL DEFAULT '',
    review_note text NOT NULL DEFAULT '',
    reviewed_by uuid,
    version integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO project_workflow (project_id, state)
SELECT id, CASE WHEN status IN ('completed', 'cancelled') THEN status ELSE 'planned' END
FROM project;
