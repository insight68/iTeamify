import { describe, expect, it } from "vitest";
import { ReconciliationConfirmResponseSchema } from "./schemas";

describe("ReconciliationConfirmResponseSchema", () => {
  it("keeps older server responses compatible", () => {
    expect(ReconciliationConfirmResponseSchema.parse({
      success: true,
      confirmed: ["batch-1"],
    })).toEqual({ success: true, confirmed: ["batch-1"], failed: [] });
  });

  it("rejects malformed confirmed batches", () => {
    expect(ReconciliationConfirmResponseSchema.safeParse({
      success: true,
      confirmed: null,
    }).success).toBe(false);
  });
});
