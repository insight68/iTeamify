import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { productCategoryListOptions } from "./queries";

describe("product category query options", () => {
  it("normalizes every filter and pagination field in the query key", () => {
    const options = productCategoryListOptions("workspace-1", {
      search: "  3.0244 ",
      category: " 黑巧 ",
      series: " 日常款 ",
      status: "unmapped",
      page: 2.9,
      pageSize: 500,
    });

    expect(options.queryKey).toEqual([
      "product-categories",
      "workspace-1",
      "list",
      "3.0244",
      "黑巧",
      "日常款",
      "unmapped",
      2,
      100,
    ]);
    expect(options.placeholderData).toBe(keepPreviousData);
  });

  it("gates requests on the workspace id and defaults invalid pages", () => {
    expect(productCategoryListOptions("").enabled).toBe(false);
    expect(productCategoryListOptions("workspace-1", { page: Number.NaN, pageSize: 0 }).queryKey)
      .toEqual([
        "product-categories",
        "workspace-1",
        "list",
        "",
        "",
        "",
        "all",
        1,
        30,
      ]);
  });
});
