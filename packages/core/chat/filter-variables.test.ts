import { describe, expect, it } from "vitest";
import {
  resolveFilterDefault,
  hasDynamicVariable,
  getFilterVariables,
} from "./filter-variables";
import type { FilterVariableContext } from "./filter-variables";

// Helper: build a context with a fixed "now" so date tests are deterministic.
function ctx(overrides?: Partial<FilterVariableContext>): FilterVariableContext {
  return {
    currentUser: { id: "u-1", name: "Alice" },
    now: new Date("2026-06-23T10:00:00Z"),
    ...overrides,
  };
}

// ── resolveFilterDefault ──

describe("resolveFilterDefault", () => {
  it("returns undefined for null / undefined / empty-string", () => {
    expect(resolveFilterDefault(null, ctx())).toBeUndefined();
    expect(resolveFilterDefault(undefined, ctx())).toBeUndefined();
    expect(resolveFilterDefault("", ctx())).toBeUndefined();
  });

  it("returns static string as-is", () => {
    expect(resolveFilterDefault("hello", ctx())).toBe("hello");
  });

  it("returns static number-like default as string", () => {
    expect(resolveFilterDefault(42, ctx())).toBe("42");
  });

  it("resolves {{current_user}} to user display name", () => {
    expect(resolveFilterDefault("{{current_user}}", ctx())).toBe("Alice");
  });

  it("resolves {{current_user_id}} to user ID", () => {
    expect(resolveFilterDefault("{{current_user_id}}", ctx())).toBe("u-1");
  });

  it("returns empty string when currentUser is null for user variables", () => {
    const c = ctx({ currentUser: null });
    expect(resolveFilterDefault("{{current_user}}", c)).toBeUndefined(); // empty string → undefined
    expect(resolveFilterDefault("{{current_user_id}}", c)).toBeUndefined();
  });

  it("resolves {{today}} to current date in YYYY-MM-DD", () => {
    expect(resolveFilterDefault("{{today}}", ctx())).toBe("2026-06-23");
  });

  it("resolves {{yesterday}}", () => {
    expect(resolveFilterDefault("{{yesterday}}", ctx())).toBe("2026-06-22");
  });

  it("resolves week variables", () => {
    // 2026-06-23 is a Tuesday. Monday = 06-22, Sunday = 06-28.
    expect(resolveFilterDefault("{{this_week_start}}", ctx())).toBe("2026-06-22");
    expect(resolveFilterDefault("{{this_week_end}}", ctx())).toBe("2026-06-28");
    expect(resolveFilterDefault("{{last_week_start}}", ctx())).toBe("2026-06-15");
    expect(resolveFilterDefault("{{last_week_end}}", ctx())).toBe("2026-06-21");
  });

  it("resolves month variables", () => {
    expect(resolveFilterDefault("{{this_month_start}}", ctx())).toBe("2026-06-01");
    expect(resolveFilterDefault("{{this_month_end}}", ctx())).toBe("2026-06-30");
    expect(resolveFilterDefault("{{last_month_start}}", ctx())).toBe("2026-05-24");
    expect(resolveFilterDefault("{{last_month_end}}", ctx())).toBe("2026-06-23");
    expect(resolveFilterDefault("{{last_natural_month_start}}", ctx())).toBe("2026-05-01");
    expect(resolveFilterDefault("{{last_natural_month_end}}", ctx())).toBe("2026-05-31");
  });

  it("resolves quarter variables", () => {
    // June = Q2. Q2 = Apr–Jun.
    expect(resolveFilterDefault("{{this_quarter_start}}", ctx())).toBe("2026-04-01");
    expect(resolveFilterDefault("{{this_quarter_end}}", ctx())).toBe("2026-06-30");
    expect(resolveFilterDefault("{{last_quarter_start}}", ctx())).toBe("2026-01-01");
    expect(resolveFilterDefault("{{last_quarter_end}}", ctx())).toBe("2026-03-31");
  });

  it("resolves multiple variables in one template", () => {
    expect(
      resolveFilterDefault("{{current_user}} - {{today}}", ctx()),
    ).toBe("Alice - 2026-06-23");
  });

  it("leaves unknown variable tokens unchanged", () => {
    expect(
      resolveFilterDefault("{{unknown_var}}", ctx()),
    ).toBe("{{unknown_var}}");
  });

  it("resolves mixed known and unknown variables", () => {
    expect(
      resolveFilterDefault("{{today}}/{{bad}}", ctx()),
    ).toBe("2026-06-23/{{bad}}");
  });

  // ── date boundary tests ──

  it("end-of-month: December → 31", () => {
    const c = ctx({ now: new Date("2026-12-15T10:00:00Z") });
    expect(resolveFilterDefault("{{this_month_end}}", c)).toBe("2026-12-31");
  });

  it("start-of-year: January → 01", () => {
    const c = ctx({ now: new Date("2026-01-10T10:00:00Z") });
    expect(resolveFilterDefault("{{this_month_start}}", c)).toBe("2026-01-01");
  });

  it("end-of-quarter: Q1 → March 31", () => {
    const c = ctx({ now: new Date("2026-02-15T10:00:00Z") });
    expect(resolveFilterDefault("{{this_quarter_end}}", c)).toBe("2026-03-31");
  });

  it("last_quarter across year boundary", () => {
    const c = ctx({ now: new Date("2026-02-15T10:00:00Z") });
    expect(resolveFilterDefault("{{last_quarter_start}}", c)).toBe("2025-10-01");
    expect(resolveFilterDefault("{{last_quarter_end}}", c)).toBe("2025-12-31");
  });

  it("last_natural_month across year boundary (January → previous December)", () => {
    const c = ctx({ now: new Date("2026-01-15T10:00:00Z") });
    expect(resolveFilterDefault("{{last_natural_month_start}}", c)).toBe("2025-12-01");
    expect(resolveFilterDefault("{{last_natural_month_end}}", c)).toBe("2025-12-31");
  });

  it("mondayOf: Sunday → previous Monday", () => {
    // 2026-06-28 is a Sunday
    const c = ctx({ now: new Date("2026-06-28T10:00:00Z") });
    expect(resolveFilterDefault("{{this_week_start}}", c)).toBe("2026-06-22");
    expect(resolveFilterDefault("{{this_week_end}}", c)).toBe("2026-06-28");
  });
});

