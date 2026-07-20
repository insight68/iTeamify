import { describe, expect, it } from "vitest";
import { buildAgentTableExportXlsxFileName } from "./table-export";

describe("table export", () => {
  it("sanitizes generated XLSX filenames", () => {
    expect(buildAgentTableExportXlsxFileName("A/B:C", new Date("2026-07-05T00:00:00Z")))
      .toBe("A-B-C-2026-07-05.xlsx");
  });
});
