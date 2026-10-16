import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { projectWorkflowSchema } from "./workflow-schemas";

const valid = {
  id: "p1",
  workspace_id: "w1",
  title: "Report",
  workflow_status: "planned",
  version: 1,
};

afterEach(() => vi.unstubAllGlobals());

function respond(value: unknown) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })),
  );
}

describe("project workflow API boundary", () => {
  it("accepts nullable backend fields and defaults missing permissions to false", () => {
    expect(
      projectWorkflowSchema.parse({
        ...valid,
        description: null,
        lead_type: null,
        lead_id: null,
      }),
    ).toMatchObject({
      can_manage: false,
      can_review: false,
      can_submit: false,
      execution_active: false,
      acceptance_criteria: "",
    });
  });

  it("preserves unknown future workflow states for a defensive UI", () => {
    expect(
      projectWorkflowSchema.parse({ ...valid, workflow_status: "future_state" })
        .workflow_status,
    ).toBe("future_state");
  });

  it("does not turn a malformed response into a successful empty list", async () => {
    respond([{ ...valid, version: "one" }]);
    await expect(
      new ApiClient("https://api.test").listProjectWorkflows(),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects malformed action receipts after the request was sent", async () => {
    respond({ ok: true });
    await expect(
      new ApiClient("https://api.test").projectWorkflowAction("p1", {
        action: "approve",
        version: 1,
        result: "Report",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("sends the reviewed result and version without automatic mutation retries", async () => {
    respond(valid);
    const input = {
      action: "approve" as const,
      version: 1,
      result: "Report v1",
    };
    await new ApiClient("https://api.test").projectWorkflowAction("p1", input);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/api/projects/p1/workflow",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("rejects a malformed project creation receipt", async () => {
    respond({ ok: true });
    await expect(
      new ApiClient("https://api.test").createProject({
        title: "Report",
        acceptance_criteria: "Sources",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