// ── hasDynamicVariable ──

describe("hasDynamicVariable", () => {
  it("returns false for non-strings", () => {
    expect(hasDynamicVariable(null)).toBe(false);
    expect(hasDynamicVariable(undefined)).toBe(false);
    expect(hasDynamicVariable(123)).toBe(false);
    expect(hasDynamicVariable(true)).toBe(false);
    expect(hasDynamicVariable({})).toBe(false);
  });

  it("returns false for strings without template markers", () => {
    expect(hasDynamicVariable("hello")).toBe(false);
    expect(hasDynamicVariable("")).toBe(false);
    expect(hasDynamicVariable("{today}")).toBe(false); // single brace
  });

  it("returns true for strings containing {{...}}", () => {
    expect(hasDynamicVariable("{{today}}")).toBe(true);
    expect(hasDynamicVariable("prefix {{current_user}}")).toBe(true);
    expect(hasDynamicVariable("{{a}} and {{b}}")).toBe(true);
  });
});

// ── getFilterVariables ──

describe("getFilterVariables", () => {
  it("returns a non-empty array", () => {
    const vars = getFilterVariables();
    expect(vars.length).toBeGreaterThan(0);
  });

  it("every variable has required fields", () => {
    for (const v of getFilterVariables()) {
      expect(typeof v.key).toBe("string");
      expect(v.key.length).toBeGreaterThan(0);
      expect(typeof v.label).toBe("string");
      expect(["user", "time"]).toContain(v.category);
      expect(typeof v.resolve).toBe("function");
    }
  });

  it("variable keys are unique", () => {
    const vars = getFilterVariables();
    const keys = vars.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes expected user variables", () => {
    const keys = getFilterVariables().map((v) => v.key);
    expect(keys).toContain("current_user");
    expect(keys).toContain("current_user_id");
  });

  it("includes expected time variables", () => {
    const keys = getFilterVariables().map((v) => v.key);
    expect(keys).toContain("today");
    expect(keys).toContain("this_month_start");
    expect(keys).toContain("last_natural_month_end");
  });

  it("every resolve function returns a string", () => {
    for (const v of getFilterVariables()) {
      const result = v.resolve(ctx());
      expect(typeof result).toBe("string");
    }
  });
});
