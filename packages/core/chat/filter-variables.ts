/**
 * Dynamic filter default-value variables for chat table filters.
 *
 * Administrators can set a filter's `default_value` to a template string like
 * `"{{current_user}}"` or `"{{today}}"`.  At page-load time the template is
 * resolved to a concrete value (e.g. the current user's display name) so the
 * end user sees the resolved value in the filter chip.
 *
 * Variables are resolved once when the AgentTablePanel mounts.  They are NOT
 * re-resolved on re-render — the resolved value becomes a normal filter value
 * from the user's perspective.
 */

// ── Types ──

export interface FilterVariableDef {
  /** Template key used inside `{{…}}`, e.g. `"current_user"`. */
  key: string;
  /** Human-readable label shown in the config-panel variable picker. */
  label: string;
  /** Grouping category for the variable list. */
  category: "user" | "time";
  /** Resolve the variable to a concrete string value. */
  resolve: (ctx: FilterVariableContext) => string;
}

export interface FilterVariableContext {
  /** The currently logged-in user, or null if unavailable. */
  currentUser: { id: string; name: string } | null;
  /**
   * The "now" instant used for relative-date resolution.
   * Callers should pass `new Date()` (injectable for tests).
   */
  now: Date;
}

// ── Helpers ──

/** Pad a number to two digits. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as `YYYY-MM-DD`. */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Return the Monday of the week containing `d` (Monday = start of week). */
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // days from Monday
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  return m;
}

/** Return the Sunday of the week containing `d`. */
function sundayOf(d: Date): Date {
  const m = mondayOf(d);
  const s = new Date(m);
  s.setDate(s.getDate() + 6);
  return s;
}

/** First day of the month for `d`. */
function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Last day of the month for `d`. */
function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** First day of the quarter for `d`. */
function firstOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

/** Last day of the quarter for `d`. */
function lastOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

// ── Variable registry ──

const VARIABLES: FilterVariableDef[] = [
  // -- user --
  {
    key: "current_user",
    label: "Current user",
    category: "user",
    resolve: (ctx) => ctx.currentUser?.name ?? "",
  },
  {
    key: "current_user_id",
    label: "Current user ID",
    category: "user",
    resolve: (ctx) => ctx.currentUser?.id ?? "",
  },

  // -- time: day --
  {
    key: "today",
    label: "Today",
    category: "time",
    resolve: (ctx) => fmtDate(ctx.now),
  },
  {
    key: "yesterday",
    label: "Yesterday",
    category: "time",
    resolve: (ctx) => {
      const d = new Date(ctx.now);
      d.setDate(d.getDate() - 1);
      return fmtDate(d);
    },
  },

  // -- time: week --
  {
    key: "this_week_start",
    label: "This week start (Mon)",
    category: "time",
    resolve: (ctx) => fmtDate(mondayOf(ctx.now)),
  },
  {
    key: "this_week_end",
    label: "This week end (Sun)",
    category: "time",
    resolve: (ctx) => fmtDate(sundayOf(ctx.now)),
  },
  {
    key: "last_week_start",
    label: "Last week start (Mon)",
    category: "time",
    resolve: (ctx) => {
      const m = mondayOf(ctx.now);
      m.setDate(m.getDate() - 7);
      return fmtDate(m);
    },
  },
  {
    key: "last_week_end",
    label: "Last week end (Sun)",
    category: "time",
    resolve: (ctx) => {
      const m = mondayOf(ctx.now);
      m.setDate(m.getDate() - 1);
      return fmtDate(m);
    },
  },

  // -- time: month --
  {
    key: "this_month_start",
    label: "This month start",
    category: "time",
    resolve: (ctx) => fmtDate(firstOfMonth(ctx.now)),
  },
  {
    key: "this_month_end",
    label: "This month end",
    category: "time",
    resolve: (ctx) => fmtDate(lastOfMonth(ctx.now)),
  },
  {
    key: "last_month_start",
    label: "Last 30 days start",
    category: "time",
    resolve: (ctx) => {
      const d = new Date(ctx.now);
      d.setDate(d.getDate() - 30);
      return fmtDate(d);
    },
  },
  {
    key: "last_month_end",
    label: "Last 30 days end (today)",
    category: "time",
    resolve: (ctx) => fmtDate(ctx.now),
  },
  {
    key: "last_natural_month_start",
    label: "Last natural month start",
    category: "time",
    resolve: (ctx) => {
      const prev = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 1, 1);
      return fmtDate(prev);
    },
  },
  {
    key: "last_natural_month_end",
    label: "Last natural month end",
    category: "time",
    resolve: (ctx) => {
      const prev = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 0);
      return fmtDate(prev);
    },
  },

  // -- time: quarter --
  {
    key: "this_quarter_start",
    label: "This quarter start",
    category: "time",
    resolve: (ctx) => fmtDate(firstOfQuarter(ctx.now)),
  },
  {
    key: "this_quarter_end",
    label: "This quarter end",
    category: "time",
    resolve: (ctx) => fmtDate(lastOfQuarter(ctx.now)),
  },
  {
    key: "last_quarter_start",
    label: "Last quarter start",
    category: "time",
    resolve: (ctx) => {
      const q = Math.floor(ctx.now.getMonth() / 3);
      return fmtDate(new Date(ctx.now.getFullYear(), (q - 1) * 3, 1));
    },
  },
  {
    key: "last_quarter_end",
    label: "Last quarter end",
    category: "time",
    resolve: (ctx) => {
      const q = Math.floor(ctx.now.getMonth() / 3);
      return fmtDate(new Date(ctx.now.getFullYear(), q * 3, 0));
    },
  },
];

/** Lookup map keyed by variable key. */
const VAR_MAP = new Map<string, FilterVariableDef>(
  VARIABLES.map((v) => [v.key, v]),
);

// ── Public API ──

const TEMPLATE_RE = /{{(\w+)}}/g;

/**
 * Return the full list of available filter variables (useful for rendering
 * hints / tooltips in the config UI).
 */
export function getFilterVariables(): FilterVariableDef[] {
  return VARIABLES;
}

/**
 * Return true when `value` contains at least one `{{…}}` template marker.
 */
export function hasDynamicVariable(value: unknown): boolean {
  if (typeof value !== "string") return false;
  TEMPLATE_RE.lastIndex = 0;
  return TEMPLATE_RE.test(value);
}

/**
 * Resolve a filter's `default_value` by replacing any `{{variable}}` tokens
 * with their concrete runtime values.
 *
 * Rules:
 * - Non-string values → returned as-is via `String()`.
 * - Strings without `{{` → returned as-is (static default).
 * - Unknown variable keys → the token is left unchanged (no error thrown).
 * - `currentUser` is null → user-class variables resolve to `""`.
 * - Returns `undefined` when `raw` is null/undefined/empty-string so callers
 *   don't accidentally treat "no default" as the literal string `""`.
 */
export function resolveFilterDefault(
  raw: unknown,
  context: FilterVariableContext,
): string | undefined {
  if (raw == null || raw === "") return undefined;
  const template = String(raw);
  if (!template.includes("{{")) return template;

  TEMPLATE_RE.lastIndex = 0;
  const resolved = template.replace(TEMPLATE_RE, (_match, key: string) => {
    const def = VAR_MAP.get(key);
    if (!def) return _match; // unknown — leave unchanged
    return def.resolve(context);
  });

  return resolved || undefined;
}
