import { describe, it, expect } from "vitest";

import {
  collectUnmappedModels,
  estimateCost,
  formatCny,
  isModelPriced,
  usesFallbackPricing,
} from "./utils";

const zeroUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
};

describe("estimateCost", () => {
  it("prices the canonical Anthropic Sonnet 4.6 SKU", () => {
    const cost = estimateCost({
      ...zeroUsage,
      model: "claude-sonnet-4-6",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    // 1M × ¥3 input + 1M × ¥15 output = ¥18.
    expect(cost).toBeCloseTo(18, 5);
  });

  it("prices a Codex CLI session reporting gpt-5-codex", () => {
    const cost = estimateCost({
      ...zeroUsage,
      model: "gpt-5-codex",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_tokens: 2_000_000,
    });
    // 1M × ¥1.25 + 1M × ¥10 + 2M × ¥0.125 = ¥11.50.
    expect(cost).toBeCloseTo(11.5, 5);
  });

  it("strips dated snapshots before resolving (gpt-5-2025-08-07 → gpt-5)", () => {
    const cost = estimateCost({
      ...zeroUsage,
      model: "gpt-5-2025-08-07",
      input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.25, 5);
  });

  it("prices each dotted Codex catalog SKU at its own tier, not gpt-5", () => {
    // Every dotted minor version is priced independently. The resolver does
    // exact-match-after-date-strip (no startsWith fallback), so each row
    // must exist on its own.
    expect(
      estimateCost({ ...zeroUsage, model: "gpt-5.5", input_tokens: 1_000_000 }),
    ).toBeCloseTo(5, 5);
    expect(
      estimateCost({ ...zeroUsage, model: "gpt-5.4", output_tokens: 1_000_000 }),
    ).toBeCloseTo(15, 5);
    expect(
      estimateCost({
        ...zeroUsage,
        model: "gpt-5.4-mini",
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(0.75 + 4.5, 5);
    expect(
      estimateCost({
        ...zeroUsage,
        model: "gpt-5.3-codex",
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.75 + 14, 5);
  });

  it("uses visibly-marked default pricing for an unmapped catalog SKU", () => {
    // `gpt-5.5-mini` is in the Codex catalog but OpenAI hasn't published a
    // public rate. It must not inherit `gpt-5.5`; it uses the independent
    // default tier and remains flagged so the UI can mark the amount as an
    // estimate.
    expect(isModelPriced("gpt-5.5-mini")).toBe(false);
    expect(usesFallbackPricing("gpt-5.5-mini")).toBe(true);
    expect(
      estimateCost({
        ...zeroUsage,
        model: "gpt-5.5-mini",
        input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.25, 5);
  });

  it("flags hypothetical future variants as unmapped instead of inheriting a relative's price", () => {
    // No exact match → default-price estimate. Covers both dotted families
    // (`gpt-5.99-codex`) and unknown sub-variants (`gpt-5-foo`); neither may
    // silently inherit `gpt-5` pricing.
    expect(isModelPriced("gpt-5.99-codex")).toBe(false);
    expect(isModelPriced("gpt-5-foo")).toBe(false);
    expect(
      estimateCost({
        ...zeroUsage,
        model: "gpt-5.99-codex",
        input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.25, 5);
  });

  it("uses default pricing for a genuinely unknown model", () => {
    expect(
      estimateCost({
        ...zeroUsage,
        model: "totally-made-up-model",
        input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.25, 5);
  });

  it("prices empty and explicit default model values with the default tier", () => {
    expect(
      estimateCost({
        ...zeroUsage,
        model: "",
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBeCloseTo(11.25, 5);
    expect(
      estimateCost({
        ...zeroUsage,
        model: "default",
        input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(1.25, 5);
    expect(isModelPriced("")).toBe(true);
    expect(isModelPriced("default")).toBe(true);
    expect(usesFallbackPricing("")).toBe(false);
  });
});

describe("formatCny", () => {
  it("formats direct renminbi values without conversion", () => {
    expect(formatCny(1234.5)).toBe("¥1,234.50");
    expect(formatCny(1.25)).toBe("¥1.25");
  });

  it("marks default-price fallback amounts as estimates", () => {
    expect(formatCny(1.25, { estimated: true })).toBe("≈¥1.25");
  });
});

describe("isModelPriced", () => {
  it("recognises both Claude and Codex/GPT families", () => {
    expect(isModelPriced("claude-sonnet-4-6")).toBe(true);
    expect(isModelPriced("gpt-5-codex")).toBe(true);
    expect(isModelPriced("gpt-5-mini")).toBe(true);
    expect(isModelPriced("o3")).toBe(true);
    expect(isModelPriced("totally-made-up-model")).toBe(false);
  });
});

it("prices MiniMax-M2.7 correctly", () => {
    expect(
      estimateCost({ ...zeroUsage, model: "MiniMax-M2.7", input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ).toBeCloseTo(0.30 + 1.20, 5);
    expect(isModelPriced("MiniMax-M2.7")).toBe(true);
  });

  it("prices GLM-5.1 correctly", () => {
    expect(
      estimateCost({ ...zeroUsage, model: "glm-5.1", input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ).toBeCloseTo(1.05 + 3.50, 5);
    expect(isModelPriced("glm-5.1")).toBe(true);
  });

describe("collectUnmappedModels", () => {
  it("only surfaces names that miss every pricing tier", () => {
    const rows = [
      { ...zeroUsage, model: "claude-sonnet-4-6" },
      { ...zeroUsage, model: "gpt-5-codex" },
      { ...zeroUsage, model: "fictional-model-x" },
    ];
    expect(collectUnmappedModels(rows)).toEqual(["fictional-model-x"]);
  });
});
